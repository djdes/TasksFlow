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
  type BillingInfo,
  type BillingOrder,
  type CheckoutResult,
  type OrderStatus,
  type PlanPrice,
} from "@shared/billing";
import type { Company, PaymentOrderRow, User } from "@shared/schema";
import { logger } from "../logger";
import {
  buildPaymentParams,
  buildPaymentUrl,
  chargeRecurring,
  formatOutSum,
  isConfigured,
  verifyResultSignature,
  type RobokassaConfig,
} from "./robokassa";
import type { BillingStore, DueRecurring, SettleContext, SettlePatch } from "./store";

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
};

const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export function formatDay(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" });
}

const planName = (id: string) => (isPaidPlan(id) ? PLANS[id].name : id);

export function toBillingOrder(row: PaymentOrderRow): BillingOrder {
  const status: OrderStatus = row.status === "paid" || row.status === "expired" ? row.status : "pending";
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

  const now = nowOf(deps);
  const prices = await deps.store.getPrices();
  const raw = JSON.stringify(Object.fromEntries(Object.entries(params).filter(([k]) => k !== "SignatureValue")));
  const result = await deps.store.settle(invId, raw, now, (ctx) => decideSettlement(ctx, prices, now));
  if (!result.claimed) return ok(invIdRaw);

  logger.info({ invId, companyId: result.order.companyId, planUntil: result.patch.plan?.until ?? null }, "[billing] оплата получена");
  void afterPaid(deps, result.context, result.patch).catch((err) => logger.warn({ err, invId }, "[billing] уведомления об оплате не ушли"));
  return ok(invIdRaw);
}

async function afterPaid(deps: BillingDeps, ctx: SettleContext, patch: SettlePatch): Promise<void> {
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
        "Верните деньги в кабинете Робокассы (оферта: 10 рабочих дней).",
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
      `${patch.plan ? `, до ${formatDay(patch.plan.until)}` : ". Тариф бессрочный — срок не менялся, разберите вручную"}. Заказ №${order.id}`,
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

/** Раз в несколько минут: протухшие заказы, предупреждения и автосписания. */
export async function runBillingTick(deps: BillingDeps): Promise<void> {
  const now = nowOf(deps);
  const expired = await deps.store.expirePending(now - PENDING_TTL_SEC);
  if (expired > 0) logger.info({ expired }, "[billing] неоплаченные заказы закрыты");
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
  if (!cfg.login || !cfg.password1) {
    logger.warn({ companyId: row.companyId }, "[billing] касса не настроена — автосписание отложено");
    return;
  }
  const terms = seriesTerms(row);
  const parent = row.recurringParentOrderId ? await deps.store.getOrder(row.recurringParentOrderId) : null;
  if (!terms || !parent || parent.status !== "paid") return giveUp(deps, row, "нет оплаченного первого платежа серии");
  // Тестовые платежи карту не сохраняют: списывать нечего.
  if (parent.isTest) return giveUp(deps, row, "серия создана в тестовом режиме — автосписаний нет");

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
    isTest: false,
    recurringConsent: false,
    recurringChargeOf: parent.id,
    createdAt: now,
  });
  const result = await chargeRecurring(
    cfg,
    { invId: order.id, previousInvId: parent.id, amountRub: terms.amount, description: order.description },
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
        "Проверьте операцию в кабинете кассы; повтор — через сутки.",
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
