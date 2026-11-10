import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, Moon } from "lucide-react";
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, utcOffsetLabel } from "@shared/day";
import {
  ALL_DAYS,
  daysLabel,
  DEFAULT_NOTIFY,
  NOTIFY_SLOTS,
  QUIET_MAX_MINUTES,
  quietLength,
  quietUntil,
  WEEKDAYS,
  withDefaults,
  type NotifySettings,
  type NotifySlot,
} from "@shared/notify";
import { WEEK_DAYS } from "@/lib/task-schedule";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SLOT_TEXT: Record<NotifySlot, { title: string; hint: string }> = {
  morning: { title: "Утренняя сводка", hint: "Всем: сотруднику — его задачи на день, руководителю и админу — ещё сводка по команде" },
  evening: { title: "Перед уходом — что не сделано", hint: "Только тем, у кого остались невыполненные задачи" },
  digest: { title: "Итоги дня", hint: "Админу и руководителям — по их людям" },
};

type CompanyLike = { name: string; timezone?: string | null; notify?: Partial<NotifySettings> | null };

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d) => b.includes(d));

/**
 * «Расписание дня»: часовой пояс компании (по нему полночный сброс задач и
 * дни в истории) и время напоминаний в Telegram. Сохраняется отдельно от
 * остальной формы — частичный PUT /api/companies/me.
 */
