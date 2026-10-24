import {
  formatRub,
  INVOICE_VALID_DAYS,
  invoiceSchema,
  isPaidPlan,
  orderDescription,
  periodLabel,
  requisitesSchema,
  type CompanyRequisites,
  type InvoiceResult,
} from "@shared/billing";
import { PLANS } from "@shared/plans";
import type { PaymentOrderRow, User } from "@shared/schema";
import { logger } from "../logger";
import { buildInvoiceDraft, formatRuDate, renderInvoicePdf } from "./documents";
import { buyerOf, documentsReady, requisitesOf, sellerOf, siteOf } from "./parties";
import { placeOrder, quoteOrder, settleOrder, toBillingOrder, type BillingDeps, type Reply } from "./service";

export { closingPdf, ensureClosingDocument } from "./closing";

/**
 * Оплата по счёту (юрлица и ИП) и закрывающие документы.
 *
 *  • Реквизиты компании — в «Тариф и оплата», с проверкой ИНН и ОГРН.
 *  • Счёт: заказ payment_method=invoice без кассы. Один действующий счёт
 *    на те же условия — повторный запрос вернёт его, новый тариф или срок
 *    отменит прежний. Оплату по выписке банка отмечает root — тот же путь,
 *    что у уведомления кассы (settle): тариф, письмо, УПД.
 *  • УПД — server/billing/closing.ts.
 */
const DAY = 24 * 60 * 60;
const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

// --- Реквизиты компании -------------------------------------------------------------

export async function saveCompanyRequisites(deps: BillingDeps, ctx: { companyId: number; body: unknown }): Promise<Reply<{ requisites: CompanyRequisites }>> {
  const parsed = requisitesSchema.safeParse(ctx.body);
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    return { status: 400, json: { message: issue?.message ?? "Проверьте реквизиты", code: String(issue?.path?.[0] ?? "") } };
  }
  await deps.store.saveRequisites(ctx.companyId, parsed.data, nowOf(deps));
  logger.info({ companyId: ctx.companyId, inn: parsed.data.inn }, "[billing] реквизиты компании сохранены");
  return { status: 200, json: { requisites: parsed.data } };
}

// --- Счёт ---------------------------------------------------------------------------------

