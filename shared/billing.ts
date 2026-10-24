/**
 * Оплата тарифов (Робокасса): цены, сроки, пересчёт срока при смене
 * тарифа, тексты согласия на автосписания и правило автопродления.
 * Модуль без серверных и браузерных зависимостей: им пользуются и форма
 * оплаты в кабинете, и сервер (server/billing), поэтому сумма и срок,
 * которые человек видит до оплаты, считаются той же функцией, что и после.
 */
import { z } from "zod";
import { PLANS, type PlanId } from "./plans";

export const PAID_PLAN_IDS = ["team", "business"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

/** На сколько месяцев можно оплатить тариф. */
export const BILLING_MONTHS = [1, 3, 6, 12] as const;
export type BillingMonths = (typeof BILLING_MONTHS)[number];

export type PlanPrice = { plan: PaidPlanId; months: BillingMonths; priceRub: number };

/**
 * Цены, пока root не задал свои (Root → Компании → Цены): как на лендинге,
 * «Команда» — 990 ₽ в месяц. «Бизнес» без цены — «по запросу», онлайн его
 * не купить, пока цену не добавят.
 */
export const DEFAULT_PRICES: readonly PlanPrice[] = [{ plan: "team", months: 1, priceRub: 990 }];

export const MAX_PRICE_RUB = 1_000_000;

export const priceSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  priceRub: z.number().int().min(1, "Цена — от 1 ₽").max(MAX_PRICE_RUB, "Слишком большая цена"),
});

export const pricesSchema = z
  .array(priceSchema)
  .max(PAID_PLAN_IDS.length * BILLING_MONTHS.length)
  .refine((list) => new Set(list.map((p) => `${p.plan}:${p.months}`)).size === list.length, "Один срок тарифа указан дважды");

export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
  /** Галочка автосписаний. Нет галочки — разовый платёж. */
  recurringConsent: z.boolean().optional().default(false),
  /** Куда Робокасса пришлёт чек. Пусто — спросит на странице оплаты. */
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Проверьте адрес почты"),
  /**
   * Сумма, которую человек видел на странице. Не сумма к оплате, а сверка:
   * если root поменял цену, пока форма была открыта, заказ не создаём.
   */
  expectedRub: z.number().int().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export function isPaidPlan(id: string | null | undefined): id is PaidPlanId {
  return (PAID_PLAN_IDS as readonly string[]).includes(id ?? "");
}

export function priceFor(prices: readonly PlanPrice[], plan: PaidPlanId, months: number): number | null {
  return prices.find((p) => p.plan === plan && p.months === months)?.priceRub ?? null;
}

/** Сроки тарифа, на которые есть цена, по возрастанию. */
export function monthsFor(prices: readonly PlanPrice[], plan: PaidPlanId): BillingMonths[] {
  return prices
    .filter((p) => p.plan === plan)
    .map((p) => p.months)
    .sort((a, b) => a - b);
}

/** Цена месяца: месячная, а если её нет — самая выгодная из длинных сроков. */
export function monthlyRate(prices: readonly PlanPrice[], plan: PaidPlanId): number | null {
  const monthly = priceFor(prices, plan, 1);
  if (monthly !== null) return monthly;
  const rates = prices.filter((p) => p.plan === plan).map((p) => p.priceRub / p.months);
  return rates.length ? Math.min(...rates) : null;
}

/**
 * +N календарных месяцев к моменту (unix sec). Число месяца сохраняется,
 * а если его нет (31 января + 1 месяц) — последний день месяца.
 */
