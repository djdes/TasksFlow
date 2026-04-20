import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateTask } from "@/hooks/use-tasks";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { JournalModeComposer } from "@/components/JournalModeComposer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  User,
  Plus,
  Calendar,
  RefreshCw,
  CalendarDays,
  Coins,
  Tag,
  FileText,
  ImagePlus,
  X,
  BookOpen,
  Sparkles,
} from "lucide-react";
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

  // ──── WeSetup journal mode ────
  const [mode, setMode] = useState<"free" | "journal">("free");
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
  const [selectedRowKey, setSelectedRowKey] = useState<string>("");
  const [journalTaskTitle, setJournalTaskTitle] = useState<string>("");
  const [journalWorkerUserId, setJournalWorkerUserId] = useState<string>("");
  const [journalSubmitting, setJournalSubmitting] = useState(false);
  const [openJournalStep, setOpenJournalStep] = useState<
    "journal" | "details" | "review"
  >("journal");
  const [openDocumentId, setOpenDocumentId] = useState<string>("");
  // Use a ref instead of state so a failed fetch doesn't re-trigger
  // the effect when error/loading state flips back. Otherwise React
  // hot-loops requests until the dev rate-limit kills the server.
  const catalogAttemptedRef = useRef(false);
  useEffect(() => {
    if (mode !== "journal") return;
    if (catalogAttemptedRef.current) return;
    catalogAttemptedRef.current = true;
    setCatalogLoading(true);
    setCatalogError(null);
    fetch("/api/wesetup/journals-catalog", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.message || `WeSetup ${r.status}`);
        }
        return (await r.json()) as WesetupCatalog;
      })
      .then((data) => {
        setCatalog(data);
        if (data.journals.length > 0) {
          setActiveJournal(data.journals[0].templateCode);
        }
      })
      .catch((err) => setCatalogError(err.message || "Ошибка загрузки"))
      .finally(() => setCatalogLoading(false));
  }, [mode]);

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
  const selectedRow = useMemo(
    () =>
      flatRows.find(
        (item) =>
          item.document.documentId === selectedDocId &&
          item.row.rowKey === selectedRowKey
      ) ?? null,
    [flatRows, selectedDocId, selectedRowKey]
  );
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
  const selectedAssignableUser = useMemo(
    () =>
      assignableUsers.find(
        (worker) => worker.userId === journalWorkerUserId
      ) ?? null,
    [assignableUsers, journalWorkerUserId]
  );
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
      : Boolean(selectedDocId && journalTaskTitle.trim() && journalWorkerUserId);
  const journalSelectionSummary = activeJournalData
    ? `${activeJournalData.label} · ${activeJournalData.documents.length} док.`
    : null;
  const journalDetailsSummary = selectedRow
    ? `${activeJournalUi.modeRowLabel} · ${selectedRow.row.label}`
    : selectedDocument && journalTaskTitle.trim()
    ? `${activeJournalUi.modeFreeLabel} · ${journalTaskTitle.trim()}`
    : null;
  const journalReviewSummary = isJournalDetailsReady
    ? journalTaskMode === "row" && selectedRow
      ? `${selectedRow.document.documentTitle} · ${selectedRow.row.label}`
      : `${selectedDocument?.documentTitle ?? "Документ"} · ${
          selectedAssignableUser?.name ?? "Сотрудник"
        }`
    : null;

  useEffect(() => {
    if (!activeJournalData) {
      setSelectedDocId("");
      setSelectedRowKey("");
      return;
    }
    const documentIds = new Set(
      activeJournalData.documents.map((document) => document.documentId)
    );
    if (!documentIds.has(selectedDocId)) {
      setSelectedDocId(activeJournalData.documents[0]?.documentId ?? "");
    }
    const rowBelongsToActiveJournal = activeJournalRows.some(
      (item) =>
        item.document.documentId === selectedDocId &&
        item.row.rowKey === selectedRowKey
    );
    if (!rowBelongsToActiveJournal) {
      setSelectedRowKey("");
    }
    if (!activeJournalSupportsRowMode && journalTaskMode !== "free") {
      setJournalTaskMode("free");
    }
  }, [
    activeJournalData,
    activeJournalRows,
    activeJournalSupportsRowMode,
    journalTaskMode,
    selectedDocId,
    selectedRowKey,
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
    },
  });

  // Проверка прав администратора — после всех хуков, иначе React
  // ругается на «Rendered more hooks than during the previous render»,
  // потому что guest-render оборвался бы до использования useEffect и
  // useMemo выше.
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
      if (!journalWorkerUserId) {
        toast({
          title: "Не выбран сотрудник",
          description: "Укажите сотрудника, которому уйдёт журнальная задача",
          variant: "destructive",
        });
        return;
      }
    }

    const requestBody = isRowMode
      ? {
          journalCode: selectedRow!.journal.templateCode,
          documentId: selectedRow!.document.documentId,
          rowKey: selectedRow!.row.rowKey,
          ...(customTitle ? { title: customTitle } : {}),
        }
      : {
          journalCode: activeJournalData.templateCode,
          documentId: selectedDocId,
          title: customTitle,
          workerUserId: journalWorkerUserId,
        };

    setJournalSubmitting(true);
    try {
      const response = await fetch("/api/wesetup/bind-row", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Ошибка связи с WeSetup");
      }
      const toastLabel = isRowMode
        ? `${selectedRow!.journal.label} → ${customTitle || selectedRow!.row.label}`
        : `${activeJournalData.label} → ${customTitle}`;
      toast({
        title: data?.created ? "Задача создана" : "Задача уже существовала",
        description: `${toastLabel} (TasksFlow #${data?.tasksflowTaskId})`,
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
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
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

        <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-xl p-5 sm:p-8">
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
                selectedRowKey={selectedRowKey}
                journalTaskMode={journalTaskMode}
                journalSearch={journalSearch}
                rowSearch={rowSearch}
                journalTaskTitle={journalTaskTitle}
                journalWorkerUserId={journalWorkerUserId}
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
                  setSelectedRowKey("");
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
                    setSelectedRowKey("");
                  }
                  setOpenJournalStep("details");
                }}
                onRowSearchChange={setRowSearch}
                onDocumentToggle={(documentId, canCollapse) => {
                  setOpenDocumentId(canCollapse ? "" : documentId);
                }}
                onRowSelect={(item) => {
                  setSelectedDocId(item.document.documentId);
                  setSelectedRowKey(item.row.rowKey);
                  setOpenDocumentId(item.document.documentId);
                  if (!journalTaskTitle.trim()) {
                    setJournalTaskTitle(item.row.label);
                  }
                  setOpenJournalStep("review");
                }}
                onDocumentChange={setSelectedDocId}
                onTitleChange={setJournalTaskTitle}
                onWorkerChange={setJournalWorkerUserId}
                onSubmit={onJournalSubmit}
              />
              {false ? (
            <div className="space-y-4">
              {catalogLoading ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  Загружаем каталог из WeSetup…
                </div>
              ) : catalogError ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {catalogError}
                </div>
              ) : catalog?.journals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  В WeSetup пока нет журналов с поддержкой TasksFlow.
                </div>
              ) : catalog ? (
                <>
                  <Input
                    type="search"
                    value={journalSearch}
                    onChange={(e) => setJournalSearch(e.target.value)}
                    placeholder="Поиск по журналам: уборка, здоровье, медкнижки…"
                    className="things-input"
                    data-testid="journal-search"
                  />

                  {visibleJournals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                      По этому запросу журналы не найдены.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {visibleJournals.map((j) => {
                        const active = j.templateCode === activeJournal;
                        const rowsTotal = j.documents.reduce(
                          (sum, d) => sum + d.rows.length,
                          0
                        );
                        return (
                          <button
                            key={j.templateCode}
                            type="button"
                            onClick={() => {
                              setActiveJournal(j.templateCode);
                              setSelectedDocId(j.documents[0]?.documentId ?? "");
                              setSelectedRowKey("");
                              setRowSearch("");
                              setJournalTaskMode(
                                j.hasAdapter && rowsTotal > 0 ? "row" : "free"
                              );
                            }}
                            className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                              active
                                ? "border-primary bg-primary/10 font-medium"
                                : "border-border/50 hover:bg-muted/30"
                            }`}
                            data-testid={`journal-tab-${j.templateCode}`}
                          >
                            {j.label}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {j.documents.length} док.
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeJournalData ? (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{activeJournalData!.label}</div>
                        <div className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          {activeJournalData!.documents.length} документов
                        </div>
                        <div className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          {activeJournalData!.hasAdapter
                            ? "Есть строки журнала"
                            : "Свободные задачи"}
                        </div>
                      </div>
                      {activeJournalData!.description ? (
                        <div className="mt-1 text-sm text-muted-foreground">
                          {activeJournalData!.description}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeJournalSupportsRowMode ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setJournalTaskMode("row")}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          journalTaskMode === "row"
                            ? "border-primary bg-primary/10"
                            : "border-border/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="font-medium">По строке журнала</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Привязка к существующей строке журнала с автоисполнителем.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setJournalTaskMode("free");
                          setSelectedRowKey("");
                        }}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          journalTaskMode === "free"
                            ? "border-primary bg-primary/10"
                            : "border-border/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="font-medium">Свободная задача</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Любой текст задачи в выбранный журнал и документ.
                        </div>
                      </button>
                    </div>
                  ) : null}

                  {activeJournalData ? (
                    journalTaskMode === "row" && activeJournalSupportsRowMode ? (
                      <>
                        <Input
                          type="search"
                          value={rowSearch}
                          onChange={(e) => setRowSearch(e.target.value)}
                          placeholder="Поиск по строкам: сотрудник, документ, строка…"
                          className="things-input"
                          data-testid="journal-row-search"
                        />

                        <div className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-xl border border-border/50 p-2">
                          {filteredRows.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              По строкам ничего не найдено. Попробуйте другой запрос.
                            </div>
                          ) : (
                            filteredRows.map((item) => {
                              const taken = Boolean(item.row.existingTasksflowTaskId);
                              const selected =
                                selectedDocId === item.document.documentId &&
                                selectedRowKey === item.row.rowKey;
                              return (
                                <button
                                  type="button"
                                  key={`${item.document.documentId}/${item.row.rowKey}`}
                                  disabled={taken}
                                  onClick={() => {
                                    setSelectedDocId(item.document.documentId);
                                    setSelectedRowKey(item.row.rowKey);
                                    if (!journalTaskTitle.trim()) {
                                      setJournalTaskTitle(item.row.label);
                                    }
                                  }}
                                  className={`flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    selected
                                      ? "border-primary bg-primary/10"
                                      : taken
                                      ? "border-border/30 bg-muted/20 opacity-50"
                                      : "border-border/50 hover:bg-muted/30"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                      {item.row.label}
                                    </div>
                                    {item.row.sublabel ? (
                                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {item.row.sublabel}
                                      </div>
                                    ) : null}
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {item.journal.label} · {item.document.documentTitle} ·{" "}
                                      {item.document.period.from}—{item.document.period.to}
                                    </div>
                                  </div>
                                  {taken ? (
                                    <div className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                      #{item.row.existingTasksflowTaskId}
                                    </div>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            Название задачи
                          </div>
                          <Input
                            value={journalTaskTitle}
                            onChange={(e) => setJournalTaskTitle(e.target.value)}
                            placeholder="Оставьте как есть или задайте свой текст"
                            className="things-input"
                          />
                        </div>

                        {selectedRow ? (
                          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                            <div className="font-medium">Будет создана задача:</div>
                            <div className="mt-1 text-muted-foreground">
                              «{journalTaskTitle.trim() || selectedRow!.row.label}» в журнале «
                              {selectedRow!.journal.label}». Исполнитель и расписание
                              подставятся автоматически из строки журнала.
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {activeJournalData!.documents.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                            В этом журнале пока нет активных документов.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <div className="text-sm font-medium">Документ журнала</div>
                              <Select
                                value={selectedDocId}
                                onValueChange={setSelectedDocId}
                              >
                                <SelectTrigger className="things-input w-full">
                                  <SelectValue placeholder="Выберите документ" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeJournalData!.documents.map((document) => (
                                    <SelectItem
                                      key={document.documentId}
                                      value={document.documentId}
                                    >
                                      {document.documentTitle} · {document.period.from}—{document.period.to}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <div className="text-sm font-medium">Текст задачи</div>
                              <Input
                                value={journalTaskTitle}
                                onChange={(e) => setJournalTaskTitle(e.target.value)}
                                placeholder="Например: Проверить температуру витрины"
                                className="things-input"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-sm font-medium">Сотрудник</div>
                              <Select
                                value={journalWorkerUserId}
                                onValueChange={setJournalWorkerUserId}
                              >
                                <SelectTrigger className="things-input w-full">
                                  <SelectValue placeholder="Кому назначить задачу" />
                                </SelectTrigger>
                                <SelectContent>
                                  {assignableUsers.length === 0 ? (
                                    <div className="p-3 text-sm text-muted-foreground">
                                      В WeSetup ещё не синхронизированы сотрудники для TasksFlow.
                                    </div>
                                  ) : (
                                    assignableUsers.map((worker) => (
                                      <SelectItem key={worker.userId} value={worker.userId}>
                                        {worker.name}
                                        {worker.positionTitle
                                          ? ` · ${worker.positionTitle}`
                                          : ""}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            {selectedDocId && journalTaskTitle.trim() ? (
                              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                                <div className="font-medium">Будет создана задача:</div>
                                <div className="mt-1 text-muted-foreground">
                                  «{journalTaskTitle.trim()}» в журнале «{activeJournalData!.label}»
                                  {selectedAssignableUser
                                    ? ` для ${selectedAssignableUser!.name}`
                                    : ""}.
                                  После выполнения WeSetup добавит запись в выбранный документ.
                                </div>
                              </div>
                            ) : null}
                          </>
                        )}
                      </>
                    )
                  ) : null}
                </>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="lg"
                  disabled={
                    journalSubmitting ||
                    !activeJournalData ||
                    (journalTaskMode === "row" && activeJournalSupportsRowMode
                      ? !selectedRow
                      : !selectedDocId ||
                        !journalTaskTitle.trim() ||
                        !journalWorkerUserId)
                  }
                  onClick={onJournalSubmit}
                  className="things-button"
                >
                  {journalSubmitting ? "Создаю…" : "Создать журнальную задачу"}
                </Button>
              </div>
            </div>
              ) : null}
            </>
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
