import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, RefreshCw, Copy, CalendarDays, Coins, Tag, FileText, ImagePlus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface Task {
  id: number;
  title: string;
  workerId: number | null;
  requiresPhoto: boolean;
  weekDays?: number[] | null;
  monthDay?: number | null;
  isRecurring?: boolean;
  price?: number;
  category?: string | null;
  description?: string | null;
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

  // Multi-worker: duplicate one existing task to one OR more employees.
  // Seeded from the source task's workerId on open; admin can add more.
  const [workerIds, setWorkerIds] = useState<number[]>([]);

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

  // Заполняем форму данными задачи при открытии
  useEffect(() => {
    if (task && open) {
      // Получаем weekDays и преобразуем в массив если нужно
      let weekDaysArray: number[] | null = null;
      if (task.weekDays) {
        if (Array.isArray(task.weekDays)) {
          weekDaysArray = task.weekDays;
        }
      }

      form.reset({
        title: task.title,
        workerId: task.workerId ? task.workerId.toString() : undefined,
        requiresPhoto: task.requiresPhoto ?? false,
        weekDays: weekDaysArray,
        monthDay: task.monthDay ? task.monthDay.toString() : undefined,
        isRecurring: task.isRecurring ?? true,
        price: task.price ? task.price.toString() : "0",
        category: task.category || "",
        description: task.description || "",
      });

      // Сбрасываем пример фото при открытии (не копируем от исходной задачи)
      setExamplePhotoFile(null);
      setExamplePhotoPreview(null);
      setWorkerIds(task.workerId ? [task.workerId] : []);
    }
  }, [task, open, form]);

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

  const removeExamplePhoto = () => {
    setExamplePhotoFile(null);
    setExamplePhotoPreview(null);
    if (examplePhotoInputRef.current) {
      examplePhotoInputRef.current.value = "";
    }
  };

  const uploadExamplePhoto = async (taskId: number) => {
    if (!examplePhotoFile) return;

    const formData = new FormData();
    formData.append("photo", examplePhotoFile);

    try {
      const response = await fetch(`/api/tasks/${taskId}/example-photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Error uploading example photo:", error);
      }
    } catch (error) {
      console.error("Error uploading example photo:", error);
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
    const base = {
      title: values.title,
      requiresPhoto: values.requiresPhoto ?? false,
      weekDays:
        values.weekDays && values.weekDays.length > 0 ? values.weekDays : null,
      monthDay: values.monthDay || null,
      isRecurring: values.isRecurring ?? true,
      price: values.price || 0,
      category: values.category || null,
      description: values.description || null,
    };
    let created = 0;
    let failed = 0;
    let firstCreatedId: number | null = null;
    for (const workerId of workerIds) {
      await new Promise<void>((resolve) => {
        createTask.mutate({ ...base, workerId } as any, {
          onSuccess: (createdTask: any) => {
            created += 1;
            if (firstCreatedId === null && createdTask?.id) {
              firstCreatedId = createdTask.id;
            }
            resolve();
          },
          onError: () => {
            failed += 1;
            resolve();
          },
        });
      });
    }
    if (examplePhotoFile && firstCreatedId !== null) {
      await uploadExamplePhoto(firstCreatedId);
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
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Что нужно сделать?"
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
                  <FormLabel className="flex items-center gap-2 text-sm">
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormLabel>
                  Исполнители ·{" "}
                  <span className="text-primary">{workerIds.length}</span> из{" "}
                  {users.length}
                </FormLabel>
                {users.length > 0 ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWorkerIds(users.map((u) => u.id))}
                      className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/30"
                    >
                      Выбрать всех
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkerIds([])}
                      className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/30"
                    >
                      Очистить
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-border/50 p-2 sm:grid-cols-2">
                {users.map((user) => {
                  const checked = workerIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() =>
                        setWorkerIds((prev) =>
                          prev.includes(user.id)
                            ? prev.filter((id) => id !== user.id)
                            : [...prev, user.id]
                        )
                      }
                      className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                        checked
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        className="shrink-0"
                      />
                      <span className="truncate">
                        {user.name || user.phone}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Каждый выбранный сотрудник получит свою копию задачи.
              </p>
            </FormItem>

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 text-sm">
                    <Tag className="w-4 h-4" />
                    Категория
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Например: Уборка, Готовка..."
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
              name="price"
              render={({ field }) => (
                <FormItem className="rounded-md border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">Стоимость выполнения</FormLabel>
                  </div>
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

                  {/* Секция примера фото - показывается только если галочка установлена */}
                  {field.value && (
                    <div className="pt-2 border-t border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Пример фото (необязательно)</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Загрузите пример того, как должна выглядеть выполненная задача
                      </p>

                      {examplePhotoPreview ? (
                        <div className="relative inline-block">
                          <img
                            src={examplePhotoPreview}
                            alt="Пример фото"
                            className="w-24 h-24 object-cover rounded-lg border border-border"
                          />
                          <button
                            type="button"
                            onClick={removeExamplePhoto}
                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            ref={examplePhotoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleExamplePhotoSelect}
                            className="hidden"
                            id="duplicate-example-photo-upload"
                          />
                          <label
                            htmlFor="duplicate-example-photo-upload"
                            className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-primary/40 bg-primary/5 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/10 transition-all text-sm"
                          >
                            <ImagePlus className="w-4 h-4 text-primary" />
                            <span className="font-medium text-primary">Выбрать фото</span>
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
                <FormItem className="rounded-md border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">Дни недели</FormLabel>
                  </div>
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
                <FormItem className="rounded-md border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <FormLabel className="text-sm font-medium">День месяца</FormLabel>
                  </div>
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
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border/50 p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer flex items-center gap-2 text-sm">
                      <RefreshCw className="w-4 h-4" />
                      Повторяющаяся задача
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

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
