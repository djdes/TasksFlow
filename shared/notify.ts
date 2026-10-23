import { z } from "zod";

/**
 * Напоминания в Telegram по расписанию компании. Время — «ЧЧ:ММ» по
 * часовому поясу компании, null — напоминание выключено.
 *
 *   morning — сотруднику список задач на день;
 *   evening — сотруднику, если что-то осталось несделанным;
 *   digest  — руководителю итоги дня по его людям.
 */
export type NotifySlot = "morning" | "evening" | "digest";
export type NotifySettings = Record<NotifySlot, string | null>;

export const NOTIFY_SLOTS: readonly NotifySlot[] = ["morning", "evening", "digest"];

export const DEFAULT_NOTIFY: NotifySettings = { morning: "09:00", evening: "18:00", digest: "20:30" };

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");

export const notifySettingsSchema = z.object({
  morning: hhmm.nullable(),
  evening: hhmm.nullable(),
  digest: hhmm.nullable(),
});

/** Настройки из БД; пусто или мусор — значения по умолчанию. */
export function parseNotifySettings(raw: string | null | undefined): NotifySettings {
  if (!raw) return { ...DEFAULT_NOTIFY };
  try {
    const parsed = notifySettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...DEFAULT_NOTIFY };
  } catch {
    return { ...DEFAULT_NOTIFY };
  }
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
