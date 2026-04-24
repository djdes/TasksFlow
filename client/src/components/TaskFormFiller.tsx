import { useEffect, useMemo, useState } from "react";
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
import {
  normalizeTaskFormPayload,
  type TaskFormFieldOption,
  type TaskFormSchema,
} from "@shared/wesetup-journal-mode";

type Props = {
  taskId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted?: () => void;
};

type RuntimeTaskFormField = {
  type: string;
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: TaskFormFieldOption[];
  defaultValue?: unknown;
};

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/wesetup/task-form?taskId=${taskId}`, {
      credentials: "include",
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(data?.message || `task-form ${r.status}`);
        }
        return data;
      })
      .then((data: unknown) => {
        const normalized = normalizeTaskFormPayload(data);
        if (!normalized) {
          throw new Error("WeSetup вернул форму в неизвестном формате");
        }
        if (!normalized.form) {
          toast({
            title: "Форма недоступна",
            description: "Эта задача без журнальной формы — отметьте кнопкой «Выполнено».",
          });
          onOpenChange(false);
          return;
        }
        const form = normalized.form as RuntimeTaskFormSchema;
        setSchema(form);
        // Pre-fill with defaults.
        const initial: Record<string, unknown> = {};
        for (const field of form.fields) {
          if (field.type === "boolean") {
            initial[field.key] = field.defaultValue ?? false;
          } else if (
            field.type === "multiselect" ||
            field.type === "checkbox-group"
          ) {
            initial[field.key] = Array.isArray(field.defaultValue)
              ? field.defaultValue
              : [];
          } else if (field.type === "number") {
            initial[field.key] =
              field.defaultValue === undefined || field.defaultValue === ""
                ? null
                : Number(field.defaultValue);
          } else if (field.type === "select" && field.defaultValue) {
            initial[field.key] = field.defaultValue;
          } else {
            initial[field.key] =
              field.defaultValue === undefined ? "" : field.defaultValue;
          }
        }
        setValues(initial);
      })
      .catch((err) => {
        toast({
          title: "Ошибка",
          description: err?.message || "Не удалось загрузить форму",
          variant: "destructive",
        });
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, taskId]);

  const readyToSubmit = useMemo(() => {
    if (!schema) return false;
    for (const field of schema.fields) {
      if (!field.required) continue;
      const v = values[field.key];
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "number" && Number.isNaN(v)) return false;
      if (v === null || v === undefined || v === "") return false;
    }
    return true;
  }, [schema, values]);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/wesetup/complete-with-values", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          isCompleted: true,
          values,
        }),
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

  // Summary string for the confirmation dialog. «Здоров / без
  // температуры» etc. — gives the employee one last look before save.
  const confirmSummary = useMemo(() => {
    if (!schema) return "";
    const parts: string[] = [];
    for (const field of schema.fields) {
      const v = values[field.key];
      parts.push(`${field.label}: ${formatValue(field, v)}`);
    }
    return parts.join("\n");
  }, [schema, values]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-3xl border-border/60 bg-card/95 backdrop-blur p-0 shadow-xl shadow-primary/10">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-bold">
              Заполнить журнал
            </DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Загружаем форму…
            </div>
          ) : schema ? (
            <div className="space-y-4 px-6 pb-4">
              {schema.intro ? (
                <p className="rounded-2xl bg-primary/5 border border-primary/10 p-4 text-sm leading-relaxed text-foreground/90">
                  {schema.intro}
                </p>
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
            <Button
              disabled={!readyToSubmit || submitting}
              onClick={() => setConfirmOpen(true)}
              className="h-12 rounded-xl px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
            >
              {schema?.submitLabel ?? "Выполнено"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur p-0 shadow-xl shadow-primary/10">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-bold">
              Подтвердите данные
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 pb-4 text-sm">
            <p className="text-muted-foreground">
              После подтверждения данные сразу попадут в журнал WeSetup
              — изменить можно будет только через менеджера.
            </p>
            <div className="whitespace-pre-line rounded-2xl border border-border/50 bg-muted/40 p-4 text-sm font-medium">
              {confirmSummary}
            </div>
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

  switch (field.type) {
    case "text":
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
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="things-input"
            />
          )}
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
        </div>
      );
  }
}

function formatValue(field: RuntimeTaskFormField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    const options = Array.isArray(field.options) ? field.options : [];
    return value
      .map((item) => {
        const opt = options.find((o) => o.value === String(item));
        return opt ? `${opt.code ? opt.code + " — " : ""}${opt.label}` : String(item);
      })
      .join(", ");
  }
  switch (field.type) {
    case "boolean":
      return value ? "Да" : "Нет";
    case "radio":
    case "select": {
      const options = Array.isArray(field.options) ? field.options : [];
      const opt = options.find((o) => o.value === value);
      return opt ? `${opt.code ? opt.code + " — " : ""}${opt.label}` : String(value);
    }
    case "number":
      return field.unit ? `${value} ${field.unit}` : String(value);
    default:
      return String(value);
  }
}
