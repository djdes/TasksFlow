import { useId } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { BellRing, CalendarClock, CalendarDays, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WEEK_DAYS, describeSchedule } from "@/lib/task-schedule";
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
 * Срок делает задачу разовой: остальное при нём недоступно.
 */
export function TaskScheduleFields({ form }: { form: UseFormReturn<any> }) {
  const headingId = useId();
  const weekLabelId = useId();
  // Только свои поля: набор названия задачи эту часть не перерисовывает.
  const [dueDateInput, weekDays, monthDay, isRecurring] = useWatch({
    control: form.control,
    name: ["dueDateInput", "weekDays", "monthDay", "isRecurring"],
  }) as [ScheduleValues["dueDateInput"], ScheduleValues["weekDays"], ScheduleValues["monthDay"], ScheduleValues["isRecurring"]];
  // Как при сохранении: только настоящая дата делает задачу разовой.
  const hasDueDate = parseDueDateInput(dueDateInput) !== null;
  const summary = describeSchedule({ dueDateInput, weekDays, monthDay, isRecurring });

  return (
    <section className="task-schedule" aria-labelledby={headingId}>
      <h3 id={headingId} className="task-schedule-title">
        <CalendarClock aria-hidden />
        Когда задача видна
      </h3>
      <p className="task-schedule-summary" role="status" aria-live="polite" data-testid="schedule-summary">
        <strong>{summary.when}</strong>
        <span>{summary.repeat}</span>
        {summary.note && <span className="task-schedule-note">{summary.note}</span>}
      </p>

      <div className="task-schedule-grid">
        <FormField
          control={form.control}
          name="weekDays"
          render={({ field }) => (
            <FormItem className="task-schedule-field">
              {/* Не FormLabel: подпись у группы кнопок, а не у одного поля. */}
              <p id={weekLabelId} className="task-schedule-label">
                <Calendar aria-hidden />
                Дни недели
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby={weekLabelId}>
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
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
              <p className="task-schedule-hint">Ничего не выбрано — каждый день.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="monthDay"
          render={({ field }) => (
            <FormItem className="task-schedule-field">
              <FormLabel className="task-schedule-label">
                <CalendarDays aria-hidden />
                Число месяца
              </FormLabel>
              <Select
                disabled={hasDueDate}
                onValueChange={(val) => field.onChange(val === "none" ? undefined : val)}
                value={field.value?.toString() || "none"}
              >
                <FormControl>
                  <SelectTrigger className="things-input w-full">
                    <SelectValue placeholder="Любое" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">Любое</SelectItem>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}-е число
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="task-schedule-hint">Для ежемесячных дел: инвентаризация, отчёт.</p>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="isRecurring"
        render={({ field }) => (
          <FormItem className="task-schedule-check">
            <FormControl>
              <Checkbox checked={hasDueDate ? false : field.value} onCheckedChange={field.onChange} disabled={hasDueDate} />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="cursor-pointer flex items-center gap-2">
                <RefreshCw className="w-4 h-4" aria-hidden />
                Начинать заново каждый день
              </FormLabel>
              <p className="task-schedule-hint">
                {hasDueDate
                  ? "Недоступно: у задачи есть срок, она разовая."
                  : "В полночь задача снова ждёт выполнения, а вчерашнее — с фото — остаётся в истории. Выключите для разового дела без срока."}
              </p>
            </div>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="dueDateInput"
        render={({ field }) => (
          <FormItem className="task-schedule-field task-schedule-due">
            <FormLabel className="task-schedule-label">
              <CalendarClock aria-hidden />
              Или разово — к сроку
            </FormLabel>
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  type="date"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="max-w-[200px]"
                  data-testid="input-due-date"
                />
              </FormControl>
              {field.value && (
                <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange("")}>
                  Убрать
                </Button>
              )}
            </div>
            <p className="task-schedule-hint">Видна сразу; после срока не исчезает, а получает отметку «Просрочено». Срок отключает дни и повтор.</p>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="remindAt"
        render={({ field }) => (
          <FormItem className="task-schedule-field task-schedule-remind">
            <FormLabel className="task-schedule-label">
              <BellRing aria-hidden />
              Напомнить в
            </FormLabel>
            <div className="flex items-center gap-2">
              <FormControl>
                <Input
                  type="time"
                  step={300}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="max-w-[140px]"
                  data-testid="input-remind-at"
                />
              </FormControl>
              {field.value && (
                <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange("")}>
                  Убрать
                </Button>
              )}
            </div>
            <p className="task-schedule-hint">
              Необязательно. В это время исполнитель получит уведомление, если задача ещё не сделана. Утренняя сводка приходит всем и так.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  );
}

/** Значение поля «Напомнить в» для API: «ЧЧ:ММ» или null. */
export function remindAtPayload(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}
