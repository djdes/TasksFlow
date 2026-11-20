/**
 * Должностная инструкция сотрудника → задачи (shared/job-description.ts).
 *
 * JobDescriptionField — вкладки «Текст / Word / Excel / PDF», а если
 * инструкции нет — «Подобрать по должности» или «Как у коллеги».
 * JobDescriptionReviewDialog — «Задачи из инструкции»: отметить нужные,
 * поправить названия, убрать задачи прошлой инструкции, создать; после —
 * что стало с созданными (на месте, переименована, удалена).
 */
import { useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGroup, motion } from "framer-motion";
import { Briefcase, Check, Copy, FileSpreadsheet, FileText, FileType, Loader2, Pencil, RotateCcw, Sparkles, Type, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckMark } from "@/components/ui/check-mark";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMotionPreference } from "@/contexts/MotionContext";
import {
  JOB_DESCRIPTION_ACCEPT,
  JOB_DESCRIPTION_MAX_CHARS,
  JOB_DESCRIPTION_MAX_FILE_BYTES,
  JOB_DESCRIPTION_MIN_CHARS,
  JOB_POSITION_MIN_CHARS,
  jobDescriptionLabel,
  proposalScheduleLabel,
  sourceFromFileName,
  type JobDescriptionDetails,
  type JobDescriptionState,
} from "@shared/job-description";

type FileKind = "docx" | "xlsx" | "pdf";
export type JobDescriptionKind = "text" | FileKind | "position" | "copy";
export type JobDescriptionValue = {
  kind: JobDescriptionKind;
  text: string;
  file: File | null;
  /** «Как у коллеги»: чьи задачи взять. */
  copyFrom: { userId: number; name: string } | null;
  /** «Создать сразу, без проверки». */
  autoApply: boolean;
};
/** Коллега на той же должности, у которого уже есть задачи из инструкции. */
export type JobDescriptionTemplate = { userId: number; name: string; count: number };

export const emptyJobDescription = (): JobDescriptionValue => ({ kind: "text", text: "", file: null, copyFrom: null, autoApply: false });

/** Заполнено ли поле вообще — пустое просто пропускаем. */
export function hasJobDescription(v: JobDescriptionValue): boolean {
  if (v.kind === "position") return true;
  if (v.kind === "copy") return v.copyFrom !== null;
  return v.kind === "text" ? v.text.trim().length > 0 : v.file !== null;
}

/** Что не так с заполненным полем — до создания сотрудника, чтобы не узнать об ошибке после. */
export function jobDescriptionProblem(v: JobDescriptionValue, position?: string | null): string | null {
  if (!hasJobDescription(v)) return null;
  if (v.kind === "position") {
    return (position ?? "").trim().length < JOB_POSITION_MIN_CHARS ? "Укажите должность — по ней подберём задачи" : null;
  }
  if (v.kind === "copy") return null;
  if (v.kind === "text") {
    return v.text.trim().length < JOB_DESCRIPTION_MIN_CHARS ? "Слишком коротко — добавьте пару обязанностей" : null;
  }
  const file = v.file!;
  if (file.size > JOB_DESCRIPTION_MAX_FILE_BYTES) return "Файл больше 5 МБ — сохраните без картинок или вставьте текстом";
  const source = sourceFromFileName(file.name);
  if (source === "legacy") return "Старый формат — сохраните как .docx или .xlsx";
  if (source !== v.kind) return v.kind === "docx" ? "Нужен файл Word (.docx)" : v.kind === "xlsx" ? "Нужен файл Excel (.xlsx)" : "Нужен файл PDF";
  return null;
}

export type JobDescriptionUpload = { gatewayReady: boolean; state: JobDescriptionState };

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || fallback);
  return json as T;
}

