import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useUpdateTask, useTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Edit, Calendar, RefreshCw, CalendarDays, Coins, Tag, FileText, ImagePlus, X, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
  weekDays: z.array(z.number()).nullable().optional(),
  monthDay: z.string().optional().transform(val => val ? parseInt(val, 10) : null),
  isRecurring: z.boolean().optional().default(true),
  price: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  category: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  description: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
});

type FormValues = z.input<typeof formSchema>;

const WEEK_DAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

export default function EditTask() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: task, isLoading } = useTask(Number(id));
  const updateTask = useUpdateTask();
  const { data: users = [] } = useUsers();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Состояние для примера фото
  const [examplePhotoFile, setExamplePhotoFile] = useState<File | null>(null);
  const [examplePhotoPreview, setExamplePhotoPreview] = useState<string | null>(null);
  const [currentExamplePhoto, setCurrentExamplePhoto] = useState<string | null>(null);
  const [isUploadingExample, setIsUploadingExample] = useState(false);
  const [isDeletingExample, setIsDeletingExample] = useState(false);
  const examplePhotoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      workerId: undefined,
      requiresPhoto: false,
      weekDays: null,
      monthDay: undefined,
      isRecurring: true,
      price: "0",
      category: "",
      description: "",
    },
  });

  // Обновляем форму когда задача загружена
  useEffect(() => {
    if (task) {
      // Получаем weekDays и преобразуем в массив если нужно
      const taskWeekDays = (task as any).weekDays;
      let weekDaysArray: number[] | null = null;
      if (taskWeekDays) {
        if (Array.isArray(taskWeekDays)) {
          weekDaysArray = taskWeekDays;
        } else if (typeof taskWeekDays === 'string') {
          try {
            weekDaysArray = JSON.parse(taskWeekDays);
          } catch {
            weekDaysArray = null;
          }
        }
      }

      form.reset({
        title: task.title,
        workerId: task.workerId ? task.workerId.toString() : undefined,
        requiresPhoto: task.requiresPhoto ?? false,
        weekDays: weekDaysArray,
        monthDay: (task as any).monthDay ? (task as any).monthDay.toString() : undefined,
        isRecurring: (task as any).isRecurring ?? true,
        price: (task as any).price ? (task as any).price.toString() : "0",
        category: (task as any).category || "",
        description: (task as any).description || "",
      });

      // Устанавливаем текущее пример фото если есть
      setCurrentExamplePhoto((task as any).examplePhotoUrl || null);
    }
  }, [task, form]);

  // Обработчики для примера фото
  const handleExamplePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Ошибка",
          description: "Выберите изображение",
          variant: "destructive",
        });
        return;
      }
      setExamplePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setExamplePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeExamplePhotoPreview = () => {
    setExamplePhotoFile(null);
    setExamplePhotoPreview(null);
    if (examplePhotoInputRef.current) {
      examplePhotoInputRef.current.value = "";
    }
  };

  const uploadExamplePhoto = async () => {
    if (!examplePhotoFile || !id) return;

    setIsUploadingExample(true);
    const formData = new FormData();
    formData.append("photo", examplePhotoFile);

    try {
      const response = await fetch(`/api/tasks/${id}/example-photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка загрузки");
      }

      const data = await response.json();
      setCurrentExamplePhoto(data.examplePhotoUrl);
      setExamplePhotoFile(null);
      setExamplePhotoPreview(null);
      if (examplePhotoInputRef.current) {
        examplePhotoInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Успешно",
        description: "Пример фото загружен",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить фото",
        variant: "destructive",
      });
    } finally {
      setIsUploadingExample(false);
    }
  };

  const deleteExamplePhoto = async () => {
    if (!id) return;

    setIsDeletingExample(true);
    try {
      const response = await fetch(`/api/tasks/${id}/example-photo`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка удаления");
      }

      setCurrentExamplePhoto(null);
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Успешно",
        description: "Пример фото удален",
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
  if (!user || !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Только администратор может редактировать задачи</p>
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
    const taskData = {
      id: Number(id),
      title: values.title,
      workerId: values.workerId,
      requiresPhoto: values.requiresPhoto ?? false,
      weekDays: values.weekDays && values.weekDays.length > 0 ? values.weekDays : null,
      monthDay: values.monthDay || null,
      isRecurring: values.isRecurring ?? true,
      price: values.price || 0,
      category: values.category || null,
      description: values.description || null,
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Загрузка...</span>
        </div>
      </div>
    );
  }

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
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input
                      className="things-input"
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
                  <FormLabel className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Описание задачи
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Подробное описание задачи..."
                      className="things-input min-h-[80px] resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Необязательно. Отображается при просмотре задачи пользователем.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="workerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Исполнитель</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger className="things-input w-full">
                        <SelectValue placeholder="Выберите сотрудника" />
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
                  <FormLabel className="flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Категория
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Например: Уборка, Готовка, Покупки..."
                      className="things-input"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Необязательно. Поможет фильтровать задачи по категориям.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">Стоимость выполнения</FormLabel>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Укажите сумму в рублях, которая будет начислена исполнителю за выполнение задачи
                  </p>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="things-input w-32"
                        {...field}
                      />
                      <span className="text-sm text-muted-foreground">₽</span>
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
                        Пользователь должен будет загрузить фотографию перед завершением задачи
                      </p>
                    </div>
                  </div>

                  {/* Секция примера фото - показывается только если галочка установлена */}
                  {field.value && (
                    <div className="pt-3 border-t border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Пример фото (необязательно)</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Загрузите пример того, как должна выглядеть выполненная задача
                      </p>

                      {/* Текущее загруженное пример фото */}
                      {currentExamplePhoto && !examplePhotoPreview && (
                        <div className="relative inline-block mb-3">
                          <img
                            src={currentExamplePhoto}
                            alt="Пример фото"
                            className="w-32 h-32 object-cover rounded-lg border border-border"
                          />
                          <button
                            type="button"
                            onClick={deleteExamplePhoto}
                            disabled={isDeletingExample}
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {isDeletingExample ? (
                              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* Превью нового фото перед загрузкой */}
                      {examplePhotoPreview && (
                        <div className="space-y-2 mb-3">
                          <div className="relative inline-block">
                            <img
                              src={examplePhotoPreview}
                              alt="Новый пример фото"
                              className="w-32 h-32 object-cover rounded-lg border border-primary"
                            />
                            <button
                              type="button"
                              onClick={removeExamplePhotoPreview}
                              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={uploadExamplePhoto}
                              disabled={isUploadingExample}
                            >
                              {isUploadingExample ? "Загрузка..." : "Сохранить фото"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={removeExamplePhotoPreview}
                            >
                              Отмена
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Кнопка выбора нового фото */}
                      {!examplePhotoPreview && (
                        <>
                          <input
                            ref={examplePhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleExamplePhotoSelect}
                            className="hidden"
                            id="example-photo-upload"
                          />
                          <label
                            htmlFor="example-photo-upload"
                            className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-primary/40 bg-primary/5 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/10 transition-all"
                          >
                            <ImagePlus className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">
                              {currentExamplePhoto ? "Заменить фото" : "Выбрать фото"}
                            </span>
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="weekDays"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">Дни недели</FormLabel>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Выберите дни, когда задача будет показываться пользователю. Если ничего не выбрано - задача видна всегда.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((day) => {
                      const isSelected = field.value?.includes(day.value) ?? false;
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            const currentDays = field.value ?? [];
                            if (isSelected) {
                              field.onChange(currentDays.filter((d: number) => d !== day.value));
                            } else {
                              field.onChange([...currentDays, day.value]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monthDay"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">День месяца</FormLabel>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Укажите день месяца (1-31), когда задача будет показываться. Если не указано - задача видна всегда.
                  </p>
                  <Select
                    onValueChange={(val) => field.onChange(val === "none" ? undefined : val)}
                    value={field.value?.toString() || "none"}
                  >
                    <FormControl>
                      <SelectTrigger className="things-input w-full">
                        <SelectValue placeholder="Не указан" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Не указан</SelectItem>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day} день
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border/50 p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Повторяющаяся задача
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Задача будет автоматически сбрасываться каждый день. Фотографии удаляются, статус выполнения сбрасывается.
                    </p>
                  </div>
                </FormItem>
              )}
            />

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
                  disabled={updateTask.isPending}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {updateTask.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
