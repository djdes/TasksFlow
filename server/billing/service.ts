/**
 * Оплата тарифов: заказ, подтверждение оплаты (ResultURL), автопродление.
 *
 *  • Сумма считается только здесь, по ценам из БД: с клиента приходят
 *    тариф, срок и галочка автосписаний. Сумма клиента — лишь сверка.
 *  • Оплата подтверждается только уведомлением Робокассы на ResultURL с
 *    подписью Пароля #2 и суммой, совпадающей с заказом. Переход
 *    pending → paid атомарный, повтор уведомления — просто «OK».
 *  • Автопродление: первый платёж с галочкой запоминает карту (серия);
 *    за 3 дня до конца срока — предупреждение, в последний день —
 *    списание, неудача — ещё две попытки раз в сутки, потом автопродление
 *    выключается и админы получают письмо.
 *  • Сверка: зависший «ожидает оплаты» спрашиваем у кассы (OpStateExt) —
 *    потерянное уведомление не оставит человека без оплаченного тарифа.
 *  • Возврат — через API кассы (Пароль #3): тариф и срок откатываются,
 *    если после этой оплаты их никто не менял.
 *  • Без автопродления — напоминание за 3 дня до конца тарифа и в день,
 *    когда он закончился.
 *
 * Всё внешнее (БД, касса, уведомления, время) приходит в deps — тесты
 * подставляют своё.
 */
import { effectivePlan, PLANS } from "@shared/plans";
import {
  addMonths,
  chargeAt,
  checkoutSchema,
  daysLabel,
  formatRub,
  isPaidPlan,
  OFFER_REVISION,
  orderDescription,
  periodLabel,
  planAfterPayment,
  priceFor,
  recurringAction,
  recurringStatement,
  RECURRING_MAX_ATTEMPTS,
  RECURRING_NOTICE_DAYS,
  PAYMENT_METHODS,
  pickPromotion,
  priceBreakdown,
  promoLabel,
  promotionDiscountRub,
  type BillingCheckResult,
  type DiscountRule,
  type DiscountSource,
  type LifetimeDiscount,
  type PriceBreakdown,
  type PromoKind,
  normalizePromoCode,
  type BillingDiagnostics,
  type CompanyRequisites,
  type PaidPlanId,
  type PaymentMethod,
  type PromoQuote,
  type BillingInfo,
  type BillingOrder,
  type CheckoutResult,
  type OrderStatus,
  type PlanPrice,
  type ReconcileResult,
  type ReconcileStatus,
  type RefundResult,
  type RefundStatus,
  type RootBillingOrder,
} from "@shared/billing";
import type { Company, CompanyDiscountRow, PaymentOrderRow, User } from "@shared/schema";
import { logger } from "../logger";
import {
  buildPaymentParams,
  buildPaymentUrl,
  chargeRecurring,
  createRefund,
  formatOutSum,
  isConfigured,
  OP_RESULT,
  OP_STATE,
  opState,
  refundState,
  verifyResultSignature,
  type OpState,
  type RobokassaConfig,
} from "./robokassa";
import { issueClosingDocument } from "./closing";
import { sellerMissing, type SellerRequisites } from "./legal";
import { documentsReady, requisitesOf, sellerOf } from "./parties";
import { isTopup, signedRub, toBalanceEntry } from "./ledger";
import { applyPromo, PROMO_HOLD_SEC, RESERVATION_MESSAGES, type PromoApplied } from "./promo";
import type { BillingStore, DueRecurring, ExpiringPlan, NewOrder, SettleContext, SettlePatch } from "./store";

export const DAY = 24 * 60 * 60;
/** Неоплаченный заказ через столько секунд помечается «не оплачен». */
export const PENDING_TTL_SEC = 3 * DAY;

/** Уведомление админам компании: push, Telegram и письмо. */
export type BillingNotice = {
  title: string;
  body: string;
  /** Абзацы письма. */
  paragraphs: string[];
};

export interface BillingNotifier {
  /** Админам компании (и на почту плательщика, если она другая). */
  admins(companyId: number, notice: BillingNotice, extraEmails?: Array<string | null>): Promise<void>;
  /** Владельцу сервиса в Telegram. */
  owner(text: string): Promise<void>;
  /** Открытые кабинеты компании перечитают тариф. */
  live(companyId: number): void;
}

export type BillingDeps = {
  store: BillingStore;
  config: () => RobokassaConfig;
  notify: BillingNotifier;
  getCompany: (id: number) => Promise<Pick<Company, "id" | "name" | "plan" | "planUntil"> | undefined>;
  countUsers: (companyId: number) => Promise<number>;
  fetch?: typeof fetch;
  now?: () => number;
  /** Адрес сайта для ResultURL/SuccessURL в диагностике и в документах. */
  baseUrl?: () => string;
  /** Реквизиты Исполнителя для счетов и УПД; по умолчанию — из env LEGAL_*. */
  seller?: () => SellerRequisites;
  /** Ключ DaData для «Заполнить по ИНН»; null — кнопки нет. */
  dadata?: () => string | null;
};

export { documentsReady, requisitesOf, sellerOf } from "./parties";

const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export function formatDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" });
}

const planName = (id: string) => (isPaidPlan(id) ? PLANS[id].name : id);

/** «тариф «Команда» на 1 месяц» или «пополнение баланса» — для писем. */
const orderWhat = (order: Pick<PaymentOrderRow, "orderKind" | "plan" | "months">) =>
  isTopup(order) ? "пополнение баланса" : `тариф «${planName(order.plan)}» на ${periodLabel(order.months)}`;

type LifetimeRule = DiscountRule & { row: CompanyDiscountRow };

/** Действующие постоянные скидки компании (не сняты и не истекли). */
export function activeLifetimes(rows: readonly CompanyDiscountRow[], now: number): LifetimeRule[] {
  return rows
    .filter((row) => row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now))
    .map((row) => ({ code: row.code, kind: row.kind === "fixed" ? "fixed" : "percent", value: row.value, row }));
}

export function toLifetimeDiscount(rule: LifetimeRule): LifetimeDiscount {
  return { code: rule.code, kind: rule.kind, value: rule.value, label: promoLabel(rule.kind, rule.value), boundAt: rule.row.boundAt, expiresAt: rule.row.expiresAt };
}

/** Действующая акция: из включённых — по pickPromotion. */
export async function currentPromotion(deps: BillingDeps, now: number) {
  return pickPromotion(await deps.store.activePromotions(), now);
}

const ORDER_STATUSES: readonly OrderStatus[] = ["pending", "paid", "expired", "refunded", "cancelled"];
const REFUND_STATUSES: readonly RefundStatus[] = ["sending", "pending", "uncertain", "finished", "canceled"];

/**
 * docs — реквизиты Исполнителя заполнены: тогда у счёта есть PDF, а у
 * оплаченного боевого заказа — УПД.
 */
export function toBillingOrder(row: PaymentOrderRow, opts: { docs?: boolean } = {}): BillingOrder {
  const status: OrderStatus = (ORDER_STATUSES as readonly string[]).includes(row.status) ? (row.status as OrderStatus) : "pending";
  const refundStatus = (REFUND_STATUSES as readonly string[]).includes(row.refundStatus ?? "") ? (row.refundStatus as RefundStatus) : null;
  const method: PaymentMethod = (PAYMENT_METHODS as readonly string[]).includes(row.paymentMethod) ? (row.paymentMethod as PaymentMethod) : "card";
  const docs = opts.docs === true;
  return {
    id: row.id,
    kind: isTopup(row) ? "topup" : "plan",
    plan: isPaidPlan(row.plan) ? row.plan : "team",
    months: row.months,
    amountRub: row.amountRub,
    description: row.description,
    status,
    isTest: row.isTest,
    automatic: row.recurringChargeOf !== null,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    planUntil: row.planUntilAfter,
    refundStatus,
    method,
    promoCode: row.promoCode,
    discountRub: row.discountRub,
    discountSource: row.discountSource === "lifetime" ? "lifetime" : row.promoCode ? "code" : null,
    promotionDiscountRub: row.promotionDiscountRub,
    pointsRub: row.pointsRub,
    invoiceDueAt: row.invoiceDueAt,
    hasInvoice: docs && method === "invoice",
    hasUpd: docs && status === "paid" && !row.isTest && row.amountRub > 0,
  };
}

// --- Страница «Тариф и оплата» -------------------------------------------------