export function ScheduleSettings({ company }: { company: CompanyLike }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [timezone, setTimezone] = useState(company.timezone || DEFAULT_TIMEZONE);
  // Старый сервер (или демо) может не прислать дни и «ночь» — дополняем.
  const [notify, setNotify] = useState<NotifySettings>(withDefaults(company.notify ?? {}));
  // Время, которое вернётся при повторном включении выключенного слота.
  const [lastTimes, setLastTimes] = useState<Record<NotifySlot, string>>({
    morning: company.notify?.morning ?? DEFAULT_NOTIFY.morning!,
    evening: company.notify?.evening ?? DEFAULT_NOTIFY.evening!,
    digest: company.notify?.digest ?? DEFAULT_NOTIFY.digest!,
  });
  const [lastQuiet, setLastQuiet] = useState(company.notify?.quietFrom ?? DEFAULT_NOTIFY.quietFrom!);

  useEffect(() => {
    setTimezone(company.timezone || DEFAULT_TIMEZONE);
    setNotify(withDefaults(company.notify ?? {}));
  }, [company.timezone, company.notify]);

  const until = quietUntil(notify);
  const nightTooLong = !!notify.quietFrom && quietLength(notify.quietFrom, until) > QUIET_MAX_MINUTES;
  const toggleDay = (day: number) =>
    setNotify((n) => {
      const has = n.days.includes(day);
      // Последний день не снимаем: без дней напоминаний не было бы вовсе.
      if (has && n.days.length === 1) return n;
      return { ...n, days: has ? n.days.filter((d) => d !== day) : [...n.days, day].sort((a, b) => a - b) };
    });

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/companies/me", { name: company.name, timezone, notify }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-me"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "me"] }),
      ]);
      toast({ title: "Расписание сохранено" });
    },
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });

  const options = TIMEZONE_OPTIONS.some((o) => o.value === timezone)
    ? TIMEZONE_OPTIONS
    : [{ value: timezone, label: timezone }, ...TIMEZONE_OPTIONS];

  return (
    <div className="content-panel schedule-settings">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Clock3 className="w-5 h-5 text-primary" aria-hidden="true" />
        Расписание дня
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        В полночь по этому времени у задач начинается новый день, а вчерашний уходит в историю вместе с фото.
      </p>

      <label className="block mb-6">
        <span className="text-sm font-medium text-foreground mb-2 block">Часовой пояс</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="reports-select w-full sm:w-80">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} · {utcOffsetLabel(o.value)}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-1">Напоминания</legend>
        <p className="text-xs text-muted-foreground mb-3">
          Приходят уведомлением в приложение (и на рабочий стол, если TasksFlow установлен) и в Telegram, если бот привязан
          в «Моём аккаунте». Своё время напоминания можно поставить и отдельной задаче. Каждый может выключить лишнее у себя в «Уведомлениях».
        </p>
        <div className="schedule-slots">
          {NOTIFY_SLOTS.map((slot) => {
            const on = notify[slot] !== null;
            const id = `notify-${slot}`;
            return (
              <div key={slot} className="schedule-slot" data-off={!on || undefined}>
                <input
                  id={id}
                  type="checkbox"
                  className="schedule-check"
                  checked={on}
                  onChange={(e) => setNotify((n) => ({ ...n, [slot]: e.target.checked ? lastTimes[slot] : null }))}
                />
                <label htmlFor={id} className="schedule-slot-text">
                  <span>{SLOT_TEXT[slot].title}</span>
                  <small>{SLOT_TEXT[slot].hint}</small>
                </label>
                <input
                  type="time"
                  aria-label={`Время: ${SLOT_TEXT[slot].title}`}
                  className="schedule-time"
                  value={notify[slot] ?? lastTimes[slot]}
                  disabled={!on}
                  step={300}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!/^\d{2}:\d{2}$/.test(value)) return;
                    setLastTimes((t) => ({ ...t, [slot]: value }));
                    setNotify((n) => ({ ...n, [slot]: value }));
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="schedule-days" role="group" aria-labelledby="notify-days-label">
          <div className="schedule-days-head">
            <span id="notify-days-label" className="text-sm font-medium text-foreground">
              Дни напоминаний
            </span>
            <span className="schedule-days-summary" aria-live="polite">
              {daysLabel(notify.days)}
            </span>
          </div>
          <div className="schedule-days-row">
            {WEEK_DAYS.map((day) => {
              const on = notify.days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className="schedule-day"
                  aria-pressed={on}
                  aria-label={`${day.label}: ${on ? "напоминания есть" : "без напоминаний"}`}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              );
            })}
            <button
              type="button"
              className="schedule-days-preset"
              onClick={() =>
                setNotify((n) => ({ ...n, days: sameDays(n.days, WEEKDAYS) ? [...ALL_DAYS] : [...WEEKDAYS] }))
              }
            >
              {sameDays(notify.days, WEEKDAYS) ? "Каждый день" : "Только будни"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            В остальные дни нет ни сводок, ни времени задач. Новые задачи и проверки приходят всегда.
          </p>
        </div>

        <div className="schedule-slots mt-4">
          <div className="schedule-slot" data-off={!notify.quietFrom || undefined}>
            <input
              id="notify-quiet"
              type="checkbox"
              className="schedule-check"
              checked={!!notify.quietFrom}
              onChange={(e) => setNotify((n) => ({ ...n, quietFrom: e.target.checked ? lastQuiet : null }))}
            />
            <label htmlFor="notify-quiet" className="schedule-slot-text">
              <span className="inline-flex items-center gap-1.5">
                <Moon className="w-4 h-4" aria-hidden="true" />
                Ночью не беспокоить
              </span>
              <small>
                {notify.quietFrom
                  ? `Новые задачи, проверки и оплата ночью не будят — придут утром, в ${until}${notify.morning ? " вместе со сводкой" : ""}.`
                  : "Уведомления приходят сразу, круглые сутки — для ночных смен."}
              </small>
            </label>
            <input
              type="time"
              aria-label="Не беспокоить с"
              className="schedule-time"
              value={notify.quietFrom ?? lastQuiet}
              disabled={!notify.quietFrom}
              step={300}
              onChange={(e) => {
                const value = e.target.value;
                if (!/^\d{2}:\d{2}$/.test(value)) return;
                setLastQuiet(value);
                setNotify((n) => ({ ...n, quietFrom: value }));
              }}
            />
          </div>
        </div>
        {nightTooLong ? (
          <p className="text-xs text-destructive mt-2" role="alert">
            Ночь с {notify.quietFrom} до {until} длиннее 14 часов — проверьте время.
          </p>
        ) : null}
      </fieldset>

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={nightTooLong}
          loading={save.isPending}
          loadingLabel="Сохраняем…"
        >
          Сохранить расписание
        </Button>
      </div>
    </div>
  );
}
