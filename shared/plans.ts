/**
 * Тарифы — как на лендинге (client/src/public/pages/LandingPage.tsx).
 * Лимиты включаются env PLAN_LIMITS=on: до этого тариф только
 * показывается, а сотрудников можно добавлять без ограничений — включать
 * ограничение для действующих клиентов решает владелец сервиса.
 */
export type PlanId = "start" | "team" | "business";

export type Plan = { id: PlanId; name: string; maxUsers: number | null; locations: boolean };

export const PLANS: Record<PlanId, Plan> = {
  start: { id: "start", name: "Старт", maxUsers: 5, locations: false },
  team: { id: "team", name: "Команда", maxUsers: 30, locations: false },
  business: { id: "business", name: "Бизнес", maxUsers: null, locations: true },
};

export const PLAN_IDS: readonly PlanId[] = ["start", "team", "business"];

/**
 * Действующий тариф: платный до plan_until, после — «Старт».
 * Пустой или неизвестный — «Старт».
 */
export function effectivePlan(raw: string | null | undefined, until: number | null | undefined, now: number = Math.floor(Date.now() / 1000)): Plan {
  const id = (PLAN_IDS as readonly string[]).includes(raw ?? "") ? (raw as PlanId) : "start";
  if (id !== "start" && until != null && until > 0 && until < now) return PLANS.start;
  return PLANS[id];
}

/** Сколько ещё человек можно добавить; null — без лимита. */
export function seatsLeft(plan: Plan, usersCount: number): number | null {
  return plan.maxUsers === null ? null : Math.max(0, plan.maxUsers - usersCount);
}
