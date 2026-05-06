/**
 * Milestone-логика стрик-ачивок. Извлечено из StreakAchievement.tsx
 * чтобы тестировать без React/framer-motion/Portal.
 */

export const MILESTONES = [7, 14, 30, 60, 100, 200] as const;

export type Milestone = (typeof MILESTONES)[number];

/**
 * Выбирает наивысший milestone, который воркер уже преодолел и ещё не
 * видел. От высокого к низкому, чтобы не спамить старыми ачивками
 * («достиг 30 дней» — показываем 30, не 7).
 *
 *   streakDays=10, seen={} → 7 (преодолён 7, не 14)
 *   streakDays=30, seen={} → 30
 *   streakDays=30, seen={30} → 14
 *   streakDays=30, seen={7,14,30} → null (всё показали)
 *   streakDays=5  → null (никакого milestone не преодолено)
 */
export function pickHighestUnseenMilestone(
  streakDays: number,
  seen: ReadonlySet<number>,
): Milestone | null {
  if (streakDays < 1) return null;
  for (let i = MILESTONES.length - 1; i >= 0; i -= 1) {
    const m = MILESTONES[i];
    if (streakDays >= m && !seen.has(m)) return m;
  }
  return null;
}
