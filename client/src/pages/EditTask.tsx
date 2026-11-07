import { QueryError } from "@/components/QueryError";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUpdateTask, useTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskScheduleFields, remindAtPayload } from "@/components/TaskScheduleFields";
import { ArrowLeft, Edit, Coins, Check } from "lucide-react";
import { TaskPhotoField } from "@/components/TaskPhotoField";
import { uploadTaskAttachmentPhoto } from "@/lib/photo-upload";
import { ChecklistEditor, checklistDraftFrom, checklistPayload, type ChecklistDraftItem } from "@/components/ChecklistEditor";
import {
  TaskQuestionsEditor,
  mergeChecklistAndQuestions,
  questionDraftsFrom,
  questionsError,
  withoutQuestions,
  type QuestionDraft,
} from "@/components/TaskQuestionsEditor";
import { parseDueDateInput, formatDueDateInput } from "@shared/task-visibility";
import { useQueryClient } from "@tanstack/react-query";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { coerceWeekDays } from "@/lib/coerce-week-days";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertTaskSchema.extend({
  workerId: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  requiresPhoto: z.boolean().optional().default(false),
  // .int() симметрично с insertTaskSchema (защита от float'ов).
  weekDays: z.array(z.number().int()).nullable().optional(),
  monthDay: z.string().optional().transform(val => val ? parseInt(val, 10) : null),
  isRecurring: z.boolean().optional().default(true),
  price: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  category: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  description: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  // Срок из <input type="date"> — строка YYYY-MM-DD, конвертируется в
  // unix-секунды локальной полуночи в onSubmit.
  dueDateInput: z.string().optional(),
  // «Напомнить в» — «ЧЧ:ММ» или пусто.
  remindAt: z.string().optional(),
});

type FormValues = z.input<typeof formSchema>;

/** Состав чек-листа для сравнения: id, название, «нужно фото» и варианты вопроса, без отметок. */
function checklistShape(
  items: readonly { id: string; title: string; requiresPhoto?: boolean; options?: readonly string[] | null }[] | null,
): string {
  return JSON.stringify((items ?? []).map((it) => [it.id, it.title.trim(), it.requiresPhoto !== false, it.options ?? null]));
}

