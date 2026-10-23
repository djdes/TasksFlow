/**
 * «День» по часовому поясу компании. Сброс повторяющихся задач, история
 * и отчёты считают день одинаково на сервере и в браузере: по IANA-зоне
 * компании, а не по часам сервера или телефона. Иначе у кафе во
 * Владивостоке задачи сбрасывались бы в 7 утра по местному времени.
 *
 * День — строка YYYY-MM-DD: её удобно хранить, сравнивать и сдвигать.
 */
export const DEFAULT_TIMEZONE = "Europe/Moscow";

/** Пояса для выбора в настройках. Смещение UTC считает utcOffsetLabel. */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Europe/Kaliningrad", label: "Калининград" },
  { value: "Europe/Moscow", label: "Москва" },
  { value: "Europe/Samara", label: "Самара" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург" },
  { value: "Asia/Omsk", label: "Омск" },
  { value: "Asia/Novosibirsk", label: "Новосибирск" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск" },
  { value: "Asia/Irkutsk", label: "Иркутск" },
  { value: "Asia/Yakutsk", label: "Якутск" },
  { value: "Asia/Vladivostok", label: "Владивосток" },
  { value: "Asia/Magadan", label: "Магадан" },
  { value: "Asia/Kamchatka", label: "Камчатка" },
  { value: "Europe/Minsk", label: "Минск" },
  { value: "Asia/Almaty", label: "Алматы" },
  { value: "Asia/Tashkent", label: "Ташкент" },
  { value: "Asia/Yerevan", label: "Ереван" },
  { value: "Asia/Tbilisi", label: "Тбилиси" },
  { value: "Asia/Baku", label: "Баку" },
];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Пояс компании или пояс по умолчанию, если в БД что-то не то. */
export function zoneOrDefault(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(unixSec: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(unixSec * 1000))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** unix sec → YYYY-MM-DD в поясе tz. */
export function dayInZone(unixSec: number, tz: string): string {
  const p = partsIn(unixSec, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** unix sec → «ЧЧ:ММ» в поясе tz. */
export function timeInZone(unixSec: number, tz: string): string {
  const p = partsIn(unixSec, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function isDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function utcOf(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Bad day: ${day}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Сдвиг дня: shiftDay("2026-03-01", -1) → "2026-02-28". */
export function shiftDay(day: string, delta: number): string {
  const d = utcOf(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0 = воскресенье … 6 = суббота, как Date.getDay() и weekDays задач. */
export function dayOfWeek(day: string): number {
  return utcOf(day).getUTCDay();
}

export function dayOfMonth(day: string): number {
  return utcOf(day).getUTCDate();
}

/** Сколько дней от from до to включительно (from ≤ to). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to).getTime() - utcOf(from).getTime()) / 86_400_000) + 1;
}

/** Смещение пояса в секундах в момент unixSec (Москва → 10800). */
function offsetAt(unixSec: number, tz: string): number {
  const p = partsIn(unixSec, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - unixSec;
}

/** unix sec местной полуночи, с которой начинается day в поясе tz. */
export function startOfDayInZone(day: string, tz: string): number {
  const utcMidnight = utcOf(day).getTime() / 1000;
  // Второй проход уточняет смещение, если на эти сутки пришёлся переход
  // на летнее время (в России его нет, но пояса бывают любые).
  let guess = utcMidnight - offsetAt(utcMidnight, tz);
  guess = utcMidnight - offsetAt(guess, tz);
  return guess;
}

/** «UTC+3», «UTC+5:30» — для подписи в списке поясов. */
export function utcOffsetLabel(tz: string, at: number = Math.floor(Date.now() / 1000)): string {
  const total = Math.round(offsetAt(at, tz) / 60);
  const sign = total < 0 ? "−" : "+";
  const h = Math.floor(Math.abs(total) / 60);
  const m = Math.abs(total) % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ""}`;
}
