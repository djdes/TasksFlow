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
 *
 *   days      — в какие дни недели приходят напоминания (все три и время
 *               задачи); в остальные дни тихо. По умолчанию — каждый день.
 *   quietFrom — с какого времени ночь: новые задачи, «ждёт проверки»,
 *               «вернули» и оплата, случившиеся ночью, не будят, а
 *               приходят утром — во время утренней сводки (или в 08:00,
 *               если она выключена). null — уведомления сразу, круглые
 *               сутки (ночные смены).
 */
export type NotifySlot = "morning" | "evening" | "digest";
export type NotifySettings = Record<NotifySlot, string | null> & {
  /** 0 — воскресенье … 6 — суббота, как Date.getDay() и weekDays задач. */
  days: number[];
  quietFrom: string | null;
};

export const NOTIFY_SLOTS: readonly NotifySlot[] = ["morning", "evening", "digest"];

export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
/** Конец ночи, если утренняя сводка выключена. */
export const QUIET_UNTIL_FALLBACK = "08:00";
/** Ночь длиннее — почти наверняка опечатка (например, «с 09:00»). */
export const QUIET_MAX_MINUTES = 14 * 60;

export const DEFAULT_NOTIFY: NotifySettings = {
  morning: "08:30",
  evening: "18:00",
  digest: "20:30",
  days: [...ALL_DAYS],
  quietFrom: "22:00",
};

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");

const daysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Выберите хотя бы один день напоминаний")
  .max(7)
  .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b));

/** Длина ночи в минутах: с quietFrom до утра (через полночь). */
export function quietLength(quietFrom: string, until: string): number {
  return (hhmmToMinutes(until) - hhmmToMinutes(quietFrom) + 1440) % 1440;
}

/** Когда кончается ночь: утренняя сводка, а без неё — 08:00. */
export function quietUntil(settings: Pick<NotifySettings, "morning">): string {
  return settings.morning ?? QUIET_UNTIL_FALLBACK;
}

/**
 * Что присылает кабинет. days и quietFrom необязательны: старый кабинет
 * их не знает, и сервер тогда оставляет сохранённые (routes.ts).
 */
export const notifySettingsSchema = z
  .object({
    morning: hhmm.nullable(),
    evening: hhmm.nullable(),
    digest: hhmm.nullable(),
    days: daysSchema.optional(),
    quietFrom: hhmm.nullable().optional(),
  })
  .refine(
    (s) => !s.quietFrom || quietLength(s.quietFrom, quietUntil(s)) <= QUIET_MAX_MINUTES,
    { message: "Ночь получается длиннее 14 часов — проверьте время «не беспокоить с»", path: ["quietFrom"] },
  );

export type NotifySettingsInput = z.infer<typeof notifySettingsSchema>;

/** Настройки из БД; пусто или мусор — значения по умолчанию, по полю. */
export function parseNotifySettings(raw: string | null | undefined): NotifySettings {
  if (!raw) return withDefaults({});
  try {
    const parsed = notifySettingsSchema.safeParse(JSON.parse(raw));
    return withDefaults(parsed.success ? parsed.data : {});
  } catch {
    return withDefaults({});
  }
}

/** Дополнить недостающие поля значениями по умолчанию. */
export function withDefaults(input: Partial<NotifySettingsInput>): NotifySettings {
  return {
    morning: input.morning === undefined ? DEFAULT_NOTIFY.morning : input.morning,
    evening: input.evening === undefined ? DEFAULT_NOTIFY.evening : input.evening,
    digest: input.digest === undefined ? DEFAULT_NOTIFY.digest : input.digest,
    days: input.days && input.days.length > 0 ? [...input.days] : [...ALL_DAYS],
    quietFrom: input.quietFrom === undefined ? DEFAULT_NOTIFY.quietFrom : input.quietFrom,
  };
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** День недели (0 — вс … 6 — сб) — день напоминаний компании? */
export function isReminderDay(settings: Pick<NotifySettings, "days">, weekday: number): boolean {
  return settings.days.length === 0 || settings.days.includes(weekday);
}

/** Сейчас ночь по настройкам компании (минуты от местной полуночи)? */
export function isQuietTime(settings: Pick<NotifySettings, "morning" | "quietFrom">, minutes: number): boolean {
  if (!settings.quietFrom) return false;
  const from = hhmmToMinutes(settings.quietFrom);
  const until = hhmmToMinutes(quietUntil(settings));
  if (from === until) return false;
  return from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until;
}

/** «Пн–Пт», «каждый день», «Пн, Ср, Пт» — для подписи в настройках. */
const SHORT_DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
export function daysLabel(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 0 || set.size === 7) return "каждый день";
  if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return "по будням";
  if (set.size === 2 && set.has(0) && set.has(6)) return "по выходным";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d)).map((d) => SHORT_DAYS[d]).join(", ");
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
