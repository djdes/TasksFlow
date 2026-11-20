/**
 * Должностная инструкция сотрудника: вкладки «Текст», «Word», «Excel»
 * и пояснение, что с ней будет. По инструкции сервер через диспетчера
 * создаст сотруднику задачи (shared/job-description.ts).
 */
import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGroup, motion } from "framer-motion";
import { FileSpreadsheet, FileText, Loader2, RotateCcw, Sparkles, Type, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMotionPreference } from "@/contexts/MotionContext";
import {
  JOB_DESCRIPTION_ACCEPT,
  JOB_DESCRIPTION_MAX_CHARS,
  JOB_DESCRIPTION_MAX_FILE_BYTES,
  JOB_DESCRIPTION_MIN_CHARS,
  jobDescriptionLabel,
  sourceFromFileName,
  type JobDescriptionState,
} from "@shared/job-description";

export type JobDescriptionKind = "text" | "docx" | "xlsx";
export type JobDescriptionValue = { kind: JobDescriptionKind; text: string; file: File | null };

export const emptyJobDescription = (): JobDescriptionValue => ({ kind: "text", text: "", file: null });

/** Заполнено ли поле вообще — пустое просто пропускаем. */
export function hasJobDescription(v: JobDescriptionValue): boolean {
  return v.kind === "text" ? v.text.trim().length > 0 : v.file !== null;
}

/** Что не так с заполненным полем — до создания сотрудника, чтобы не узнать об ошибке после. */
export function jobDescriptionProblem(v: JobDescriptionValue): string | null {
  if (!hasJobDescription(v)) return null;
  if (v.kind === "text") {
    return v.text.trim().length < JOB_DESCRIPTION_MIN_CHARS ? "Слишком коротко — добавьте пару обязанностей" : null;
  }
  const file = v.file!;
  if (file.size > JOB_DESCRIPTION_MAX_FILE_BYTES) return "Файл больше 5 МБ — сохраните без картинок или вставьте текстом";
  const source = sourceFromFileName(file.name);
  if (source === "legacy") return "Старый формат — сохраните как .docx или .xlsx";
  if (source !== v.kind) return v.kind === "docx" ? "Нужен файл Word (.docx)" : "Нужен файл Excel (.xlsx)";
  return null;
}

export type JobDescriptionUpload = { gatewayReady: boolean; state: JobDescriptionState };

