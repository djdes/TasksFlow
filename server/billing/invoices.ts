import {
  formatRub,
  INVOICE_VALID_DAYS,
  invoiceSchema,
  isPaidPlan,
  orderDescription,
  periodLabel,
  requisitesSchema,
  innLookupSchema,
  topupDescription,
  type CompanyRequisites,
  type InnLookupResult,
  type InvoiceResult,
} from "@shared/billing";
import { PLANS } from "@shared/plans";
import type { PaymentOrderRow, User } from "@shared/schema";
import { logger } from "../logger";
import { lookupInn } from "./dadata";
import { buildInvoiceDraft, formatRuDate, renderInvoicePdf } from "./documents";
import { buyerOf, documentsReady, requisitesOf, sellerOf, siteOf } from "./parties";
import { breakdownFields, placeOrder, quoteOrder, settleOrder, toBillingOrder, type BillingDeps, type Reply } from "./service";

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

/** «Заполнить по ИНН»: реквизиты из DaData. Без ключа — 503, страница кнопку не покажет. */
export async function lookupRequisites(deps: BillingDeps, body: unknown): Promise<Reply<InnLookupResult>> {
  const key = deps.dadata?.() ?? null;
  if (!key) return { status: 503, json: { message: "Автозаполнение не подключено — заполните реквизиты вручную", code: "not_configured" } };
  const parsed = innLookupSchema.safeParse(body);
  if (!parsed.success || !parsed.data.inn) return { status: 400, json: { message: "Введите ИНН" } };
  const result = await lookupInn(key, parsed.data.inn, deps.fetch);
  return { status: 200, json: result };
}

// --- Счёт ---------------------------------------------------------------------------------

/**
 * Проверки перед счётом: реквизиты исполнителя и компании, не бессрочный
 * тариф. null — можно выставлять.
 */
async function invoiceBlocker(deps: BillingDeps, companyId: number, opts: { planOnly: boolean }): Promise<Reply<never> | null> {
  if (!documentsReady(deps)) {
    return { status: 503, json: { message: "Оплата по счёту пока недоступна. Напишите на support@tasksflow.ru — выставим счёт вручную.", code: "not_configured" } };
  }
  if (!(await deps.store.getRequisites(companyId))) return { status: 400, json: { message: "Заполните реквизиты компании — без них счёт не выставить.", code: "requisites" } };
  const company = await deps.getCompany(companyId);
  if (!company) return { status: 404, json: { message: "Компания не найдена" } };
  if (opts.planOnly && isPaidPlan(company.plan) && company.planUntil == null) {
    return { status: 409, json: { message: "Тариф подключён бессрочно — оплачивать его не нужно.", code: "perpetual" } };
  }
  return null;
}

/**
 * Тот же счёт ещё действует — вернём его, а не плодим одинаковые. Иначе —
 * прежние счета того же вида (их отменяем, когда новый уже выставлен:
 * оплатят по старому — root всё равно сможет отметить оплату). Счёт за
 * тариф и счёт на пополнение друг друга не отменяют.
 */
async function openInvoices(
  deps: BillingDeps,
  companyId: number,
  kind: "plan" | "topup",
  same: (open: PaymentOrderRow) => boolean,
  now: number,
): Promise<{ reuse: PaymentOrderRow | null; replace: PaymentOrderRow[] }> {
  const open = (await deps.store.listOpenInvoices(companyId)).filter((o) => (o.orderKind === "topup" ? "topup" : "plan") === kind);
  const reuse = open.find((o) => same(o) && (o.invoiceDueAt ?? 0) > now) ?? null;
  return { reuse, replace: reuse ? [] : open };
}

async function cancelReplaced(deps: BillingDeps, replaced: PaymentOrderRow[]): Promise<void> {
  for (const old of replaced) await deps.store.cancelInvoice(old.id);
}

const invoiceReply = (order: PaymentOrderRow, existing: boolean): Reply<InvoiceResult> => ({
  status: 200,
  json: { order: toBillingOrder(order, { docs: true }), existing, pdfUrl: `/api/billing/orders/${order.id}/invoice.pdf` },
});