export async function billingInfo(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "email"> },
): Promise<BillingInfo | null> {
  const company = await deps.getCompany(ctx.companyId);
  if (!company) return null;
  const cfg = deps.config();
  const now = nowOf(deps);
  const [prices, billing, orders, usersCount, requisites, promotion, discounts, history, heldRub] = await Promise.all([
    deps.store.getPrices(),
    deps.store.getCompanyBilling(ctx.companyId),
    deps.store.listOrders(ctx.companyId, 20),
    deps.countUsers(ctx.companyId),
    deps.store.getRequisites(ctx.companyId),
    currentPromotion(deps, now),
    deps.store.getCompanyDiscounts(ctx.companyId),
    deps.store.listBalanceEntries(ctx.companyId, 20),
    deps.store.getPointsHeld(ctx.companyId),
  ]);
  const docs = documentsReady(deps);
  const plan = effectivePlan(company.plan, company.planUntil, now);
  const active = Boolean(billing?.recurringActive);
  return {
    configured: isConfigured(cfg),
    testMode: cfg.isTest,
    recurringAvailable: cfg.recurring,
    plan: {
      id: plan.id,
      until: plan.id === "start" ? null : company.planUntil ?? null,
      perpetual: plan.id !== "start" && company.planUntil == null,
      usersCount,
    },
    prices,
    recurring: {
      active,
      plan: active && billing && isPaidPlan(billing.recurringPlan) ? billing.recurringPlan : null,
      months: active ? billing?.recurringMonths ?? null : null,
      amountRub: active ? billing?.recurringAmountRub ?? null : null,
      nextChargeAt: active && company.planUntil ? chargeAt(company.planUntil) : null,
    },
    orders: orders.map((o) => toBillingOrder(o, { docs })),
    email: ctx.user.email ?? null,
    now,
    requisites: requisites ? requisitesOf(requisites) : null,
    invoiceAvailable: docs,
    promotion,
    lifetimeDiscounts: activeLifetimes(discounts, now).map(toLifetimeDiscount),
    balance: { amountRub: (billing?.balanceRub ?? 0) + heldRub, heldRub, history: history.map(toBalanceEntry) },
    innLookup: !!deps.dadata?.(),
  };
}

/** Правило введённого кода — для страницы (POST /api/billing/promo). */
export type CodeRule = { code: string; kind: PromoKind; value: number; lifetime: boolean; durationMonths: number | null };

export type Quote = {
  ok: true;
  breakdown: PriceBreakdown;
  /** Введённый код — если скидка по нему (а не постоянная). */
  promo: PromoApplied | null;
  /** Правило введённого кода; если код — уже действующая постоянная скидка, её снимок. */
  codeRule: CodeRule | null;
};

/**
 * Сумма заказа тарифа: цена → акция → промокод или постоянная скидка →
 * баллы (priceBreakdown — та же функция, что на странице). Ошибка — готовый
 * ответ: нет цены, код не подошёл или сумма на странице устарела.
 */
export async function quoteOrder(
  deps: BillingDeps,
  input: { companyId: number; plan: PaidPlanId; months: number; promoCode?: string; expectedRub?: number; usePoints?: boolean; now: number },
): Promise<Quote | { ok: false; reply: Reply<never> }> {
  const [prices, promotion, discounts, balance] = await Promise.all([
    deps.store.getPrices(),
    currentPromotion(deps, input.now),
    deps.store.getCompanyDiscounts(input.companyId),
    // Баллы брошенных заказов тоже доступны: новый заказ их освобождает.
    input.usePoints
      ? Promise.all([deps.store.getBalance(input.companyId), deps.store.getPointsHeld(input.companyId)]).then(([b, h]) => b + h)
      : Promise.resolve(0),
  ]);
  const listRub = priceFor(prices, input.plan, input.months);
  if (listRub === null) return { ok: false, reply: { status: 400, json: { message: "Этот тариф сейчас нельзя оплатить онлайн — напишите нам, подключим." } } };
  const lifetimes = activeLifetimes(discounts, input.now);
  let promo: PromoApplied | null = null;
  let codeRule: CodeRule | null = null;
  if (input.promoCode) {
    const own = lifetimes.find((l) => l.code === normalizePromoCode(input.promoCode!));
    if (own) {
      // Код уже работает постоянной скидкой — проверять его как новый не нужно.
      codeRule = { code: own.code, kind: own.kind, value: own.value, lifetime: true, durationMonths: null };
    } else {
      const base = listRub - (promotion ? promotionDiscountRub(listRub, promotion.percent) : 0);
      const applied = await applyPromo(deps.store, { code: input.promoCode, companyId: input.companyId, baseRub: base, now: input.now });
      if (!applied.ok) return { ok: false, reply: { status: 400, json: { message: applied.message, code: "promo" } } };
      promo = applied.applied;
      codeRule = { code: promo.code, kind: promo.kind, value: promo.value, lifetime: promo.lifetime, durationMonths: promo.durationMonths };
    }
  }
  const breakdown = priceBreakdown({ listRub, promotion, code: codeRule, lifetimes, pointsAvailable: balance });
  if (breakdown.discount?.source !== "code") promo = null;
  if (input.expectedRub !== undefined && input.expectedRub !== breakdown.amountRub) {
    return {
      ok: false,
      reply: { status: 409, json: { message: "Сумма изменилась — проверьте её и нажмите ещё раз.", code: "price_changed", priceRub: breakdown.amountRub } },
    };
  }
  return { ok: true, breakdown, promo, codeRule };
}

/** Поля заказа по расчёту: цена, акция, скидка, баллы. */
export function breakdownFields(b: PriceBreakdown): Pick<
  NewOrder,
  "baseRub" | "promotionId" | "promotionPercent" | "promotionDiscountRub" | "discountRub" | "discountSource" | "promoCode" | "pointsRub"
> {
  return {
    baseRub: b.listRub,
    promotionId: b.promotion?.id ?? null,
    promotionPercent: b.promotion?.percent ?? null,
    promotionDiscountRub: b.promotion?.discountRub ?? 0,
    discountRub: b.discount?.discountRub ?? 0,
    discountSource: (b.discount?.source ?? null) satisfies DiscountSource | null,
    promoCode: b.discount?.code ?? null,
    pointsRub: b.pointsRub,
  };
}

/**
 * Создать заказ из кабинета: резерв промокода (лимит, «один раз на
 * компанию», «только первая оплата» под блокировкой кода) и баллы — в одной
 * транзакции с заказом.
 */
export async function placeOrder(
  deps: BillingDeps,
  order: NewOrder,
  promo: PromoApplied | null,
  now: number,
): Promise<{ ok: true; order: PaymentOrderRow } | { ok: false; reply: Reply<never> }> {
  const reservation = promo ? { code: promo.code, companyId: order.companyId, free: order.amountRub === 0, reservedSince: now - PROMO_HOLD_SEC } : null;
  const placed = await deps.store.placeOrder(order, reservation);
  if (placed.ok) return placed;
  if (placed.reason === "balance") {
    return { ok: false, reply: { status: 409, json: { message: "Баллов на балансе стало меньше — проверьте сумму и нажмите ещё раз.", code: "price_changed" } } };
  }
  return { ok: false, reply: { status: 400, json: { message: RESERVATION_MESSAGES[placed.reason], code: "promo" } } };
}

/** POST /api/billing/promo: что даст код на выбранный тариф и срок. */
export async function quotePromo(deps: BillingDeps, ctx: { companyId: number; body: unknown }): Promise<PromoQuote> {
  const parsed = checkoutSchema.pick({ plan: true, months: true, promoCode: true }).safeParse(ctx.body);
  if (!parsed.success || !parsed.data.promoCode) return { ok: false, message: "Введите промокод" };
  const quote = await quoteOrder(deps, { companyId: ctx.companyId, ...parsed.data, now: nowOf(deps) });
  if (!quote.ok) return { ok: false, message: (quote.reply.json as { message: string }).message };
  // Правило кода отдаём, даже если выгоднее постоянная скидка: страница
  // посчитает сумму сама (priceBreakdown) и покажет, что применена постоянная.
  const rule = quote.codeRule!;
  return { ok: true, ...rule, label: promoLabel(rule.kind, rule.value) };
}

// --- Заказ ---------------------------------------------------------------------

export type Reply<T> = { status: number; json: T | { message: string; code?: string; priceRub?: number } };