/** Отправить инструкцию сотрудника на разбор (или взять задачи коллеги). */
export async function uploadJobDescription(userId: number, v: JobDescriptionValue, position?: string | null): Promise<JobDescriptionUpload> {
  const body = new FormData();
  if (v.kind === "text") body.append("text", v.text);
  else if (v.kind === "position") {
    body.append("mode", "position");
    if (position) body.append("position", position);
  } else if (v.kind === "copy" && v.copyFrom) body.append("copyFromUserId", String(v.copyFrom.userId));
  else if (v.file) body.append("file", v.file, v.file.name);
  if (v.autoApply) body.append("autoApply", "true");
  const res = await fetchOrFriendlyError(`/api/users/${userId}/job-description`, {
    method: "POST",
    credentials: "include",
    body,
    signal: AbortSignal.timeout(60_000),
  });
  return jsonOrThrow<JobDescriptionUpload>(res, "Не удалось отправить инструкцию");
}

const TABS: Array<{ kind: "text" | FileKind; label: string; Icon: typeof Type }> = [
  { kind: "text", label: "Текст", Icon: Type },
  { kind: "docx", label: "Word", Icon: FileText },
  { kind: "xlsx", label: "Excel", Icon: FileSpreadsheet },
  { kind: "pdf", label: "PDF", Icon: FileType },
];
const FILE_TITLES: Record<FileKind, string> = { docx: "Выбрать файл Word", xlsx: "Выбрать файл Excel", pdf: "Выбрать PDF" };
const FILE_META: Record<FileKind, string> = { docx: ".docx · до 5 МБ", xlsx: ".xlsx · до 5 МБ", pdf: "PDF с текстом · до 5 МБ" };
const FileIcon = ({ kind }: { kind: FileKind }) => (kind === "xlsx" ? <FileSpreadsheet aria-hidden /> : kind === "pdf" ? <FileType aria-hidden /> : <FileText aria-hidden />);

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

