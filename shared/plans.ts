/**
 * Тарифы — как на лендинге (client/src/public/pages/LandingPage.tsx).
 * Лимиты включаются env PLAN_LIMITS=on: до этого тариф только
 * показывается, а сотрудников можно добавлять без ограничений — включать
 * ограничение для действующих клиентов решает владелец сервиса.
 */
// Коды в базе (companies.plan, payment_orders.plan, billing_prices) остались
// прежними: start / team / business. С 01.11.2026 меняются только названия:
// «Старт» → «Бесплатный», «Команда» → «Стандарт», «Бизнес» → «Премиум».
export type PlanId = "start" | "team" | "business";

export type Plan = { id: PlanId; name: string; maxUsers: number | null; locations: boolean };

export const PLANS: Record<PlanId, Plan> = {
  start: { id: "start", name: "Бесплатный", maxUsers: 5, locations: false },
  team: { id: "team", name: "Стандарт", maxUsers: 30, locations: false },
  business: { id: "business", name: "Премиум", maxUsers: null, locations: true },
};

export const PLAN_IDS: readonly PlanId[] = ["start", "team", "business"];

/** Что входит в тариф — одинаково на лендинге и на странице оплаты. */
export const PLAN_FEATURES: Record<PlanId, readonly string[]> = {
  start: ["До 5 сотрудников", "Задачи и чек-листы", "Фотоотчёты"],
  team: ["До 30 сотрудников", "Повторяющиеся задачи", "Премии и проверка", "Приглашение по QR"],
  business: ["Без лимита сотрудников", "Несколько точек", "Интеграции и API", "Помощь с запуском"],
};

/**
 * Действующий тариф: платный до plan_until, после — «Бесплатный».
 * Пустой или неизвестный — «Бесплатный».
 */
export function effectivePlan(raw: string | null | undefined, until: number | null | undefined, now: number = Math.floor(Date.now() / 1000)): Plan {
  const id = (PLAN_IDS as readonly string[]).includes(raw ?? "") ? (raw as PlanId) : "start";
  if (id !== "start" && until != null && until > 0 && until < now) return PLANS.start;
  return PLANS[id];
}

/** Прежние названия: они остались в описании заказов, оплаченных до 01.11.2026. */
export const LEGACY_PLAN_NAMES: Record<PlanId, string> = { start: "Старт", team: "Команда", business: "Бизнес" };

/**
 * Название тарифа из описания заказа («TasksFlow, тариф «Команда» на 1 месяц»):
 * в счёте и УПД оно должно совпадать с чеком, даже если тариф потом
 * переименовали. Нет в описании — текущее название.
 */
export function planNameFromDescription(plan: PlanId, description: string | null | undefined): string {
  const named = description?.match(/тариф «([^»]+)»/)?.[1];
  return named && (named === PLANS[plan].name || named === LEGACY_PLAN_NAMES[plan]) ? named : PLANS[plan].name;
}

/** Сколько ещё человек можно добавить; null — без лимита. */
export function seatsLeft(plan: Plan, usersCount: number): number | null {
  return plan.maxUsers === null ? null : Math.max(0, plan.maxUsers - usersCount);
}