/** Отправить инструкцию сотрудника на разбор. */
export async function uploadJobDescription(userId: number, v: JobDescriptionValue): Promise<JobDescriptionUpload> {
  const body = new FormData();
  if (v.kind === "text") body.append("text", v.text);
  else if (v.file) body.append("file", v.file, v.file.name);
  const res = await fetchOrFriendlyError(`/api/users/${userId}/job-description`, {
    method: "POST",
    credentials: "include",
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || "Не удалось отправить инструкцию");
  return json as JobDescriptionUpload;
}

const TABS: Array<{ kind: JobDescriptionKind; label: string; Icon: typeof Type }> = [
  { kind: "text", label: "Текст", Icon: Type },
  { kind: "docx", label: "Word", Icon: FileText },
  { kind: "xlsx", label: "Excel", Icon: FileSpreadsheet },
];

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

export function JobDescriptionField({ value, onChange, disabled = false, error, heading = true }: {
  value: JobDescriptionValue;
  onChange: (v: JobDescriptionValue) => void;
  disabled?: boolean;
  error?: string | null;
  /** В окне «Инструкция» заголовок и пояснение даёт само окно. */
  heading?: boolean;
}) {
  const id = useId();
  const { reduced } = useMotionPreference();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const problem = error ?? jobDescriptionProblem(value);
  const pickFile = (file: File | null | undefined) => {
    if (!file) return;
    const source = sourceFromFileName(file.name);
    // Перетащили Excel во вкладку Word — просто переключаем вкладку.
    const kind = source === "docx" || source === "xlsx" ? source : value.kind;
    onChange({ ...value, kind, file });
  };

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
            Прочитаем инструкцию и сами поставим сотруднику задачи по его обязанностям. Они появятся в «Задачах»
            через минуту-две — их можно поправить или удалить.
          </p>
        </>
      ) : (
        <span className="sr-only" id={`${id}-title`}>Должностная инструкция</span>
      )}

      <LayoutGroup id={id}>
        <div className="job-desc-tabs" role="tablist" aria-labelledby={`${id}-title`}>
          {TABS.map(({ kind, label, Icon }) => {
            const active = value.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${id}-panel`}
                className={`job-desc-tab ${active ? "is-active" : ""}`}
                disabled={disabled}
                onClick={() => onChange({ ...value, kind, file: kind === value.kind ? value.file : null })}
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
        {value.kind === "text" ? (
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
            {value.kind === "docx" ? <FileText aria-hidden /> : <FileSpreadsheet aria-hidden />}
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
              accept={JOB_DESCRIPTION_ACCEPT[value.kind]}
              disabled={disabled}
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }}
              data-testid="job-description-input"
            />
            {value.kind === "docx" ? <FileText aria-hidden /> : <FileSpreadsheet aria-hidden />}
            <span className="job-desc-drop-title">{value.kind === "docx" ? "Выбрать файл Word" : "Выбрать файл Excel"}</span>
            <span className="job-desc-drop-meta">{value.kind === "docx" ? ".docx" : ".xlsx"} · до 5 МБ</span>
          </label>
        )}
      </div>
      {problem && <p className="job-desc-error" role="alert">{problem}</p>}
    </div>
  );
}

/** Статус инструкции в строке сотрудника. */
export function JobDescriptionBadge({ state, gatewayReady, onRetry, retrying }: {
  state: JobDescriptionState;
  gatewayReady: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const busy = state.status === "queued" || state.status === "processing";
  const tone = state.status === "failed" ? "is-failed" : state.status === "done" ? "is-done" : "is-busy";
  return (
    <span className="job-desc-badge-row">
      <span className={`job-desc-badge ${tone}`} title={state.error ?? state.fileName ?? undefined} data-testid={`job-description-state-${state.userId}`}>
        {busy && gatewayReady ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        {jobDescriptionLabel(state, gatewayReady)}
      </span>
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
  return r.gatewayReady
    ? { title: "Инструкцию разбираем", description: "Задачи появятся у сотрудника через минуту-две." }
    : { title: "Инструкция сохранена", description: "Задачи появятся, когда подключат диспетчер разбора." };
}

/** «Инструкция» у уже добавленного сотрудника. */
export function JobDescriptionDialog({ userId, name, open, onOpenChange }: {
  userId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState<JobDescriptionValue>(emptyJobDescription);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const send = useMutation({
    mutationFn: () => uploadJobDescription(userId, value),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: [JOB_DESCRIPTIONS_KEY] });
      toast(uploadedToast(r));
      setValue(emptyJobDescription());
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });
  const submit = () => {
    const problem = hasJobDescription(value) ? jobDescriptionProblem(value) : "Вставьте текст или выберите файл";
    setError(problem);
    if (!problem) send.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!send.isPending) { setError(null); onOpenChange(o); } }}>
      <DialogContent className="sm:max-w-lg" data-testid="job-description-dialog">
        <DialogHeader>
          <DialogTitle>Инструкция: {name}</DialogTitle>
          <DialogDescription>
            Прочитаем инструкцию и поставим задачи по обязанностям — через минуту-две они будут в «Задачах».
            Новая инструкция заменит прежнюю, одинаковые задачи второй раз не создаются.
          </DialogDescription>
        </DialogHeader>
        <JobDescriptionField value={value} onChange={(v) => { setValue(v); setError(null); }} disabled={send.isPending} error={error} heading={false} />
        <Button type="button" onClick={submit} disabled={send.isPending} className="w-full" data-testid="job-description-submit">
          {send.isPending ? "Отправляем…" : "Разобрать инструкцию"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