export function JobDescriptionField({ value, onChange, disabled = false, error, heading = true, position, templates = [] }: {
  value: JobDescriptionValue;
  onChange: (v: JobDescriptionValue) => void;
  disabled?: boolean;
  error?: string | null;
  /** В окне «Инструкция» заголовок и пояснение даёт само окно. */
  heading?: boolean;
  /** Должность из формы — для «Подобрать по должности». */
  position?: string | null;
  /** Коллеги на той же должности с готовыми задачами — «Как у Олега». */
  templates?: JobDescriptionTemplate[];
}) {
  const id = useId();
  const { reduced } = useMotionPreference();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const problem = error ?? jobDescriptionProblem(value, position);
  const tabKind = value.kind === "position" || value.kind === "copy" ? null : value.kind;
  const pickFile = (file: File | null | undefined) => {
    if (!file) return;
    const source = sourceFromFileName(file.name);
    // Перетащили Excel во вкладку Word — просто переключаем вкладку.
    const kind = source === "docx" || source === "xlsx" || source === "pdf" ? source : value.kind;
    onChange({ ...value, kind, file, copyFrom: null });
  };
  const positionLabel = (position ?? "").trim();

  return (
    <div className="job-desc" data-testid="job-description">
      {heading ? (
        <>
          <div className="job-desc-head">
            <span className="job-desc-icon" aria-hidden><Sparkles /></span>
            <span className="job-desc-title" id={`${id}-title`}>Должностная инструкция</span>
            <span className="job-desc-optional">необязательно</span>
          </div>
          <p className="job-desc-hint" id={`${id}-hint`}>
            Прочитаем инструкцию и предложим сотруднику задачи по его обязанностям — вы отметите нужные.
            Инструкции нет — подберём по должности.
          </p>
        </>
      ) : (
        <span className="sr-only" id={`${id}-title`}>Должностная инструкция</span>
      )}

      <LayoutGroup id={id}>
        <div className="job-desc-tabs" role="tablist" aria-labelledby={`${id}-title`}>
          {TABS.map(({ kind, label, Icon }) => {
            const active = tabKind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${id}-panel`}
                className={`job-desc-tab ${active ? "is-active" : ""}`}
                disabled={disabled}
                onClick={() => onChange({ ...value, kind, file: kind === value.kind ? value.file : null, copyFrom: null })}
                data-testid={`job-description-tab-${kind}`}
              >
                {active && <motion.span className="tab-indicator" layoutId="job-desc-tab" initial={false} transition={reduced ? { duration: 0 } : { type: "spring", duration: 0.32, bounce: 0 }} />}
                <Icon aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div id={`${id}-panel`} role="tabpanel" aria-describedby={heading ? `${id}-hint` : undefined}>
        {value.kind === "position" || value.kind === "copy" ? (
          <div className="job-desc-file" data-testid="job-description-alt">
            {value.kind === "position" ? <Briefcase aria-hidden /> : <Copy aria-hidden />}
            <span className="job-desc-file-name">
              {value.kind === "position"
                ? positionLabel ? `Подберём задачи для «${positionLabel}»` : "Подберём задачи по должности"
                : `Задачи коллеги: ${value.copyFrom?.name ?? "—"}`}
            </span>
            <button type="button" className="job-desc-file-remove" onClick={() => onChange({ ...value, kind: "text", copyFrom: null })} aria-label="Отменить" disabled={disabled}>
              <X aria-hidden />
            </button>
          </div>
        ) : value.kind === "text" ? (
          <Textarea
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder="Вставьте текст: обязанности, что и как часто делать"
            className="job-desc-text"
            rows={5}
            maxLength={JOB_DESCRIPTION_MAX_CHARS}
            disabled={disabled}
            aria-invalid={problem ? true : undefined}
            data-testid="job-description-text"
          />
        ) : value.file ? (
          <div className="job-desc-file" data-testid="job-description-file">
            <FileIcon kind={value.kind} />
            <span className="job-desc-file-name">{value.file.name}</span>
            <span className="job-desc-file-size">{sizeLabel(value.file.size)}</span>
            <button type="button" className="job-desc-file-remove" onClick={() => onChange({ ...value, file: null })} aria-label="Убрать файл" disabled={disabled}>
              <X aria-hidden />
            </button>
          </div>
        ) : (
          <label
            className={`job-desc-drop ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
          >
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept={JOB_DESCRIPTION_ACCEPT[value.kind as FileKind]}
              disabled={disabled}
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              data-testid="job-description-input"
            />
            <FileIcon kind={value.kind as FileKind} />
            <span className="job-desc-drop-title">{FILE_TITLES[value.kind as FileKind]}</span>
            <span className="job-desc-drop-meta">{FILE_META[value.kind as FileKind]}</span>
          </label>
        )}
      </div>

      {/* Инструкции нет: по должности или как у коллеги на той же должности. */}
      {value.kind !== "position" && value.kind !== "copy" && !hasJobDescription(value) && (
        <div className="job-desc-alts">
          <button type="button" className="due-quick-chip" disabled={disabled} onClick={() => onChange({ ...value, kind: "position", file: null, copyFrom: null })} data-testid="job-description-by-position">
            <Briefcase aria-hidden />
            {positionLabel ? `По должности «${positionLabel.length > 24 ? `${positionLabel.slice(0, 23)}…` : positionLabel}»` : "Подобрать по должности"}
          </button>
          {templates.slice(0, 3).map((t) => (
            <button key={t.userId} type="button" className="due-quick-chip" disabled={disabled} onClick={() => onChange({ ...value, kind: "copy", file: null, copyFrom: { userId: t.userId, name: t.name } })} data-testid={`job-description-copy-${t.userId}`}>
              <Copy aria-hidden />
              Как у коллеги: {t.name}
            </button>
          ))}
        </div>
      )}

      {hasJobDescription(value) && (
        <label className="job-desc-auto">
          <input type="checkbox" className="app-check" checked={value.autoApply} disabled={disabled} onChange={(e) => onChange({ ...value, autoApply: e.target.checked })} data-testid="job-description-auto" />
          <span>Создать задачи сразу, без проверки</span>
        </label>
      )}
      {problem && <p className="job-desc-error" role="alert">{problem}</p>}
    </div>
  );
}

/** Статус инструкции в строке сотрудника; «Проверьте задачи» и «Задач из инструкции» открывают окно. */
export function JobDescriptionBadge({ state, gatewayReady, onRetry, retrying, onOpen }: {
  state: JobDescriptionState;
  gatewayReady: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  onOpen?: () => void;
}) {
  const busy = state.status === "queued" || state.status === "processing";
  const tone = state.status === "failed" ? "is-failed" : state.status === "review" ? "is-review" : state.status === "done" ? "is-done" : "is-busy";
  const label = jobDescriptionLabel(state, gatewayReady);
  const openable = onOpen && (state.status === "review" || state.status === "done");
  const content = (
    <>
      {busy && gatewayReady ? <Loader2 className="animate-spin" aria-hidden /> : state.status === "review" ? <Check aria-hidden /> : <Sparkles aria-hidden />}
      {label}
    </>
  );
  return (
    <span className="job-desc-badge-row">
      {openable ? (
        <button type="button" className={`job-desc-badge is-button ${tone}`} onClick={onOpen} data-testid={`job-description-state-${state.userId}`}>
          {content}
        </button>
      ) : (
        <span className={`job-desc-badge ${tone}`} title={state.error ?? state.fileName ?? undefined} data-testid={`job-description-state-${state.userId}`}>
          {content}
        </span>
      )}
      {state.status === "failed" && onRetry && (
        <Button type="button" variant="ghost" size="sm" className="job-desc-retry" onClick={onRetry} disabled={retrying}>
          <RotateCcw aria-hidden />
          Повторить
        </Button>
      )}
      {state.status === "failed" && state.error && <span className="job-desc-badge-error">{state.error}</span>}
    </span>
  );
}

export const JOB_DESCRIPTIONS_KEY = "/api/job-descriptions";
type JobDescriptionList = { gatewayReady: boolean; items: JobDescriptionState[] };

/** Состояния инструкций компании; пока что-то разбирается — спрашиваем каждые 4 секунды. */
export function useJobDescriptions(enabled: boolean) {
  return useQuery<JobDescriptionList>({
    queryKey: [JOB_DESCRIPTIONS_KEY],
    queryFn: async () => {
      const res = await fetchOrFriendlyError(JOB_DESCRIPTIONS_KEY, { credentials: "include", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error("Не удалось загрузить инструкции");
      const json = (await res.json()) as Partial<JobDescriptionList> | null;
      return { gatewayReady: Boolean(json?.gatewayReady), items: Array.isArray(json?.items) ? json!.items : [] };
    },
    enabled,
    refetchInterval: (query) =>
      query.state.data?.items.some((s) => s.status === "queued" || s.status === "processing") ? 4000 : false,
  });
}

/** Тост после отправки: что будет дальше. */
export function uploadedToast(r: JobDescriptionUpload): { title: string; description: string } {
  if (r.state.status === "review") return { title: "Задачи готовы к проверке", description: "Откройте «Проверьте задачи» в строке сотрудника." };
  if (r.state.status === "done") return { title: "Задачи созданы", description: `Создано: ${r.state.tasksCreated}.` };
  const next = r.state.autoApply ? "задачи появятся у сотрудника" : "предложим задачи на проверку";
  return r.gatewayReady
    ? { title: "Инструкцию разбираем", description: `Через минуту-две ${next}.` }
    : { title: "Инструкция сохранена", description: "Разберём, когда подключат диспетчер разбора." };
}

/** «Инструкция» у уже добавленного сотрудника. */
export function JobDescriptionDialog({ userId, name, position, templates, open, onOpenChange }: {
  userId: number;
  name: string;
  position?: string | null;
  templates?: JobDescriptionTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState<JobDescriptionValue>(emptyJobDescription);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const send = useMutation({
    mutationFn: () => uploadJobDescription(userId, value, position),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: [JOB_DESCRIPTIONS_KEY] });
      toast(uploadedToast(r));
      setValue(emptyJobDescription());
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });
  const submit = () => {
    const problem = hasJobDescription(value) ? jobDescriptionProblem(value, position) : "Вставьте текст, выберите файл или подберите по должности";
    setError(problem);
    if (!problem) send.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!send.isPending) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="sm:max-w-lg" data-testid="job-description-dialog">
        <DialogHeader>
          <DialogTitle>Инструкция: {name}</DialogTitle>
          <DialogDescription>
            Прочитаем инструкцию и предложим задачи по обязанностям — вы отметите нужные. Новая инструкция
            заменит прежнюю: задачи, которых в ней нет, предложим убрать.
          </DialogDescription>
        </DialogHeader>
        <JobDescriptionField value={value} onChange={(v) => { setValue(v); setError(null); }} disabled={send.isPending} error={error} heading={false} position={position} templates={templates} />
        <Button type="button" onClick={submit} disabled={send.isPending} className="w-full" data-testid="job-description-submit">
          {send.isPending ? "Отправляем…" : "Разобрать инструкцию"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** «Задачи из инструкции»: проверить предложения перед созданием или посмотреть, что стало с созданными. */
export function JobDescriptionReviewDialog({ userId, name, open, onOpenChange }: {
  userId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = [`/api/users/${userId}/job-description`];
  const details = useQuery<JobDescriptionDetails>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetchOrFriendlyError(`/api/users/${userId}/job-description`, { credentials: "include", signal: AbortSignal.timeout(20_000) });
      return jsonOrThrow<JobDescriptionDetails>(res, "Не удалось загрузить задачи");
    },
    enabled: open,
  });
  const data = details.data;
  // Отметки и правки названий живут в окне до «Создать»; по умолчанию отмечено всё новое.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [keepStale, setKeepStale] = useState<Set<number>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const proposals = useMemo(() => data?.proposals ?? [], [data]);
  const chosen = useMemo(() => proposals.filter((p) => !p.exists && !unchecked.has(p.id)), [proposals, unchecked]);
  const stale = data?.stale ?? [];
  const removing = stale.filter((s) => !keepStale.has(s.taskId));

  const apply = useMutation({
    mutationFn: async () => {
      const edited = Object.fromEntries(Object.entries(titles).filter(([id, t]) => t.trim() && chosen.some((p) => p.id === id)));
      const res = await fetchOrFriendlyError(`/api/users/${userId}/job-description/apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include: chosen.map((p) => p.id), titles: edited, remove: removing.map((s) => s.taskId) }),
        signal: AbortSignal.timeout(60_000),
      });
      return jsonOrThrow<{ created: number; removed: number; skipped: number; errors: string[] }>(res, "Не удалось создать задачи");
    },
    onSuccess: async (r) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [JOB_DESCRIPTIONS_KEY] }),
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
      ]);
      const parts = [`создано ${r.created}`];
      if (r.removed) parts.push(`убрано ${r.removed}`);
      toast({ title: r.errors.length ? "Готово, но не всё" : "Задачи созданы", description: `${parts.join(", ")}.${r.errors.length ? ` ${r.errors[0]}` : ""}`, variant: r.errors.length ? "destructive" : undefined });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Ошибка", description: err.message, variant: "destructive" }),
  });

  const toggle = (id: string) => setUnchecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleStale = (id: number) => setKeepStale((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const review = data?.state.status === "review";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!apply.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl jd-review" data-testid="job-description-review">
        <DialogHeader>
          <DialogTitle>Задачи из инструкции: {name}</DialogTitle>
          <DialogDescription>
            {review
              ? "Отметьте, что поставить сотруднику. Название можно поправить — карандаш справа."
              : "Что создано из инструкции и что с этими задачами стало потом."}
          </DialogDescription>
        </DialogHeader>

        {details.isLoading ? (
          <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : details.isError ? (
          <div className="jd-review-error" role="alert">
            <p>{(details.error as Error).message}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => details.refetch()}>Повторить</Button>
          </div>
        ) : review ? (
          <>
            <ul className="jd-proposals" aria-label="Предложенные задачи">
              {proposals.map((p) => {
                const checked = !p.exists && !unchecked.has(p.id);
                const questions = p.checklist.filter((c) => c.options).length;
                const steps = p.checklist.length - questions;
                return (
                  <li key={p.id} className={`jd-proposal ${p.exists ? "is-existing" : ""}`} data-testid={`jd-proposal-${p.id}`}>
                    <button type="button" role="checkbox" aria-checked={checked} disabled={p.exists || apply.isPending} className="jd-proposal-toggle" onClick={() => toggle(p.id)}>
                      <CheckMark checked={checked} disabled={p.exists} />
                      <span className="jd-proposal-text">
                        <span className="jd-proposal-title">{titles[p.id]?.trim() || p.title}</span>
                        <span className="jd-proposal-meta">
                          <span>{proposalScheduleLabel(p)}</span>
                          <span>{p.requiresPhoto ? "с фото" : "без фото"}</span>
                          {steps > 0 && <span>{steps} {plural(steps, "шаг", "шага", "шагов")}</span>}
                          {questions > 0 && <span className="is-question">{questions} {plural(questions, "вопрос", "вопроса", "вопросов")}</span>}
                          {p.exists && <span className="is-existing">уже есть</span>}
                        </span>
                      </span>
                    </button>
                    {!p.exists && (
                      <button type="button" className="jd-proposal-edit" aria-label={`Поправить название: ${p.title}`} onClick={() => setEditing(editing === p.id ? null : p.id)} disabled={apply.isPending}>
                        <Pencil aria-hidden />
                      </button>
                    )}
                    {editing === p.id && (
                      <Input
                        autoFocus
                        className="jd-proposal-input"
                        value={titles[p.id] ?? p.title}
                        maxLength={255}
                        onChange={(e) => setTitles((t) => ({ ...t, [p.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(null); } }}
                        aria-label="Название задачи"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {stale.length > 0 && (
              <section className="jd-stale" aria-label="Больше нет в инструкции">
                <h3>Больше нет в инструкции — убрать?</h3>
                <ul>
                  {stale.map((s) => {
                    const remove = !keepStale.has(s.taskId);
                    return (
                      <li key={s.taskId}>
                        <button type="button" role="checkbox" aria-checked={remove} className="jd-proposal-toggle" onClick={() => toggleStale(s.taskId)} disabled={apply.isPending} data-testid={`jd-stale-${s.taskId}`}>
                          <CheckMark checked={remove} />
                          <span className="jd-proposal-title">{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <div className="jd-review-actions">
              <Button type="button" onClick={() => apply.mutate()} disabled={apply.isPending || (chosen.length === 0 && removing.length === 0)} data-testid="jd-apply">
                {apply.isPending ? "Создаём…" : chosen.length > 0
                  ? `Создать ${chosen.length} ${plural(chosen.length, "задачу", "задачи", "задач")}${removing.length ? `, убрать ${removing.length}` : ""}`
                  : `Убрать ${removing.length}`}
              </Button>
            </div>
          </>
        ) : (
          <ul className="jd-created" aria-label="Созданные задачи">
            {(data?.created ?? []).length === 0 && <li className="jd-created-empty">Из этой инструкции задачи не создавались.</li>}
            {(data?.created ?? []).map((c) => (
              <li key={c.taskId} className={`jd-created-row is-${c.state}`}>
                <span className="jd-proposal-title">{c.state === "edited" ? c.currentTitle : c.title}</span>
                <span className="jd-created-state">
                  {c.state === "active" ? "на месте" : c.state === "edited" ? `переименована, было «${c.title}»` : "удалена"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