export async function createCheckout(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id" | "email">; body: unknown; ip: string | null; userAgent: string | null },
): Promise<Reply<CheckoutResult>> {
  const parsed = checkoutSchema.safeParse(ctx.body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте данные" } };
  const input = parsed.data;
  const cfg = deps.config();
  const now = nowOf(deps);
  // В тестовом режиме кассы баллы не списываются: настоящие баллы ушли бы
  // за тестовую оплату без денег.
  const quote = await quoteOrder(deps, { companyId: ctx.companyId, ...input, usePoints: input.usePoints && !cfg.isTest, now });
  if (!quote.ok) return quote.reply;
  const b = quote.breakdown;
  // Промокод или баллы на всю сумму работают и без кассы: денег нет, касса не нужна.
  if (b.amountRub > 0 && !isConfigured(cfg)) {
    return {
      status: 503,
      json: { message: "Онлайн-оплата пока не подключена. Напишите на support@tasksflow.ru — подключим тариф по счёту.", code: "not_configured" },
    };
  }
  const company = await deps.getCompany(ctx.companyId);
  if (!company) return { status: 404, json: { message: "Компания не найдена" } };
  if (isPaidPlan(company.plan) && company.planUntil == null) {
    return { status: 409, json: { message: "Тариф подключён бессрочно — оплачивать его не нужно. Сменить тариф поможет поддержка.", code: "perpetual" } };
  }

  const base = {
    companyId: ctx.companyId,
    userId: ctx.user.id,
    email: input.email ?? ctx.user.email ?? null,
    plan: input.plan,
    months: input.months,
    amountRub: b.amountRub,
    description: orderDescription(input.plan, input.months),
    recurringChargeOf: null,
    createdAt: now,
    ...breakdownFields(b),
  };
  if (b.amountRub === 0) {
    // Скидка или баллы на всю сумму: тариф включается сразу, автопродления
    // нет — карту никто не вводил.
    const method = b.pointsRub > 0 ? "balance" : "promo";
    const placed = await placeOrder(deps, { ...base, isTest: false, recurringConsent: false, paymentMethod: method }, quote.promo, now);
    if (!placed.ok) return placed.reply;
    const order = placed.order;
    await settleOrder(deps, order.id, JSON.stringify({ source: method, code: b.discount?.code ?? null, points: b.pointsRub }), method);
    const paid = await deps.store.getOrder(order.id);
    logger.info({ orderId: order.id, companyId: ctx.companyId, method, points: b.pointsRub, code: b.discount?.code ?? null }, "[billing] тариф включён без оплаты деньгами");
    return { status: 200, json: { invId: order.id, amountRub: 0, params: {}, paymentUrl: "", free: true, order: paid ? toBillingOrder(paid, { docs: documentsReady(deps) }) : undefined } };
  }

  const recurring = input.recurringConsent && cfg.recurring;
  const placed = await placeOrder(deps, { ...base, isTest: cfg.isTest, recurringConsent: recurring }, quote.promo, now);
  if (!placed.ok) return placed.reply;
  const order = placed.order;
  if (recurring) {
    // Историю согласий Робокасса требует хранить: когда дано и какой текст
    // человек видел. Отзыв — отдельная строка, старые не правятся.
    await deps.store.addConsent({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      orderId: order.id,
      granted: true,
      statementText: recurringStatement(b.listRub, input.months) + consentNotes(b),
      offerRevision: OFFER_REVISION,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      createdAt: now,
    });
  }
  const params = buildPaymentParams(cfg, {
    id: order.id,
    amountRub: b.amountRub,
    description: order.description,
    email: order.email,
    isTest: order.isTest,
    recurring,
  });
  logger.info(
    { orderId: order.id, companyId: ctx.companyId, plan: input.plan, months: input.months, amountRub: b.amountRub, discount: b.discount, promotion: b.promotion?.id ?? null, points: b.pointsRub, recurring, isTest: order.isTest },
    "[billing] заказ создан",
  );
  return { status: 200, json: { invId: order.id, amountRub: b.amountRub, params, paymentUrl: buildPaymentUrl(params) } };
}

/**
 * Что в согласии на автосписания сказать про этот платёж: серия списывает
 * полную цену (с постоянной скидкой, пока она действует), а акция, промокод
 * и баллы — только на первый платёж.
 */
export function consentNotes(b: PriceBreakdown): string {
  const notes: string[] = [];
  if (b.discount?.source === "lifetime") notes.push(`Пока действует постоянная скидка ${b.discount.label}, каждое списание меньше на неё.`);
  if (b.amountRub !== b.listRub) {
    const why = [
      b.promotion && "по акции",
      b.discount?.source === "code" && `по промокоду ${b.discount.code}`,
      b.discount?.source === "lifetime" && "с постоянной скидкой",
      b.pointsRub > 0 && "с баллами",
    ]
      .filter(Boolean)
      .join(", ");
    notes.push(`Первый платёж — ${formatRub(b.amountRub)}${why ? ` (${why})` : ""}.`);
  }
  return notes.length ? ` ${notes.join(" ")}` : "";
}

// --- Подтверждение оплаты ------------------------------------------------------

/**
 * Автосписание пришло, когда серии уже нет: автопродление отключили или
 * заменили другой оплатой, пока касса подтверждала платёж. Тариф такое
 * списание не меняет — по оферте деньги возвращаются полностью.
 */
export function isLateCharge(ctx: SettleContext): boolean {
  const { order, billing } = ctx;
  return order.recurringChargeOf !== null && !(billing?.recurringActive && billing.recurringParentOrderId === order.recurringChargeOf);
}

/**
 * Что записать по оплаченному заказу:
 *   • тариф — срок по planAfterPayment (бессрочный тариф не трогаем);
 *   • автосписание серии — сбросить попытки; запоздавшее (серии уже нет) —
 *     ничего не менять, деньги вернуть;
 *   • первый платёж с галочкой — новая серия автопродления;
 *   • разовая оплата другого тарифа или срока — старая серия выключается,
 *     иначе следующее автосписание вернуло бы прежний тариф;
 *   • оплата с «постоянным» промокодом — постоянная скидка компании (новая
 *     заменяет прежнюю: код применили, только если он выгоднее).
 */
export function decideSettlement(ctx: SettleContext, prices: readonly PlanPrice[], now: number): SettlePatch {
  const { order, company, billing } = ctx;
  if (isTopup(order) || !isPaidPlan(order.plan) || isLateCharge(ctx)) return { plan: null, billing: null };
  const perpetual = isPaidPlan(company.plan) && company.planUntil == null;
  const current = effectivePlan(company.plan, company.planUntil, now);
  const plan = perpetual
    ? null
    : {
        id: order.plan,
        until: planAfterPayment({ currentPlan: current.id, currentUntil: company.planUntil, plan: order.plan, months: order.months, now, prices }).until,
      };

  let patch: SettlePatch["billing"] = null;
  if (order.recurringChargeOf !== null) {
    patch = { recurringAttempts: 0, recurringNoticeFor: null };
  } else if (order.recurringConsent) {
    patch = {
      recurringActive: true,
      recurringParentOrderId: order.id,
      recurringPlan: order.plan,
      recurringMonths: order.months,
      // Серия — по полной цене: скидка промокода была только на первый платёж.
      recurringAmountRub: order.baseRub ?? order.amountRub,
      recurringAttempts: 0,
      recurringLastAttemptAt: null,
      recurringNoticeFor: null,
      recurringDisabledAt: null,
    };
  } else if (billing?.recurringActive) {
    patch =
      billing.recurringPlan !== order.plan || billing.recurringMonths !== order.months
        ? { recurringActive: false, recurringDisabledAt: now, recurringAttempts: 0 }
        : { recurringAttempts: 0, recurringNoticeFor: null };
  }
  const promo = ctx.promo;
  // Тестовый платёж (без денег) постоянную скидку не закрепляет.
  const lifetime =
    promo?.lifetime && !order.isTest && order.discountSource !== "lifetime" && order.promoCode === promo.code
      ? {
          promoCodeId: promo.id,
          code: promo.code,
          kind: promo.kind,
          value: promo.value,
          expiresAt: promo.durationMonths ? addMonths(now, promo.durationMonths) : null,
        }
      : null;
  return { plan, billing: patch, lifetime };
}

const ok = (invId: string) => ({ status: 200, body: `OK${invId}` });
const bad = (message: string) => ({ status: 400, body: message });

/**
 * ResultURL. Контракт Робокассы: в ответ строго «OK{InvId}» текстом,
 * иначе уведомление повторится. Поэтому на уже оплаченный заказ тоже «OK».
 */
export async function handleResult(deps: BillingDeps, params: Record<string, string>): Promise<{ status: number; body: string }> {
  const pick = (name: string) => params[name] ?? params[name.toLowerCase()] ?? "";
  const outSum = pick("OutSum");
  const invIdRaw = pick("InvId");
  const signature = pick("SignatureValue");
  const invId = Number(invIdRaw);
  if (!outSum || !signature || !Number.isInteger(invId) || invId <= 0) return bad("bad request");

  const order = await deps.store.getOrder(invId);
  if (!order) return bad("unknown order");
  // Сумма — из заказа, а не из уведомления: иначе подменённый OutSum
  // «оплатил» бы тариф любой суммой.
  if (formatOutSum(outSum) !== formatOutSum(order.amountRub)) {
    logger.error({ invId, outSum, expected: order.amountRub }, "[billing] сумма уведомления не совпала с заказом");
    return bad("amount mismatch");
  }
  if (!verifyResultSignature(deps.config(), { outSum, invId: invIdRaw, signature, isTest: order.isTest, params })) {
    logger.error({ invId }, "[billing] неверная подпись уведомления");
    return bad("bad signature");
  }

  const raw = JSON.stringify(Object.fromEntries(Object.entries(params).filter(([k]) => k !== "SignatureValue")));
  await settleOrder(deps, invId, raw, "result");
  return ok(invIdRaw);
}

/**
 * Засчитать оплату заказа: по уведомлению ResultURL или по сверке с кассой.
 * true — засчитали сейчас; false — уже был оплачен (или возвращён).
 */
export type SettleVia = "result" | "check" | "invoice" | "promo" | "balance";

export async function settleOrder(deps: BillingDeps, invId: number, raw: string, via: SettleVia): Promise<boolean> {
  const now = nowOf(deps);
  const prices = await deps.store.getPrices();
  const result = await deps.store.settle(invId, raw, now, (ctx) => decideSettlement(ctx, prices, now));
  if (!result.claimed) return false;
  logger.info(
    { invId, companyId: result.order.companyId, planUntil: result.patch.plan?.until ?? null, via, points: result.points, lifetime: result.patch.lifetime?.code ?? null },
    "[billing] оплата получена",
  );
  if (result.points.short) {
    void deps.notify
      .owner(
        `⚠️ Заказ №${invId} оплачен после того, как его баллы (${formatRub(result.order.pointsRub)}) вернулись на баланс, а там их уже нет. ` +
          `Тариф продлён, но ${formatRub(result.order.pointsRub)} не оплачены — разберитесь с компанией #${result.order.companyId}.`,
      )
      .catch((err) => logger.warn({ err, invId }, "[billing] владелец не узнал о недостаче баллов"));
  }
  void afterPaid(deps, result.context, result.patch, via).catch((err) => logger.warn({ err, invId }, "[billing] уведомления об оплате не ушли"));
  // УПД — снимком на дату оплаты (best-effort: не вышло — выпустится при скачивании).
  void issueClosingDocument(deps, invId).catch((err) => logger.warn({ err, invId }, "[billing] УПД не выпущен"));
  return true;
}

async function afterPaid(deps: BillingDeps, ctx: SettleContext, patch: SettlePatch, via: SettleVia = "result"): Promise<void> {
  const { order, company, billing } = ctx;
  deps.notify.live(company.id);
  const docsLine = order.amountRub > 0 && !order.isTest && documentsReady(deps) ? "Закрывающий документ (УПД) — в кабинете: «Тариф и оплата» → «Платежи»." : null;
  if (isTopup(order) && order.isTest) {
    await deps.notify.admins(company.id, {
      title: "Тестовое пополнение прошло",
      body: "Касса в тестовом режиме: денег не было, баллы не начислены.",
      paragraphs: [`Тестовый платёж на ${formatRub(order.amountRub)} прошёл. В тестовом режиме кассы баллы не начисляются — денег не было.`],
    });
    await deps.notify.owner(`🧪 Тестовое пополнение ${formatRub(order.amountRub)} — «${company.name}» (#${company.id}), заказ №${order.id}. Баллы не начислены.`);
    return;
  }
  if (isTopup(order)) {
    const balance = await deps.store.getBalance(company.id).catch(() => null);
    await deps.notify.admins(
      company.id,
      {
        title: "Баланс пополнен",
        body: `+${formatRub(order.amountRub)} баллами${balance !== null ? ` · на балансе ${formatRub(balance)}` : ""}`,
        paragraphs: [
          `Получили ${formatRub(order.amountRub)}${via === "invoice" ? " по счёту" : ""} — на баланс начислено ${formatRub(order.amountRub)} баллами (1 балл = 1 ₽).`,
          "Баллами можно оплатить тариф целиком или частично: галочка «Списать баллы» в «Тариф и оплата».",
          ...(docsLine ? [docsLine] : []),
        ],
      },
      [order.email],
    );
    await deps.notify.owner(
      `💰 Пополнение баланса ${formatRub(order.amountRub)} — «${company.name}» (#${company.id})${via === "invoice" ? ", по счёту" : ""}${order.isTest ? " [ТЕСТ]" : ""}. Заказ №${order.id}` +
        (via === "check" ? ". ⚠️ Уведомление на ResultURL не пришло — оплату нашла сверка с кассой." : ""),
    );
    return;
  }
  const name = planName(order.plan);
  const automatic = order.recurringChargeOf !== null;
  if (isLateCharge(ctx)) {
    await deps.notify.admins(
      company.id,
      {
        title: "Вернём автосписание",
        body: `${formatRub(order.amountRub)} списались, когда автопродление уже было выключено. Вернём их полностью.`,
        paragraphs: [
          `Касса списала ${formatRub(order.amountRub)} за тариф «${name}», когда автопродление уже было выключено. Тариф это списание не меняет.`,
          "По оферте вернём деньги полностью в течение 10 рабочих дней на ту же карту — делать ничего не нужно.",
        ],
      },
      [order.email],
    );
    await deps.notify.owner(
      `⚠️ Автосписание после отключения автопродления — «${company.name}» (#${company.id}), заказ №${order.id}, ${formatRub(order.amountRub)}. ` +
        "Верните деньги: root → «Платежи» → «Вернуть деньги» (или в кабинете Робокассы). Оферта: 10 рабочих дней.",
    );
    return;
  }
  if (patch.billing?.recurringActive === false && billing?.recurringActive) {
    await deps.store
      .addConsent({
        companyId: company.id,
        userId: order.userId,
        orderId: order.id,
        granted: false,
        statementText: "Автопродление выключено: вручную оплачен другой тариф или срок",
        offerRevision: OFFER_REVISION,
        ip: null,
        userAgent: null,
        createdAt: order.paidAt ?? nowOf(deps),
      })
      .catch((err) => logger.warn({ err, orderId: order.id }, "[billing] история согласий не записана"));
  }
  const untilText = patch.plan ? `до ${formatDay(patch.plan.until)}` : "бессрочно";
  const lines = [`Тариф «${name}» действует ${untilText}.`];
  if (order.recurringConsent && !automatic) lines.push(`Автопродление включено: следующее списание — в последний день срока, предупредим за ${daysLabel(RECURRING_NOTICE_DAYS)}.`);
  if (patch.billing?.recurringActive === false && billing?.recurringActive) {
    lines.push("Автопродление прежнего тарифа выключено. Включить его для нового тарифа можно при следующей оплате.");
  }
  if (patch.lifetime) {
    const label = promoLabel(patch.lifetime.kind === "fixed" ? "fixed" : "percent", patch.lifetime.value);
    lines.push(
      `Постоянная скидка ${label} по коду ${patch.lifetime.code} закреплена за компанией${patch.lifetime.expiresAt ? ` до ${formatDay(patch.lifetime.expiresAt)}` : ""}: она применится к следующим оплатам и автопродлению сама.`,
    );
  }
  if (docsLine) lines.push(docsLine);
  const extras = [
    order.promotionDiscountRub > 0 && `акция −${formatRub(order.promotionDiscountRub)}`,
    order.discountRub > 0 && `${order.discountSource === "lifetime" ? "постоянная скидка" : `промокод ${order.promoCode ?? ""}`} −${formatRub(order.discountRub)}`,
    order.pointsRub > 0 && `баллами ${formatRub(order.pointsRub)}`,
  ].filter(Boolean) as string[];
  const free = via === "promo" || via === "balance";
  const what = free
    ? `Тариф «${name}» на ${periodLabel(order.months)} включён${via === "balance" ? ` — оплачено баллами (${formatRub(order.pointsRub)})` : order.promoCode ? ` по промокоду ${order.promoCode}` : ""}.`
    : `Получили ${formatRub(order.amountRub)} за тариф «${name}» на ${periodLabel(order.months)}${via === "invoice" ? " по счёту" : ""}${extras.length ? ` (${extras.join(", ")})` : ""}.`;
  await deps.notify.admins(
    company.id,
    {
      title: automatic ? "Тариф продлён" : free ? "Тариф включён" : "Оплата получена",
      body: `${via === "balance" ? "Баллами" : via === "promo" ? "Промокод" : formatRub(order.amountRub)} · «${name}» ${untilText}`,
      paragraphs: [what, ...lines],
    },
    [order.email],
  );
  const ownerHead =
    via === "balance" ? `🪙 Оплата баллами ${formatRub(order.pointsRub)}` : via === "promo" ? "🎟 Промокод на всю сумму" : `💳 Оплата ${formatRub(order.amountRub)}`;
  await deps.notify.owner(
    `${ownerHead} — «${company.name}» (#${company.id}), «${name}» на ${periodLabel(order.months)}` +
      `${via === "invoice" ? ", по счёту" : ""}${extras.length ? `, ${extras.join(", ")}` : ""}` +
      `${patch.lifetime ? `, закреплена постоянная скидка ${patch.lifetime.code}` : ""}` +
      `${automatic ? ", автопродление" : order.recurringConsent ? ", с автопродлением" : ""}${order.isTest ? " [ТЕСТ]" : ""}` +
      `${patch.plan ? `, до ${formatDay(patch.plan.until)}` : ". Тариф бессрочный — срок не менялся, разберите вручную"}. Заказ №${order.id}` +
      (via === "check"
        ? ". ⚠️ Уведомление на ResultURL не пришло — оплату нашла сверка с кассой. Проверьте ResultURL в «Технических настройках» магазина."
        : ""),
  );
}

// --- Автопродление ---------------------------------------------------------------

/** Отключение автопродления: сразу и без подтверждений, оплаченный срок остаётся. */
export async function disableRecurring(
  deps: BillingDeps,
  ctx: { companyId: number; user: Pick<User, "id">; ip: string | null; userAgent: string | null },
): Promise<boolean> {
  const now = nowOf(deps);
  const wasActive = await deps.store.disableRecurring(ctx.companyId, now);
  if (wasActive) {
    await deps.store.addConsent({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      orderId: null,
      granted: false,
      statementText: "Отказ от автоматических списаний — кнопка «Отключить автопродление» в кабинете",
      offerRevision: OFFER_REVISION,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      createdAt: now,
    });
    deps.notify.live(ctx.companyId);
    logger.info({ companyId: ctx.companyId }, "[billing] автопродление отключено");
  }
  return wasActive;
}

/**
 * Раз в несколько минут: протухшие заказы, сверка зависших с кассой,
 * статусы возвратов, предупреждения и автосписания, напоминания об
 * окончании тарифа. Каждый шаг сам ловит свои ошибки — один сбой не
 * останавливает остальные.
 */
export async function runBillingTick(deps: BillingDeps): Promise<void> {
  const now = nowOf(deps);
  const expired = await deps.store.expirePending(now - PENDING_TTL_SEC, now);
  if (expired > 0) logger.info({ expired }, "[billing] неоплаченные заказы закрыты");
  await step("сверка заказов", () => reconcilePending(deps, now));
  await step("статусы возвратов", () => pollRefunds(deps));
  await step("автопродление", () => processRecurring(deps, now));
  await step("напоминания об окончании тарифа", () => sendExpiryNotices(deps, now));
}

async function step(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    logger.error({ err }, `[billing] ${name} не прошли`);
  }
}

