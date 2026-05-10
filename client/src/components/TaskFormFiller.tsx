import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Camera, RefreshCw, ClipboardList, CheckCircle2, Loader2, X as XIcon } from "lucide-react";
import {
  normalizeTaskFormPayload,
  type TaskFormField,
  type TaskFormSchema,
} from "@shared/wesetup-journal-mode";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { isFormReadyToSubmit } from "@/lib/task-form-validate";
import { formatTaskFormValue } from "@/lib/task-form-format";

type Props = {
  taskId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted?: () => void;
};

type RuntimeTaskFormField = TaskFormField;

type RuntimeTaskFormSchema = Omit<TaskFormSchema, "fields"> & {
  fields: RuntimeTaskFormField[];
};

/**
 * When a task is bound to a WeSetup journal row, the employee sees a
 * structured form here instead of the plain «Выполнено» button.
 * Fetches the schema by taskId, renders it, validates locally, shows
 * a confirmation dialog, then POSTs structured values back to WeSetup
 * via /api/wesetup/complete-with-values.
 */
export function TaskFormFiller({ taskId, open, onOpenChange, onCompleted }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<RuntimeTaskFormSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Photo enforcement (2026-05-10): когда task.requiresPhoto=true,
  // рендерим upload-виджет и блокируем «Сделал» до загрузки фото.
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  const loadForm = useCallback(async () => {
    setLoading(true);
    setSchema(null);
    setValues({});
    setLoadError(null);
    try {
      // 30s timeout: server-side proxy уже имеет timeout 30s к WeSetup,
      // у клиента такой же запас + время на Express round-trip. Без
      // таймаута воркер с журнальной задачей видит «Загружаем форму…»
      // вечно если что-то ломается на бэкенде.
      const response = await fetchOrFriendlyError(`/api/wesetup/task-form?taskId=${taskId}`, {
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `task-form ${response.status}`);
      }
      const normalized = normalizeTaskFormPayload(data);
      if (!normalized) {
        throw new Error("WeSetup вернул форму в неизвестном формате");
      }
      // Read task metadata (requiresPhoto + photoUrls) — пришло из
      // /api/wesetup/task-form proxy который теперь включает их.
      const taskMeta = (data as { task?: { requiresPhoto?: boolean; photoUrls?: string[] } } | null)?.task;
      if (taskMeta) {
        setRequiresPhoto(Boolean(taskMeta.requiresPhoto));
        setPhotoUrls(Array.isArray(taskMeta.photoUrls) ? taskMeta.photoUrls : []);
      } else {
        setRequiresPhoto(false);
        setPhotoUrls([]);
      }
      if (!normalized.form) {
        setLoadError(
          "У этой задачи нет структурированной журнальной формы. Закройте окно и отметьте задачу обычной кнопкой."
        );
        return;
      }

      const form = normalized.form as RuntimeTaskFormSchema;
      setSchema(form);
      // Pre-fill with defaults.
      const initial: Record<string, unknown> = {};
      for (const field of form.fields) {
        const defaultValue = field.defaultValue;
        if (field.type === "boolean") {
          initial[field.key] =
            typeof defaultValue === "boolean"
              ? defaultValue
              : defaultValue === "true"
                ? true
                : false;
        } else if (
          field.type === "multiselect" ||
          field.type === "checkbox-group"
        ) {
          initial[field.key] = Array.isArray(defaultValue)
            ? defaultValue
            : typeof defaultValue === "string" && defaultValue
              ? defaultValue.split(",").map((item) => item.trim()).filter(Boolean)
            : [];
        } else if (field.type === "number") {
          initial[field.key] =
            defaultValue === undefined || defaultValue === ""
              ? null
              : Number(defaultValue);
        } else if ((field.type === "select" || field.type === "radio") && defaultValue) {
          initial[field.key] = String(defaultValue);
        } else {
          initial[field.key] =
            defaultValue === undefined ? "" : defaultValue;
        }
      }
      setValues(initial);
    } catch (err: any) {
      const raw = err?.message || "Не удалось загрузить форму";
      setLoadError(
        /fetch failed|network|Failed to fetch|ECONNREFUSED|ENOTFOUND/i.test(raw)
          ? "Не удалось связаться с WeSetup. Проверьте соединение и повторите попытку."
          : raw
      );
      toast({
        title: "Ошибка",
        description: raw,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [taskId, toast]);

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      return;
    }
    void loadForm();
  }, [open, loadForm]);

  const photoOk = !requiresPhoto || photoUrls.length > 0;
  const readyToSubmit = useMemo(
    () => isFormReadyToSubmit(schema, values) && photoOk,
    [schema, values, photoOk],
  );

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // Загрузка фото через POST /api/tasks/:id/photo (multipart/form-data).
  // Endpoint возвращает обновлённый список photoUrls — обновляем
  // локальный state, чтобы readyToSubmit разблокировался.
  async function uploadPhoto(file: File) {
    if (photoUploading) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetchOrFriendlyError(`/api/tasks/${taskId}/photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || "Не удалось загрузить фото");
      }
      const nextUrls = Array.isArray(data?.photoUrls) ? data.photoUrls : [];
      setPhotoUrls(nextUrls);
      toast({
        title: "Фото загружено",
        description: `${nextUrls.length}/10`,
      });
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось загрузить фото",
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function deletePhoto(url: string) {
    try {
      const response = await fetchOrFriendlyError(
        `/api/tasks/${taskId}/photo?url=${encodeURIComponent(url)}`,
        {
          method: "DELETE",
          credentials: "include",
          signal: AbortSignal.timeout(30_000),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || "Не удалось удалить фото");
      }
      const nextUrls = Array.isArray(data?.photoUrls) ? data.photoUrls : [];
      setPhotoUrls(nextUrls);
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось удалить фото",
        variant: "destructive",
      });
    }
  }

  async function doSubmit() {
    if (!readyToSubmit) return;
    setSubmitting(true);
    try {
      // 35s — server timeout к WeSetup 30s + 5s запас на Express
      // round-trip и сериализацию. Hot path: каждое завершение
      // journal-задачи воркером.
      const response = await fetchOrFriendlyError("/api/wesetup/complete-with-values", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          isCompleted: true,
          values,
        }),
        signal: AbortSignal.timeout(35_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Ошибка отправки");
      }
      toast({
        title: "Выполнено",
        description: "Журнал WeSetup заполнен.",
      });
      setConfirmOpen(false);
      onOpenChange(false);
      onCompleted?.();
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err?.message || "Не удалось сохранить",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Pairs label-value для confirm dialog'а. Раньше plain-text join
  // выглядел сыро — теперь рендерим аккуратными карточками с
  // лейблом сверху и значением снизу.
  const confirmRows = useMemo(() => {
    if (!schema) return [] as Array<{ key: string; label: string; value: string }>;
    const rows: Array<{ key: string; label: string; value: string }> = [];
    for (const field of schema.fields) {
      if (field.type === "hidden") continue;
      const v = values[field.key];
      rows.push({
        key: field.key,
        label: field.label,
        value: formatTaskFormValue(field, v) || "—",
      });
    }
    return rows;
  }, [schema, values]);

  const visibleFieldCount = useMemo(
    () =>
      schema?.fields?.filter((f) => f.type !== "hidden").length ?? 0,
    [schema],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-3xl border-border/60 bg-card/95 backdrop-blur p-0 shadow-xl shadow-primary/10 overflow-hidden">
          {/* Header — иконка журнала + название + meta. Outline-стиль
              совпадает с остальными dialog'ами TasksFlow. */}
          <DialogHeader className="border-b border-border/40 bg-gradient-to-b from-primary/5 to-transparent px-6 pt-6 pb-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ClipboardList className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                  Заполнить журнал
                </DialogTitle>
                {visibleFieldCount > 0 ? (
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {visibleFieldCount === 1
                      ? "1 поле"
                      : visibleFieldCount < 5
                        ? `${visibleFieldCount} поля`
                        : `${visibleFieldCount} полей`}
                    {" · данные сразу попадут в WeSetup"}
                  </p>
                ) : null}
              </div>
            </div>
          </DialogHeader>
          {loading ? (
            <div className="space-y-3 px-6 py-6">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Загружаем форму…
              </div>
              {/* Skeleton 3 fields для UX ожидания. */}
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
                  <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="space-y-4 px-6 py-6 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <div className="font-semibold">Форма не загрузилась</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-destructive/90">
                    {loadError}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadForm()}
                className="h-11 rounded-xl"
              >
                <RefreshCw className="mr-2 size-4" />
                Повторить
              </Button>
            </div>
          ) : schema ? (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 pb-4 pt-4">
              {schema.intro ? (
                <p className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-[13px] leading-relaxed text-foreground/90">
                  {schema.intro}
                </p>
              ) : null}
              {requiresPhoto ? (
                <div className="rounded-2xl border border-orange-300/60 bg-orange-50/60 p-4 dark:border-orange-400/40 dark:bg-orange-500/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-[13px] font-semibold text-orange-900 dark:text-orange-100">
                        Фото обязательно
                      </span>
                    </div>
                    <span className="text-[11px] tabular-nums text-orange-700 dark:text-orange-200">
                      {photoUrls.length}/10
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug text-orange-700/90 dark:text-orange-200/80">
                    Загрузите хотя бы одно фото — без этого «Сделал» заблокирована.
                  </p>
                  {photoUrls.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {photoUrls.map((url, idx) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt={`Фото ${idx + 1}`}
                            className="size-16 rounded-xl object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => void deletePhoto(url)}
                            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow"
                            aria-label="Удалить фото"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label
                    className={`mt-3 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-400/60 bg-white/70 text-[13px] font-medium text-orange-900 transition-colors hover:bg-orange-50 dark:border-orange-300/40 dark:bg-white/5 dark:text-orange-100 ${
                      photoUploading || photoUrls.length >= 10
                        ? "pointer-events-none opacity-50"
                        : ""
                    }`}
                  >
                    {photoUploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                    {photoUploading ? "Загружаем…" : "Добавить фото"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoUploading || photoUrls.length >= 10}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadPhoto(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : null}
              {schema.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setField(field.key, v)}
                />
              ))}
            </div>
          ) : null}
          <DialogFooter className="gap-2 border-t border-border/40 bg-muted/30 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="h-12 rounded-xl px-5 font-semibold"
            >
              Отмена
            </Button>
            {!loadError && (
              <Button
                disabled={!readyToSubmit || submitting || loading}
                onClick={() => setConfirmOpen(true)}
                className="h-12 rounded-xl px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
              >
                {schema?.submitLabel ?? "Выполнено"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur p-0 shadow-xl shadow-primary/10 overflow-hidden">
          <DialogHeader className="border-b border-border/40 bg-gradient-to-b from-primary/5 to-transparent px-6 pt-6 pb-5">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CheckCircle2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                  Подтвердите данные
                </DialogTitle>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  После сохранения изменить можно будет только через менеджера
                </p>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto px-6 pb-4 pt-4">
            {confirmRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 text-center text-[13px] text-muted-foreground">
                Нет полей для подтверждения
              </p>
            ) : (
              confirmRows.map((row) => (
                <div
                  key={row.key}
                  className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {row.label}
                  </div>
                  <div className="mt-1 text-[14px] leading-snug font-medium text-foreground">
                    {row.value}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="gap-2 border-t border-border/40 bg-muted/30 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              className="h-12 rounded-xl px-5 font-semibold"
            >
              Назад, проверить
            </Button>
            <Button
              onClick={doSubmit}
              disabled={submitting}
              className="h-12 rounded-xl px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
            >
              {submitting ? "Отправка…" : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: RuntimeTaskFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const labelCls = "mb-2 block text-sm font-semibold text-foreground";
  const requiredMark = field.required ? (
    <span className="ml-1 text-destructive">*</span>
  ) : null;
  const options = Array.isArray(field.options) ? field.options : [];
  const hint = field.helpText ? (
    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
      {field.helpText}
    </p>
  ) : null;

  switch (field.type) {
    case "hidden":
      return null;
    case "text":
    case "email":
    case "tel":
    case "phone":
    case "url":
    case "password":
    case "textarea":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          {field.multiline || field.type === "textarea" ? (
            <Textarea
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              rows={3}
              className="things-input min-h-[100px] py-3"
            />
          ) : (
            <Input
              type={
                field.type === "email"
                  ? "email"
                  : field.type === "url"
                    ? "url"
                    : field.type === "tel" || field.type === "phone"
                      ? "tel"
                      : field.type === "password"
                        ? "password"
                        : "text"
              }
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="things-input"
            />
          )}
          {hint}
        </div>
      );
    case "number":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {field.unit ? (
              <span className="ml-1 font-normal text-muted-foreground">
                ({field.unit})
              </span>
            ) : null}
            {requiredMark}
          </label>
          <Input
            type="number"
            inputMode="decimal"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            min={field.min}
            max={field.max}
            step={field.step}
            className="things-input text-lg font-semibold tabular-nums"
          />
          {hint}
        </div>
      );
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:bg-primary/5">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(Boolean(v))}
            className="size-5"
          />
          <span className="text-base font-medium">{field.label}</span>
          {hint}
        </label>
      );
    case "select":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          {options.length > 0 ? (
            <Select
              value={(value as string) ?? ""}
              onValueChange={(v) => onChange(v)}
            >
              <SelectTrigger className="things-input w-full justify-between">
                <SelectValue placeholder="Выберите значение" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="py-2.5"
                  >
                    {opt.code ? (
                      <span className="mr-2 inline-flex min-w-[36px] justify-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                        {opt.code}
                      </span>
                    ) : null}
                    <span className="text-sm">{opt.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className="things-input"
            />
          )}
          {hint}
        </div>
      );
    case "radio":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          <div className="grid gap-2">
            {options.map((opt) => {
              const checked = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    checked
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-card hover:bg-muted/30"
                  }`}
                >
                  {opt.code ? (
                    <span className="mr-2 inline-flex min-w-[36px] justify-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {opt.code}
                    </span>
                  ) : null}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {hint}
        </div>
      );
    case "multiselect":
    case "checkbox-group": {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          <div className="grid gap-2">
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      const set = new Set(selected);
                      if (next) {
                        set.add(opt.value);
                      } else {
                        set.delete(opt.value);
                      }
                      onChange(Array.from(set));
                    }}
                    className="size-5"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {hint}
        </div>
      );
    }
    case "date":
    case "time":
    case "datetime":
    case "datetime-local":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          <Input
            type={
              field.type === "time"
                ? "time"
                : field.type === "datetime" || field.type === "datetime-local"
                ? "datetime-local"
                : "date"
            }
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="things-input text-base"
          />
          {hint}
        </div>
      );
    case "file":
    case "photo":
    case "image":
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          <Input
            type="file"
            accept={
              field.type === "photo" || field.type === "image"
                ? "image/*"
                : undefined
            }
            className="things-input h-auto py-3"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) {
                onChange(null);
                return;
              }
              const dataUrl = await readFileAsDataUrl(file);
              onChange({
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl,
              });
            }}
          />
          {value && typeof value === "object" && "name" in value ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {(value as { name?: string }).name}
            </p>
          ) : null}
          {hint}
        </div>
      );
    default:
      return (
        <div>
          <label className={labelCls}>
            {field.label}
            {requiredMark}
          </label>
          {options.length > 0 ? (
            <Select
              value={(value as string) ?? ""}
              onValueChange={(v) => onChange(v)}
            >
              <SelectTrigger className="things-input w-full justify-between">
                <SelectValue placeholder="Выберите значение" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="things-input"
            />
          )}
          {hint}
        </div>
      );
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
