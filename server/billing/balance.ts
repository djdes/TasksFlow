import { balanceAdjustSchema, formatRub, topupDescription, topupSchema, type BalanceEntry, type RootBalance, type TopupResult } from "@shared/billing";
import type { User } from "@shared/schema";
import { logger } from "../logger";
import { createTopupInvoice } from "./invoices";
import { adjustEntry, signedRub, toBalanceEntry } from "./ledger";
import { buildPaymentParams, buildPaymentUrl, isConfigured } from "./robokassa";
import { placeOrder, type BillingDeps, type Reply } from "./service";

/**
 * Баланс компании в баллах (1 балл = 1 ₽): пополнение картой через кассу
 * или по счёту, корректировки root. Списание баллов за тариф — в заказе
 * (service.ts, placeOrder), проводки — server/billing/ledger.ts.
 */
const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export async function createTopup(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id" | "email">; body: unknown },
): Promise<Reply<TopupResult>> {
  const parsed = topupSchema.safeParse(ctx.body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте сумму" } };
  const { amountRub, method, email } = parsed.data;
  if (method === "invoice") {
    const reply = await createTopupInvoice(deps, { companyId: ctx.companyId, user: ctx.user, amountRub });
    return reply.status === 200 && "order" in reply.json ? { status: 200, json: { ...reply.json, method: "invoice" } } : (reply as Reply<never>);
  }
  const cfg = deps.config();
  if (!isConfigured(cfg)) {
    return { status: 503, json: { message: "Онлайн-оплата пока не подключена — пополнить можно по счёту.", code: "not_configured" } };
  }
  const company = await deps.getCompany(ctx.companyId);
  if (!company) return { status: 404, json: { message: "Компания не найдена" } };
  const now = nowOf(deps);
  const placed = await placeOrder(
    deps,
    {
      companyId: ctx.companyId,
      userId: ctx.user.id,
      email: email ?? ctx.user.email ?? null,
      plan: "topup",
      months: 0,
      amountRub,
      description: topupDescription(amountRub),
      isTest: cfg.isTest,
      recurringConsent: false,
      recurringChargeOf: null,
      createdAt: now,
      orderKind: "topup",
    },
    null,
    now,
  );
  if (!placed.ok) return placed.reply;
  const order = placed.order;
  // Пополнение — аванс: в чеке признак «аванс», не «полный расчёт».
  const params = buildPaymentParams(cfg, { id: order.id, amountRub, description: order.description, email: order.email, isTest: order.isTest, recurring: false, advance: true });
  logger.info({ orderId: order.id, companyId: ctx.companyId, amountRub, isTest: order.isTest }, "[billing] пополнение баланса: заказ создан");
  return { status: 200, json: { method: "card", invId: order.id, amountRub, params, paymentUrl: buildPaymentUrl(params) } };
}

// --- Root ---------------------------------------------------------------------------------

export async function listRootBalances(deps: BillingDeps): Promise<RootBalance[]> {
  return deps.store.listBalances(200);
}

export async function rootCompanyBalance(
  deps: BillingDeps,
  companyId: number,
): Promise<Reply<{ companyId: number; companyName: string; balanceRub: number; heldRub: number; history: BalanceEntry[] }>> {
  const company = await deps.getCompany(companyId);
  if (!company) return { status: 404, json: { message: "Компании с таким номером нет" } };
  // balanceRub — свободные баллы; heldRub — занятые брошенной оплатой картой
  // (компания видит их суммой: новый заказ их освободит).
  const [balanceRub, heldRub, rows] = await Promise.all([
    deps.store.getBalance(companyId),
    deps.store.getPointsHeld(companyId),
    deps.store.listBalanceEntries(companyId, 100),
  ]);
  return { status: 200, json: { companyId, companyName: company.name, balanceRub, heldRub, history: rows.map(toBalanceEntry) } };
}

/** Корректировка: начислить (бонус, компенсация) или списать. В минус баланс не уходит. */
export async function adjustBalance(deps: BillingDeps, companyId: number, body: unknown, by: { userId: number }): Promise<Reply<{ balanceRub: number; message: string }>> {
  const parsed = balanceAdjustSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте сумму и причину" } };
  const company = await deps.getCompany(companyId);
  if (!company) return { status: 404, json: { message: "Компании с таким номером нет" } };
  const { amountRub, reason } = parsed.data;
  const posted = await deps.store.postLedger(adjustEntry({ companyId, amountRub, reason, actorUserId: by.userId }), nowOf(deps));
  if (!posted.ok) {
    const balance = await deps.store.getBalance(companyId);
    return { status: 409, json: { message: `Нельзя списать больше свободных баллов (${formatRub(balance)})` } };
  }
  logger.info({ companyId, amountRub, by: by.userId }, "[billing] корректировка баланса");
  deps.notify.live(companyId);
  void deps.notify
    .admins(companyId, {
      title: amountRub > 0 ? "Баллы начислены" : "Баллы списаны",
      body: `${signedRub(amountRub)} · на балансе ${formatRub(posted.balanceRub)}`,
      paragraphs: [`Баланс изменён на ${signedRub(amountRub)}: ${reason}.`, `Сейчас на балансе ${formatRub(posted.balanceRub)} баллами (1 балл = 1 ₽).`],
    })
    .catch((err) => logger.warn({ err, companyId }, "[billing] уведомление о корректировке не ушло"));
  return { status: 200, json: { balanceRub: posted.balanceRub, message: `Готово: ${signedRub(amountRub)}, на балансе ${formatRub(posted.balanceRub)}` } };
}