async function processRecurring(deps: BillingDeps, now: number): Promise<void> {
  const due = await deps.store.listDueRecurring(now + RECURRING_NOTICE_DAYS * DAY + 60);
  for (const row of due) {
    try {
      const action = recurringAction(
        {
          active: row.recurringActive,
          until: row.planUntil,
          attempts: row.recurringAttempts,
          lastAttemptAt: row.recurringLastAttemptAt,
          noticeFor: row.recurringNoticeFor,
        },
        now,
      );
      if (action === "notice") await sendUpcomingNotice(deps, row, now);
      else if (action === "charge") await chargeSeries(deps, row, now);
      else if (action === "give-up") await giveUp(deps, row, "оплату не удалось списать", true);
    } catch (err) {
      logger.error({ err, companyId: row.companyId }, "[billing] автопродление компании не обработано");
    }
  }
}

function seriesTerms(row: DueRecurring) {
  const plan = isPaidPlan(row.recurringPlan) ? row.recurringPlan : null;
  const months = row.recurringMonths ?? 0;
  const amount = row.recurringAmountRub ?? 0;
  return plan && months > 0 && amount > 0 ? { plan, months, amount } : null;
}

/**
 * Сумма автосписания: сумма серии минус постоянная скидка, если она
 * действует на день списания. Акции и промокоды на серию не действуют.
 */
