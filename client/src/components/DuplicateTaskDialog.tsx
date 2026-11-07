import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-tasks";
import { coerceWeekDays } from "@/lib/coerce-week-days";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskScheduleFields, remindAtPayload } from "@/components/TaskScheduleFields";
import { ChecklistEditor, checklistPayload, newChecklistId, type ChecklistDraftItem } from "@/components/ChecklistEditor";
import { isQuestionItem, itemNeedsPhoto } from "@shared/checklist";
import {
  TaskQuestionsEditor,
  mergeChecklistAndQuestions,
  questionDraftsFrom,
  questionsError,
  type QuestionDraft,
} from "@/components/TaskQuestionsEditor";
import { WorkerPicker } from "@/components/WorkerPicker";
import { TaskPhotoField } from "@/components/TaskPhotoField";
import { fileFromUploadedPhoto, uploadTaskAttachmentPhoto } from "@/lib/photo-upload";
import type { ChecklistItem } from "@shared/schema";
import { formatDueDateInput, parseDueDateInput } from "@shared/task-visibility";
import { Copy, Coins, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  dueDateInput: z.string().optional(),
  // «Напомнить в» — «ЧЧ:ММ» или пусто (пустое серверная схема не примет).
  remindAt: z.string().optional(),
  price: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  category: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  description: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
});

type FormValues = z.input<typeof formSchema>;

interface Task {
  id: number;
  title: string;
  workerId: number | null;
  requiresPhoto: boolean;
  weekDays?: number[] | null;
  monthDay?: number | null;
  isRecurring?: boolean;
  /** Срок копируется вместе с остальными полями. */
  dueDate?: number | null;
  /** «Напомнить в» тоже копируется. */
  remindAt?: string | null;
  price?: number;
  category?: string | null;
  description?: string | null;
  /** Подзадачи копируются составом: без отметок и фото, с новыми id. */
  checklist?: ChecklistItem[] | null;
  /** Фото к задаче — копируется в каждую копию. */
  examplePhotoUrl?: string | null;
}

/** Пункты исходной задачи → черновик копии: заново, без отметок и фото. */
export function checklistCopyDraft(items: readonly ChecklistItem[] | null | undefined): ChecklistDraftItem[] {
  return (items ?? [])
    .filter((it) => it?.title?.trim() && !isQuestionItem(it))
    .map((it) => ({ id: newChecklistId(), title: it.title, requiresPhoto: itemNeedsPhoto(it), done: false, photoUrls: [] }));
}

interface DuplicateTaskDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateTaskDialog({ task, open, onOpenChange }: DuplicateTaskDialogProps) {
  const [, setLocation] = useLocation();
  const createTask = useCreateTask();
  const { data: users = [] } = useUsers();
  const { toast } = useToast();

  // Состояние для примера фото
  const [examplePhotoFile, setExamplePhotoFile] = useState<File | null>(null);
  const [examplePhotoPreview, setExamplePhotoPreview] = useState<string | null>(null);
  const examplePhotoInputRef = useRef<HTMLInputElement>(null);
  // Фото исходной задачи: копии получают его же, пока его не убрали или не заменили.
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(null);

