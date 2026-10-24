import { formatRub, isPaidPlan, periodLabel, type BalanceEntry, type BalanceEntryKind } from "@shared/billing";
import { PLANS } from "@shared/plans";
import type { BalanceTransactionRow, PaymentOrderRow } from "@shared/schema";

/**
 * Баланс в баллах (1 балл = 1 ₽): какие проводки делает каждый шаг заказа.
 * Только решения — без базы: MySQL (store.ts) и хранилище в тестах
 * проводят одно и то же.
 *
 *   • пополнение оплачено — +сумма (topup:{id}), заказ «credited»;
 *   • заказ тарифа с баллами создан — −баллы (order_spend:{id}), «held»;
 *     не оплачен или брошен ради нового заказа — +баллы назад
 *     (order_release:{id}), «released»; оплачен — «spent»; оплачен после
 *     возврата баллов — −баллы снова (order_spend_late:{id}), а если их уже
 *     нет — «short»: владельцу разобраться;
 *   • деньги за заказ с баллами вернули — +баллы (order_refund:{id});
 *   • возврат пополнения — −сумма до отправки в кассу («refund_hold»),
 *     касса отменила — +сумма назад; если деньги вернули мимо нас (в
 *     кабинете кассы) — списываем, сколько осталось, недостачу — владельцу.
 *
 * Баланс не уходит в минус: списание проходит, только если хватает.
 */

export type LedgerEntry = {
  companyId: number;
  amountRub: number;
  kind: BalanceEntryKind;
  description: string;
  orderId: number | null;
  actorUserId: number | null;
  /** Ключ повтора: вторая проводка с тем же ключом не проходит. */
  dedupeKey: string | null;
};

export type PointsState = "held" | "spent" | "released" | "short" | "returned" | "credited" | "refund_hold" | "refunded";

const orderTitle = (order: Pick<PaymentOrderRow, "plan" | "months">) =>
  isPaidPlan(order.plan) ? `тариф «${PLANS[order.plan].name}» на ${periodLabel(order.months)}` : "заказ";

export const isTopup = (order: Pick<PaymentOrderRow, "orderKind">) => order.orderKind === "topup";

function entry(order: Pick<PaymentOrderRow, "id" | "companyId">, amountRub: number, kind: BalanceEntryKind, description: string, dedupeKey: string | null): LedgerEntry {
  return { companyId: order.companyId, amountRub, kind, description, orderId: order.id, actorUserId: null, dedupeKey };
}

/** Баллы на заказ тарифа при его создании. */
export function spendEntry(order: Pick<PaymentOrderRow, "id" | "companyId" | "plan" | "months" | "pointsRub">): LedgerEntry {
  return entry(order, -order.pointsRub, "order_spend", `Оплата: ${orderTitle(order)}, заказ №${order.id}`, `order_spend:${order.id}`);
}

/** Заказ не оплачен (истёк, отменён, брошен) — баллы назад. null — возвращать нечего. */
export function releaseEntry(order: PaymentOrderRow): LedgerEntry | null {
  if (order.pointsRub <= 0 || order.pointsState !== "held") return null;
  return entry(order, order.pointsRub, "order_release", `Баллы вернулись: заказ №${order.id} не оплачен`, `order_release:${order.id}`);
}

export type SettleLedger = { entry: LedgerEntry | null; pointsState: PointsState | null; short: boolean };

/**
 * Оплата заказа. balanceRub — остаток под блокировкой строки баланса:
 * нужен, только если баллы заказа уже вернулись (оплата пришла поздно).
 */