export async function createInvoice(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id" | "email">; body: unknown },
): Promise<Reply<InvoiceResult>> {
  const parsed = invoiceSchema.safeParse(ctx.body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте данные" } };
  const blocked = await invoiceBlocker(deps, ctx.companyId, { planOnly: true });
  if (blocked) return blocked;
  const input = parsed.data;
  const now = nowOf(deps);
  // Баллы по счёту не списываются: счёт оплачивают деньгами целиком.
  const quote = await quoteOrder(deps, { companyId: ctx.companyId, ...input, usePoints: false, now });
  if (!quote.ok) return quote.reply;
  const b = quote.breakdown;
  if (b.amountRub === 0) {
    return { status: 400, json: { message: "Скидка закрывает всю сумму — счёт не нужен. Нажмите «Перейти к оплате», тариф включится сразу.", code: "free" } };
  }
  const fields = breakdownFields(b);
  const { reuse, replace } = await openInvoices(
    deps,
    ctx.companyId,
    "plan",
    (o) => o.plan === input.plan && o.months === input.months && o.amountRub === b.amountRub && o.promoCode === fields.promoCode,
    now,
  );
  if (reuse) return invoiceReply(reuse, true);

  const requisites = requisitesOf((await deps.store.getRequisites(ctx.companyId))!);
  const company = (await deps.getCompany(ctx.companyId))!;
  const placed = await placeOrder(deps, {
    companyId: ctx.companyId,
    userId: ctx.user.id,
    email: requisites.email ?? ctx.user.email ?? null,
    plan: input.plan,
    months: input.months,
    amountRub: b.amountRub,
    description: `${orderDescription(input.plan, input.months)}, по счёту`,
    isTest: false,
    recurringConsent: false,
    recurringChargeOf: null,
    createdAt: now,
    paymentMethod: "invoice",
    invoiceDueAt: now + INVOICE_VALID_DAYS * DAY,
    ...fields,
  }, quote.promo, now);
  if (!placed.ok) return placed.reply;
  const order = placed.order;
  await cancelReplaced(deps, replace);
  logger.info({ orderId: order.id, companyId: ctx.companyId, amountRub: b.amountRub, discount: b.discount, promotion: b.promotion?.id ?? null }, "[billing] выставлен счёт");
  notifyOwnerInvoice(deps, order, company, requisites.inn, `«${PLANS[input.plan].name}» на ${periodLabel(input.months)}${fields.promoCode ? `, ${b.discount?.source === "lifetime" ? "постоянная скидка" : "промокод"} ${fields.promoCode}` : ""}`);
  return invoiceReply(order, false);
}

/** Счёт на пополнение баланса: те же реквизиты и путь отметки оплаты. */
export async function createTopupInvoice(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id" | "email">; amountRub: number },
): Promise<Reply<InvoiceResult>> {
  const blocked = await invoiceBlocker(deps, ctx.companyId, { planOnly: false });
  if (blocked) return blocked;
  const now = nowOf(deps);
  const { reuse, replace } = await openInvoices(deps, ctx.companyId, "topup", (o) => o.amountRub === ctx.amountRub, now);
  if (reuse) return invoiceReply(reuse, true);
  const requisites = requisitesOf((await deps.store.getRequisites(ctx.companyId))!);
  const company = (await deps.getCompany(ctx.companyId))!;
  const placed = await placeOrder(deps, {
    companyId: ctx.companyId,
    userId: ctx.user.id,
    email: requisites.email ?? ctx.user.email ?? null,
    plan: "topup",
    months: 0,
    amountRub: ctx.amountRub,
    description: `${topupDescription(ctx.amountRub)}, по счёту`,
    isTest: false,
    recurringConsent: false,
    recurringChargeOf: null,
    createdAt: now,
    paymentMethod: "invoice",
    invoiceDueAt: now + INVOICE_VALID_DAYS * DAY,
    orderKind: "topup",
  }, null, now);
  if (!placed.ok) return placed.reply;
  await cancelReplaced(deps, replace);
  logger.info({ orderId: placed.order.id, companyId: ctx.companyId, amountRub: ctx.amountRub }, "[billing] выставлен счёт на пополнение");
  notifyOwnerInvoice(deps, placed.order, company, requisites.inn, "пополнение баланса");
  return invoiceReply(placed.order, false);
}

function notifyOwnerInvoice(deps: BillingDeps, order: PaymentOrderRow, company: { id: number; name: string }, inn: string, what: string): void {
  void deps.notify
    .owner(
      `🧾 Счёт №${order.id} — «${company.name}» (#${company.id}, ИНН ${inn}), ${what}, ${formatRub(order.amountRub)}. ` +
        `Оплатить до ${formatRuDate(order.invoiceDueAt!)}. Когда деньги придут: root → «Компании» → «Платежи» → «Отметить оплату».`,
    )
    .catch((err) => logger.warn({ err, orderId: order.id }, "[billing] владелец не узнал о счёте"));
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