export async function seriesCharge(deps: BillingDeps, companyId: number, seriesRub: number, now: number) {
  const lifetimes = activeLifetimes(await deps.store.getCompanyDiscounts(companyId), now);
  const b = priceBreakdown({ listRub: seriesRub, promotion: null, code: null, lifetimes, pointsAvailable: 0 });
  return { amountRub: b.amountRub, discount: b.discount };
}

async function sendUpcomingNotice(deps: BillingDeps, row: DueRecurring, now: number): Promise<void> {
  const terms = seriesTerms(row);
  if (!terms || !row.planUntil) return;
  const day = formatDay(chargeAt(row.planUntil));
  const charge = await seriesCharge(deps, row.companyId, terms.amount, chargeAt(row.planUntil));
  const discountNote = charge.discount ? ` (с постоянной скидкой ${charge.discount.label})` : "";
  await deps.notify.admins(row.companyId, {
    title: "Скоро продление тарифа",
    body: `${day} спишем ${formatRub(charge.amountRub)} за «${planName(terms.plan)}». Отключить — в «Тариф и оплата».`,
    paragraphs: [
      `Тариф «${planName(terms.plan)}» оплачен до ${formatDay(row.planUntil)}. ${day} спишем ${formatRub(charge.amountRub)}${discountNote} с карты, которой вы платили, и продлим тариф на ${periodLabel(terms.months)}.`,
      "Если продлевать не нужно, отключите автопродление в кабинете: «Тариф и оплата» → «Отключить автопродление». Оплаченный срок сохранится.",
    ],
  });
  await deps.store.setNoticeFor(row.companyId, row.planUntil, now);
}

async function chargeSeries(deps: BillingDeps, row: DueRecurring, now: number): Promise<void> {
  const cfg = deps.config();
  const terms = seriesTerms(row);
  const parent = row.recurringParentOrderId ? await deps.store.getOrder(row.recurringParentOrderId) : null;
  if (!terms || !parent || parent.status !== "paid") return giveUp(deps, row, "нет оплаченного первого платежа серии");
  // Серия из тестового режима и списывается тестово (IsTest=1, тестовые
  // пароли): автопродление проверяется без денег — но только пока магазин
  // в тестовом режиме. В боевом тестовая серия продлевала бы тариф даром.
  if (parent.isTest && !cfg.isTest) return giveUp(deps, row, "серия создана в тестовом режиме — в боевом режиме её не списываем");
  if (!cfg.login || !(parent.isTest ? cfg.testPassword1 : cfg.password1)) {
    logger.warn({ companyId: row.companyId, isTest: parent.isTest }, "[billing] касса не настроена — автосписание отложено");
    return;
  }

  // Попытку «занимаем» до запроса одним условным UPDATE: второй процесс
  // (перезапуск при деплое) или повторный тик в те же сутки её не получат,
  // и карта не спишется дважды.
  if (!(await deps.store.claimAttempt(row.companyId, now, RECURRING_MAX_ATTEMPTS))) return;
  const charge = await seriesCharge(deps, row.companyId, terms.amount, now);
  const order = await deps.store.createOrder({
    companyId: row.companyId,
    userId: null,
    email: parent.email,
    plan: terms.plan,
    months: terms.months,
    amountRub: charge.amountRub,
    description: `${orderDescription(terms.plan, terms.months)}, автопродление`,
    isTest: parent.isTest,
    recurringConsent: false,
    recurringChargeOf: parent.id,
    createdAt: now,
    ...(charge.discount
      ? { baseRub: terms.amount, discountRub: charge.discount.discountRub, discountSource: "lifetime", promoCode: charge.discount.code }
      : {}),
    ...(charge.amountRub === 0 ? { paymentMethod: "promo" } : {}),
  });
  if (charge.amountRub === 0) {
    // Постоянная скидка закрывает всю сумму: продлеваем без кассы.
    await settleOrder(deps, order.id, JSON.stringify({ source: "lifetime", code: charge.discount?.code ?? null }), "promo");
    return;
  }
  const result = await chargeRecurring(
    cfg,
    { invId: order.id, previousInvId: parent.id, amountRub: charge.amountRub, description: order.description, isTest: parent.isTest },
    deps.fetch,
  );
  if (result.accepted) {
    logger.info({ companyId: row.companyId, orderId: order.id }, "[billing] автосписание принято кассой, ждём подтверждения");
    return;
  }
  if (!result.definitive) {
    // Ответа нет: списание могло пройти. Заказ ждёт уведомления (оно
    // засчитается и позже), а человек проверит его в кабинете кассы.
    logger.warn({ companyId: row.companyId, orderId: order.id, response: result.response }, "[billing] касса не ответила на автосписание");
    await deps.notify.owner(
      `⚠️ Робокасса не ответила на автосписание — «${row.companyName}» (#${row.companyId}), заказ №${order.id}: ${result.response}. ` +
        "Сверка с кассой засчитает его сама, если списание прошло; повтор — через сутки.",
    );
    return;
  }
  await deps.store.expireOrder(order.id, now);
  logger.warn(
    { companyId: row.companyId, orderId: order.id, attempt: row.recurringAttempts + 1, response: result.response },
    "[billing] касса не приняла автосписание",
  );
}

async function giveUp(deps: BillingDeps, row: DueRecurring, reason: string, attempted = false): Promise<void> {
  const now = nowOf(deps);
  if (!(await deps.store.disableRecurring(row.companyId, now))) return;
  await deps.store.addConsent({
    companyId: row.companyId,
    userId: null,
    orderId: row.recurringParentOrderId,
    granted: false,
    statementText: `Автопродление выключено сервисом: ${reason}`,
    offerRevision: OFFER_REVISION,
    ip: null,
    userAgent: null,
    createdAt: now,
  });
  const terms = seriesTerms(row);
  const name = terms ? planName(terms.plan) : "платный";
  const tried = attempted ? ` — попробовали ${RECURRING_MAX_ATTEMPTS} раза` : "";
  await deps.notify.admins(row.companyId, {
    title: "Автопродление выключено",
    body: `Не удалось продлить тариф «${name}» автоматически. Оплатите в «Тариф и оплата».`,
    paragraphs: [
      `Не получилось списать оплату за тариф «${name}»${terms ? ` (${formatRub(terms.amount)})` : ""}${tried}. Автопродление выключено.`,
      "Чтобы тариф продолжал действовать, оплатите его в кабинете: «Тариф и оплата». Можно снова включить автопродление галочкой при оплате.",
    ],
  });
  await deps.notify.owner(`⚠️ Автопродление выключено — «${row.companyName}» (#${row.companyId}): ${reason}`);
  deps.notify.live(row.companyId);
}

