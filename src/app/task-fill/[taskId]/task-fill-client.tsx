"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TaskFormField,
  TaskFormSchema,
} from "@/lib/tasksflow-adapters/task-form";

type Props = {
  taskId: number;
  token: string;
  returnUrl: string | null;
  journalLabel: string;
  documentTitle: string;
  employeeName: string | null;
  employeePositionTitle: string | null;
  form: TaskFormSchema | null;
  alreadyCompleted: boolean;
};

/**
 * Standalone «fill journal from TasksFlow» UI. No WeSetup session
 * needed — auth via HMAC token in POST body. Styled with the WeSetup
 * design system tokens (hex colours from
 * `.claude/skills/design-system`): dark-hero top, indigo primary,
 * rounded 2xl/3xl, soft-surface backgrounds.
 */
export function TaskFillClient({
  taskId,
  token,
  returnUrl,
  journalLabel,
  documentTitle,
  employeeName,
  employeePositionTitle,
  form,
  alreadyCompleted,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    if (form) {
      for (const field of form.fields) {
        if (field.type === "boolean")
          init[field.key] = field.defaultValue ?? false;
        else if (field.type === "select" && field.defaultValue)
          init[field.key] = field.defaultValue;
        else init[field.key] = "";
      }
    }
    return init;
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(alreadyCompleted);
  const [error, setError] = useState<string | null>(null);

  const readyToSubmit = useMemo(() => {
    if (!form) return true; // no-form tasks (generic) can always submit
    for (const f of form.fields) {
      if (!("required" in f) || !f.required) continue;
      const v = values[f.key];
      if (v === null || v === undefined || v === "") return false;
    }
    return true;
  }, [form, values]);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function doSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/task-fill/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, values }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Ошибка сохранения");
      }
      setDone(true);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-redirect back to TasksFlow a couple of seconds after
  // success, if the caller provided a ?return=<url>. The worker
  // doesn't have to tap anything — the TasksFlow dashboard
  // refreshes on its own thanks to the completeTask call our
  // /api/task-fill endpoint made.
  useEffect(() => {
    if (!done || !returnUrl) return;
    const t = setTimeout(() => {
      window.location.href = returnUrl;
    }, 1800);
    return () => clearTimeout(t);
  }, [done, returnUrl]);

  return (
    <main className="min-h-screen bg-[#fafbff]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0b1024] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-xl px-5 py-10">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ClipboardCheck className="size-5" />
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {journalLabel}
              </div>
              <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
                {documentTitle}
              </h1>
              {employeeName ? (
                <p className="mt-2 text-[14px] text-white/75">
                  {employeeName}
                  {employeePositionTitle
                    ? ` · ${employeePositionTitle}`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="mx-auto max-w-xl px-5 py-8">
        {done ? (
          <SuccessCard
            returnUrl={returnUrl}
            autoRedirecting={Boolean(returnUrl)}
          />
        ) : (
          <div className="rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
            {form?.intro ? (
              <p className="mb-5 rounded-2xl bg-[#f5f6ff] p-4 text-[14px] leading-relaxed text-[#3c4053]">
                {form.intro}
              </p>
            ) : null}

            {form && form.fields.length > 0 ? (
              <div className="space-y-4">
                {form.fields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(v) => setField(field.key, v)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-4 text-[14px] text-[#6f7282]">
                Форма не требует заполнения — просто подтвердите выполнение.
              </p>
            )}

            {error ? (
              <div className="mt-4 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] p-4 text-[13px] text-[#a13a32]">
                {error}
              </div>
            ) : null}

            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!readyToSubmit || submitting}
              className="mt-6 h-12 w-full rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white hover:bg-[#4a5bf0] shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)]"
            >
              {form?.submitLabel ?? "Выполнено"}
            </Button>
            {returnUrl ? (
              <a
                href={returnUrl}
                className="mt-3 block text-center text-[13px] text-[#6f7282] hover:text-[#0b1024]"
              >
                Отмена — вернуться
              </a>
            ) : null}
          </div>
        )}

        {/* Confirmation sheet */}
        {confirmOpen && !done ? (
          <ConfirmSheet
            form={form}
            values={values}
            submitting={submitting}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={doSubmit}
          />
        ) : null}
      </section>
    </main>
  );
}

function SuccessCard({
  returnUrl,
  autoRedirecting,
}: {
  returnUrl: string | null;
  autoRedirecting: boolean;
}) {
  return (
    <div className="rounded-3xl border border-[#ececf4] bg-white p-8 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#116b2a]">
        <CheckCircle2 className="size-7" />
      </div>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0b1024]">
        Журнал заполнен
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[#6f7282]">
        Запись сохранена в WeSetup. Задача в TasksFlow отмечена выполненной.
      </p>
      {returnUrl ? (
        <>
          <a
            href={returnUrl}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-6 text-[15px] font-medium text-white hover:bg-[#4a5bf0]"
          >
            Вернуться в TasksFlow
          </a>
          {autoRedirecting ? (
            <p className="mt-3 text-[12px] text-[#9b9fb3]">
              Переадресация через пару секунд…
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ConfirmSheet({
  form,
  values,
  submitting,
  onCancel,
  onConfirm,
}: {
  form: TaskFormSchema | null;
  values: Record<string, unknown>;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const summary = useMemo(() => {
    if (!form) return null;
    return form.fields.map((field) => ({
      label: field.label,
      value: formatValue(field, values[field.key]),
    }));
  }, [form, values]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border-x border-t border-[#ececf4] bg-white p-6 shadow-[0_-20px_60px_-20px_rgba(11,16,36,0.3)] sm:rounded-3xl sm:border">
        <h3 className="text-[18px] font-semibold text-[#0b1024]">
          Проверьте данные
        </h3>
        <p className="mt-1 text-[13px] text-[#6f7282]">
          После подтверждения запись попадёт в журнал WeSetup.
        </p>
        {summary ? (
          <div className="mt-4 space-y-1 rounded-2xl border border-[#ececf4] bg-[#fafbff] p-4 text-[13px]">
            {summary.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-3">
                <span className="text-[#6f7282]">{item.label}:</span>
                <span className="text-right font-medium text-[#0b1024]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[14px]"
          >
            Назад
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="h-11 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0]"
          >
            {submitting ? "Сохраняю…" : "Подтвердить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TaskFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <div>
          <Label label={field.label} required={field.required} />
          {field.multiline ? (
            <Textarea
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              rows={3}
              className="rounded-2xl border-[#dcdfed] px-4 py-3 text-[15px]"
            />
          ) : (
            <Input
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              className="h-12 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
            />
          )}
        </div>
      );
    case "number":
      return (
        <div>
          <Label
            label={field.label}
            suffix={field.unit ? `(${field.unit})` : undefined}
            required={field.required}
          />
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
            className="h-12 rounded-2xl border-[#dcdfed] px-4 text-[15px] font-semibold tabular-nums"
          />
        </div>
      );
    case "boolean":
      return (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#ececf4] bg-white p-4 transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(Boolean(v))}
            className="size-5"
          />
          <span className="text-[15px] text-[#0b1024]">{field.label}</span>
        </label>
      );
    case "select":
      return (
        <div>
          <Label label={field.label} required={field.required} />
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="h-12 rounded-2xl border-[#dcdfed] px-4 text-[15px]">
              <SelectValue placeholder="Выберите значение" />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.code ? (
                    <span className="mr-2 inline-flex min-w-[36px] justify-center rounded-md bg-[#eef1ff] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#3848c7]">
                      {opt.code}
                    </span>
                  ) : null}
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "date":
      return (
        <div>
          <Label label={field.label} required={field.required} />
          <Input
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
          />
        </div>
      );
  }
}

function Label({
  label,
  suffix,
  required,
}: {
  label: string;
  suffix?: string;
  required?: boolean;
}) {
  return (
    <label className="mb-2 block text-[13px] font-medium text-[#3c4053]">
      {label}
      {suffix ? (
        <span className="ml-1 text-[#9b9fb3] font-normal">{suffix}</span>
      ) : null}
      {required ? <span className="ml-0.5 text-[#d2453d]">*</span> : null}
    </label>
  );
}

function formatValue(field: TaskFormField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "boolean":
      return value ? "Да" : "Нет";
    case "select": {
      const opt = field.options.find((o) => o.value === value);
      return opt ? `${opt.code ? opt.code + " — " : ""}${opt.label}` : String(value);
    }
    case "number":
      return field.unit ? `${value} ${field.unit}` : String(value);
    default:
      return String(value);
  }
}
