import { useMemo, useState, type ChangeEvent, type RefObject } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { CalendarClock, CalendarDays, Check, ChevronDown, Plus, RefreshCw, Repeat, X, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WEEK_DAYS, describeSchedule, dueShortcuts, formatDueInput } from "@/lib/task-schedule";
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

/** «7 нояб.» — дата рядом с быстрым сроком. */
function shortDate(value: string): string {
  const sec = parseDueDateInput(value);
  return sec === null ? "" : new Date(sec * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

/**
 * «Срок до» разовой задачи: одно поле, по нажатию — варианты (сегодня …
 * до конца месяца) и своя дата. Пусто — без срока.
 */
export function DueDateQuick({ form }: { form: UseFormReturn<any> }) {
  const value = (useWatch({ control: form.control, name: "dueDateInput" }) as string | undefined) ?? "";
  const [open, setOpen] = useState(false);
  const shortcuts = useMemo(() => dueShortcuts(), []);
  const label = formatDueInput(value);
  const overdue = label !== null && getDueStatus(parseDueDateInput(value), Math.floor(Date.now() / 1000)).kind === "overdue";
  const set = (next: string) => {
    form.setValue("dueDateInput", next, { shouldDirty: true });
    setOpen(false);
  };

  return (
    <div className="due-quick">
      <Popover open={open} onOpenChange={setOpen}>
        <div className={cn("due-quick-field", label && "has-value")}>
          <PopoverTrigger asChild>
            <button type="button" className="pick-trigger" data-testid="due-trigger">
              <CalendarClock aria-hidden className="due-quick-icon" />
              <span className={cn("due-quick-text", !label && "is-placeholder")}>{label ? `Срок до ${label}` : "Срок до"}</span>
              {!value && <ChevronDown aria-hidden className="pick-chevron" />}
            </button>
          </PopoverTrigger>
          {value && (
            <button type="button" className="due-quick-clear" onClick={() => set("")} aria-label="Убрать срок" title="Убрать срок">
              <X aria-hidden />
            </button>
          )}
        </div>
        <PopoverContent className="pick-panel" aria-label="Срок">
          {shortcuts.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={value === s.value}
              onClick={() => set(s.value)}
              className="pick-row"
              data-testid={`due-${s.key}`}
            >
              <span>{s.label}</span>
              <small>{shortDate(s.value)}</small>
              {value === s.value && <Check aria-hidden className="pick-check" />}
            </button>
          ))}
          {/* Своя дата: системный календарь поверх строки. */}
          <label className="pick-row pick-row--date">
            <CalendarDays aria-hidden />
            <span>Другая дата</span>
            <input
              type="date"
              value={value}
              onChange={(e) => e.target.value && set(e.target.value)}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* Старые браузеры: календарь откроется сам по касанию. */
                }
              }}
              aria-label="Другая дата"
              className="due-quick-input"
              data-testid="input-due-date"
            />
          </label>
        </PopoverContent>
      </Popover>
      {overdue && <p className="quick-task-hint quick-task-hint--error">Дата уже прошла</p>}
    </div>
  );
}

const SCHEDULE_PRESETS: { key: string; label: string; days: number[] | null }[] = [
  { key: "daily", label: "Каждый день", days: null },
  { key: "workdays", label: "По будням", days: [1, 2, 3, 4, 5] },
  { key: "weekend", label: "По выходным", days: [6, 0] },
];

const sameDays = (a: readonly number[] | null | undefined, b: readonly number[] | null) => {
  const x = [...(a ?? [])].sort().join();
  const y = [...(b ?? [])].sort().join();
  return x === y || (x.split(",").length === 7 && y === "");
};

/**
 * Расписание регулярной задачи одним полем: в нём словами «По будням», по
 * нажатию — готовые варианты, дни недели, число месяца и повтор. Считает
 * так же, как describeSchedule и isTaskVisibleOn.
 */
export function ScheduleQuick({ form }: { form: UseFormReturn<any> }) {
  const [weekDays, monthDay, isRecurring] = useWatch({
    control: form.control,
    name: ["weekDays", "monthDay", "isRecurring"],
  }) as [number[] | null | undefined, string | number | null | undefined, boolean | undefined];
  const [open, setOpen] = useState(false);
  const summary = describeSchedule({ weekDays, monthDay, isRecurring });
  const label = isRecurring === false ? `${summary.when} · один раз` : summary.when;
  const set = (name: string, value: unknown) => form.setValue(name, value, { shouldDirty: true });
  const days = weekDays ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="due-quick-field has-value pick-trigger" data-testid="schedule-trigger">
          <Repeat aria-hidden className="due-quick-icon" />
          <span className="due-quick-text" data-testid="schedule-summary">{label}</span>
          <ChevronDown aria-hidden className="pick-chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="pick-panel" aria-label="Расписание">
        {SCHEDULE_PRESETS.map((p) => {
          const active = !Number(monthDay) && sameDays(days, p.days);
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                set("weekDays", p.days);
                set("monthDay", undefined);
              }}
              className="pick-row"
              data-testid={`schedule-${p.key}`}
            >
              <span>{p.label}</span>
              {active && <Check aria-hidden className="pick-check" />}
            </button>
          );
        })}
        <div className="pick-days" role="group" aria-label="Дни недели">
          {WEEK_DAYS.map((day) => {
            const on = days.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={on}
                onClick={() => set("weekDays", on ? days.filter((d) => d !== day.value) : [...days, day.value])}
                className="task-schedule-day"
              >
                {day.label}
              </button>
            );
          })}
        </div>
        <select
          value={Number(monthDay) ? String(monthDay) : ""}
          onChange={(e) => set("monthDay", e.target.value || undefined)}
          aria-label="Число месяца"
          className={cn("task-answer-select pick-select", !Number(monthDay) && "is-empty")}
          data-testid="schedule-month-day"
        >
          <option value="">Любое число</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={String(d)}>
              Каждое {d}-е
            </option>
          ))}
        </select>
        <label className="toggle-row">
          <RefreshCw aria-hidden className="toggle-row-icon" />
          <span className="toggle-row-label">Повторять каждый день</span>
          <input
            type="checkbox"
            checked={isRecurring !== false}
            onChange={(e) => set("isRecurring", e.target.checked)}
            className="pick-checkbox"
          />
        </label>
        {summary.note && <p className="quick-task-hint">{summary.note}</p>}
        <button type="button" className="worker-picker-done" onClick={() => setOpen(false)}>
          Готово
        </button>
      </PopoverContent>
    </Popover>
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