// --- Сверка с кассой (OpStateExt) -------------------------------------------------

/** Моложе не сверяем: человек ещё на странице оплаты, уведомление в пути. */
export const CHECK_MIN_AGE_SEC = 2 * 60;
/** Сколько зависших заказов сверяем за один тик. */
const CHECKS_PER_TICK = 10;

/** Как часто сверять заказ: свежий — каждые 5 минут, старше часа — раз в час, старше суток — раз в 6 часов. */
export function checkInterval(ageSec: number): number {
  if (ageSec < 60 * 60) return 5 * 60;
  if (ageSec < DAY) return 60 * 60;
  return 6 * 60 * 60;
}

/** Проверочный номер заказа: такого нет, касса ответит «не найдено», если логин и Пароль #2 верны. */
export const PROBE_INV_ID = 2_147_000_000;

function opResultMessage(state: Extract<OpState, { ok: true }>): string {
  if (state.resultCode === OP_RESULT.badSignature) return "Касса не приняла подпись: проверьте Пароль #2 и алгоритм хеша (ROBOKASSA_HASH)";
  if (state.resultCode === OP_RESULT.shopNotFound) return "Касса не нашла магазин: проверьте логин (ROBOKASSA_MERCHANT_LOGIN)";
  return `Касса ответила кодом ${state.resultCode}${state.description ? `: ${state.description}` : ""}`;
}

/**
 * IncSum — сколько заплатил покупатель; меньше суммы заказа быть не может.
 * Непонятный формат — не засчитываем сами: пусть посмотрит человек.
 */
export function coversAmount(incSum: string | null, amountRub: number): boolean {
  if (incSum === null) return true;
  const sum = Number(incSum.replace(/[\s\u00a0]/g, "").replace(",", "."));
  return Number.isFinite(sum) && sum + 0.005 >= amountRub;
}

/**
 * Спросить кассу о заказе и привести его в соответствие: оплачен — засчитать
 * (как по ResultURL), отменён — «не оплачен», деньги возвращены в кабинете
 * кассы — отметить возврат и откатить тариф. Ответ кассы подписан нашим
 * Паролем #2 и пришёл на наш запрос, сумма привязана к InvId подписью
 * формы оплаты, поэтому State 100 достаточно.
 */
export async function reconcileOrder(deps: BillingDeps, order: PaymentOrderRow): Promise<{ status: ReconcileStatus; message: string }> {
  const state = await opState(deps.config(), order.id, deps.fetch);
  if (!state.ok) return { status: "error", message: state.error };
  if (state.resultCode === OP_RESULT.notFound) {
    return { status: "not_found", message: order.isTest ? "Касса не показывает тестовые операции" : "В кассе такой операции нет: оплату не начинали" };
  }
  if (state.resultCode !== OP_RESULT.ok) return { status: "error", message: opResultMessage(state) };

  switch (state.stateCode) {
    case OP_STATE.paid: {
      if (order.status === "paid" || order.status === "refunded") return { status: "already", message: "Оплачен — в кассе так же" };
      if (!coversAmount(state.incSum, order.amountRub)) {
        logger.error({ invId: order.id, incSum: state.incSum, expected: order.amountRub }, "[billing] сверка: сумма в кассе не сходится с заказом");
        await deps.notify.owner(`⚠️ Сверка: по заказу №${order.id} касса показывает сумму «${state.incSum}» при заказе на ${formatRub(order.amountRub)}. Не засчитано — разберите вручную.`);
        return { status: "error", message: `Касса показывает сумму «${state.incSum}» при заказе на ${formatRub(order.amountRub)} — не засчитано` };
      }
      const raw = JSON.stringify({ source: "OpStateExt", state: state.stateCode, incSum: state.incSum, paymentMethod: state.paymentMethod });
      const settled = await settleOrder(deps, order.id, raw, "check");
      return settled ? { status: "paid", message: "Оплата найдена в кассе и засчитана" } : { status: "already", message: "Уже засчитан" };
    }
    case OP_STATE.cancelled:
      if (order.status === "pending") await deps.store.expireOrder(order.id, nowOf(deps));
      return { status: "cancelled", message: "Касса: операция отменена, денег нет" };
    case OP_STATE.refunded:
      if (order.status === "paid") {
        // Деньги вернули в кабинете кассы — у нас заказ ещё «оплачен».
        if (order.refundStatus !== "pending" && order.refundStatus !== "uncertain") {
          if (!(await deps.store.claimRefund(order.id, nowOf(deps)))) return { status: "refunded", message: "Касса: деньги возвращены, возврат уже обрабатывается" };
          await deps.store.setRefund(order.id, { refundStatus: "uncertain" });
          await stopSeriesForRefund(deps, order);
        }
        await completeRefund(deps, order.id);
        return { status: "refunded", message: "Касса: деньги возвращены — заказ отмечен возвращённым" };
      }
      return { status: "refunded", message: "Касса: деньги возвращены покупателю" };
    case OP_STATE.crediting:
      return { status: "waiting", message: "Деньги получены, касса их зачисляет — засчитаем, когда закончит" };
    default:
      return { status: "waiting", message: "Касса: операция создана, оплаты пока нет" };
  }
}

/** Зависшие «ожидает оплаты» (боевые): свежие — чаще, старые — реже. */
async function reconcilePending(deps: BillingDeps, now: number): Promise<void> {
  const cfg = deps.config();
  if (!cfg.login || !cfg.password2) return;
  // Ярусы — те же интервалы, что в checkInterval: отбор целиком в SQL, иначе
  // старые брошенные заказы забили бы выборку и свежие не проверялись бы.
  const tiers = [
    { createdAfter: now - 60 * 60, checkedBefore: now - checkInterval(0) },
    { createdAfter: now - DAY, checkedBefore: now - checkInterval(60 * 60) },
    { createdAfter: now - PENDING_TTL_SEC, checkedBefore: now - checkInterval(DAY) },
  ];
  const candidates = await deps.store.listPendingForCheck({ tiers, createdBefore: now - CHECK_MIN_AGE_SEC, limit: CHECKS_PER_TICK });
  for (const order of candidates) {
    if (!(await deps.store.claimCheck(order.id, now, now - checkInterval(now - order.createdAt)))) continue;
    const result = await reconcileOrder(deps, order).catch((err) => ({ status: "error" as const, message: String(err) }));
    if (result.status === "paid" || result.status === "error") logger.info({ invId: order.id, ...result }, "[billing] сверка заказа");
  }
}

/**
 * Опрос статуса заказа со страницы оплаты: если он завис в «ожидает
 * оплаты», в фоне спрашиваем кассу (не чаще раза в 30 секунд на заказ) —
 * следующий опрос увидит результат.
 */
export function checkWhilePolling(deps: BillingDeps, order: PaymentOrderRow): void {
  const now = nowOf(deps);
  // Только оплаты через кассу: счёт и промокод касса не видела.
  if (order.status !== "pending" || order.isTest || order.paymentMethod !== "card" || now - order.createdAt < 60) return;
  if (order.checkedAt !== null && now - order.checkedAt < 30) return;
  void (async () => {
    if (!(await deps.store.claimCheck(order.id, now, now - 30))) return;
    await reconcileOrder(deps, order);
  })().catch((err) => logger.warn({ err, invId: order.id }, "[billing] сверка при опросе не прошла"));
}

// --- Возвраты ---------------------------------------------------------------------

/**
 * Возвращённая оплата серии автопродления выключает серию: иначе откат
 * срока сразу вызвал бы новое списание.
 */
async function stopSeriesForRefund(deps: BillingDeps, order: PaymentOrderRow): Promise<void> {
  const billing = await deps.store.getCompanyBilling(order.companyId);
  const parent = billing?.recurringParentOrderId ?? null;
  if (!billing?.recurringActive || parent === null || (order.id !== parent && order.recurringChargeOf !== parent)) return;
  const now = nowOf(deps);
  if (!(await deps.store.disableRecurring(order.companyId, now))) return;
  await deps.store.addConsent({
    companyId: order.companyId,
    userId: null,
    orderId: order.id,
    granted: false,
    statementText: `Автопродление выключено: возврат оплаты по заказу №${order.id}`,
    offerRevision: OFFER_REVISION,
    ip: null,
    userAgent: null,
    createdAt: now,
  });
  deps.notify.live(order.companyId);
}

