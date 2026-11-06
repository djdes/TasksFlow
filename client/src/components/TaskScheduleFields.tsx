import { useId } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { BellRing, CalendarClock, CalendarDays, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PickerField } from "@/components/QuickTaskFields";
import { WEEK_DAYS, describeSchedule, formatDueInput } from "@/lib/task-schedule";
import { parseDueDateInput } from "@shared/task-visibility";

/** Поля расписания, общие для создания и правки задачи. */
type ScheduleValues = {
  dueDateInput?: string;
  weekDays?: number[] | null;
  monthDay?: string | number | null;
  isRecurring?: boolean;
};

/**
 * «Когда задача видна»: сверху — сводка словами («По будням · в полночь
 * начинается заново»), ниже — дни недели, число месяца, повтор и срок.
 * Подписи — в placeholder самих полей, отдельных заголовков нет: сводка
 * сверху и так говорит, что выбрано. Срок делает задачу разовой: остальное
 * при нём недоступно.
 */
export function TaskScheduleFields({ form, allowDue = true }: { form: UseFormReturn<any>; allowDue?: boolean }) {
  const headingId = useId();
  // Только свои поля: набор названия задачи эту часть не перерисовывает.
  const [dueDateInput, weekDays, monthDay, isRecurring] = useWatch({
    control: form.control,
    name: ["dueDateInput", "weekDays", "monthDay", "isRecurring"],
  }) as [ScheduleValues["dueDateInput"], ScheduleValues["weekDays"], ScheduleValues["monthDay"], ScheduleValues["isRecurring"]];
  // Как при сохранении: только настоящая дата делает задачу разовой.
  // Без срока (вкладка «Регулярная»): дата, оставшаяся в форме, не в счёт.
  const hasDueDate = allowDue && parseDueDateInput(dueDateInput) !== null;
  const summary = describeSchedule({ dueDateInput: allowDue ? dueDateInput : null, weekDays, monthDay, isRecurring });

  return (
    <section className="task-schedule" aria-labelledby={headingId}>
      <h3 id={headingId} className="sr-only">Когда задача видна</h3>
      {/* Сводка одной строкой: когда видна · что после выполнения. */}
      <p className="task-schedule-summary" role="status" aria-live="polite" data-testid="schedule-summary">
        <strong>{summary.when}</strong>{" "}
        <span>· {summary.repeat.charAt(0).toLowerCase() + summary.repeat.slice(1)}</span>
        {summary.note && <span className="task-schedule-note"> {summary.note}</span>}
      </p>

      <FormField
        control={form.control}
        name="weekDays"
        render={({ field }) => (
          <FormItem className="task-schedule-field">
            {/* Подпись группы — для чтения с экрана; ничего не выбрано — каждый день. */}
            <div className="task-schedule-days" role="group" aria-label="Дни недели (ничего не выбрано — каждый день)">
              {WEEK_DAYS.map((day) => {
                const isSelected = field.value?.includes(day.value) ?? false;
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={hasDueDate}
                    aria-pressed={isSelected}
                    onClick={() => {
                      const currentDays: number[] = field.value ?? [];
                      field.onChange(isSelected ? currentDays.filter((d) => d !== day.value) : [...currentDays, day.value]);
                    }}
                    className="task-schedule-day"
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
          <FormItem className="task-schedule-field">
            <FormLabel className="sr-only">Число месяца</FormLabel>
            <Select
              disabled={hasDueDate}
              onValueChange={(val) => field.onChange(val === "none" ? undefined : val)}
              value={field.value?.toString() || "none"}
            >
              <FormControl>
                <SelectTrigger className={`things-input w-full task-schedule-select ${field.value ? "" : "text-muted-foreground"}`}>
                  <CalendarDays aria-hidden className="task-schedule-select-icon" />
                  <SelectValue placeholder="Любое число" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">Любое число</SelectItem>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <SelectItem key={day} value={day.toString()}>
                    Каждое {day}-е число
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
          <FormItem className={`toggle-row ${hasDueDate ? "is-disabled" : ""}`}>
            <RefreshCw aria-hidden className="toggle-row-icon" />
            <FormLabel className="toggle-row-label">{hasDueDate ? "Со сроком — один раз" : "Повторять каждый день"}</FormLabel>
            <FormControl>
              <Checkbox checked={hasDueDate ? false : field.value} onCheckedChange={field.onChange} disabled={hasDueDate} />
            </FormControl>
          </FormItem>
        )}
      />

      {allowDue && (
      <FormField
        control={form.control}
        name="dueDateInput"
        render={({ field }) => (
          <FormItem className="task-schedule-field">
            <PickerField
              type="date"
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v)}
              placeholder="Разово — к сроку"
              display={(v) => {
                const text = formatDueInput(v);
                return text ? `Срок: ${text}` : null;
              }}
              icon={CalendarClock}
              testId="input-due-date"
              clearLabel="Убрать срок"
            />
            <FormMessage />
          </FormItem>
        )}
      />
      )}

      <RemindAtField form={form} />
    </section>
  );
}

/** «Напомнить в» — общее поле расписания и разовой задачи. */
export function RemindAtField({ form, className = "task-schedule-field" }: { form: UseFormReturn<any>; className?: string }) {
  return (
      <FormField
        control={form.control}
        name="remindAt"
        render={({ field }) => (
          <FormItem className={className}>
            <PickerField
              type="time"
              value={field.value ?? ""}
              onChange={(v) => field.onChange(v)}
              placeholder="Напомнить в…"
              display={(v) => (v ? `Напомнить в ${v}` : null)}
              icon={BellRing}
              testId="input-remind-at"
              clearLabel="Без напоминания"
            />
            <FormMessage />
          </FormItem>
        )}
      />
  );
}

/** Значение поля «Напомнить в» для API: «ЧЧ:ММ» или null. */
export function remindAtPayload(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}
