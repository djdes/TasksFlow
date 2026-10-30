import { z } from "zod";

/**
 * Напоминания по расписанию компании — в Telegram и push (приложение,
 * PWA на рабочем столе, браузер). Время — «ЧЧ:ММ» по часовому поясу
 * компании, null — напоминание выключено.
 *
 *   morning — утренняя сводка для всех: сотруднику его задачи на день,
 *             руководителю и админу — ещё сводка по команде;
 *   evening — сотруднику, если что-то осталось несделанным;
 *   digest  — руководителю итоги дня по его людям.
 *
 * Отдельной задаче можно поставить своё время (tasks.remind_at): в это
 * время исполнитель получит напоминание, если задача ещё не сделана.
 */
export type NotifySlot = "morning" | "evening" | "digest";
export type NotifySettings = Record<NotifySlot, string | null>;

export const NOTIFY_SLOTS: readonly NotifySlot[] = ["morning", "evening", "digest"];

export const DEFAULT_NOTIFY: NotifySettings = { morning: "08:30", evening: "18:00", digest: "20:30" };

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");

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

// ---------------------------------------------------------------------------
// Личные настройки уведомлений (users.notify_prefs). Действуют на все
// каналы: push на устройствах и Telegram; письма — отдельным пунктом.

export type NotifyPrefKey = "newTask" | "reminders" | "review" | "verdict" | "digest" | "emailNewTask";
export type NotifyPrefs = Record<NotifyPrefKey, boolean>;

export const NOTIFY_PREF_KEYS: readonly NotifyPrefKey[] = ["newTask", "reminders", "verdict", "review", "digest", "emailNewTask"];

/**
 * По умолчанию включены уведомления на устройства и в Telegram — человек сам
 * выключит лишнее. Письма — только по желанию: у старых аккаунтов email уже
 * есть, и включённые по умолчанию письма стали бы спамом после выкладки
 * (например, на каждую задачу из синхронизации WeSetup).
 */
export const DEFAULT_PREFS: NotifyPrefs = {
  newTask: true,
  reminders: true,
  review: true,
  verdict: true,
  digest: true,
  emailNewTask: false,
};

/** Подписи и кому пункт нужен: review и digest — тем, кто проверяет и руководит. */
export const NOTIFY_PREF_TEXT: Record<NotifyPrefKey, { title: string; hint: string; managersOnly?: boolean }> = {
  newTask: { title: "Новые задачи", hint: "Когда вам поставили задачу" },
  reminders: { title: "Напоминания", hint: "Утренняя сводка, вечернее «что осталось» и время, заданное в задаче" },
  verdict: { title: "Проверка моих задач", hint: "Задачу приняли или вернули на доработку" },
  review: { title: "Задачи на проверку", hint: "Сотрудник отметил задачу — пора принять или вернуть", managersOnly: true },
  digest: { title: "Итоги дня", hint: "Вечером: сколько сделано и что осталось у ваших людей", managersOnly: true },
  emailNewTask: { title: "Письма о новых задачах", hint: "На email из блока «Email» ниже" },
};

export const notifyPrefsSchema = z.object({
  newTask: z.boolean(),
  reminders: z.boolean(),
  review: z.boolean(),
  verdict: z.boolean(),
  digest: z.boolean(),
  emailNewTask: z.boolean(),
});

/** Из БД: пусто — по умолчанию, неизвестные пункты — по умолчанию по одному. */
export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = notifyPrefsSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? { ...DEFAULT_PREFS, ...parsed.data } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