/** Деньги вернулись: заказ «возвращён», тариф откатывается, баллы — назад, админам — уведомление. */
async function completeRefund(deps: BillingDeps, orderId: number): Promise<void> {
  const finished = await deps.store.finishRefund(orderId, nowOf(deps));
  if (!finished) return;
  // Деньги вернулись — УПД по этой оплате аннулируется.
  await deps.store.voidClosingDocument(orderId, nowOf(deps)).catch((err) => logger.warn({ err, orderId }, "[billing] УПД не аннулирован"));
  const { order, rolledBack, points } = finished;
  logger.info({ invId: order.id, companyId: order.companyId, rolledBack, points, discountRevoked: finished.discountRevoked }, "[billing] возврат завершён");
  deps.notify.live(order.companyId);
  const company = await deps.getCompany(order.companyId);
  const money = order.paymentMethod === "balance" ? `${formatRub(order.pointsRub)} баллами` : formatRub(order.amountRub);
  const paragraphs: string[] = [];
  if (isTopup(order)) {
    paragraphs.push(
      `Вернули ${formatRub(order.amountRub)} за пополнение баланса (заказ №${order.id}). Деньги придут на карту, которой платили; срок зачисления зависит от банка.`,
      points.postedRub < 0 ? `С баланса списано ${formatRub(-points.postedRub)} баллов.` : "Баллы этого пополнения уже списаны с баланса.",
    );
  } else {
    paragraphs.push(
      order.paymentMethod === "balance"
        ? `Оплату тарифа «${planName(order.plan)}» на ${periodLabel(order.months)} баллами отменили (заказ №${order.id}).`
        : `Вернули ${formatRub(order.amountRub)} за тариф «${planName(order.plan)}» на ${periodLabel(order.months)} (заказ №${order.id}). Деньги придут на карту, которой платили; срок зачисления зависит от банка.`,
      rolledBack
        ? isPaidPlan(rolledBack.plan) && (rolledBack.until === null || rolledBack.until > nowOf(deps))
          ? `Тариф «${planName(rolledBack.plan)}» действует ${rolledBack.until ? `до ${formatDay(rolledBack.until)}` : "бессрочно"}, как до этой оплаты.`
          : `Срок, оплаченный этим платежом, снят: кабинет на тарифе «${PLANS.start.name}».`
        : "Срок тарифа не меняли.",
    );
    if (points.postedRub > 0) paragraphs.push(`${formatRub(points.postedRub)} баллов вернулись на баланс.`);
    if (finished.discountRevoked) paragraphs.push("Постоянная скидка, которую дала эта оплата, снята.");
  }
  await deps.notify
    .admins(
      order.companyId,
      {
        title: order.paymentMethod === "balance" ? "Оплата баллами отменена" : "Деньги возвращены",
        body:
          order.paymentMethod === "balance"
            ? `Отменили оплату баллами за ${orderWhat(order)}: ${formatRub(order.pointsRub)} вернулись на баланс, заказ №${order.id}.`
            : `Вернули ${money} за ${orderWhat(order)}, заказ №${order.id}.`,
        paragraphs,
      },
      [order.email],
    )
    .catch((err) => logger.warn({ err, invId: order.id }, "[billing] уведомление о возврате не ушло"));
  await deps.notify.owner(
    `↩️ Возврат ${money} завершён — «${company?.name ?? `#${order.companyId}`}», заказ №${order.id} (${orderWhat(order)}). ` +
      (isTopup(order)
        ? points.short > 0
          ? `⚠️ На балансе не хватило ${formatRub(points.short)}: пополнение уже потратили — разберитесь с компанией.`
          : "Баллы пополнения списаны с баланса."
        : (rolledBack
            ? "Тариф откачен к состоянию до оплаты."
            : "Тариф не откатывали: после оплаты он менялся или оплата старше снимка «до оплаты». Поправьте срок вручную, если нужно.") +
          (points.postedRub > 0 ? ` Баллы ${signedRub(points.postedRub)} вернулись на баланс.` : "")),
  );
}

export const rootOrder = async (deps: BillingDeps, id: number): Promise<RootBillingOrder | null> => {
  const row = await deps.store.getOrder(id);
  if (!row) return null;
  const company = await deps.getCompany(row.companyId);
  return { ...toBillingOrder(row, { docs: documentsReady(deps) }), companyId: row.companyId, companyName: company?.name ?? null, email: row.email };
};

/**
 * Возврат оплаты целиком через API кассы. Повторно отправить нельзя, пока
 * касса не ответила, что прошлый возврат отменён: двойной возврат — это
 * потерянные деньги. Исключение — «касса не ответила»: root может повторить
 * (force), подтвердив, что проверил кабинет; перед отправкой касса всё
 * равно спрашивается, не вернули ли уже (State 60).
 */
export async function refundOrder(deps: BillingDeps, orderId: number, opts: { force?: boolean } = {}): Promise<Reply<RefundResult>> {
  const order = await deps.store.getOrder(orderId);
  if (!order) return { status: 404, json: { message: "Заказ не найден" } };
  if (order.status !== "paid") return { status: 409, json: { message: "Вернуть можно только оплаченный заказ" } };
  if (order.isTest) return { status: 409, json: { message: "Тестовый платёж: денег не было, возвращать нечего" } };
  if (order.paymentMethod === "balance") return refundPointsOrder(deps, order);
  if (order.paymentMethod !== "card") {
    return {
      status: 409,
      json: {
        message:
          order.paymentMethod === "invoice"
            ? "Счёт оплачен переводом — касса его не вернёт. Верните деньги переводом по реквизитам плательщика" +
              (isTopup(order) ? ", а баллы спишите корректировкой баланса." : ".")
            : "Тариф включён промокодом — денег не было, возвращать нечего.",
      },
    };
  }
  const retryUncertain = order.refundStatus === "uncertain" && opts.force === true;
  if (order.refundStatus === "uncertain" && !retryUncertain) {
    return {
      status: 409,
      json: {
        message: "Касса не подтвердила прошлый возврат. Проверьте в кабинете Робокассы, что деньги не вернулись, и только тогда повторите.",
        code: "refund_uncertain",
      },
    };
  }
  if (order.refundStatus && order.refundStatus !== "canceled" && !retryUncertain) {
    return { status: 409, json: { message: "Возврат по этому заказу уже отправлен" } };
  }
  const cfg = deps.config();
  if (!cfg.password3) {
    return {
      status: 503,
      json: { message: "Нужен Пароль #3 (ROBOKASSA_PASSWORD3) — без него касса не принимает возвраты. Можно вернуть деньги в кабинете Робокассы, затем нажать «Проверить в кассе».", code: "no_password3" },
    };
  }
  if (!(await deps.store.claimRefund(order.id, nowOf(deps), { allowUncertain: retryUncertain }))) {
    return { status: 409, json: { message: "Возврат по этому заказу уже отправлен" } };
  }
  // Пополнение: сначала списываем баллы — вернуть деньги за потраченные баллы
  // нельзя. Повтор после «касса не ответила» баллы уже держит — не трогаем.
  const holdsNow = isTopup(order) && order.pointsState === "credited";
  if (holdsNow) {
    const hold = await deps.store.holdTopupRefund(order.id, nowOf(deps));
    if (!hold.ok) {
      await deps.store.setRefund(order.id, { refundStatus: order.refundStatus });
      return {
        status: 409,
        json: {
          message:
            hold.reason === "balance"
              ? `На балансе ${formatRub(hold.balanceRub ?? 0)} — меньше пополнения: часть баллов уже потрачена. Верните разницу вручную или спишите баллы корректировкой.`
              : "Пополнение уже возвращается",
        },
      };
    }
  }
  /** Возврат не ушёл в кассу — статус как был, баллы пополнения (если их списала эта попытка) назад. */
  const undo = async () => {
    await deps.store.setRefund(order.id, { refundStatus: order.refundStatus });
    if (holdsNow) await deps.store.releaseTopupRefund(order.id, nowOf(deps));
  };

  const state = await opState(cfg, order.id, deps.fetch);
  if (!state.ok || state.resultCode !== OP_RESULT.ok || !state.opKey) {
    await undo();
    const reason = !state.ok ? state.error : state.resultCode !== OP_RESULT.ok ? opResultMessage(state) : "касса не вернула ключ операции";
    return { status: 502, json: { message: `Не удалось найти операцию в кассе: ${reason}` } };
  }
  if (state.stateCode === OP_STATE.refunded) {
    await deps.store.setRefund(order.id, { refundStatus: "uncertain" });
    await stopSeriesForRefund(deps, order);
    await completeRefund(deps, order.id);
    return { status: 200, json: { message: "Касса уже вернула эти деньги — заказ отмечен возвращённым", order: await rootOrder(deps, order.id) } };
  }

  const created = await createRefund(cfg, { opKey: state.opKey }, deps.fetch);
  if (created.ok) {
    await deps.store.setRefund(order.id, { refundStatus: "pending", refundRequestId: created.requestId });
    await stopSeriesForRefund(deps, order);
    logger.info({ invId: order.id, requestId: created.requestId }, "[billing] возврат отправлен");
    return { status: 200, json: { message: "Возврат отправлен в кассу. Когда деньги уйдут, заказ станет «Возвращён», а тариф откатится.", order: await rootOrder(deps, order.id) } };
  }
  if (!created.definitive) {
    // Ответа нет: возврат мог уйти. Повтор — риск вернуть дважды, поэтому
    // ждём: сверка увидит State 60 и закончит возврат сама.
    await deps.store.setRefund(order.id, { refundStatus: "uncertain" });
    await stopSeriesForRefund(deps, order);
    await deps.notify.owner(`⚠️ Робокасса не ответила на возврат по заказу №${order.id}: ${created.error}. Проверьте операцию в кабинете кассы и не повторяйте возврат.`);
    return { status: 202, json: { message: "Касса не ответила. Не повторяйте возврат: проверьте операцию в кабинете Робокассы — статус обновится сам.", order: await rootOrder(deps, order.id) } };
  }
  await undo();
  return { status: 502, json: { message: `Касса отклонила возврат: ${created.error}` } };
}