export async function createInvoice(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id" | "email">; body: unknown },
): Promise<Reply<InvoiceResult>> {
  if (!documentsReady(deps)) {
    return { status: 503, json: { message: "Оплата по счёту пока недоступна. Напишите на support@tasksflow.ru — выставим счёт вручную.", code: "not_configured" } };
  }
  const parsed = invoiceSchema.safeParse(ctx.body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте данные" } };
  const input = parsed.data;
  const requisitesRow = await deps.store.getRequisites(ctx.companyId);
  if (!requisitesRow) return { status: 400, json: { message: "Заполните реквизиты компании — без них счёт не выставить.", code: "requisites" } };
  const company = await deps.getCompany(ctx.companyId);
  if (!company) return { status: 404, json: { message: "Компания не найдена" } };
  if (isPaidPlan(company.plan) && company.planUntil == null) {
    return { status: 409, json: { message: "Тариф подключён бессрочно — оплачивать его не нужно.", code: "perpetual" } };
  }
  const now = nowOf(deps);
  const quote = await quoteOrder(deps, { companyId: ctx.companyId, ...input, now });
  if (!quote.ok) return quote.reply;
  if (quote.amountRub === 0) {
    return { status: 400, json: { message: "Промокод закрывает всю сумму — счёт не нужен. Нажмите «Перейти к оплате», тариф включится сразу.", code: "free" } };
  }

  // Тот же счёт ещё действует — возвращаем его, а не плодим одинаковые.
  // Другие условия — прежний счёт отменяем: оплатят по старому — root всё
  // равно сможет отметить оплату.
  const promoCode = quote.promo?.code ?? null;
  for (const open of await deps.store.listOpenInvoices(ctx.companyId)) {
    const same = open.plan === input.plan && open.months === input.months && open.amountRub === quote.amountRub && open.promoCode === promoCode;
    if (same && (open.invoiceDueAt ?? 0) > now) {
      return { status: 200, json: { order: toBillingOrder(open, { docs: true }), existing: true, pdfUrl: `/api/billing/orders/${open.id}/invoice.pdf` } };
    }
    await deps.store.cancelInvoice(open.id);
  }

  const requisites = requisitesOf(requisitesRow);
  const placed = await placeOrder(deps, {
    companyId: ctx.companyId,
    userId: ctx.user.id,
    email: requisites.email ?? ctx.user.email ?? null,
    plan: input.plan,
    months: input.months,
    amountRub: quote.amountRub,
    description: `${orderDescription(input.plan, input.months)}, по счёту`,
    isTest: false,
    recurringConsent: false,
    recurringChargeOf: null,
    createdAt: now,
    paymentMethod: "invoice",
    invoiceDueAt: now + INVOICE_VALID_DAYS * DAY,
    ...(quote.promo ? { baseRub: quote.baseRub, discountRub: quote.promo.discountRub, promoCode } : {}),
  }, quote.promo, now);
  if (!placed.ok) return placed.reply;
  const order = placed.order;
  logger.info({ orderId: order.id, companyId: ctx.companyId, amountRub: quote.amountRub, promo: promoCode }, "[billing] выставлен счёт");
  void deps.notify
    .owner(
      `🧾 Счёт №${order.id} — «${company.name}» (#${company.id}, ИНН ${requisites.inn}), «${PLANS[input.plan].name}» на ${periodLabel(input.months)}, ` +
        `${formatRub(quote.amountRub)}${promoCode ? `, промокод ${promoCode}` : ""}. Оплатить до ${formatRuDate(order.invoiceDueAt!)}. ` +
        "Когда деньги придут: root → «Компании» → «Платежи» → «Отметить оплату».",
    )
    .catch((err) => logger.warn({ err, orderId: order.id }, "[billing] владелец не узнал о счёте"));
  return { status: 200, json: { order: toBillingOrder(order, { docs: true }), existing: false, pdfUrl: `/api/billing/orders/${order.id}/invoice.pdf` } };
}

/** Root: деньги по счёту пришли — тот же путь, что у уведомления кассы. */
export async function markInvoicePaid(deps: BillingDeps, orderId: number, by: { userId: number }): Promise<Reply<{ message: string }>> {
  const order = await deps.store.getOrder(orderId);
  if (!order || order.paymentMethod !== "invoice") return { status: 404, json: { message: "Счёт не найден" } };
  if (order.status === "paid" || order.status === "refunded") return { status: 409, json: { message: "Счёт уже оплачен" } };
  const settled = await settleOrder(deps, order.id, JSON.stringify({ source: "invoice", markedBy: by.userId }), "invoice");
  if (!settled) return { status: 409, json: { message: "Счёт уже оплачен" } };
  logger.info({ orderId, by: by.userId }, "[billing] оплата по счёту отмечена");
  return { status: 200, json: { message: "Оплата отмечена: тариф продлён, админы получили уведомление." } };
}

export async function cancelInvoiceOrder(deps: BillingDeps, orderId: number): Promise<Reply<{ message: string }>> {
  const order = await deps.store.getOrder(orderId);
  if (!order || order.paymentMethod !== "invoice") return { status: 404, json: { message: "Счёт не найден" } };
  if (!(await deps.store.cancelInvoice(order.id))) return { status: 409, json: { message: "Отменить можно только неоплаченный счёт" } };
  deps.notify.live(order.companyId);
  return { status: 200, json: { message: "Счёт отменён" } };
}

/** PDF счёта: по текущим реквизитам сторон (счёт — не закрывающий документ). */
export async function invoicePdf(deps: BillingDeps, order: PaymentOrderRow): Promise<Buffer | null> {
  if (order.paymentMethod !== "invoice" || !documentsReady(deps)) return null;
  const draft = buildInvoiceDraft({ order, seller: sellerOf(deps), buyer: await buyerOf(deps, order.companyId), site: siteOf(deps) });
  return renderInvoicePdf(draft);
}
