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
   * Сумма, которую человек видел на странице (уже со скидкой). Не сумма к
   * оплате, а сверка: если цена или промокод изменились, пока форма была
   * открыта, заказ не создаём.
   */
  expectedRub: z.number().int().optional(),
  /** Промокод. Скидку считает только сервер. */
  promoCode: z.string().trim().max(40).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Счёт для юрлица или ИП: тариф, срок, промокод. Без автопродления и почты для чека. */
export const invoiceSchema = checkoutSchema.pick({ plan: true, months: true, expectedRub: true, promoCode: true });
export type InvoiceInput = z.infer<typeof invoiceSchema>;

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
// .2 — промокоды, оплата по счёту, закрывающие документы (24.10.2026).
export const OFFER_REVISION = "2026-10-24.2";
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

export type OrderStatus = "pending" | "paid" | "expired" | "refunded" | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Не оплачен",
  refunded: "Возвращён",
  cancelled: "Отменён",
};

/** Как оплачен заказ: картой/СБП через кассу, по счёту или промокодом на всю сумму. */
export type PaymentMethod = "card" | "invoice" | "promo";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["card", "invoice", "promo"];

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
  method: PaymentMethod;
  /** Промокод заказа и скидка по нему, ₽. */
  promoCode: string | null;
  discountRub: number;
  /** Счёт: оплатить до (unix sec). */
  invoiceDueAt: number | null;
  /** Можно скачать счёт (PDF). */
  hasInvoice: boolean;
  /** Можно скачать закрывающий документ (УПД). */
  hasUpd: boolean;
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
  /** Реквизиты компании для счёта и УПД; null — не заполнены. */
  requisites: CompanyRequisites | null;
  /** Оплата по счёту открыта: реквизиты исполнителя заполнены. */
  invoiceAvailable: boolean;
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
  /** Реквизиты исполнителя для счетов и УПД (LEGAL_*): чего не хватает. */
  documents: { ready: boolean; missing: string[] };
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
  /** Промокод закрыл всю сумму: тариф уже включён, касса не нужна. */
  free?: boolean;
  order?: BillingOrder;
};

/** Ответ POST /api/billing/invoice. */
export type InvoiceResult = {
  order: BillingOrder;
  /** Счёт уже был выставлен на те же условия — вернули его. */
  existing: boolean;
  pdfUrl: string;
};

// --- Промокоды -------------------------------------------------------------------

