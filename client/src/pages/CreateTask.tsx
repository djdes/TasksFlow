import { PageSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-tasks";
import { useWesetupConfiguration } from "@/hooks/use-wesetup";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { JournalModeComposer } from "@/components/JournalModeComposer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskScheduleFields, RemindAtField, remindAtPayload } from "@/components/TaskScheduleFields";
import { WorkerPicker } from "@/components/WorkerPicker";
import { DueDateQuick, PhotoSlot } from "@/components/QuickTaskFields";
import { ChecklistEditor, checklistPayload, type ChecklistDraftItem } from "@/components/ChecklistEditor";
import {
  ArrowLeft,
  Plus,
  ImagePlus,
  BookOpen,
  Sparkles,
  LayoutTemplate,
  Camera,
  ChevronDown,
  ListChecks,
  Repeat,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { TaskTemplatesDialog } from "@/components/TaskTemplatesDialog";
import { parseDueDateInput } from "@shared/task-visibility";
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
import { insertTaskSchema } from "@shared/schema";
import type {
  WesetupCatalog,
} from "@shared/wesetup-journal-mode";
import {
  filterJournals,
  filterJournalRows,
  flattenJournalRows,
  groupJournalRowsByDocument,
  resolveActiveJournal,
  resolveJournalUi,
} from "@shared/wesetup-journal-mode";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertTaskSchema.extend({
  workerId: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  requiresPhoto: z.boolean().optional().default(false),
  // .int() симметрично с insertTaskSchema на сервере — без него
  // client мог бы пропустить float [1.5, 3] и получить 400 от сервера.
  weekDays: z.array(z.number().int()).nullable().optional(),
  monthDay: z.string().optional().transform(val => val ? parseInt(val, 10) : null),
  isRecurring: z.boolean().optional().default(true),
  price: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  category: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  description: z.string().optional().transform(val => val && val.trim() ? val.trim() : null),
  // Срок из <input type="date"> — строка YYYY-MM-DD. В unix-секунды
  // локальной полуночи превращаем в onSubmit, а не здесь: transform
  // сработал бы и на промежуточных значениях при вводе.
  dueDateInput: z.string().optional(),
  // «Напомнить в» — «ЧЧ:ММ» или пусто.
  remindAt: z.string().optional(),
});

type FormValues = z.input<typeof formSchema>;

export default function CreateTask() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { canManageTasks, isAdmin } = usePermissions();
  const createTask = useCreateTask();
  const { data: users = [], dataUpdatedAt: usersUpdatedAt, isLoading: usersLoading, isError: usersError, refetch: retryUsers } = useUsers();
  const { toast } = useToast();
  const [examplePhotoFile, setExamplePhotoFile] = useState<File | null>(null);
  const [examplePhotoPreview, setExamplePhotoPreview] = useState<string | null>(null);
  const examplePhotoInputRef = useRef<HTMLInputElement>(null);

  // Multi-worker for free-mode task creation. Admin checks one OR more
  // workers; submit loops the create mutation once per worker so each
  // gets their own task instance (same pattern as journal-mode batch).
  const [freeModeWorkerIds, setFreeModeWorkerIds] = useState<number[]>([]);

  // Чек-лист (подзадачи): админ задаёт заголовки пунктов и где нужно фото.
  // done/фото заполняет сотрудник. Пусто → обычная задача.
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([]);

  // ──── WeSetup journal mode ────
  // Журнальный режим показываем ТОЛЬКО если у компании настроена интеграция
  // с WeSetup. Без неё TasksFlow — просто «ставить задачи» (свободный режим).
  const wesetupConfig = useWesetupConfiguration();
  // Каталог журналов WeSetup — настройка интеграции, он только у админа.
  const wesetupEnabled = !!wesetupConfig.data?.wesetupConfigured && isAdmin;

  const [mode, setMode] = useState<"free" | "journal">("free");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Разовая (по умолчанию) — срок и фото проблемы; регулярная — дни и повтор.
  // ?kind=recurring открывает сразу регулярную.
  const [kind, setKind] = useState<"once" | "recurring">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("kind") === "recurring" ? "recurring" : "once",
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const [workersInvalid, setWorkersInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Страховка: если интеграция не настроена, не даём залипнуть в журнальном режиме.
  useEffect(() => {
    if (!wesetupEnabled && mode === "journal") setMode("free");
  }, [wesetupEnabled, mode]);
  const [catalog, setCatalog] = useState<WesetupCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [journalSearch, setJournalSearch] = useState<string>("");
  const [activeJournal, setActiveJournal] = useState<string>("");
  const [journalTaskMode, setJournalTaskMode] = useState<"row" | "free">(
    "row"
  );
  const [rowSearch, setRowSearch] = useState<string>("");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  // Multi-row selection for row-mode: admin ticks one OR more rows
  // inside a single document; submit creates one TF task per rowKey.
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [journalTaskTitle, setJournalTaskTitle] = useState<string>("");
  const [journalWorkerUserIds, setJournalWorkerUserIds] = useState<string[]>([]);
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  const [openJournalStep, setOpenJournalStep] = useState<
    "journal" | "details" | "review"
  >("journal");
  const [openDocumentId, setOpenDocumentId] = useState<string>("");
  // Use a ref instead of state so a failed fetch doesn't re-trigger
  // the effect when error/loading state flips back. Otherwise React
  // hot-loops requests until the dev rate-limit kills the server.
  const catalogAttemptedRef = useRef(false);

  const loadJournalCatalog = useCallback(async (force = false) => {
    if (!force && catalogAttemptedRef.current) return;
    catalogAttemptedRef.current = true;
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const response = await fetchOrFriendlyError("/api/wesetup/journals-catalog", {
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.message ||
            `WeSetup вернул HTTP ${response.status}. Проверьте адрес и API ключ.`
        );
      }
      if (!data || !Array.isArray(data.journals)) {
        throw new Error("WeSetup вернул каталог журналов в неизвестном формате.");
      }
      const nextCatalog = data as WesetupCatalog;
      setCatalog(nextCatalog);
      if (nextCatalog.journals.length > 0) {
        setActiveJournal((current) =>
          nextCatalog.journals.some((journal) => journal.templateCode === current)
            ? current
            : nextCatalog.journals[0].templateCode
        );
      }
    } catch (err: any) {
      setCatalog(null);
      const raw = err?.message || "Ошибка загрузки каталогов WeSetup";
      setCatalogError(
        /fetch failed|network|Failed to fetch|ECONNREFUSED|ENOTFOUND/i.test(raw)
          ? "Не удалось связаться с WeSetup. Проверьте адрес, API ключ и доступность сервера."
          : raw
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "journal") return;
    void loadJournalCatalog();
  }, [mode, loadJournalCatalog]);

  const visibleJournals = useMemo(
    () => filterJournals(catalog?.journals ?? [], journalSearch),
    [catalog, journalSearch]
  );
  useEffect(() => {
    const nextActive = resolveActiveJournal(visibleJournals, activeJournal);
    if (nextActive !== activeJournal) {
      setActiveJournal(nextActive);
    }
  }, [visibleJournals, activeJournal]);

  const activeJournalData = useMemo(
    () =>
      catalog?.journals.find((journal) => journal.templateCode === activeJournal) ??
      null,
    [catalog, activeJournal]
  );
  const activeJournalUi = useMemo(
    () => resolveJournalUi(activeJournalData),
    [activeJournalData]
  );

  const flatRows = useMemo(() => flattenJournalRows(catalog), [catalog]);
  const filteredRows = useMemo(() => {
    return filterJournalRows(flatRows, activeJournal, rowSearch);
  }, [flatRows, activeJournal, rowSearch]);
  const groupedFilteredRows = useMemo(
    () => groupJournalRowsByDocument(filteredRows, activeJournal),
    [filteredRows, activeJournal]
  );
  // First selected row — used as the «anchor» for journal code, title
  // defaults, and the review summary. All other selected rows share the
  // same document (enforced at toggle time).
  const selectedRows = useMemo(
    () =>
      flatRows.filter(
        (item) =>
          item.document.documentId === selectedDocId &&
          selectedRowKeys.includes(item.row.rowKey)
      ),
    [flatRows, selectedDocId, selectedRowKeys]
  );
  const selectedRow = selectedRows[0] ?? null;
  const activeJournalRows = useMemo(
    () =>
      flatRows.filter((item) => item.journal.templateCode === activeJournal),
    [flatRows, activeJournal]
  );
  const activeJournalSupportsRowMode =
    Boolean(activeJournalData?.hasAdapter) && activeJournalRows.length > 0;
  const assignableUsers = useMemo(
    () =>
      [...(catalog?.assignableUsers ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "ru")
      ),
    [catalog]
  );
  const selectedAssignableUsers = useMemo(
    () =>
      assignableUsers.filter((worker) =>
        journalWorkerUserIds.includes(worker.userId)
      ),
    [assignableUsers, journalWorkerUserIds]
  );
  // Backward-compat single-name string for the review summary (first
  // selected worker, since that's enough to anchor the «for whom»
  // sentence). The full count goes into the explicit summary below.
  const selectedAssignableUser = selectedAssignableUsers[0] ?? null;
  const selectedDocument = useMemo(
    () =>
      activeJournalData?.documents.find(
        (document) => document.documentId === selectedDocId
      ) ?? null,
    [activeJournalData, selectedDocId]
  );
  const isJournalDetailsReady =
    journalTaskMode === "row" && activeJournalSupportsRowMode
      ? Boolean(selectedRow)
      : Boolean(
          selectedDocId &&
            journalTaskTitle.trim() &&
            journalWorkerUserIds.length > 0
        );
  const journalSelectionSummary = activeJournalData
    ? `${activeJournalData.label} · ${activeJournalData.documents.length} док.`
    : null;
  const journalDetailsSummary = selectedRow
    ? selectedRows.length > 1
      ? `${activeJournalUi.modeRowLabel} · ${selectedRow.row.label} +${selectedRows.length - 1}`
      : `${activeJournalUi.modeRowLabel} · ${selectedRow.row.label}`
    : selectedDocument && journalTaskTitle.trim()
    ? `${activeJournalUi.modeFreeLabel} · ${journalTaskTitle.trim()}`
    : null;
  const workersSummary =
    selectedAssignableUsers.length === 0
      ? "Сотрудник не выбран"
      : selectedAssignableUsers.length === 1
      ? selectedAssignableUsers[0].name
      : `${selectedAssignableUsers[0].name} +${selectedAssignableUsers.length - 1}`;
  const journalReviewSummary = isJournalDetailsReady
    ? journalTaskMode === "row" && selectedRow
      ? selectedRows.length > 1
        ? `${selectedRow.document.documentTitle} · ${selectedRow.row.label} +${selectedRows.length - 1}`
        : `${selectedRow.document.documentTitle} · ${selectedRow.row.label}`
      : `${selectedDocument?.documentTitle ?? "Документ"} · ${workersSummary}`
    : null;

  useEffect(() => {
    if (!activeJournalData) {
      setSelectedDocId((current) => (current ? "" : current));
      setSelectedRowKeys((current) => (current.length > 0 ? [] : current));
      return;
    }
    const documentIds = new Set(
      activeJournalData.documents.map((document) => document.documentId)
    );
    if (!documentIds.has(selectedDocId)) {
      setSelectedDocId(activeJournalData.documents[0]?.documentId ?? "");
    }
    const validRowKeys = new Set(
      activeJournalRows
        .filter((item) => item.document.documentId === selectedDocId)
        .map((item) => item.row.rowKey)
    );
    setSelectedRowKeys((current) => {
      const kept = current.filter((key) => validRowKeys.has(key));
      return kept.length === current.length ? current : kept;
    });
    if (!activeJournalSupportsRowMode && journalTaskMode !== "free") {
      setJournalTaskMode("free");
    }
  }, [
    activeJournalData,
    activeJournalRows,
    activeJournalSupportsRowMode,
    journalTaskMode,
    selectedDocId,
  ]);

  useEffect(() => {
    if (groupedFilteredRows.length === 0) {
      setOpenDocumentId("");
      return;
    }
    const hasOpenDocument = groupedFilteredRows.some(
      (group) => group.document.documentId === openDocumentId
    );
    if (hasOpenDocument) return;
    setOpenDocumentId(selectedDocId || groupedFilteredRows[0].document.documentId);
  }, [groupedFilteredRows, openDocumentId, selectedDocId]);

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
      dueDateInput: "",
      remindAt: "",
    },
  });


  // Что уже задано в «Ещё» — подпись у свёрнутого блока, чтобы не забыть о скрытом.
  const [morePrice, moreCategory, moreRequiresPhoto, moreRemindAt] = useWatch({
    control: form.control,
    name: ["price", "category", "requiresPhoto", "remindAt"],
  });
  const filledChecklist = checklistItems.filter((i) => i.title.trim()).length;
  const moreSummary =
    [
      filledChecklist ? `чек-лист: ${filledChecklist}` : null,
      Number(morePrice) > 0 ? `премия ${morePrice} ₽` : null,
      typeof moreCategory === "string" && moreCategory.trim() ? moreCategory.trim() : null,
      moreRequiresPhoto ? "фото результата" : null,
      kind === "once" && moreRemindAt ? `напомнить в ${moreRemindAt}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Чек-лист, премия, категория, фото результата";

  // Проверка прав администратора — после всех хуков, иначе React
  // ругается на «Rendered more hooks than during the previous render»,
  // потому что guest-render оборвался бы до использования useEffect и
  // useMemo выше.
  if (!user || !canManageTasks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Задачи ставят администратор и руководитель</p>
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

  const uploadExamplePhoto = async (taskId: number): Promise<boolean> => {
    if (!examplePhotoFile) return true;

    const formData = new FormData();
    formData.append("photo", examplePhotoFile);

    try {
      const response = await fetchOrFriendlyError(`/api/tasks/${taskId}/example-photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        console.error("Error uploading example photo:", error);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error uploading example photo:", error);
      return false;
    }
  };

  // Создание задачи в журнальном режиме: всё делает бекенд WeSetup.
  // Есть два сценария:
  //   1. row-mode: связываем существующую adapter-строку журнала;
  //   2. free-mode: создаём свободную задачу в выбранном журнале/документе.
  const onJournalSubmit = async () => {
    if (!activeJournalData) return;

    const customTitle = journalTaskTitle.trim();
    const isRowMode = journalTaskMode === "row" && activeJournalSupportsRowMode;
    if (isRowMode && !selectedRow) {
      toast({
        title: "Не выбрана строка",
        description: "Найдите и выберите строку журнала из списка ниже",
        variant: "destructive",
      });
      return;
    }
    if (!isRowMode) {
      if (!selectedDocId) {
        toast({
          title: "Не выбран документ",
          description: "Выберите документ журнала, куда нужно вставить задачу",
          variant: "destructive",
        });
        return;
      }
      if (!customTitle) {
        toast({
          title: "Пустое название",
          description: "Введите текст задачи для выбранного журнала",
          variant: "destructive",
        });
        return;
      }
      if (journalWorkerUserIds.length === 0) {
        toast({
          title: "Не выбраны сотрудники",
          description:
            "Отметьте хотя бы одного сотрудника, кому уйдёт журнальная задача",
          variant: "destructive",
        });
        return;
      }
    }

    const requestBody = isRowMode
      ? {
          journalCode: selectedRow!.journal.templateCode,
          documentId: selectedRow!.document.documentId,
          // Batch — one TF task per selected row (see bind-row's
          // `rowKeys[]` slot handling).
          rowKeys: selectedRows.map((r) => r.row.rowKey),
          ...(customTitle ? { title: customTitle } : {}),
        }
      : {
          journalCode: activeJournalData.templateCode,
          documentId: selectedDocId,
          title: customTitle,
          // Batch — backend создаст по одной TasksFlow-задаче на каждого
          // выбранного сотрудника (см. /api/integrations/tasksflow/bind-row).
          workerUserIds: journalWorkerUserIds,
        };

    setJournalSubmitting(true);
    try {
      const response = await fetchOrFriendlyError("/api/wesetup/bind-row", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Ошибка связи с WeSetup");
      }
      // Batch response: { results: [...], summary: {...} } for free-text
      // mode (multi-worker) and single { tasksflowTaskId, created } for
      // adapter-row mode. Normalise both into a human-readable summary.
      const isBatch = Array.isArray(data?.results);
      const toastLabel = isRowMode
        ? `${selectedRow!.journal.label} → ${customTitle || selectedRow!.row.label}`
        : `${activeJournalData.label} → ${customTitle}`;
      if (isBatch) {
        const sum = data!.summary as {
          created: number;
          alreadyLinked: number;
          skipped: number;
          errors: number;
        };
        const parts = [
          `Создано: ${sum.created}`,
          sum.alreadyLinked
            ? `уже было: ${sum.alreadyLinked}`
            : null,
          sum.skipped ? `пропущено: ${sum.skipped}` : null,
          sum.errors ? `ошибок: ${sum.errors}` : null,
        ].filter(Boolean);
        toast({
          title: sum.errors === 0 ? "Задачи разосланы" : "Часть задач не создана",
          description: `${toastLabel} · ${parts.join(", ")}`,
          variant: sum.errors > 0 ? "destructive" : "default",
        });
      } else {
        toast({
          title: data?.created ? "Задача создана" : "Задача уже существовала",
          description: `${toastLabel} (TasksFlow #${data?.tasksflowTaskId})`,
        });
      }
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
    if (freeModeWorkerIds.length === 0) {
      // Подсказка у самого поля, без всплывашки поверх формы.
      setWorkersInvalid(true);
      document.querySelector<HTMLElement>('[data-testid="worker-picker"]')?.focus();
      return;
    }
    // Разовая: срок (или без срока), без дней и без повтора — сделанная
    // остаётся сделанной. Регулярная: дни, число и повтор, срока нет.
    const once = kind === "once";
    const dueDate = once ? parseDueDateInput(values.dueDateInput) : null;
    const base = {
      title: values.title,
      requiresPhoto: values.requiresPhoto ?? false,
      weekDays: !once && values.weekDays && values.weekDays.length > 0 ? values.weekDays : null,
      monthDay: once ? null : values.monthDay || null,
      dueDate,
      remindAt: remindAtPayload(values.remindAt),
      isRecurring: once ? false : (values.isRecurring ?? true),
      price: values.price || 0,
      category: values.category || null,
      description: values.description || null,
      // Чек-лист: только непустые пункты; done/фото стартуют пустыми.
      checklist: checklistPayload(checklistItems),
    };
    // Фото проблемы видно у разовой всегда, пример результата у регулярной —
    // только при «Закрыть только с фото результата».
    const withPhoto = !!examplePhotoFile && (once || base.requiresPhoto);

    setSubmitting(true);
    let created = 0;
    let failed = 0;
    const createdIds: number[] = [];
    let lastError = "";
    try {
      // По задаче на каждого выбранного: у каждого своя копия и своё фото.
      for (const workerId of freeModeWorkerIds) {
        try {
          const task: any = await createTask.mutateAsync({ ...base, workerId } as any);
          created += 1;
          if (task?.id) createdIds.push(task.id);
        } catch (err) {
          failed += 1;
          lastError = err instanceof Error ? err.message : "";
        }
      }
      let photoFailed = 0;
      if (withPhoto) {
        for (const id of createdIds) {
          if (!(await uploadExamplePhoto(id))) photoFailed += 1;
        }
      }

      if (created > 0 && failed === 0) {
        toast({
          title: photoFailed ? "Задача создана без фото" : "Успешно",
          description: photoFailed
            ? "Фото не загрузилось — добавьте его в правке задачи"
            : created === 1
              ? "Задача создана"
              : `Создано задач: ${created}`,
          variant: photoFailed ? "destructive" : "default",
        });
        setLocation("/");
      } else if (created > 0) {
        toast({
          title: "Создано с ошибками",
          description: `Успешно: ${created}, ошибок: ${failed}${lastError ? ` — ${lastError}` : ""}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ошибка",
          description: lastError || "Не удалось создать задачу",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (usersLoading || wesetupConfig.isLoading) return <PageSkeleton />;
  if (usersError && !usersUpdatedAt) return <div className="page-container py-8"><QueryError onRetry={() => { void retryUsers(); }} /></div>;

  return (
    <div className="page-screen">
      <div className="page-container">
        <div className="page-header">
          <button
            onClick={() => setLocation("/")}
            className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3">
            <div className="page-icon">
              <Plus className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title min-w-0 flex-1">Новая задача</h1>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={() => setTemplatesOpen(true)}
              aria-label="Из шаблона"
              title="Из шаблона — готовые задачи на смену для вашей отрасли"
              data-testid="open-templates"
            >
              <LayoutTemplate aria-hidden="true" />
            </Button>
          </div>
        </div>
        <TaskTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          onCreated={() => setLocation("/")}
        />

        <div className="content-panel">
          {/* Mode toggle: Free vs Journal — только если настроена интеграция WeSetup */}
          {wesetupEnabled && (
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
              onClick={() => {
                setMode("journal");
                setOpenJournalStep("journal");
              }}
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
                Любой журнал WeSetup: по строке или свободной задачей.
              </p>
            </button>
          </div>
          )}

          {mode === "journal" ? (
            <>
              <JournalModeComposer
                catalogLoading={catalogLoading}
                catalogError={catalogError}
                catalog={catalog}
                visibleJournals={visibleJournals}
                activeJournal={activeJournal}
                activeJournalData={activeJournalData}
                activeJournalUi={activeJournalUi}
                activeJournalSupportsRowMode={activeJournalSupportsRowMode}
                groupedFilteredRows={groupedFilteredRows}
                selectedRow={selectedRow}
                selectedDocumentTitle={selectedDocument?.documentTitle ?? null}
                selectedDocId={selectedDocId}
                selectedRowKeys={selectedRowKeys}
                journalTaskMode={journalTaskMode}
                journalSearch={journalSearch}
                rowSearch={rowSearch}
                journalTaskTitle={journalTaskTitle}
                journalWorkerUserIds={journalWorkerUserIds}
                assignableUsers={assignableUsers}
                selectedAssignableUserName={selectedAssignableUser?.name ?? null}
                openJournalStep={openJournalStep}
                openDocumentId={openDocumentId}
                isJournalDetailsReady={isJournalDetailsReady}
                journalSelectionSummary={journalSelectionSummary}
                journalDetailsSummary={journalDetailsSummary}
                journalReviewSummary={journalReviewSummary}
                journalSubmitting={journalSubmitting}
                onStepChange={setOpenJournalStep}
                onJournalSearchChange={setJournalSearch}
                onJournalSelect={(journal, rowsTotal) => {
                  setActiveJournal(journal.templateCode);
                  setSelectedDocId(journal.documents[0]?.documentId ?? "");
                  setSelectedRowKeys([]);
                  setRowSearch("");
                  setJournalTaskMode(
                    journal.hasAdapter && rowsTotal > 0 ? "row" : "free"
                  );
                  setOpenDocumentId(journal.documents[0]?.documentId ?? "");
                  setOpenJournalStep("details");
                }}
                onTaskModeChange={(nextMode) => {
                  setJournalTaskMode(nextMode);
                  if (nextMode === "free") {
                    setSelectedRowKeys([]);
                  }
                  setOpenJournalStep("details");
                }}
                onRowSearchChange={setRowSearch}
                onDocumentToggle={(documentId, canCollapse) => {
                  setOpenDocumentId(canCollapse ? "" : documentId);
                }}
                onRowToggle={(item) => {
                  // Switching documents clears prior selection — a batch
                  // submit targets a single document.
                  if (selectedDocId && selectedDocId !== item.document.documentId) {
                    setSelectedDocId(item.document.documentId);
                    setSelectedRowKeys([item.row.rowKey]);
                  } else {
                    setSelectedDocId(item.document.documentId);
                    setSelectedRowKeys((prev) =>
                      prev.includes(item.row.rowKey)
                        ? prev.filter((k) => k !== item.row.rowKey)
                        : [...prev, item.row.rowKey]
                    );
                  }
                  setOpenDocumentId(item.document.documentId);
                  if (!journalTaskTitle.trim()) {
                    setJournalTaskTitle(item.row.label);
                  }
                }}
                onRowSelectAllInDocument={(documentId, rowKeys) => {
                  setSelectedDocId(documentId);
                  setSelectedRowKeys(rowKeys);
                  setOpenDocumentId(documentId);
                }}
                onRowClear={() => setSelectedRowKeys([])}
                onDocumentChange={setSelectedDocId}
                onTitleChange={setJournalTaskTitle}
                onWorkersChange={setJournalWorkerUserIds}
                onCatalogRetry={() => void loadJournalCatalog(true)}
                onSubmit={onJournalSubmit}
              />
            </>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="quick-task-form" noValidate>
                {/* Разовая — «отмыть тут, вот фото»: срок и фото проблемы.
                    Регулярная — дни недели, число месяца и повтор. */}
                <div className="task-kind-switch" role="radiogroup" aria-label="Тип задачи">
                  {([
                    ["once", "Разовая", Zap],
                    ["recurring", "Регулярная", Repeat],
                  ] as const).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={kind === value}
                      onClick={() => setKind(value)}
                      className="task-kind-option"
                      data-testid={`task-kind-${value}`}
                    >
                      <Icon aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Что нужно сделать?"
                          aria-label="Название"
                          className="things-input quick-task-title"
                          maxLength={255}
                          enterKeyHint="next"
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
                          placeholder="Описание — необязательно"
                          aria-label="Описание задачи"
                          className="things-input min-h-[72px] resize-none"
                          rows={2}
                          maxLength={5000}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <WorkerPicker
                    users={users}
                    value={freeModeWorkerIds}
                    onChange={(ids) => {
                      setFreeModeWorkerIds(ids);
                      if (ids.length) setWorkersInvalid(false);
                    }}
                    invalid={workersInvalid}
                  />
                  {workersInvalid ? (
                    <p className="quick-task-hint quick-task-hint--error" role="alert">Выберите ответственного</p>
                  ) : freeModeWorkerIds.length > 1 ? (
                    <p className="quick-task-hint">Каждый получит свою копию задачи.</p>
                  ) : null}
                </div>

                {kind === "once" ? (
                  <>
                    <PhotoSlot
                      id="problem-photo-upload"
                      title="Фото проблемы"
                      hint="Сотрудник увидит его в задаче"
                      icon={Camera}
                      preview={examplePhotoPreview}
                      inputRef={examplePhotoInputRef}
                      onSelect={handleExamplePhotoSelect}
                      onRemove={removeExamplePhoto}
                    />
                    <DueDateQuick form={form} />
                  </>
                ) : (
                  <TaskScheduleFields form={form} allowDue={false} />
                )}

                <div className="quick-task-more">
                  <button
                    type="button"
                    className="quick-task-more-toggle"
                    aria-expanded={moreOpen}
                    aria-controls="quick-task-more"
                    onClick={() => setMoreOpen((v) => !v)}
                    data-testid="task-more-toggle"
                  >
                    <SlidersHorizontal aria-hidden />
                    <span className="quick-task-more-text">
                      Ещё
                      <small>{moreSummary}</small>
                    </span>
                    <ChevronDown aria-hidden className={moreOpen ? "rotate-180" : ""} />
                  </button>

                  <div id="quick-task-more" hidden={!moreOpen} className="quick-task-more-body">
                    <div className="quick-task-group">
                      <p className="quick-task-caption">
                        <ListChecks aria-hidden />
                        Чек-лист
                      </p>
                      <ChecklistEditor items={checklistItems} onChange={setChecklistItems} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder="Категория: уборка, кухня…"
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
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                placeholder="Премия за выполнение, ₽"
                                aria-label="Премия за выполнение, ₽"
                                className="things-input"
                                {...field}
                                value={field.value === "0" ? "" : field.value}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="requiresPhoto"
                      render={({ field }) => (
                        <FormItem className="quick-task-group">
                          <div className="flex flex-row items-start gap-3 space-y-0">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="cursor-pointer">Закрыть только с фото результата</FormLabel>
                              <p className="text-xs text-muted-foreground">Без фото сотрудник не отметит задачу выполненной</p>
                            </div>
                          </div>

                          {/* Пример результата — у регулярной; у разовой это место занимает фото проблемы. */}
                          {field.value && kind === "recurring" && (
                            <div className="pt-3 border-t border-border/30">
                              <PhotoSlot
                                id="example-photo-upload"
                                title="Пример результата"
                                hint="Как должно выглядеть сделанное"
                                icon={ImagePlus}
                                preview={examplePhotoPreview}
                                inputRef={examplePhotoInputRef}
                                onSelect={handleExamplePhotoSelect}
                                onRemove={removeExamplePhoto}
                              />
                            </div>
                          )}
                        </FormItem>
                      )}
                    />

                    {kind === "once" && (
                      <RemindAtField form={form} className="task-schedule-field quick-task-group" />
                    )}
                  </div>
                </div>

                <div className="quick-task-actions">
                  <Button type="button" variant="ghost" onClick={() => setLocation("/")} className="border border-border/50">
                    Отмена
                  </Button>
                  <Button
                    type="submit"
                    loading={submitting}
                    loadingLabel="Создание…"
                    className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl"
                  >
                    Создать
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
