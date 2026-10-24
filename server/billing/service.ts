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
  type BillingCheckResult,
  type BillingDiagnostics,
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
import type { Company, PaymentOrderRow, User } from "@shared/schema";
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
import type { BillingStore, DueRecurring, ExpiringPlan, SettleContext, SettlePatch } from "./store";

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
  /** Адрес сайта для ResultURL/SuccessURL в диагностике. */
  baseUrl?: () => string;
};

const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export function formatDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" });
}

const planName = (id: string) => (isPaidPlan(id) ? PLANS[id].name : id);

const ORDER_STATUSES: readonly OrderStatus[] = ["pending", "paid", "expired", "refunded"];
const REFUND_STATUSES: readonly RefundStatus[] = ["sending", "pending", "uncertain", "finished", "canceled"];

export function toBillingOrder(row: PaymentOrderRow): BillingOrder {
  const status: OrderStatus = (ORDER_STATUSES as readonly string[]).includes(row.status) ? (row.status as OrderStatus) : "pending";
  const refundStatus = (REFUND_STATUSES as readonly string[]).includes(row.refundStatus ?? "") ? (row.refundStatus as RefundStatus) : null;
  return {
    id: row.id,
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
  const [prices, billing, orders, usersCount] = await Promise.all([
    deps.store.getPrices(),
    deps.store.getCompanyBilling(ctx.companyId),
    deps.store.listOrders(ctx.companyId, 20),
    deps.countUsers(ctx.companyId),
  ]);
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
    orders: orders.map(toBillingOrder),
    email: ctx.user.email ?? null,
    now,
  };
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
  if (!isConfigured(cfg)) {
    return {
      status: 503,
      json: { message: "Онлайн-оплата пока не подключена. Напишите на support@tasksflow.ru — подключим тариф по счёту.", code: "not_configured" },
    };
  }
  const prices = await deps.store.getPrices();
  const price = priceFor(prices, input.plan, input.months);
  if (price === null) return { status: 400, json: { message: "Этот тариф сейчас нельзя оплатить онлайн — напишите нам, подключим." } };
  if (input.expectedRub !== undefined && input.expectedRub !== price) {
    return { status: 409, json: { message: "Цена изменилась — проверьте сумму и нажмите ещё раз.", code: "price_changed", priceRub: price } };
  }
  const company = await deps.getCompany(ctx.companyId);
  if (!company) return { status: 404, json: { message: "Компания не найдена" } };
  if (isPaidPlan(company.plan) && company.planUntil == null) {
    return { status: 409, json: { message: "Тариф подключён бессрочно — оплачивать его не нужно. Сменить тариф поможет поддержка.", code: "perpetual" } };
  }

  const now = nowOf(deps);
  const recurring = input.recurringConsent && cfg.recurring;
  const order = await deps.store.createOrder({
    companyId: ctx.companyId,
    userId: ctx.user.id,
    email: input.email ?? ctx.user.email ?? null,
    plan: input.plan,
    months: input.months,
    amountRub: price,
    description: orderDescription(input.plan, input.months),
    isTest: cfg.isTest,
    recurringConsent: recurring,
    recurringChargeOf: null,
    createdAt: now,
  });
  if (recurring) {
    // Историю согласий Робокасса требует хранить: когда дано и какой текст
    // человек видел. Отзыв — отдельная строка, старые не правятся.
    await deps.store.addConsent({
      companyId: ctx.companyId,
      userId: ctx.user.id,
      orderId: order.id,
      granted: true,
      statementText: recurringStatement(price, input.months),
      offerRevision: OFFER_REVISION,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      createdAt: now,
    });
  }
  const params = buildPaymentParams(cfg, {
    id: order.id,
    amountRub: price,
    description: order.description,
    email: order.email,
    isTest: order.isTest,
    recurring,
  });
  logger.info({ orderId: order.id, companyId: ctx.companyId, plan: input.plan, months: input.months, amountRub: price, recurring, isTest: order.isTest }, "[billing] заказ создан");
  return { status: 200, json: { invId: order.id, amountRub: price, params, paymentUrl: buildPaymentUrl(params) } };
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
 *     иначе следующее автосписание вернуло бы прежний тариф.
 */
export function decideSettlement(ctx: SettleContext, prices: readonly PlanPrice[], now: number): SettlePatch {
  const { order, company, billing } = ctx;
  if (!isPaidPlan(order.plan) || isLateCharge(ctx)) return { plan: null, billing: null };
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
      recurringAmountRub: order.amountRub,
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
  return { plan, billing: patch };
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
async function settleOrder(deps: BillingDeps, invId: number, raw: string, via: "result" | "check"): Promise<boolean> {
  const now = nowOf(deps);
  const prices = await deps.store.getPrices();
  const result = await deps.store.settle(invId, raw, now, (ctx) => decideSettlement(ctx, prices, now));
  if (!result.claimed) return false;
  logger.info({ invId, companyId: result.order.companyId, planUntil: result.patch.plan?.until ?? null, via }, "[billing] оплата получена");
  void afterPaid(deps, result.context, result.patch, via).catch((err) => logger.warn({ err, invId }, "[billing] уведомления об оплате не ушли"));
  return true;
}

async function afterPaid(deps: BillingDeps, ctx: SettleContext, patch: SettlePatch, via: "result" | "check" = "result"): Promise<void> {
  const { order, company, billing } = ctx;
  deps.notify.live(company.id);
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
  await deps.notify.admins(
    company.id,
    {
      title: automatic ? "Тариф продлён" : "Оплата получена",
      body: `${formatRub(order.amountRub)} · «${name}» ${untilText}`,
      paragraphs: [`Получили ${formatRub(order.amountRub)} за тариф «${name}» на ${periodLabel(order.months)}.`, ...lines],
    },
    [order.email],
  );
  await deps.notify.owner(
    `💳 Оплата ${formatRub(order.amountRub)} — «${company.name}» (#${company.id}), «${name}» на ${periodLabel(order.months)}` +
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
  const expired = await deps.store.expirePending(now - PENDING_TTL_SEC);
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

async function sendUpcomingNotice(deps: BillingDeps, row: DueRecurring, now: number): Promise<void> {
  const terms = seriesTerms(row);
  if (!terms || !row.planUntil) return;
  const day = formatDay(chargeAt(row.planUntil));
  await deps.notify.admins(row.companyId, {
    title: "Скоро продление тарифа",
    body: `${day} спишем ${formatRub(terms.amount)} за «${planName(terms.plan)}». Отключить — в «Тариф и оплата».`,
    paragraphs: [
      `Тариф «${planName(terms.plan)}» оплачен до ${formatDay(row.planUntil)}. ${day} спишем ${formatRub(terms.amount)} с карты, которой вы платили, и продлим тариф на ${periodLabel(terms.months)}.`,
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
  const order = await deps.store.createOrder({
    companyId: row.companyId,
    userId: null,
    email: parent.email,
    plan: terms.plan,
    months: terms.months,
    amountRub: terms.amount,
    description: `${orderDescription(terms.plan, terms.months)}, автопродление`,
    isTest: parent.isTest,
    recurringConsent: false,
    recurringChargeOf: parent.id,
    createdAt: now,
  });
  const result = await chargeRecurring(
    cfg,
    { invId: order.id, previousInvId: parent.id, amountRub: terms.amount, description: order.description, isTest: parent.isTest },
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
  await deps.store.expireOrder(order.id);
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
      if (order.status === "pending") await deps.store.expireOrder(order.id);
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
  if (order.status !== "pending" || order.isTest || now - order.createdAt < 60) return;
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

/** Деньги вернулись: заказ «возвращён», тариф откатывается, админам — уведомление. */
async function completeRefund(deps: BillingDeps, orderId: number): Promise<void> {
  const finished = await deps.store.finishRefund(orderId, nowOf(deps));
  if (!finished) return;
  const { order, rolledBack } = finished;
  const name = planName(order.plan);
  logger.info({ invId: order.id, companyId: order.companyId, rolledBack }, "[billing] возврат завершён");
  deps.notify.live(order.companyId);
  const company = await deps.getCompany(order.companyId);
  const planText = rolledBack
    ? isPaidPlan(rolledBack.plan) && (rolledBack.until === null || rolledBack.until > nowOf(deps))
      ? `Тариф «${planName(rolledBack.plan)}» действует ${rolledBack.until ? `до ${formatDay(rolledBack.until)}` : "бессрочно"}, как до этой оплаты.`
      : `Срок, оплаченный этим платежом, снят: кабинет на тарифе «${PLANS.start.name}».`
    : "Срок тарифа не меняли.";
  await deps.notify
    .admins(
      order.companyId,
      {
        title: "Деньги возвращены",
        body: `Вернули ${formatRub(order.amountRub)} за «${name}», заказ №${order.id}.`,
        paragraphs: [
          `Вернули ${formatRub(order.amountRub)} за тариф «${name}» на ${periodLabel(order.months)} (заказ №${order.id}). Деньги придут на карту, которой платили; срок зачисления зависит от банка.`,
          planText,
        ],
      },
      [order.email],
    )
    .catch((err) => logger.warn({ err, invId: order.id }, "[billing] уведомление о возврате не ушло"));
  await deps.notify.owner(
    `↩️ Возврат ${formatRub(order.amountRub)} завершён — «${company?.name ?? `#${order.companyId}`}», заказ №${order.id}. ` +
      (rolledBack
        ? "Тариф откачен к состоянию до оплаты."
        : "Тариф не откатывали: после оплаты он менялся или оплата старше снимка «до оплаты». Поправьте срок вручную, если нужно."),
  );
}

const rootOrder = async (deps: BillingDeps, id: number): Promise<RootBillingOrder | null> => {
  const row = await deps.store.getOrder(id);
  if (!row) return null;
  const company = await deps.getCompany(row.companyId);
  return { ...toBillingOrder(row), companyId: row.companyId, companyName: company?.name ?? null, email: row.email };
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

  const state = await opState(cfg, order.id, deps.fetch);
  if (!state.ok || state.resultCode !== OP_RESULT.ok || !state.opKey) {
    await deps.store.setRefund(order.id, { refundStatus: order.refundStatus });
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
  await deps.store.setRefund(order.id, { refundStatus: order.refundStatus });
  return { status: 502, json: { message: `Касса отклонила возврат: ${created.error}` } };
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
  const result = await reconcileOrder(deps, order);
  if (order.status === "pending") await deps.store.claimCheck(order.id, nowOf(deps), nowOf(deps)).catch(() => false);
  return { status: 200, json: { ...result, order: await rootOrder(deps, order.id) } };
}