export const PROMO_KINDS = ["percent", "fixed"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Код хранится и сравнивается в верхнем регистре без пробелов. */
export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidPromoCodeFormat(code: string): boolean {
  return /^[A-Z0-9_-]{3,32}$/.test(code);
}

/** Скидка в рублях: целая, не больше цены. */
export function promoDiscountRub(kind: PromoKind, value: number, priceRub: number): number {
  const base = Math.max(0, Math.round(priceRub));
  if (kind === "percent") return Math.min(base, Math.round((base * Math.min(100, Math.max(0, value))) / 100));
  return Math.min(base, Math.max(0, Math.round(value)));
}

/** «−20 %» или «−500 ₽». */
export function promoLabel(kind: PromoKind, value: number): string {
  return kind === "percent" ? `−${value} %` : `−${formatRub(value)}`;
}

const optionalTime = z.number().int().positive().nullable().optional();

export const promoCodeCreateSchema = z
  .object({
    code: z.string().trim().min(1, "Введите код").max(40),
    kind: z.enum(PROMO_KINDS),
    value: z.number().int().min(1, "Скидка — от 1").max(MAX_PRICE_RUB),
    startsAt: optionalTime,
    endsAt: optionalTime,
    maxUses: z.number().int().min(1, "Лимит — от 1").max(1_000_000).nullable().optional(),
    newClientsOnly: z.boolean().optional().default(false),
    /** Персональный код: только для этой компании. */
    companyId: z.number().int().positive().nullable().optional(),
    note: z.string().trim().max(255).optional(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "Процент — не больше 100", path: ["value"] })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, { message: "Конец раньше начала", path: ["endsAt"] });
export type PromoCodeCreate = z.infer<typeof promoCodeCreateSchema>;

/** Код и размер скидки не меняются: на них уже могли сослаться. */
export const promoCodePatchSchema = z.object({
  active: z.boolean().optional(),
  endsAt: optionalTime,
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  note: z.string().trim().max(255).optional(),
});

export type RootPromoCode = {
  id: number;
  code: string;
  kind: PromoKind;
  value: number;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
  maxUses: number | null;
  newClientsOnly: boolean;
  companyId: number | null;
  companyName: string | null;
  note: string | null;
  /** Оплаченных заказов с кодом. */
  paidUses: number;
  createdAt: number;
};

/** Ответ POST /api/billing/promo — что даст код на выбранный тариф и срок. */
export type PromoQuote =
  | { ok: true; code: string; label: string; baseRub: number; discountRub: number; amountRub: number }
  | { ok: false; message: string };

// --- Реквизиты компании (счёт и УПД) -----------------------------------------------

const onlyDigits = (v: string) => /^\d+$/.test(v);

/** ИНН: 10 цифр — организация, 12 — ИП (и физлицо); контрольные цифры по алгоритму ФНС. */
export function isValidInn(inn: string): boolean {
  if (!onlyDigits(inn)) return false;
  const d = inn.split("").map(Number);
  const check = (weights: number[]) => (weights.reduce((sum, w, i) => sum + w * d[i], 0) % 11) % 10;
  if (d.length === 10) return check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
  if (d.length === 12) {
    return check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
  }
  return false;
}

/** ОГРН — 13 цифр, ОГРНИП — 15; последняя — остаток от деления. */
export function isValidOgrn(ogrn: string): boolean {
  if (!onlyDigits(ogrn)) return false;
  // Остаток длинного числа — по цифрам: в Number 14 цифр без потерь не поместятся.
  const mod = (digits: string, m: number) => digits.split("").reduce((r, ch) => (r * 10 + Number(ch)) % m, 0);
  if (ogrn.length === 13) return mod(ogrn.slice(0, 12), 11) % 10 === Number(ogrn[12]);
  if (ogrn.length === 15) return mod(ogrn.slice(0, 14), 13) % 10 === Number(ogrn[14]);
  return false;
}

const cleanDigits = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ""));

export const requisitesSchema = z
  .object({
    /** org — организация, ip — индивидуальный предприниматель. */
    kind: z.enum(["org", "ip"]),
    name: z.string().trim().min(3, "Укажите название").max(255),
    inn: cleanDigits,
    kpp: cleanDigits.optional().transform((v) => v || null),
    ogrn: cleanDigits.optional().transform((v) => v || null),
    address: z.string().trim().min(10, "Укажите юридический адрес").max(500),
    headPost: z.string().trim().max(100).optional().transform((v) => v || null),
    headName: z.string().trim().max(150).optional().transform((v) => v || null),
    /** Куда присылать уведомления о счетах и документах. */
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Проверьте адрес почты"),
  })
  .superRefine((v, ctx) => {
    const innLength = v.kind === "org" ? 10 : 12;
    if (v.inn.length !== innLength || !isValidInn(v.inn)) {
      ctx.addIssue({ code: "custom", path: ["inn"], message: `ИНН ${v.kind === "org" ? "организации — 10" : "ИП — 12"} цифр, проверьте его` });
    }
    if (v.kind === "org" && (!v.kpp || !/^\d{9}$/.test(v.kpp))) ctx.addIssue({ code: "custom", path: ["kpp"], message: "КПП — 9 цифр" });
    if (v.ogrn && (v.ogrn.length !== (v.kind === "org" ? 13 : 15) || !isValidOgrn(v.ogrn))) {
      ctx.addIssue({ code: "custom", path: ["ogrn"], message: v.kind === "org" ? "ОГРН — 13 цифр, проверьте его" : "ОГРНИП — 15 цифр, проверьте его" });
    }
  })
  .transform((v) => ({ ...v, kpp: v.kind === "org" ? v.kpp : null }));
export type CompanyRequisites = z.infer<typeof requisitesSchema>;

/** Счёт действует столько дней; оплатить можно и позже — тогда root отметит оплату вручную. */
export const INVOICE_VALID_DAYS = 7;
