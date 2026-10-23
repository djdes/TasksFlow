import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, utcOffsetLabel } from "@shared/day";
import { DEFAULT_NOTIFY, NOTIFY_SLOTS, type NotifySettings, type NotifySlot } from "@shared/notify";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const SLOT_TEXT: Record<NotifySlot, { title: string; hint: string }> = {
  morning: { title: "Утром — список задач", hint: "Каждому, у кого есть задачи на сегодня" },
  evening: { title: "Вечером — что осталось", hint: "Только тем, у кого что-то не сделано" },
  digest: { title: "Итоги дня", hint: "Админу и руководителям — по их людям" },
};

type CompanyLike = { name: string; timezone?: string | null; notify?: NotifySettings | null };

/**
 * «Расписание дня»: часовой пояс компании (по нему полночный сброс задач и
 * дни в истории) и время напоминаний в Telegram. Сохраняется отдельно от
 * остальной формы — частичный PUT /api/companies/me.
 */
export function ScheduleSettings({ company }: { company: CompanyLike }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [timezone, setTimezone] = useState(company.timezone || DEFAULT_TIMEZONE);
  const [notify, setNotify] = useState<NotifySettings>(company.notify ?? DEFAULT_NOTIFY);
  // Время, которое вернётся при повторном включении выключенного слота.
  const [lastTimes, setLastTimes] = useState<Record<NotifySlot, string>>({
    morning: company.notify?.morning ?? DEFAULT_NOTIFY.morning!,
    evening: company.notify?.evening ?? DEFAULT_NOTIFY.evening!,
    digest: company.notify?.digest ?? DEFAULT_NOTIFY.digest!,
  });

  useEffect(() => {
    setTimezone(company.timezone || DEFAULT_TIMEZONE);
    setNotify(company.notify ?? DEFAULT_NOTIFY);
  }, [company.timezone, company.notify]);

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
        <legend className="text-sm font-medium text-foreground mb-1">Напоминания в Telegram</legend>
        <p className="text-xs text-muted-foreground mb-3">Получают те, кто привязал бота в «Моём аккаунте».</p>
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
      </fieldset>

      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={() => save.mutate()} loading={save.isPending} loadingLabel="Сохраняем…">
          Сохранить расписание
        </Button>
      </div>
    </div>
  );
}
