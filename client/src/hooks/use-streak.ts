import { useEffect, useState } from "react";

/**
 * Локальный «стрик» — сколько дней подряд воркер закрыл хотя бы одну
 * задачу. Хранится в localStorage per-user, не дёргает API. Цель —
 * мягкая мотивация: цифра «5 дней подряд» — психологически приятный
 * ярлык, особенно для пожилых сотрудников, которым видимая отметка
 * добавляет ощущение «меня заметили».
 *
 * Правила:
 *   • Если сегодня уже закрыто что-то и stored.lastDate === today —
 *     не меняем (повторный рендер не +1).
 *   • Если stored.lastDate === вчера — +1.
 *   • Иначе — сброс на 1 (пропустил день → стрик начинается заново).
 *   • Если ещё ничего не закрыто (didCompleteSomething=false) —
 *     просто отображаем сохранённое значение.
 *
 * Не обнуляем когда day всё ещё длится: сотрудник может закрыть
 * задачу позже — даём шанс. Обнуление произойдёт через сутки если
 * lastDate отстал >= 2 дня.
 *
 * Storage: `tf_streak_${userId}` = `{days:number, lastDate:"YYYY-MM-DD"}`.
 * При смене userId (другой логин) ключ другой — стрики не путаются.
 */

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type StreakStored = { days: number; lastDate: string };

/**
 * Pure-функция парсинга localStorage-payload. Возвращает stored либо
 * null если невалидно. Извлечено для прямого тестирования defensive-
 * checks без mocking localStorage.
 *
 * Защищает от:
 *   • corrupted JSON
 *   • days не number / float / negative
 *   • lastDate не string
 *   • null root (JSON.parse('null'))
 */
export function parseStreakStored(raw: string | null | undefined): StreakStored | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StreakStored> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const days = (parsed as { days?: unknown }).days;
    const lastDate = (parsed as { lastDate?: unknown }).lastDate;
    if (
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < 0 ||
      typeof lastDate !== "string"
    ) {
      return null;
    }
    return { days, lastDate };
  } catch {
    return null;
  }
}

/**
 * Pure-функция расчёта следующего streak. Извлечена из useEffect для
 * прямого unit-тестирования без React. Изменения тут — изменения
 * UX-мотивации воркера, легко тихо сломать.
 *
 *   • didCompleteSomethingToday=false → отображаем сохранённое (даже
 *     если день начался — пока не сделал ничего, не +1).
 *   • lastDate === today → idempotent, не +1 при повторном рендере.
 *   • lastDate === yesterday → +1 (продолжение серии).
 *   • Иначе (пропустил день, нет сохранённого) → 1 (новая серия).
 */
export function computeNextStreak(
  stored: StreakStored | null,
  today: string,
  yesterday: string,
  didCompleteSomethingToday: boolean,
): number {
  if (!didCompleteSomethingToday) {
    return stored?.days ?? 0;
  }
  if (!stored) return 1;
  if (stored.lastDate === today) return stored.days;
  if (stored.lastDate === yesterday) return stored.days + 1;
  return 1;
}

type Stored = StreakStored;

export function useStreak(
  userId: number | null | undefined,
  didCompleteSomethingToday: boolean,
): number {
  const [streak, setStreak] = useState<number>(0);

  useEffect(() => {
    if (!userId) {
      setStreak(0);
      return;
    }
    const key = `tf_streak_${userId}`;
    let stored: Stored | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      stored = parseStreakStored(raw);
    } catch {
      /* corrupted — treat as fresh */
    }

    const today = todayKey();
    const yesterday = yesterdayKey();
    const nextDays = computeNextStreak(
      stored,
      today,
      yesterday,
      didCompleteSomethingToday,
    );

    if (!didCompleteSomethingToday) {
      // Только показываем то что было — без обновления storage.
      setStreak(nextDays);
      return;
    }

    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ days: nextDays, lastDate: today } satisfies Stored),
      );
    } catch {
      /* storage full / privacy mode — graceful degrade */
    }
    setStreak(nextDays);
  }, [userId, didCompleteSomethingToday]);

  return streak;
}