/**
 * Тариф оплачен баллами: «вернуть» — значит отменить оплату: срок назад,
 * баллы на баланс. Касса не участвует.
 */
async function refundPointsOrder(deps: BillingDeps, order: PaymentOrderRow): Promise<Reply<RefundResult>> {
  if (order.refundStatus && order.refundStatus !== "canceled") return { status: 409, json: { message: "Возврат по этому заказу уже идёт" } };
  if (!(await deps.store.claimRefund(order.id, nowOf(deps)))) return { status: 409, json: { message: "Возврат по этому заказу уже идёт" } };
  await deps.store.setRefund(order.id, { refundStatus: "pending" });
  await stopSeriesForRefund(deps, order);
  await completeRefund(deps, order.id);
  return { status: 200, json: { message: "Оплата баллами отменена: баллы на балансе, срок тарифа — как до оплаты.", order: await rootOrder(deps, order.id) } };
}

/** Сколько минут «отправляется» считается нормальным: два запроса к кассе — меньше минуты. */
const REFUND_SENDING_STALE_SEC = 10 * 60;

/**
 * Статусы отправленных возвратов: деньги ушли — заказ «возвращён», отменён —
 * снова можно вернуть. Зависшее «отправляется» (процесс упал посреди
 * отправки) становится «касса не ответила» и проверяется по State 60.
 * Очередь по checked_at — по кругу, не одни и те же 20.
 */
async function pollRefunds(deps: BillingDeps): Promise<void> {
  const now = nowOf(deps);
  const rows = await deps.store.listRefundsInProgress(now - REFUND_SENDING_STALE_SEC, 20);
  if (!rows.length) return;
  const cfg = deps.config();
  for (const order of rows) {
    await deps.store.markChecked(order.id, now);
    // Отмена оплаты баллами без кассы: если прошлый раз прервался — доводим здесь.
    if (order.paymentMethod === "balance") {
      if (order.refundStatus === "pending") await completeRefund(deps, order.id);
      continue;
    }
    if (order.refundStatus === "sending") {
      await deps.store.setRefund(order.id, { refundStatus: "uncertain" });
      await deps.notify.owner(`⚠️ Возврат по заказу №${order.id} завис на отправке. Проверьте операцию в кабинете Робокассы: если денег не вернули — повторите возврат в root.`);
    }
    if (order.refundStatus === "pending" && order.refundRequestId) {
      const state = await refundState(order.refundRequestId, deps.fetch);
      if (!state.ok) continue;
      if (state.label === "finished") await completeRefund(deps, order.id);
      else if (state.label === "canceled") {
        await deps.store.setRefund(order.id, { refundStatus: "canceled" });
        if (isTopup(order)) await deps.store.releaseTopupRefund(order.id, now);
        await deps.notify.owner(
          `⚠️ Робокасса отменила возврат по заказу №${order.id} (${formatRub(order.amountRub)}). Его можно отправить ещё раз. ` +
            "Если это была оплата серии, автопродление выключилось при отправке возврата — включить его можно только новой оплатой с галочкой.",
        );
      }
    } else {
      // Без ответа кассы при отправке — смотрим состояние самой операции.
      const state = await opState(cfg, order.id, deps.fetch);
      if (state.ok && state.resultCode === OP_RESULT.ok && state.stateCode === OP_STATE.refunded) await completeRefund(deps, order.id);
    }
  }
}

// --- Напоминания об окончании тарифа -----------------------------------------------

/**
 * Оплаченный онлайн тариф без автопродления: за 3 дня до конца — «скоро
 * закончится», после конца (в течение суток) — «закончился». По одному
 * разу на срок.
 */
async function sendExpiryNotices(deps: BillingDeps, now: number): Promise<void> {
  const rows = await deps.store.listExpiringPlans(now - DAY, now + RECURRING_NOTICE_DAYS * DAY);
  for (const row of rows) {
    if (!isPaidPlan(row.plan)) continue;
    const kind = row.planUntil > now ? "expiry" : "expired";
    if ((kind === "expiry" ? row.expiryNoticeFor : row.expiredNoticeFor) === row.planUntil) continue;
    if (!(await deps.store.claimExpiryNotice(row.companyId, kind, row.planUntil, now))) continue;
    await deps.notify.admins(row.companyId, expiryNotice(row, kind, now)).catch((err) => logger.warn({ err, companyId: row.companyId }, "[billing] напоминание о тарифе не ушло"));
  }
}

export function expiryNotice(row: Pick<ExpiringPlan, "plan" | "planUntil">, kind: "expiry" | "expired", now: number): BillingNotice {
  const name = planName(row.plan);
  if (kind === "expiry") {
    const days = Math.max(1, Math.ceil((row.planUntil - now) / DAY));
    return {
      title: "Тариф скоро закончится",
      body: `«${name}» действует до ${formatDay(row.planUntil)}. Продлить — в «Тариф и оплата».`,
      paragraphs: [
        `Тариф «${name}» действует до ${formatDay(row.planUntil)} — осталось ${daysLabel(days)}.`,
        "Чтобы ничего не отключилось, продлите его в «Тариф и оплата». Оставшиеся дни не пропадут — новый срок прибавится к ним.",
      ],
    };
  }
  return {
    title: "Тариф закончился",
    body: `«${name}» закончился ${formatDay(row.planUntil)}. Продлить — в «Тариф и оплата».`,
    paragraphs: [
      `Тариф «${name}» закончился ${formatDay(row.planUntil)}. Кабинет перешёл на бесплатный «${PLANS.start.name}»: данные и история на месте.`,
      "Продлить тариф можно в «Тариф и оплата» — всё вернётся сразу после оплаты.",
    ],
  };
}

// --- Диагностика для root -------------------------------------------------------------

export async function billingDiagnostics(deps: BillingDeps): Promise<BillingDiagnostics> {
  const cfg = deps.config();
  const base = (deps.baseUrl?.() ?? "").replace(/\/+$/, "");
  return {
    secrets: {
      login: !!cfg.login,
      password1: !!cfg.password1,
      password2: !!cfg.password2,
      testPassword1: !!cfg.testPassword1,
      testPassword2: !!cfg.testPassword2,
      password3: !!cfg.password3,
    },
    testMode: cfg.isTest,
    configured: isConfigured(cfg),
    hash: cfg.hash,
    recurring: cfg.recurring,
    receipt: cfg.receipt,
    sno: cfg.sno,
    tax: cfg.tax,
    urls: { result: `${base}/api/billing/robokassa/result`, success: `${base}/billing/success`, fail: `${base}/billing/fail` },
    stats: await deps.store.stats(),
    documents: { ready: documentsReady(deps), missing: sellerMissing(sellerOf(deps)) },
    dadata: !!deps.dadata?.(),
  };
}

/**
 * Проверка подключения без денег: запрос состояния заведомо несуществующего
 * заказа. «Не найдено» — касса узнала магазин и приняла подпись Пароля #2.
 * Пароль #1 так не проверить — только тестовым платежом.
 */
export async function checkConnection(deps: BillingDeps): Promise<BillingCheckResult> {
  const cfg = deps.config();
  if (!cfg.login || !cfg.password2) return { ok: false, message: "Не заданы ROBOKASSA_MERCHANT_LOGIN и ROBOKASSA_PASSWORD2" };
  const state = await opState(cfg, PROBE_INV_ID, deps.fetch);
  if (!state.ok) return { ok: false, message: `Касса не ответила: ${state.error}` };
  if (state.resultCode === OP_RESULT.notFound || state.resultCode === OP_RESULT.ok) {
    return { ok: true, message: "Касса отвечает: логин и Пароль #2 верны. Пароль #1 проверит тестовый платёж." };
  }
  return { ok: false, message: opResultMessage(state) };
}

/** Сверка одного заказа по кнопке root. */
export async function reconcileOne(deps: BillingDeps, orderId: number): Promise<Reply<ReconcileResult>> {
  const order = await deps.store.getOrder(orderId);
  if (!order) return { status: 404, json: { message: "Заказ не найден" } };
  if (order.paymentMethod !== "card") {
    return { status: 409, json: { message: order.paymentMethod === "invoice" ? "Счёт оплачивают переводом — касса о нём не знает. Отметьте оплату вручную." : "Заказ без оплаты через кассу" } };
  }
  const result = await reconcileOrder(deps, order);
  if (order.status === "pending") await deps.store.claimCheck(order.id, nowOf(deps), nowOf(deps)).catch(() => false);
  return { status: 200, json: { ...result, order: await rootOrder(deps, order.id) } };
}