export function settleLedger(order: PaymentOrderRow, balanceRub: number): SettleLedger {
  if (isTopup(order)) {
    // Тестовый платёж — без денег: баллы за него остались бы настоящими и
    // после выхода из тестового режима.
    if (order.isTest) return { entry: null, pointsState: null, short: false };
    return {
      entry: entry(order, order.amountRub, "topup", `Пополнение баланса, заказ №${order.id}`, `topup:${order.id}`),
      pointsState: "credited",
      short: false,
    };
  }
  if (order.pointsRub <= 0) return { entry: null, pointsState: null, short: false };
  if (order.pointsState === "held" || order.pointsState === null) return { entry: null, pointsState: "spent", short: false };
  if (order.pointsState === "released") {
    if (balanceRub < order.pointsRub) return { entry: null, pointsState: "short", short: true };
    return {
      entry: entry(order, -order.pointsRub, "order_spend", `Оплата: ${orderTitle(order)}, заказ №${order.id} (оплачен после возврата баллов)`, `order_spend_late:${order.id}`),
      pointsState: "spent",
      short: false,
    };
  }
  return { entry: null, pointsState: order.pointsState as PointsState, short: false };
}

/** Пополнение к возврату: сначала списываем сумму с баланса. null — уже списана или не пополнение. */
export function topupRefundHoldEntry(order: PaymentOrderRow): LedgerEntry | null {
  if (!isTopup(order) || order.pointsState !== "credited") return null;
  return entry(order, -order.amountRub, "topup_refund", `Возврат пополнения №${order.id}`, null);
}

/** Касса возврат не сделала — сумма снова на балансе. */
export function topupRefundBackEntry(order: PaymentOrderRow): LedgerEntry | null {
  if (!isTopup(order) || order.pointsState !== "refund_hold") return null;
  return entry(order, order.amountRub, "topup_refund_back", `Возврат пополнения №${order.id} не состоялся — баллы на месте`, null);
}

export type RefundLedger = { entry: LedgerEntry | null; pointsState: PointsState | null; short: number };

/** Деньги вернулись: баллы заказа — назад; пополнение — списать (если ещё не списано). */
export function refundLedger(order: PaymentOrderRow, balanceRub: number): RefundLedger {
  if (isTopup(order)) {
    if (order.pointsState === "refund_hold") return { entry: null, pointsState: "refunded", short: 0 };
    if (order.pointsState !== "credited") return { entry: null, pointsState: order.pointsState as PointsState | null, short: 0 };
    const take = Math.min(Math.max(0, balanceRub), order.amountRub);
    return {
      entry: take > 0 ? entry(order, -take, "topup_refund", `Возврат пополнения №${order.id}`, `topup_refund:${order.id}`) : null,
      pointsState: "refunded",
      short: order.amountRub - take,
    };
  }
  if (order.pointsRub > 0 && order.pointsState === "spent") {
    return {
      entry: entry(order, order.pointsRub, "order_refund", `Баллы вернулись: оплата заказа №${order.id} возвращена`, `order_refund:${order.id}`),
      pointsState: "returned",
      short: 0,
    };
  }
  return { entry: null, pointsState: order.pointsState as PointsState | null, short: 0 };
}

/** Корректировка root: «Корректировка: причина». */
export function adjustEntry(input: { companyId: number; amountRub: number; reason: string; actorUserId: number }): LedgerEntry {
  return {
    companyId: input.companyId,
    amountRub: input.amountRub,
    kind: "adjust",
    description: `Корректировка: ${input.reason}`.slice(0, 255),
    orderId: null,
    actorUserId: input.actorUserId,
    dedupeKey: null,
  };
}

const KINDS: readonly BalanceEntryKind[] = ["topup", "order_spend", "order_release", "order_refund", "adjust", "topup_refund", "topup_refund_back"];

export function toBalanceEntry(row: BalanceTransactionRow): BalanceEntry {
  return {
    id: row.id,
    amountRub: row.amountRub,
    balanceAfter: row.balanceAfter,
    kind: (KINDS as readonly string[]).includes(row.kind) ? (row.kind as BalanceEntryKind) : "adjust",
    description: row.description,
    orderId: row.orderId,
    createdAt: row.createdAt,
  };
}

/** «+500 ₽» / «−1 990 ₽» — для уведомлений. */
export const signedRub = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatRub(Math.abs(n))}`;
