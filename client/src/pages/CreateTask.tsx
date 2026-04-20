import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, User, Plus, Calendar, RefreshCw, CalendarDays, Coins, Tag, FileText, ImagePlus, X, BookOpen, Sparkles } from "lucide-react";
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

export default function CreateTask() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const createTask = useCreateTask();
  const { data: users = [] } = useUsers();
  const { toast } = useToast();
  const [examplePhotoFile, setExamplePhotoFile] = useState<File | null>(null);
  const [examplePhotoPreview, setExamplePhotoPreview] = useState<string | null>(null);
  const examplePhotoInputRef = useRef<HTMLInputElement>(null);

  // Проверка прав администратора
  if (!user || !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Только администратор может создавать задачи</p>
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

  // ──── WeSetup journal mode ────
  // Свободный режим = текущая логика (поле workerId, title и т.д. вручную).
  // Журнальный режим = выбор документа+строки из WeSetup; задача создаётся
  // на стороне WeSetup, она же подставит workerId по связке телефонов.
  type WesetupCatalog = {
    journalCode: string;
    documents: Array<{
      documentId: string;
      title: string;
      period: { from: string; to: string };
      pairs: Array<{
        rowKey: string;
        cleaningTitle: string;
        cleaningUserName: string | null;
        controlTitle: string;
        controlUserName: string | null;
        existingTasksflowTaskId: number | null;
      }>;
    }>;
  };
  const [mode, setMode] = useState<"free" | "journal">("free");
  const [catalog, setCatalog] = useState<WesetupCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedRowKey, setSelectedRowKey] = useState<string>("");
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  useEffect(() => {
    if (mode !== "journal" || catalog || catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(null);
    fetch("/api/wesetup/cleaning-catalog", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.message || `WeSetup ${r.status}`);
        }
        return (await r.json()) as WesetupCatalog;
      })
      .then((data) => setCatalog(data))
      .catch((err) => setCatalogError(err.message || "Ошибка загрузки"))
      .finally(() => setCatalogLoading(false));
  }, [mode, catalog, catalogLoading]);
  const selectedDoc = useMemo(
    () => catalog?.documents.find((d) => d.documentId === selectedDocId) ?? null,
    [catalog, selectedDocId]
  );
  const selectedPair = useMemo(
    () => selectedDoc?.pairs.find((p) => p.rowKey === selectedRowKey) ?? null,
    [selectedDoc, selectedRowKey]
  );

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

  // Создание задачи в журнальном режиме: всё делает бекенд WeSetup.
  // Мы просто говорим «свяжи строку X документа Y», а WeSetup создаст
  // задачу у нас с правильным workerId + journalLink + зарегистрирует
  // TaskLink. После успеха обновляем дашборд.
  const onJournalSubmit = async () => {
    if (!selectedDoc || !selectedPair) {
      toast({
        title: "Не выбрана строка",
        description: "Выберите документ и строку журнала",
        variant: "destructive",
      });
      return;
    }
    setJournalSubmitting(true);
    try {
      const response = await fetch("/api/wesetup/bind-row", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDoc.documentId,
          rowKey: selectedPair.rowKey,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Ошибка связи с WeSetup");
      }
      toast({
        title: data?.created ? "Задача создана" : "Задача уже существовала",
        description: `TasksFlow #${data?.tasksflowTaskId}`,
      });
      setLocation("/");
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось создать журнальную задачу",
        variant: "destructive",
      });
    } finally {
      setJournalSubmitting(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    const taskData = {
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
    createTask.mutate(taskData as any, {
      onSuccess: async (createdTask: any) => {
        // Если есть пример фото, загружаем его
        if (examplePhotoFile && createdTask?.id) {
          await uploadExamplePhoto(createdTask.id);
        }
        toast({
          title: "Успешно",
          description: "Задача создана",
        });
        setLocation("/");
      },
      onError: (error: any) => {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось создать задачу",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-background">
      <div className="max-w-2xl mx-auto p-8">
        <div className="mb-8">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Plus className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Новая задача</h1>
          </div>
          <p className="text-muted-foreground text-sm ml-[60px]">Создайте новую задачу и назначьте исполнителя</p>
        </div>

        <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-xl p-8">
          {/* Mode toggle: Free vs Journal */}
          <div className="mb-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setMode("free")}
              className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                mode === "free"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 hover:bg-muted/30"
              }`}
              data-testid="mode-free"
            >
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                Свободный режим
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Любая задача с произвольным названием и исполнителем.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode("journal")}
              className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                mode === "journal"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 hover:bg-muted/30"
              }`}
              data-testid="mode-journal"
            >
              <div className="flex items-center gap-2 font-medium">
                <BookOpen className="w-4 h-4 text-primary" />
                Журнальный режим
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Привязать задачу к строке журнала уборки в WeSetup.
              </p>
            </button>
          </div>

          {mode === "journal" ? (
            <div className="space-y-4">
              {catalogLoading ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  Загружаем каталог из WeSetup…
                </div>
              ) : catalogError ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {catalogError}
                </div>
              ) : catalog && catalog.documents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  В WeSetup пока нет активных документов журнала уборки.
                  Создайте документ там и обновите страницу.
                </div>
              ) : catalog ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Документ журнала
                    </label>
                    <Select
                      value={selectedDocId}
                      onValueChange={(v) => {
                        setSelectedDocId(v);
                        setSelectedRowKey("");
                      }}
                    >
                      <SelectTrigger className="things-input w-full">
                        <SelectValue placeholder="Выберите документ" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog.documents.map((doc) => (
                          <SelectItem key={doc.documentId} value={doc.documentId}>
                            {doc.title} · {doc.period.from}—{doc.period.to}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedDoc ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Строка (ответственный за уборку)
                      </label>
                      {selectedDoc.pairs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          В этом документе пока нет ответственных.
                          Назначьте кого-нибудь в WeSetup.
                        </p>
                      ) : (
                        <Select
                          value={selectedRowKey}
                          onValueChange={setSelectedRowKey}
                        >
                          <SelectTrigger className="things-input w-full">
                            <SelectValue placeholder="Выберите строку" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedDoc.pairs.map((pair) => {
                              const taken = Boolean(pair.existingTasksflowTaskId);
                              const label = pair.cleaningUserName
                                ? `${pair.cleaningUserName} (${pair.cleaningTitle})`
                                : pair.cleaningTitle;
                              return (
                                <SelectItem
                                  key={pair.rowKey}
                                  value={pair.rowKey}
                                  disabled={taken}
                                >
                                  {label}
                                  {taken
                                    ? ` · уже задача #${pair.existingTasksflowTaskId}`
                                    : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ) : null}
                  {selectedPair ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                      <div className="font-medium">
                        Будет создана задача:
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        «Уборка ·{" "}
                        {selectedPair.cleaningUserName ||
                          selectedPair.cleaningTitle}
                        ». Расписание и исполнитель подставятся из
                        журнала автоматически. После выполнения задачи
                        соответствующая клетка журнала отметится сама.
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="lg"
                  disabled={!selectedPair || journalSubmitting}
                  onClick={onJournalSubmit}
                  className="things-button"
                >
                  {journalSubmitting ? "Создаю…" : "Создать журнальную задачу"}
                </Button>
              </div>
            </div>
          ) : (
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
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger className="things-input w-full">
                        <SelectValue placeholder="Выберите сотрудника" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          <User className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
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

                  {/* Секция загрузки примера фото - показывается только если галочка установлена */}
                  {field.value && (
                    <div className="pt-3 border-t border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Пример фото (необязательно)</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Загрузите пример того, как должна выглядеть выполненная задача
                      </p>

                      {examplePhotoPreview ? (
                        <div className="relative inline-block">
                          <img
                            src={examplePhotoPreview}
                            alt="Пример фото"
                            className="w-32 h-32 object-cover rounded-lg border border-border"
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
                            id="example-photo-upload"
                          />
                          <label
                            htmlFor="example-photo-upload"
                            className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-primary/40 bg-primary/5 rounded-lg cursor-pointer hover:border-primary hover:bg-primary/10 transition-all"
                          >
                            <ImagePlus className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-primary">Выбрать фото</span>
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
                  disabled={createTask.isPending}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {createTask.isPending ? "Создание..." : "Создать"}
                </Button>
              </div>
            </form>
          </Form>
          )}
        </div>
      </div>
    </div>
  );
}
