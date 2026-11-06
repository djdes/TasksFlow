import { useMemo, type ChangeEvent, type RefObject } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { CalendarClock, Plus, X, type LucideIcon } from "lucide-react";
import { dueShortcuts, formatDueInput } from "@/lib/task-schedule";
import { getDueStatus, parseDueDateInput } from "@shared/task-visibility";
import { cn } from "@/lib/utils";

/**
 * Поле даты или времени, у которого подпись — placeholder внутри поля, а
 * значение пишется словами («Напомнить в 09:30»). Невидимое системное поле
 * лежит поверх: касание открывает календарь или часы телефона.
 */
export function PickerField({
  type,
  value,
  onChange,
  placeholder,
  display,
  icon: Icon,
  testId,
  clearLabel,
  disabled = false,
  invalid = false,
}: {
  type: "date" | "time";
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  display: (value: string) => string | null;
  icon: LucideIcon;
  testId?: string;
  clearLabel: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const label = value ? display(value) : null;
  return (
    <div className={cn("due-quick-field", label && "has-value", invalid && "is-invalid", disabled && "is-disabled")}>
      <Icon aria-hidden className="due-quick-icon" />
      <span className={cn("due-quick-text", !label && "is-placeholder")}>{label ?? placeholder}</span>
      <input
        type={type}
        step={type === "time" ? 300 : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* Старые браузеры: календарь откроется сам по касанию. */
          }
        }}
        aria-label={placeholder}
        className="due-quick-input"
        data-testid={testId}
      />
      {value && !disabled && (
        <button type="button" className="due-quick-clear" onClick={() => onChange("")} aria-label={clearLabel} title={clearLabel}>
          <X aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * «Устранить до» разовой задачи: поле даты, у которого подпись — сама
 * кнопка, и быстрые сроки (сегодня … до конца месяца). Пусто — без срока.
 */
export function DueDateQuick({ form }: { form: UseFormReturn<any> }) {
  const value = (useWatch({ control: form.control, name: "dueDateInput" }) as string | undefined) ?? "";
  const shortcuts = useMemo(() => dueShortcuts(), []);
  const label = formatDueInput(value);
  const overdue = label !== null && getDueStatus(parseDueDateInput(value), Math.floor(Date.now() / 1000)).kind === "overdue";
  const set = (next: string) => form.setValue("dueDateInput", next, { shouldDirty: true });

  return (
    <div className="due-quick">
      <PickerField
        type="date"
        value={value}
        onChange={set}
        placeholder="Устранить до"
        display={(v) => {
          const text = formatDueInput(v);
          return text ? `Устранить до ${text}` : null;
        }}
        icon={CalendarClock}
        testId="input-due-date"
        clearLabel="Убрать срок"
      />
      <div className="due-quick-chips" role="group" aria-label="Быстрый срок">
        {shortcuts.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={value === s.value}
            onClick={() => set(value === s.value ? "" : s.value)}
            className="due-quick-chip"
            data-testid={`due-${s.key}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {overdue && <p className="quick-task-hint quick-task-hint--error">Дата уже прошла — задача сразу будет «Просрочено»</p>}
    </div>
  );
}

/** Место под фото у задачи: кнопка «добавить» или миниатюра с «убрать». */
export function PhotoSlot({
  id,
  title,
  hint,
  icon: Icon,
  preview,
  inputRef,
  onSelect,
  onRemove,
}: {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  preview: string | null;
  inputRef: RefObject<HTMLInputElement>;
  onSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={onSelect} className="hidden" id={id} data-testid={id} />
      {preview ? (
        <div className="photo-slot">
          <img src={preview} alt={title} />
          <div className="photo-slot-text">
            <b>{title}</b>
            <span>{hint}</span>
          </div>
          <button type="button" onClick={onRemove} className="photo-slot-remove" aria-label="Убрать фото" title="Убрать фото">
            <X aria-hidden />
          </button>
        </div>
      ) : (
        <label htmlFor={id} className="photo-slot-add">
          <Icon aria-hidden />
          <span>{title}</span>
          <Plus aria-hidden className="photo-slot-plus" />
        </label>
      )}
    </>
  );
}