  // Multi-worker: duplicate one existing task to one OR more employees.
  // Seeded from the source task's workerId on open; admin can add more.
  const [workerIds, setWorkerIds] = useState<number[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([]);
  // Свои вопросы копируются с вариантами, без ответа.
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
      dueDateInput: "",
      remindAt: "",
      price: "",
      category: "",
      description: "",
    },
  });

  // Заполняем форму данными задачи при открытии
  useEffect(() => {
    if (task && open) {
      // weekDays coerce'ится через shared helper (защита от floats,
      // string-form, out-of-range — все edge cases в одном месте).
      const weekDaysArray = coerceWeekDays(task.weekDays);

      form.reset({
        title: task.title,
        workerId: task.workerId ? task.workerId.toString() : undefined,
        requiresPhoto: task.requiresPhoto ?? false,
        weekDays: weekDaysArray,
        monthDay: task.monthDay ? task.monthDay.toString() : undefined,
        isRecurring: task.isRecurring ?? true,
        // Срок видно и можно сменить: копия просроченной задачи иначе сразу была бы просрочена.
        dueDateInput: formatDueDateInput(task.dueDate),
        remindAt: task.remindAt ?? "",
        price: task.price ? task.price.toString() : "",
        category: task.category || "",
        description: task.description || "",
      });

      // Фото к задаче копируется вместе с ней (можно убрать или заменить).
      setExamplePhotoFile(null);
      setExamplePhotoPreview(task.examplePhotoUrl || null);
      setSourcePhotoUrl(task.examplePhotoUrl || null);
      setWorkerIds(task.workerId ? [task.workerId] : []);
      setChecklistItems(checklistCopyDraft(task.checklist));
      setQuestions(questionDraftsFrom(task.checklist));
      setQuestionsInvalid(null);
    }
  }, [task, open, form]);

  // Обработчики для примера фото
  const pickExamplePhoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Ошибка", description: "Выберите изображение", variant: "destructive" });
      return;
    }
    setExamplePhotoFile(file);
    setSourcePhotoUrl(null);
    const reader = new FileReader();
    reader.onloadend = () => setExamplePhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeExamplePhoto = () => {
    setExamplePhotoFile(null);
    setExamplePhotoPreview(null);
    setSourcePhotoUrl(null);
    if (examplePhotoInputRef.current) {
      examplePhotoInputRef.current.value = "";
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (workerIds.length === 0) {
      toast({
        title: "Не выбран сотрудник",
        description: "Отметьте хотя бы одного исполнителя",
        variant: "destructive",
      });
      return;
    }
    const questionsProblem = questionsError(questions);
    if (questionsProblem) {
      setQuestionsInvalid(questionsProblem);
      return;
    }
    // Как в создании задачи: срок делает её разовой и отменяет дни и повтор.
    const dueDate = parseDueDateInput(values.dueDateInput);
    const base = {
      title: values.title,
      requiresPhoto: values.requiresPhoto ?? false,
      weekDays:
        dueDate !== null ? null : values.weekDays && values.weekDays.length > 0 ? values.weekDays : null,
      monthDay: dueDate !== null ? null : values.monthDay || null,
      isRecurring: dueDate !== null ? false : (values.isRecurring ?? true),
      dueDate,
      remindAt: remindAtPayload(values.remindAt),
      price: values.price || 0,
      category: values.category || null,
      description: values.description || null,
    };
    let created = 0;
    let failed = 0;
    const createdIds: number[] = [];
    for (const workerId of workerIds) {
      await new Promise<void>((resolve) => {
        // У каждой копии свои id пунктов: отметки одной копии не задевают другую.
        const checklist = mergeChecklistAndQuestions(
          checklistPayload(checklistItems.map((it) => ({ ...it, id: newChecklistId() }))),
          questions.map((q) => ({ ...q, id: newChecklistId() })),
        );
        createTask.mutate({ ...base, workerId, checklist } as any, {
          onSuccess: (createdTask: any) => {
            created += 1;
            if (createdTask?.id) createdIds.push(createdTask.id);
            resolve();
          },
          onError: () => {
            failed += 1;
            resolve();
          },
        });
      });
    }
    // Фото к задаче — каждой копии: новое или то же, что у исходной.
    const photo = examplePhotoFile ?? (sourcePhotoUrl ? await fileFromUploadedPhoto(sourcePhotoUrl) : null);
    let photoFailed = sourcePhotoUrl && !photo ? 1 : 0;
    if (photo) {
      for (const taskId of createdIds) {
        await uploadTaskAttachmentPhoto(taskId, photo).catch(() => { photoFailed += 1; });
      }
    }
    if (photoFailed > 0 && createdIds.length > 0) {
      toast({
        title: "Фото не прикрепилось",
        description: "Копия создана без фото — добавьте его в правке задачи.",
        variant: "destructive",
      });
    }
    if (created > 0 && failed === 0) {
      toast({
        title: "Успешно",
        description:
          created === 1 ? "Задача создана" : `Создано копий: ${created}`,
      });
      setExamplePhotoFile(null);
      setExamplePhotoPreview(null);
      onOpenChange(false);
    } else if (created > 0 && failed > 0) {
      toast({
        title: "Создано с ошибками",
        description: `Успешно: ${created}, ошибок: ${failed}`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Ошибка",
        description: "Не удалось создать задачу",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Дублировать задачу
          </DialogTitle>
          <DialogDescription>Копия получит новое расписание и исполнителей — исходная задача не меняется.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              {/* Как в «Новой задаче»: выпадающий список с поиском и галочками. */}
              <WorkerPicker users={users} value={workerIds} onChange={setWorkerIds} placeholder="Исполнители" />
              {workerIds.length > 1 ? <p className="quick-task-hint">Каждому — своя копия</p> : null}
            </FormItem>

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

            <FormItem>
              <TaskPhotoField previewUrl={examplePhotoPreview} onPick={pickExamplePhoto} onRemove={removeExamplePhoto} />
            </FormItem>

            {/* Подзадачи копируются составом — можно поправить перед созданием. */}
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Подзадачи (чек-лист)
              </FormLabel>
              <ChecklistEditor items={checklistItems} onChange={setChecklistItems} />
            </FormItem>

            {questions.length > 0 && (
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
                ) : null}
              </div>
            )}

            <FormField
              control={form.control}
              name="requiresPhoto"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-3 space-y-3">
                  <div className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="cursor-pointer text-sm">
                        Добавить фото результатов
                      </FormLabel>
                    </div>
                  </div>

                </FormItem>
              )}
            />

            <TaskScheduleFields form={form} />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="flex-1 border border-border/50"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={createTask.isPending}
                className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
              >
                {createTask.isPending ? "Создание..." : "Создать"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