export function addMonths(sec: number, months: number): number {
  const d = new Date(sec * 1000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return Math.floor(d.getTime() / 1000);
}

export type PlanChange = {
  /** До какого момента будет действовать оплаченный тариф. */
  until: number;
  /** Сколько секунд прежнего тарифа переносится в новый (после пересчёта по цене). */
  carriedSec: number;
  /** Прежний тариф с остатком срока, если он другой. */
  convertedFrom: PaidPlanId | null;
};

/**
 * Что даст оплата: новый срок тарифа.
 *
 *  • тот же тариф — новый период прибавляется к оставшемуся;
 *  • другой тариф — оставшиеся дни пересчитываются по цене месяца:
 *    10 дней «Команды» за 990 ₽ становятся 5 днями тарифа за 1 980 ₽,
 *    и наоборот. Деньги за неиспользованный срок не пропадают;
 *  • истёкший или бесплатный — период начинается сейчас.
 */
export function planAfterPayment(input: {
  currentPlan: PlanId;
  currentUntil: number | null;
  plan: PaidPlanId;
  months: number;
  now: number;
  prices: readonly PlanPrice[];
}): PlanChange {
  const { currentPlan, currentUntil, plan, months, now, prices } = input;
  const remaining = currentPlan !== "start" && currentUntil && currentUntil > now ? currentUntil - now : 0;
  let carriedSec = remaining;
  let convertedFrom: PaidPlanId | null = null;
  if (remaining > 0 && currentPlan !== plan && isPaidPlan(currentPlan)) {
    const oldRate = monthlyRate(prices, currentPlan);
    const newRate = monthlyRate(prices, plan);
    if (oldRate && newRate) carriedSec = Math.floor((remaining * oldRate) / newRate);
    convertedFrom = currentPlan;
  }
  return { until: addMonths(now + carriedSec, months), carriedSec, convertedFrom };
}

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** «1 месяц», «3 месяца», «12 месяцев». */
export function periodLabel(months: number): string {
  return `${months} ${pluralRu(months, "месяц", "месяца", "месяцев")}`;
}

/** «раз в месяц», «раз в 3 месяца», «раз в год». */
export function periodEvery(months: number): string {
  if (months === 1) return "раз в месяц";
  if (months === 12) return "раз в год";
  return `раз в ${periodLabel(months)}`;
}

export function daysLabel(days: number): string {
  return `${days} ${pluralRu(days, "день", "дня", "дней")}`;
}

/** «1 990 ₽». Неразрывные пробелы, чтобы сумма не переносилась. */
export function formatRub(rub: number): string {
  const digits = String(Math.round(rub)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${digits} ₽`;
}

/** Название заказа: оно же уходит в Робокассу (до 100 символов) и в чек. */
export function orderDescription(plan: PaidPlanId, months: number): string {
  return `TasksFlow, тариф «${PLANS[plan].name}» на ${periodLabel(months)}`;
}

/** Окно оплаты Робокассы поверх страницы (Robokassa.StartPayment). */
export const ROBOKASSA_IFRAME_SCRIPT_URL = "https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js";

// --- Оферта и согласие на автосписания --------------------------------------

export const OFFER_PATH = "/offer";
/** Редакция оферты — пишется в историю согласий вместе с текстом. */
export const OFFER_REVISION = "2026-10-24";
/** Раздел оферты об автопродлении (id заголовка «Автопродление»). */
export const RECURRING_OFFER_HREF = `${OFFER_PATH}#avtoprodlenie`;

/** За сколько дней предупреждаем о списании. */
export const RECURRING_NOTICE_DAYS = 3;
/** Сколько раз пытаемся списать, прежде чем выключить автопродление. */
export const RECURRING_MAX_ATTEMPTS = 3;

/**
 * Требования Робокассы к рекуррентным платежам: галочка не стоит по
 * умолчанию, рядом — текст согласия, ссылка на оферту и периодичность.
 * Тот же текст уходит в историю согласий: в споре нужно показать ровно то,
 * что человек видел.
 */
export const RECURRING_CONSENT_TEXT = "Я согласен на автоматические списания согласно условиям оферты";

export function recurringTerms(amountRub: number, months: number): string {
  return (
    `Спишем ${formatRub(amountRub)} ${periodEvery(months)} в последний день оплаченного срока. ` +
    `Предупредим за ${daysLabel(RECURRING_NOTICE_DAYS)}, отключить можно в любой момент в «Тариф и оплата».`
  );
}

export function recurringStatement(amountRub: number, months: number): string {
  return `${RECURRING_CONSENT_TEXT}. ${recurringTerms(amountRub, months)}`;
}

export type RecurringState = {
  active: boolean;
  /** Конец оплаченного срока — день списания. */
  until: number | null;
  attempts: number;
  lastAttemptAt: number | null;
  /** Для какого plan_until уже ушло предупреждение. */
  noticeFor: number | null;
};

export type RecurringAction = "none" | "notice" | "charge" | "give-up";

const DAY = 24 * 60 * 60;

/**
 * Когда списываем: за сутки до конца оплаченного срока, чтобы тариф не
 * прерывался, пока банк подтверждает платёж. Эту же дату показываем людям.
 */
export function chargeAt(until: number): number {
  return until - DAY;
}

/**
 * Что сделать с автопродлением компании сейчас:
 *   • за 3 дня до конца срока — предупредить о списании (один раз);
 *   • в последние сутки срока — списать; не прошло — повторить через сутки,
 *     всего RECURRING_MAX_ATTEMPTS раза;
 *   • все попытки не прошли — выключить автопродление.
 * Сутки между попытками нужны и затем, чтобы не списать второй раз, пока
 * уведомление об уже принятом платеже ещё в пути.
 */
export function recurringAction(state: RecurringState, now: number): RecurringAction {
  if (!state.active || !state.until) return "none";
  const waited = state.lastAttemptAt === null || now - state.lastAttemptAt >= DAY;
  if (now >= chargeAt(state.until)) {
    if (!waited) return "none";
    return state.attempts >= RECURRING_MAX_ATTEMPTS ? "give-up" : "charge";
  }
  if (now >= state.until - RECURRING_NOTICE_DAYS * DAY && state.noticeFor !== state.until) return "notice";
  return "none";
}

// --- Заказы ------------------------------------------------------------------

export type OrderStatus = "pending" | "paid" | "expired" | "refunded";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Не оплачен",
  refunded: "Возвращён",
};

/** Возврат через API Робокассы. */
export type RefundStatus = "sending" | "pending" | "uncertain" | "finished" | "canceled";

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  sending: "возврат отправляется",
  pending: "возврат в обработке",
  uncertain: "возврат: проверьте кассу",
  finished: "деньги возвращены",
  canceled: "возврат отменён",
};

/** Заказ в истории платежей кабинета. */
export type BillingOrder = {
  id: number;
  plan: PaidPlanId;
  months: number;
  amountRub: number;
  description: string;
  status: OrderStatus;
  isTest: boolean;
  /** Автосписание по подписке, а не оплата вручную. */
  automatic: boolean;
  createdAt: number;
  paidAt: number | null;
  /** До какого момента продлил тариф (после оплаты). */
  planUntil: number | null;
  refundStatus: RefundStatus | null;
};

/** Ответ GET /api/billing — всё для страницы «Тариф и оплата». */
export type BillingInfo = {
  /** Касса настроена: есть логин магазина и пароли. */
  configured: boolean;
  testMode: boolean;
  /** Магазину подключены рекуррентные платежи (ROBOKASSA_RECURRING=1). */
  recurringAvailable: boolean;
  plan: { id: PlanId; until: number | null; perpetual: boolean; usersCount: number };
  prices: PlanPrice[];
  recurring: {
    active: boolean;
    plan: PaidPlanId | null;
    months: number | null;
    amountRub: number | null;
    /** Когда спишем (chargeAt от конца срока). */
    nextChargeAt: number | null;
  };
  orders: BillingOrder[];
  /** Почта админа для чека, если есть. */
  email: string | null;
  now: number;
};

/** Заказ в списке root: с компанией и почтой плательщика. */
export type RootBillingOrder = BillingOrder & { companyId: number; companyName: string | null; email: string | null };

/** Сводка по оплате для root («Касса»). */
export type BillingStats = {
  /** Таблицы оплаты созданы (npm run add-billing). */
  tables: boolean;
  byStatus: Record<string, number>;
  lastPaidAt: number | null;
  activeSeries: number;
};

/** GET /api/root/billing/diagnostics — что задано в env и куда смотрит касса. Без значений секретов. */
export type BillingDiagnostics = {
  /** Задан ли параметр (true/false), а не его значение. */
  secrets: {
    login: boolean;
    password1: boolean;
    password2: boolean;
    testPassword1: boolean;
    testPassword2: boolean;
    password3: boolean;
  };
  testMode: boolean;
  /** Новые заказы можно оплатить: есть логин и пароли текущего режима. */
  configured: boolean;
  hash: string;
  recurring: boolean;
  receipt: boolean;
  sno: string | null;
  tax: string;
  /** Адреса для «Технических настроек» магазина. */
  urls: { result: string; success: string; fail: string };
  stats: BillingStats;
};

/** POST /api/root/billing/check — ответ кассы на проверочный запрос. */
export type BillingCheckResult = { ok: boolean; message: string };

/** Результат сверки заказа с кассой (OpStateExt). */
export type ReconcileStatus = "paid" | "already" | "waiting" | "not_found" | "cancelled" | "refunded" | "error";
export type ReconcileResult = { status: ReconcileStatus; message: string; order: RootBillingOrder | null };

/** POST /api/root/billing/orders/:id/refund. */
export type RefundResult = { message: string; order: RootBillingOrder | null };

/** Ответ POST /api/billing/checkout. */
export type CheckoutResult = {
  invId: number;
  amountRub: number;
  /** Параметры для Robokassa.StartPayment (оплата в окне поверх страницы). */
  params: Record<string, string>;
  /** Обычная страница оплаты — если окно Робокассы не загрузилось. */
  paymentUrl: string;
};