export default function EditTask() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { canManageTasks } = usePermissions();
  const { data: task, isLoading, isError, refetch } = useTask(Number(id));
  const updateTask = useUpdateTask();
  const { data: users = [] } = useUsers();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // «Фото к задаче»
  const [currentExamplePhoto, setCurrentExamplePhoto] = useState<string | null>(null);
  const [isUploadingExample, setIsUploadingExample] = useState(false);
  const [isDeletingExample, setIsDeletingExample] = useState(false);
  // Чек-лист: состав пунктов и «нужно фото». Отметки и фото исполнителя
  // сервер сохранит сам (mergeChecklistProgress), даже если форма устарела.
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([]);
  // Свои вопросы («Кто заполняет?») — пункты чек-листа с вариантами ответа.
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [questionsInvalid, setQuestionsInvalid] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      workerId: undefined,
      requiresPhoto: false,
      weekDays: null,
      monthDay: undefined,
      isRecurring: true,
      price: "",
      category: "",
      description: "",
      dueDateInput: "",
      remindAt: "",
    },
  });
  // Вопросы — у регулярной задачи (без срока); уже заданные видны всегда.
  const [watchRecurring, watchDue] = useWatch({ control: form.control, name: ["isRecurring", "dueDateInput"] });
  const showQuestions = questions.length > 0 || (watchRecurring !== false && parseDueDateInput(watchDue) === null);


  // Обновляем форму когда задача загружена
  useEffect(() => {
    if (task) {
      // Получаем weekDays и преобразуем в массив если нужно
      const weekDaysArray = coerceWeekDays((task as any).weekDays);

      form.reset({
        title: task.title,
        workerId: task.workerId ? task.workerId.toString() : undefined,
        requiresPhoto: task.requiresPhoto ?? false,
        weekDays: weekDaysArray,
        monthDay: (task as any).monthDay ? (task as any).monthDay.toString() : undefined,
        isRecurring: (task as any).isRecurring ?? true,
        price: (task as any).price ? (task as any).price.toString() : "",
        category: (task as any).category || "",
        description: (task as any).description || "",
        dueDateInput: formatDueDateInput((task as any).dueDate),
        remindAt: (task as any).remindAt ?? "",
      });

      // Устанавливаем текущее пример фото если есть
      setCurrentExamplePhoto((task as any).examplePhotoUrl || null);
      setChecklistItems(checklistDraftFrom(withoutQuestions(task.checklist)));
      setQuestions(questionDraftsFrom(task.checklist));
    }
  }, [task, form]);

  // «Фото к задаче»: в правке загружается сразу, как только выбрано.
  const pickExamplePhoto = async (file: File) => {
    if (!id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ошибка", description: "Выберите изображение", variant: "destructive" });
      return;
    }
    setIsUploadingExample(true);
    try {
      const url = await uploadTaskAttachmentPhoto(Number(id), file);
      setCurrentExamplePhoto(url || null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Фото прикреплено" });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error?.message || "Не удалось загрузить фото", variant: "destructive" });
    } finally {
      setIsUploadingExample(false);
    }
  };

  const deleteExamplePhoto = async () => {
    if (!id) return;

    setIsDeletingExample(true);
    try {
      const response = await fetchOrFriendlyError(`/api/tasks/${id}/example-photo`, {
        method: "DELETE",
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка удаления");
      }

      setCurrentExamplePhoto(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Успешно",
        description: "Фото убрано",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить фото",
        variant: "destructive",
      });
    } finally {
      setIsDeletingExample(false);
    }
  };

  // Проверка прав администратора (после всех хуков)
  if (!user || !canManageTasks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Задачи меняют администратор и руководитель</p>
          <button
            onClick={() => setLocation("/")}
            className="text-primary hover:underline"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  const onSubmit = (values: FormValues) => {
    if (!id) return;
    const questionsProblem = questionsError(questions);
    if (questionsProblem) {
      setQuestionsInvalid(questionsProblem);
      document.querySelector<HTMLElement>('[data-testid="task-questions"] input')?.focus();
      return;
    }
    const dueDate = parseDueDateInput(values.dueDateInput);
    const nextChecklist = mergeChecklistAndQuestions(checklistPayload(checklistItems), questions);
    const taskData = {
      id: Number(id),
      title: values.title,
      workerId: values.workerId,
      requiresPhoto: values.requiresPhoto ?? false,
      // Срок и повторение взаимоисключены — см. CreateTask.
      weekDays:
        dueDate !== null
          ? null
          : values.weekDays && values.weekDays.length > 0
            ? values.weekDays
            : null,
      monthDay: dueDate !== null ? null : values.monthDay || null,
      dueDate,
      remindAt: remindAtPayload(values.remindAt),
      isRecurring: dueDate !== null ? false : (values.isRecurring ?? true),
      price: values.price || 0,
      category: values.category || null,
      description: values.description || null,
      // Чек-лист шлём, только если поменяли состав: иначе сохранение формы
      // зря перезаписывало бы пункты.
      ...(checklistShape(nextChecklist) !== checklistShape(task?.checklist ?? null)
        ? { checklist: nextChecklist }
        : {}),
    };
    updateTask.mutate(
      taskData as any,
      {
        onSuccess: () => {
          toast({
            title: "Успешно",
            description: "Задача обновлена",
          });
          setLocation("/");
        },
        onError: (error: any) => {
          toast({
            title: "Ошибка",
            description: error.message || "Не удалось обновить задачу",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) return <PageSkeleton />;
  if (isError && !task) return <div className="page-container py-8"><QueryError onRetry={() => { void refetch(); }} /></div>;

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Задача не найдена</h1>
          <button
            onClick={() => setLocation("/")}
            className="text-primary hover:underline"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-screen">
      <div className="page-container page-container--narrow">
        <div className="page-header">
          <button
            onClick={() => setLocation("/")}
            className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="page-icon">
              <Edit className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title">Редактировать задачу</h1>
          </div>
          <p className="page-subtitle sm:ml-[60px]">Измените информацию о задаче</p>
        </div>

        <div className="content-panel">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Что сделать?"
                      aria-label="Название"
                      className="things-input"
                      maxLength={255}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Подробности, если нужно"
                      aria-label="Описание задачи"
                      className="things-input min-h-[80px] resize-none"
                      rows={3}
                      maxLength={5000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <TaskPhotoField
                previewUrl={currentExamplePhoto}
                onPick={pickExamplePhoto}
                onRemove={deleteExamplePhoto}
                busy={isUploadingExample || isDeletingExample}
              />
              {isUploadingExample ? <p className="text-xs text-muted-foreground">Загружаем фото…</p> : null}
            </FormItem>

            <FormField
              control={form.control}
              name="workerId"
              render={({ field }) => (
                <FormItem>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger className="things-input w-full" aria-label="Исполнитель">
                        <SelectValue placeholder="Исполнитель" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          <p>Нет пользователей</p>
                        </div>
                      ) : (
                        users.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.name || user.phone}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Категория — если нужно"
                      aria-label="Категория"
                      className="things-input"
                      maxLength={100}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        placeholder="Премия за выполнение, ₽"
                        aria-label="Премия за выполнение, ₽"
                        className="things-input"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requiresPhoto"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-4 space-y-4">
                  <div className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="cursor-pointer">
                        Добавить фото результатов
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Сотрудник не закроет задачу без фото
                      </p>
                    </div>
                  </div>

                </FormItem>
              )}
            />

            {/* Чек-лист (подзадачи) */}
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Подзадачи (чек-лист)
              </FormLabel>
              <ChecklistEditor items={checklistItems} onChange={setChecklistItems} />
            </FormItem>

            <TaskScheduleFields form={form} />

            {showQuestions && (
              <div>
                <TaskQuestionsEditor
                  items={questions}
                  onChange={(next) => {
                    setQuestions(next);
                    if (questionsInvalid) setQuestionsInvalid(questionsError(next));
                  }}
                />
                {questionsInvalid ? (
                  <p className="quick-task-hint quick-task-hint--error" role="alert">{questionsInvalid}</p>
                ) : questions.length > 0 ? (
                  <p className="quick-task-hint">Сотрудник выберет ответ из списка — без ответа задачу не закрыть.</p>
                ) : null}
              </div>
            )}

              <div className="flex gap-4 pt-4">
                <Button 
                  type="button" 
                  variant="ghost"
                  onClick={() => setLocation("/")}
                  className="flex-1 border border-border/50"
                >
                  Отмена
                </Button>
                <Button 
                  type="submit" 
                  loading={updateTask.isPending} loadingLabel="Сохранение…"
                  className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  Сохранить
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
