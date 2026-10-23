import { effectivePlan, PLANS, type Plan } from "@shared/plans";
import type { Company } from "@shared/schema";
import { storage } from "./storage";

/**
 * Лимиты тарифов. Выключены, пока не задан PLAN_LIMITS=on: включать
 * ограничение для действующих клиентов решает владелец сервиса, а до
 * этого тариф только показывается.
 */
export function planLimitsEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PLAN_LIMITS === "on";
}

export function companyPlan(company: Pick<Company, "plan" | "planUntil"> | null | undefined): Plan {
  return effectivePlan(company?.plan, company?.planUntil);
}

const NEXT_PLAN: Record<Plan["id"], Plan | null> = { start: PLANS.team, team: PLANS.business, business: null };

/** Текст отказа, если в компанию нельзя добавить ещё человека; иначе null. */
export async function seatProblem(companyId: number | null | undefined): Promise<string | null> {
  if (!companyId || !planLimitsEnforced()) return null;
  const plan = companyPlan(await storage.getCompanyById(companyId));
  if (plan.maxUsers === null) return null;
  const count = await storage.countCompanyUsers(companyId);
  if (count < plan.maxUsers) return null;
  const next = NEXT_PLAN[plan.id];
  return (
    `На тарифе «${plan.name}» — до ${plan.maxUsers} человек в компании.` +
    (next ? ` Чтобы добавить ещё, подключите «${next.name}»: напишите на support@tasksflow.ru.` : "")
  );
}

/** Точки доступны на «Бизнесе» (при выключенных лимитах — всем). */
export function locationsProblem(company: Pick<Company, "plan" | "planUntil"> | null | undefined): string | null {
  if (!planLimitsEnforced() || companyPlan(company).locations) return null;
  return "Несколько точек — на тарифе «Бизнес». Напишите на support@tasksflow.ru, подключим.";
}
