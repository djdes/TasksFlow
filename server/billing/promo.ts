import { isValidPromoCodeFormat, normalizePromoCode, promoDiscountRub, promoLabel, type PromoKind } from "@shared/billing";
import type { PromoCodeRow } from "@shared/schema";
import type { BillingStore } from "./store";

/**
 * Промокоды: проверка и скидка. Скидка — только от цены выбранного тарифа
 * и срока и только на этот платёж: серия автопродления дальше списывает
 * полную цену (так написано рядом с галочкой и в оферте). Одна компания
 * использует код один раз.
 */
export type PromoApplied = {
  code: string;
  kind: PromoKind;
  value: number;
  label: string;
  /** «Постоянная скидка»: после оплаты закрепится за компанией. */
  lifetime: boolean;
  durationMonths: number | null;
  baseRub: number;
  discountRub: number;
  amountRub: number;
};

export const PROMO_MESSAGES = {
  notFound: "Такого промокода нет",
  inactive: "Промокод отключён",
  notStarted: "Промокод ещё не начал действовать",
  expired: "Срок действия промокода истёк",
  foreign: "Этот промокод выдан другой компании",
  exhausted: "Промокод уже использован максимальное число раз",
  newClientsOnly: "Этот промокод — только для первой оплаты",
  used: "Этот промокод вы уже использовали",
} as const;

/** Причина отказа резерва (store.createOrderWithPromo) — текстом для человека. */
export const RESERVATION_MESSAGES = {
  gone: PROMO_MESSAGES.inactive,
  exhausted: PROMO_MESSAGES.exhausted,
  used: PROMO_MESSAGES.used,
  newClientsOnly: PROMO_MESSAGES.newClientsOnly,
} as const;

/** Сколько ждущий оплаты заказ держит использование кода: человек ещё платит. */
export const PROMO_HOLD_SEC = 60 * 60;

export type PromoContext = { now: number; companyId: number; paidUses: number; hasPaidOrders: boolean; usedByCompany: boolean };

/** Чистое правило: подходит ли код. Порядок проверок — от самой понятной причины. */
export function validatePromo(rule: PromoCodeRow | null, ctx: PromoContext): { ok: true } | { ok: false; message: string } {
  if (!rule) return { ok: false, message: PROMO_MESSAGES.notFound };
  if (!rule.active) return { ok: false, message: PROMO_MESSAGES.inactive };
  if (rule.startsAt && ctx.now < rule.startsAt) return { ok: false, message: PROMO_MESSAGES.notStarted };
  if (rule.endsAt && ctx.now > rule.endsAt) return { ok: false, message: PROMO_MESSAGES.expired };
  if (rule.companyId !== null && rule.companyId !== ctx.companyId) return { ok: false, message: PROMO_MESSAGES.foreign };
  if (rule.maxUses !== null && ctx.paidUses >= rule.maxUses) return { ok: false, message: PROMO_MESSAGES.exhausted };
  if (ctx.usedByCompany) return { ok: false, message: PROMO_MESSAGES.used };
  if (rule.newClientsOnly && ctx.hasPaidOrders) return { ok: false, message: PROMO_MESSAGES.newClientsOnly };
  return { ok: true };
}

/** Проверить код для компании и посчитать сумму к оплате. Сервер — единственное место расчёта. */
export async function applyPromo(
  store: BillingStore,
  input: { code: string; companyId: number; baseRub: number; now: number },
): Promise<{ ok: true; applied: PromoApplied } | { ok: false; message: string }> {
  const code = normalizePromoCode(input.code);
  if (!isValidPromoCodeFormat(code)) return { ok: false, message: PROMO_MESSAGES.notFound };
  const rule = await store.getPromo(code);
  const [paidUses, hasPaidOrders, usedByCompany] = rule
    ? await Promise.all([
        rule.maxUses !== null ? store.promoPaidUses(code) : Promise.resolve(0),
        rule.newClientsOnly ? store.hasPaidOrders(input.companyId) : Promise.resolve(false),
        store.promoPaidByCompany(code, input.companyId),
      ])
    : [0, false, false];
  // Проверка для показа и расчёта; окончательная — атомарно при создании
  // заказа (store.createOrderWithPromo).
  const verdict = validatePromo(rule, { now: input.now, companyId: input.companyId, paidUses, hasPaidOrders, usedByCompany });
  if (!verdict.ok) return verdict;
  const kind = rule!.kind === "fixed" ? "fixed" : "percent";
  const discountRub = promoDiscountRub(kind, rule!.value, input.baseRub);
  return {
    ok: true,
    applied: {
      code,
      kind,
      value: rule!.value,
      label: promoLabel(kind, rule!.value),
      lifetime: rule!.lifetime,
      durationMonths: rule!.lifetime ? rule!.durationMonths : null,
      baseRub: input.baseRub,
      discountRub,
      amountRub: input.baseRub - discountRub,
    },
  };
}
