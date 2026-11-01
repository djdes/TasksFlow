/**
 * Тарифы с 01.11.2026 называются «Бесплатный», «Стандарт» и «Премиум»; коды в
 * базе прежние. Счёт и УПД по старому заказу показывают название из чека.
 */
import { describe, expect, it } from "vitest";
import { orderDescription } from "../shared/billing";
import { LEGACY_PLAN_NAMES, PLANS, planNameFromDescription } from "../shared/plans";
import { buildClosingDraft, buildInvoiceDraft } from "../server/billing/documents";
import type { SellerRequisites } from "../server/billing/legal";

const seller: SellerRequisites = {
  name: "ИП Иванов",
  inn: "500100732259",
  kpp: null,
  ogrn: "304500116000157",
  address: "Москва",
  head: null,
  bank: { name: "Банк", bik: "044525225", account: "40802810000000000001", corrAccount: "30101810400000000225" },
  vatNote: "Без НДС",
  email: null,
};
const buyer = { name: "ООО Ромашка", inn: "7707083893", kpp: null, ogrn: null, address: null, head: null };
const order = (description: string) => ({
  id: 7,
  plan: "team",
  months: 1,
  amountRub: 990,
  createdAt: 1_790_000_000,
  paidAt: 1_790_000_100,
  planUntilAfter: null,
  promoCode: null,
  discountRub: 0,
  invoiceDueAt: null,
  description,
});

describe("названия тарифов", () => {
  it("новые названия, коды прежние", () => {
    expect([PLANS.start.name, PLANS.team.name, PLANS.business.name]).toEqual(["Бесплатный", "Стандарт", "Премиум"]);
    expect(Object.keys(PLANS)).toEqual(["start", "team", "business"]);
    expect(orderDescription("team", 1)).toBe("TasksFlow, тариф «Стандарт» на 1 месяц");
  });

  it("название из описания заказа: прежнее остаётся, чужое и мусор — текущее", () => {
    expect(planNameFromDescription("team", "TasksFlow, тариф «Команда» на 1 месяц")).toBe("Команда");
    expect(planNameFromDescription("business", "TasksFlow, тариф «Бизнес» на 12 месяцев")).toBe("Бизнес");
    expect(planNameFromDescription("team", "TasksFlow, тариф «Стандарт» на 3 месяца")).toBe("Стандарт");
    // Название другого тарифа в описании не подменяет тариф заказа.
    expect(planNameFromDescription("team", "TasksFlow, тариф «Премиум» на 1 месяц")).toBe("Стандарт");
    expect(planNameFromDescription("team", "что-то своё")).toBe("Стандарт");
    expect(planNameFromDescription("team", null)).toBe("Стандарт");
    expect(LEGACY_PLAN_NAMES.team).toBe("Команда");
  });

  it("счёт и УПД по заказу до переименования — с «Командой», по новому — со «Стандартом»", () => {
    const old = order("TasksFlow, тариф «Команда» на 1 месяц");
    expect(buildInvoiceDraft({ order: old, seller, buyer, site: "https://tasksflow.ru" }).lines[0].title).toContain("тариф «Команда»");
    expect(buildClosingDraft({ order: old, seller, buyer, site: "https://tasksflow.ru" }).lines[0].title).toContain("тариф «Команда»");
    const fresh = order(orderDescription("team", 1));
    expect(buildClosingDraft({ order: fresh, seller, buyer, site: "https://tasksflow.ru" }).lines[0].title).toContain("тариф «Стандарт»");
  });
});
