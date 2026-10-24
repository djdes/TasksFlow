/**
 * Оплата в MySQL: цены, заказы, согласия и автопродление компании.
 * Таблицы создаёт script/_add-billing.ts. Пока миграции нет, цены —
 * по умолчанию, история пустая, а оплата честно говорит, что недоступна.
 */
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, max, ne, or, sql } from "drizzle-orm";
import {
  balanceTransactions,
  billingPrices,
  closingDocuments,
  companies,
  companyBilling,
  companyDiscounts,
  companyRequisites,
  paymentConsents,
  paymentOrders,
  pricePromotions,
  promoCodes,
  type BalanceTransactionRow,
  type ClosingDocumentRow,
  type CompanyBillingRow,
  type CompanyDiscountRow,
  type CompanyRequisitesRow,
  type PaymentOrderRow,
  type PricePromotionRow,
  type PromoCodeRow,
} from "@shared/schema";
import {
  DEFAULT_PRICES,
  isPaidPlan,
  type BillingMonths,
  type BillingStats,
  type CompanyRequisites,
  type PlanPrice,
  type PricePromotion,
  type RootBalance,
} from "@shared/billing";
import { db } from "../db";
import { logger } from "../logger";
import {
  refundLedger,
  releaseEntry,
  settleLedger,
  spendEntry,
  topupRefundBackEntry,
  topupRefundHoldEntry,
  type LedgerEntry,
} from "./ledger";

export type NewOrder = {
  companyId: number;
  userId: number | null;
  email: string | null;
  plan: string;
  months: number;
  amountRub: number;
  description: string;
  isTest: boolean;
  recurringConsent: boolean;
  recurringChargeOf: number | null;
  createdAt: number;
  /** По умолчанию card. */
  paymentMethod?: string;
  baseRub?: number | null;
  discountRub?: number;
  promoCode?: string | null;
  invoiceDueAt?: number | null;
  /** По умолчанию plan. */
  orderKind?: string;
  promotionId?: number | null;
  promotionPercent?: number | null;
  promotionDiscountRub?: number;
  discountSource?: string | null;
  /** Баллы, которые заказ занимает (списываются при создании). */
  pointsRub?: number;
};

export type NewPromoCode = Omit<PromoCodeRow, "id">;
export type NewPromotion = Omit<PricePromotionRow, "id">;

/**
 * Заказ с промокодом: лимиты проверяются в той же транзакции, что и вставка
 * заказа, под блокировкой строки кода. «Занятые» использования — оплаченные
 * заказы, неоплаченные счета и заказы, ждущие оплаты с reservedSince.
 */
export type PromoReservation = { code: string; companyId: number; free: boolean; reservedSince: number };
export type PlaceOrderResult =
  | { ok: true; order: PaymentOrderRow }
  | { ok: false; reason: "gone" | "exhausted" | "used" | "newClientsOnly" | "balance" };
export type PromotionListRow = PricePromotionRow & { paidOrders: number };
export type CompanyDiscountListRow = CompanyDiscountRow & { companyName: string | null };
/** Заказ с занятыми баллами, которые новый заказ может забрать: только оплата картой (окно кассы могли бросить). */
const releasable = (companyId: number) =>
  and(eq(paymentOrders.companyId, companyId), eq(paymentOrders.status, "pending"), eq(paymentOrders.pointsState, "held"), eq(paymentOrders.paymentMethod, "card"));
export type LedgerResult = { ok: true; balanceRub: number } | { ok: false; reason: "insufficient" | "duplicate" };
export type PromoCodeListRow = PromoCodeRow & { paidUses: number; companyName: string | null };
export type NewClosingDocument = Omit<ClosingDocumentRow, "id">;

export type NewConsent = {
  companyId: number;
  userId: number | null;
  orderId: number | null;
  granted: boolean;
  statementText: string;
  offerRevision: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
};

export type CompanyPlanRow = { id: number; name: string; plan: string | null; planUntil: number | null };

/** promo — правило кода заказа (если скидка по введённому коду): нужно, чтобы закрепить постоянную скидку. */
export type SettleContext = { order: PaymentOrderRow; company: CompanyPlanRow; billing: CompanyBillingRow | null; promo: PromoCodeRow | null };

/** Постоянная скидка, которую даёт оплата с «постоянным» кодом. */
export type LifetimeBind = Pick<CompanyDiscountRow, "promoCodeId" | "code" | "kind" | "value" | "expiresAt">;

/** Что записать по оплаченному заказу (решает server/billing/service.ts). */
export type SettlePatch = {
  /** null — тариф не трогать (например, он подключён бессрочно). */
  plan: { id: string; until: number } | null;
  /** null — автопродление не трогать. */
  billing: Partial<Omit<CompanyBillingRow, "companyId" | "balanceRub">> | null;
  /** Закрепить постоянную скидку компании. */
  lifetime?: LifetimeBind | null;
};

/** Баллы при оплате: сколько начислено или списано и не было ли недостачи. */
export type SettlePoints = { postedRub: number; short: boolean };

export type SettleResult =
  | { claimed: false; order: PaymentOrderRow | null }
  | { claimed: true; order: PaymentOrderRow; context: SettleContext; patch: SettlePatch; points: SettlePoints };

export type DueRecurring = CompanyBillingRow & { companyName: string; plan: string | null; planUntil: number | null };

/** Ярус сверки: заказы не старше createdAfter, не проверявшиеся с checkedBefore. */
export type CheckTier = { createdAfter: number; checkedBefore: number };

/** Оплаченный онлайн тариф без автопродления, срок которого скоро кончится или кончился. */
export type ExpiringPlan = {
  companyId: number;
  companyName: string;
  plan: string;
  planUntil: number;
  expiryNoticeFor: number | null;
  expiredNoticeFor: number | null;
};

/**
 * Что вернули при возврате: тариф и срок до оплаты (если оплата была
 * последней) и баллы (+ вернулись за заказ, − списаны за пополнение;
 * short — сколько пополнения уже потрачено и не списалось).
 */
export type RefundFinish = {
  order: PaymentOrderRow;
  rolledBack: { plan: string | null; until: number | null } | null;
  points: { postedRub: number; short: number };
  /** Снята постоянная скидка, которую дала эта оплата. */
  discountRevoked: boolean;
};

export interface BillingStore {
  getPrices(): Promise<PlanPrice[]>;
  setPrices(prices: PlanPrice[], now: number): Promise<void>;
  createOrder(order: NewOrder): Promise<PaymentOrderRow>;
  /**
   * Заказ из кабинета — одной транзакцией: резерв промокода (если есть);
   * если заказ платит баллами — баллы брошенных оплат картой назад и баллы
   * этого заказа списать (не хватает — reason "balance", заказа нет).
   */
  placeOrder(order: NewOrder, reservation: PromoReservation | null): Promise<PlaceOrderResult>;
  getOrder(id: number): Promise<PaymentOrderRow | null>;
  listOrders(companyId: number, limit: number): Promise<PaymentOrderRow[]>;
  listRecentOrders(limit: number): Promise<Array<PaymentOrderRow & { companyName: string | null }>>;
  /**
   * Атомарно: заказ pending/expired → paid и продление тарифа. Повторное
   * уведомление по уже оплаченному (или возвращённому) заказу вернёт claimed=false.
   */
  settle(orderId: number, raw: string, now: number, decide: (ctx: SettleContext) => SettlePatch): Promise<SettleResult>;
  /** Не принятое кассой автосписание или отменённая операция — «не оплачен»; баллы заказа — назад. */
  expireOrder(id: number, now: number): Promise<void>;
  expirePending(createdBefore: number, now: number): Promise<number>;
  addConsent(consent: NewConsent): Promise<void>;
  getCompanyBilling(companyId: number): Promise<CompanyBillingRow | null>;
  /** Выключить автопродление. true — было включено. */
  disableRecurring(companyId: number, now: number): Promise<boolean>;
  listDueRecurring(planUntilBefore: number): Promise<DueRecurring[]>;
  /**
   * Занять попытку автосписания: +1 попытка и время, только если серия
   * включена, попыток меньше maxAttempts и прошлая была больше суток назад.
   * false — попытку уже занял другой процесс или тик.
   */
  claimAttempt(companyId: number, now: number, maxAttempts: number): Promise<boolean>;
  setNoticeFor(companyId: number, until: number, now: number): Promise<void>;
  /**
   * Неоплаченные боевые заказы, которым пора к сверке (OpStateExt): заказ
   * подходит, если подходит хоть под один ярус — создан не раньше
   * createdAfter и не проверялся с checkedBefore. Свежие — первыми.
   */
  listPendingForCheck(opts: { tiers: CheckTier[]; createdBefore: number; limit: number }): Promise<PaymentOrderRow[]>;
  /**
   * Занять сверку заказа: checked_at = now, если заказ ждёт оплаты и его не
   * проверяли с checkedBefore. false — проверяет другой процесс или опрос.
   */
  claimCheck(id: number, now: number, checkedBefore: number): Promise<boolean>;
  /**
   * Занять возврат: оплачен, возврата нет или он отменён (с allowUncertain —
   * и «без ответа кассы») → «отправляется». false — уже занят.
   */
  claimRefund(id: number, now: number, opts?: { allowUncertain?: boolean }): Promise<boolean>;
  setRefund(id: number, patch: { refundStatus: string | null; refundRequestId?: string | null }): Promise<void>;
  /**
   * Возвраты «в обработке», «без ответа кассы» и зависшие «отправляется»
   * (начаты до staleSendingBefore) — их статус спрашиваем у кассы. Давно
   * не проверенные — первыми.
   */
  listRefundsInProgress(staleSendingBefore: number, limit: number): Promise<PaymentOrderRow[]>;
  /** Отметить, что кассу о заказе спросили (очередь опроса возвратов). */
  markChecked(id: number, now: number): Promise<void>;
  /**
   * Возврат прошёл: заказ «возвращён», и если эта оплата была последней
   * (срок компании равен её plan_until_after) — тариф и срок как до оплаты
   * (а если тот срок дала оплата, которую тоже вернули, — как до неё).
   * Одна транзакция. null — заказ не в обработке возврата.
   */
  finishRefund(id: number, now: number): Promise<RefundFinish | null>;
  /** Тарифы без автопродления, оплаченные онлайн (срок — от оплаты), со сроком в [fromUntil, toUntil]. */
  listExpiringPlans(fromUntil: number, toUntil: number): Promise<ExpiringPlan[]>;
  /** Занять напоминание о сроке until. false — уже отправлено (другим процессом). */
  claimExpiryNotice(companyId: number, kind: "expiry" | "expired", until: number, now: number): Promise<boolean>;
  stats(): Promise<BillingStats>;

  getPromo(code: string): Promise<PromoCodeRow | null>;
  listPromos(): Promise<PromoCodeListRow[]>;
  /** null — такой код уже есть. */
  createPromo(row: NewPromoCode): Promise<PromoCodeRow | null>;
  updatePromo(id: number, patch: Partial<Pick<PromoCodeRow, "active" | "endsAt" | "maxUses" | "note">>, now: number): Promise<PromoCodeRow | null>;
  /** Оплаченных заказов с этим кодом. */
  promoPaidUses(code: string): Promise<number>;
  /** Компания уже оплатила заказ с этим кодом. */
  promoPaidByCompany(code: string, companyId: number): Promise<boolean>;
  hasPaidOrders(companyId: number): Promise<boolean>;

  getRequisites(companyId: number): Promise<CompanyRequisitesRow | null>;
  saveRequisites(companyId: number, requisites: CompanyRequisites, now: number): Promise<void>;

  /** Неоплаченные (ждут оплаты) счета компании, новые первыми. */
  listOpenInvoices(companyId: number): Promise<PaymentOrderRow[]>;
  /** Ждёт оплаты → отменён. false — уже оплачен или отменён. */
  cancelInvoice(id: number): Promise<boolean>;

  getClosingDocument(orderId: number): Promise<ClosingDocumentRow | null>;
  /** Документ уже есть (гонка двух скачиваний) — вернёт существующий. */
  insertClosingDocument(doc: NewClosingDocument): Promise<ClosingDocumentRow>;
  setClosingBuyer(orderId: number, buyer: string): Promise<void>;
  voidClosingDocument(orderId: number, now: number): Promise<void>;

  /** Включённые акции, которые ещё не кончились (выбор — pickPromotion). */
  activePromotions(): Promise<PricePromotion[]>;
  listPromotions(): Promise<PromotionListRow[]>;
  getPromotion(id: number): Promise<PromotionListRow | null>;
  createPromotion(row: NewPromotion): Promise<PricePromotionRow>;
  updatePromotion(id: number, patch: Partial<Pick<PricePromotionRow, "active" | "endsAt" | "note">>, now: number): Promise<PricePromotionRow | null>;

  /** Постоянные скидки компании — все, и снятые (что действует, решает сервис). */
  getCompanyDiscounts(companyId: number): Promise<CompanyDiscountRow[]>;
  listCompanyDiscounts(): Promise<CompanyDiscountListRow[]>;
  /** Снять постоянную скидку по id строки. null — её нет или уже снята. */
  revokeCompanyDiscount(id: number, now: number, by: number | null): Promise<CompanyDiscountRow | null>;

  getBalance(companyId: number): Promise<number>;
  /** Баллы, которые держат брошенные оплаты картой (их освободит новый заказ с баллами). */
  getPointsHeld(companyId: number): Promise<number>;
  listBalanceEntries(companyId: number, limit: number): Promise<BalanceTransactionRow[]>;
  listBalances(limit: number): Promise<RootBalance[]>;
  /** Провести операцию баланса (корректировка root): в минус не уходит. */
  postLedger(entry: LedgerEntry, now: number): Promise<LedgerResult>;
  /**
   * Возврат пополнения: сначала сумма списывается с баланса (её уже могли
   * потратить — тогда возврат нельзя). reason state — не пополнение или уже возвращается.
   */
  holdTopupRefund(orderId: number, now: number): Promise<{ ok: true } | { ok: false; reason: "state" | "balance"; balanceRub?: number }>;
  /** Касса возврат не сделала — сумма снова на балансе. */
  releaseTopupRefund(orderId: number, now: number): Promise<void>;
}

let warnedMissingTable = false;

export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "ER_NO_SUCH_TABLE";
}

async function guard<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      logger.warn("[billing] нет таблиц оплаты — запустите npm run add-billing");
    }
    return fallback;
  }
}

const isMonths = (n: number): n is BillingMonths => n === 1 || n === 3 || n === 6 || n === 12;
const DAY_SEC = 24 * 60 * 60;

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header
    ? Number((header as { affectedRows: number }).affectedRows)
    : 0;
}

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number }).insertId);
}

/** Цены и акции живут несколько секунд в памяти: их читают лендинг и каждая страница оплаты. */
const PRICES_TTL_MS = 30_000;
let pricesCache: { at: number; prices: PlanPrice[] } | null = null;
let promotionsCache: { at: number; list: PricePromotion[] } | null = null;

export function resetPricesCache(): void {
  pricesCache = null;
  promotionsCache = null;
}

/** Использование промокода: заказ с постоянной скидкой код не тратит. */
const codeUse = () => or(isNull(paymentOrders.discountSource), ne(paymentOrders.discountSource, "lifetime"));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Строка баланса компании под блокировкой (создаётся, если её нет): остаток. */
async function lockBalance(tx: Tx, companyId: number, now: number): Promise<number> {
  await tx.insert(companyBilling).values({ companyId, updatedAt: now }).onDuplicateKeyUpdate({ set: { companyId } });
  const [row] = await tx.select({ balance: companyBilling.balanceRub }).from(companyBilling).where(eq(companyBilling.companyId, companyId)).for("update");
  return row?.balance ?? 0;
}

/**
 * Провести операцию баланса в транзакции: под блокировкой строки баланса,
 * без минуса, с ключом повтора. Все изменения balance_rub — только здесь.
 */
async function post(tx: Tx, e: LedgerEntry, now: number): Promise<LedgerResult> {
  const balance = await lockBalance(tx, e.companyId, now);
  if (e.dedupeKey) {
    const [dup] = await tx.select({ id: balanceTransactions.id }).from(balanceTransactions).where(eq(balanceTransactions.dedupeKey, e.dedupeKey)).limit(1);
    if (dup) return { ok: false, reason: "duplicate" };
  }
  const after = balance + e.amountRub;
  if (after < 0) return { ok: false, reason: "insufficient" };
  await tx.update(companyBilling).set({ balanceRub: after, updatedAt: now }).where(eq(companyBilling.companyId, e.companyId));
  await tx.insert(balanceTransactions).values({ ...e, balanceAfter: after, createdAt: now });
  return { ok: true, balanceRub: after };
}

/** Баллы заказа (строка уже под блокировкой) — назад на баланс, заказ «released». */
async function releaseHeld(tx: Tx, order: PaymentOrderRow, now: number): Promise<void> {
  const back = releaseEntry(order);
  if (!back) return;
  // duplicate — баллы уже вернули раньше: состояние всё равно «released».
  await post(tx, back, now);
  await tx.update(paymentOrders).set({ pointsState: "released" }).where(eq(paymentOrders.id, order.id));
}

/** Заказ не оплачен: статус и баллы назад — одной транзакцией. */
async function expireOne(id: number, status: "expired" | "cancelled", now: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, id)).for("update");
    if (!order || order.status !== "pending") return false;
    await tx.update(paymentOrders).set({ status }).where(eq(paymentOrders.id, id));
    await releaseHeld(tx, order, now);
    return true;
  });
}

export const billingStore: BillingStore = {
  async getPrices() {
    if (pricesCache && Date.now() - pricesCache.at < PRICES_TTL_MS) return pricesCache.prices;
    const rows = await guard(null, () => db.select().from(billingPrices));
    const prices = rows
      ? rows
          .filter((r) => isPaidPlan(r.plan) && isMonths(r.months) && r.priceRub > 0)
          .map((r) => ({ plan: r.plan as PlanPrice["plan"], months: r.months as BillingMonths, priceRub: r.priceRub }))
      : DEFAULT_PRICES.map((p) => ({ ...p }));
    pricesCache = { at: Date.now(), prices };
    return prices;
  },

  async setPrices(prices, now) {
    await db.transaction(async (tx) => {
      await tx.delete(billingPrices);
      if (prices.length) {
        await tx.insert(billingPrices).values(prices.map((p) => ({ plan: p.plan, months: p.months, priceRub: p.priceRub, updatedAt: now })));
      }
    });
    resetPricesCache();
  },

  async createOrder(order) {
    const result = await db.insert(paymentOrders).values({ ...order, status: "pending" });
    const [row] = await db.select().from(paymentOrders).where(eq(paymentOrders.id, insertId(result)));
    if (!row) throw new Error("payment order was not created");
    return row;
  },

  async placeOrder(order, r) {
    return db.transaction(async (tx) => {
      if (r) {
        const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.code, r.code)).for("update");
        if (!promo || !promo.active) return { ok: false as const, reason: "gone" as const };
        const held = or(
          eq(paymentOrders.status, "paid"),
          and(eq(paymentOrders.status, "pending"), or(eq(paymentOrders.paymentMethod, "invoice"), gte(paymentOrders.createdAt, r.reservedSince))),
        );
        if (promo.maxUses !== null) {
          const [row] = await tx.select({ n: count() }).from(paymentOrders).where(and(eq(paymentOrders.promoCode, r.code), codeUse(), held));
          if (Number(row?.n ?? 0) >= promo.maxUses) return { ok: false as const, reason: "exhausted" as const };
        }
        // Один код — одна оплата компании. Код на всю сумму засчитывается
        // сразу, поэтому ждущий заказ с ним — это параллельный запрос.
        const [mine] = await tx
          .select({ id: paymentOrders.id })
          .from(paymentOrders)
          .where(and(eq(paymentOrders.promoCode, r.code), codeUse(), eq(paymentOrders.companyId, r.companyId), r.free ? held : eq(paymentOrders.status, "paid")))
          .limit(1);
        if (mine) return { ok: false as const, reason: "used" as const };
        if (promo.newClientsOnly) {
          const [paid] = await tx
            .select({ id: paymentOrders.id })
            .from(paymentOrders)
            .where(and(eq(paymentOrders.companyId, r.companyId), eq(paymentOrders.orderKind, "plan"), inArray(paymentOrders.status, ["paid", "refunded"])))
            .limit(1);
          if (paid) return { ok: false as const, reason: "newClientsOnly" as const };
        }
      }
      const points = Math.max(0, order.pointsRub ?? 0);
      // Новый заказ с баллами заменяет брошенную оплату картой — её баллы
      // назад. Сам заказ ждёт дальше: если его всё же оплатят, баллы спишутся
      // снова. Заказы без баллов (пополнение, счёт) чужие баллы не трогают.
      // Блокировки — как в settle: сначала строки заказов (по ключу, без
      // блокировки диапазона — она давала бы взаимоблокировки на вставке),
      // потом строка баланса.
      const candidates = points > 0 ? await tx.select({ id: paymentOrders.id }).from(paymentOrders).where(releasable(order.companyId)) : [];
      const abandoned: PaymentOrderRow[] = [];
      for (const { id: oldId } of candidates) {
        const [old] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, oldId)).for("update");
        if (old && old.status === "pending" && old.pointsState === "held") abandoned.push(old);
      }
      if (points > 0) {
        // Хватит ли с баллами брошенных заказов — проверяем до того, как их
        // трогать: не хватит — брошенный заказ остаётся как был.
        const available = (await lockBalance(tx, order.companyId, order.createdAt)) + abandoned.reduce((sum, o) => sum + o.pointsRub, 0);
        if (available < points) return { ok: false as const, reason: "balance" as const };
      }
      for (const old of abandoned) await releaseHeld(tx, old, order.createdAt);
      const result = await tx.insert(paymentOrders).values({ ...order, pointsRub: points, pointsState: points > 0 ? "held" : null, status: "pending" });
      const id = insertId(result);
      if (points > 0) {
        const posted = await post(tx, spendEntry({ id, companyId: order.companyId, plan: order.plan, months: order.months, pointsRub: points }), order.createdAt);
        if (!posted.ok) throw new Error(`points were not held: ${posted.reason}`);
      }
      const [row] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, id));
      if (!row) throw new Error("payment order was not created");
      return { ok: true as const, order: row };
    });
  },

  async getOrder(id) {
    const [row] = await guard([] as PaymentOrderRow[], () => db.select().from(paymentOrders).where(eq(paymentOrders.id, id)));
    return row ?? null;
  },

  async listOrders(companyId, limit) {
    return guard([], () =>
      db.select().from(paymentOrders).where(eq(paymentOrders.companyId, companyId)).orderBy(desc(paymentOrders.id)).limit(limit),
    );
  },

  async listRecentOrders(limit) {
    const rows = await guard([], () => db.select().from(paymentOrders).orderBy(desc(paymentOrders.id)).limit(limit));
    const ids = Array.from(new Set(rows.map((r) => r.companyId)));
    const names = ids.length
      ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids))
      : [];
    const byId = new Map(names.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, companyName: byId.get(r.companyId) ?? null }));
  },

  async settle(orderId, raw, now, decide) {
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).for("update");
      // Засчитываем только ждущий, просроченный или отменённый (счёт оплатили
      // после отмены) заказ: оплаченный и возвращённый повторное уведомление
      // или сверка не трогают.
      if (!order || !["pending", "expired", "cancelled"].includes(order.status)) return { claimed: false as const, order: order ?? null };
      const [company] = await tx
        .select({ id: companies.id, name: companies.name, plan: companies.plan, planUntil: companies.planUntil })
        .from(companies)
        .where(eq(companies.id, order.companyId))
        .for("update");
      if (!company) return { claimed: false as const, order };
      const [billing] = await tx.select().from(companyBilling).where(eq(companyBilling.companyId, company.id)).for("update");
      // Правило кода — чтобы закрепить постоянную скидку (если код такой).
      const [promo] =
        order.promoCode && order.discountSource !== "lifetime" ? await tx.select().from(promoCodes).where(eq(promoCodes.code, order.promoCode)) : [];
      const context: SettleContext = { order, company, billing: billing ?? null, promo: promo ?? null };
      const patch = decide(context);

      // "" — тарифа не было: отличаем от NULL у оплат до этой колонки.
      const before = patch.plan ? { planBefore: company.plan ?? "", planUntilBefore: company.planUntil } : {};
      await tx
        .update(paymentOrders)
        .set({ status: "paid", paidAt: now, rawResult: raw.slice(0, 4000), planUntilAfter: patch.plan?.until ?? null, ...before })
        .where(eq(paymentOrders.id, order.id));
      if (patch.plan) {
        await tx.update(companies).set({ plan: patch.plan.id, planUntil: patch.plan.until }).where(eq(companies.id, company.id));
      }
      if (patch.billing) {
        await tx
          .insert(companyBilling)
          .values({ companyId: company.id, ...patch.billing, updatedAt: now })
          .onDuplicateKeyUpdate({ set: { ...patch.billing, updatedAt: now } });
      }
      if (patch.lifetime) {
        // По строке на код: прежние постоянные скидки остаются, действует выгоднейшая.
        const bind = { ...patch.lifetime, orderId: order.id, boundAt: now, revokedAt: null, revokedBy: null, updatedAt: now };
        await tx.insert(companyDiscounts).values({ companyId: company.id, ...bind }).onDuplicateKeyUpdate({ set: bind });
      }
      // Баллы: пополнение — начислить; заказ, чьи баллы уже вернулись, — списать снова.
      const ledger = settleLedger(order, order.pointsState === "released" ? await lockBalance(tx, company.id, now) : 0);
      let postedRub = 0;
      if (ledger.entry) {
        const posted = await post(tx, ledger.entry, now);
        if (posted.ok) postedRub = ledger.entry.amountRub;
      }
      if (ledger.pointsState) await tx.update(paymentOrders).set({ pointsState: ledger.pointsState }).where(eq(paymentOrders.id, order.id));
      const paid: PaymentOrderRow = { ...order, status: "paid", paidAt: now, planUntilAfter: patch.plan?.until ?? null, ...before, pointsState: ledger.pointsState ?? order.pointsState };
      return { claimed: true as const, order: paid, context, patch, points: { postedRub, short: ledger.short } };
    });
  },

  async expireOrder(id, now) {
    await expireOne(id, "expired", now);
  },

  async expirePending(createdBefore, now) {
    return guard(0, async () => {
      // Счёт живёт дольше кассовой ссылки: его закрывает root или новый счёт.
      // Заказ «баллами» ждёт, только если сбой случился между заказом и
      // зачётом, — его баллы тоже должны вернуться.
      const stale = and(eq(paymentOrders.status, "pending"), inArray(paymentOrders.paymentMethod, ["card", "balance"]), lte(paymentOrders.createdAt, createdBefore));
      // С баллами — по одному: баллы назад в той же транзакции.
      const holding = await db.select({ id: paymentOrders.id }).from(paymentOrders).where(and(stale, eq(paymentOrders.pointsState, "held"))).limit(500);
      let n = 0;
      for (const { id } of holding) if (await expireOne(id, "expired", now)) n++;
      // Остальные — одним запросом; заказы с занятыми баллами — только через expireOne, иначе баллы не вернутся.
      const withoutPoints = or(isNull(paymentOrders.pointsState), ne(paymentOrders.pointsState, "held"));
      return n + affected(await db.update(paymentOrders).set({ status: "expired" }).where(and(stale, withoutPoints)));
    });
  },

  async addConsent(consent) {
    await db.insert(paymentConsents).values({
      ...consent,
      ip: consent.ip?.slice(0, 64) ?? null,
      userAgent: consent.userAgent?.slice(0, 255) ?? null,
    });
  },

  async getCompanyBilling(companyId) {
    const [row] = await guard([] as CompanyBillingRow[], () =>
      db.select().from(companyBilling).where(eq(companyBilling.companyId, companyId)),
    );
    return row ?? null;
  },

  async disableRecurring(companyId, now) {
    const result = await guard(null, () =>
      db
        .update(companyBilling)
        .set({ recurringActive: false, recurringDisabledAt: now, recurringAttempts: 0, updatedAt: now })
        .where(and(eq(companyBilling.companyId, companyId), eq(companyBilling.recurringActive, true))),
    );
    return result !== null && affected(result) > 0;
  },

  async listDueRecurring(planUntilBefore) {
    return guard([], async () => {
      const rows = await db
        .select({ billing: companyBilling, companyName: companies.name, plan: companies.plan, planUntil: companies.planUntil })
        .from(companyBilling)
        .innerJoin(companies, eq(companies.id, companyBilling.companyId))
        .where(and(eq(companyBilling.recurringActive, true), isNotNull(companies.planUntil), lte(companies.planUntil, planUntilBefore)))
        .limit(500);
      return rows.map((r) => ({ ...r.billing, companyName: r.companyName, plan: r.plan, planUntil: r.planUntil }));
    });
  },

  async claimAttempt(companyId, now, maxAttempts) {
    const result = await db
      .update(companyBilling)
      .set({ recurringAttempts: sql`${companyBilling.recurringAttempts} + 1`, recurringLastAttemptAt: now, updatedAt: now })
      .where(
        and(
          eq(companyBilling.companyId, companyId),
          eq(companyBilling.recurringActive, true),
          lt(companyBilling.recurringAttempts, maxAttempts),
          or(isNull(companyBilling.recurringLastAttemptAt), lte(companyBilling.recurringLastAttemptAt, now - DAY_SEC)),
        ),
      );
    return affected(result) === 1;
  },

  async setNoticeFor(companyId, until, now) {
    await db.update(companyBilling).set({ recurringNoticeFor: until, updatedAt: now }).where(eq(companyBilling.companyId, companyId));
  },

  async listPendingForCheck({ tiers, createdBefore, limit }) {
    if (!tiers.length) return [];
    return guard([], () =>
      db
        .select()
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.status, "pending"),
            eq(paymentOrders.isTest, false),
            eq(paymentOrders.paymentMethod, "card"),
            lte(paymentOrders.createdAt, createdBefore),
            or(
              ...tiers.map((t) =>
                and(gte(paymentOrders.createdAt, t.createdAfter), or(isNull(paymentOrders.checkedAt), lte(paymentOrders.checkedAt, t.checkedBefore))),
              ),
            ),
          ),
        )
        .orderBy(desc(paymentOrders.createdAt))
        .limit(limit),
    );
  },

  async claimCheck(id, now, checkedBefore) {
    const result = await db
      .update(paymentOrders)
      .set({ checkedAt: now })
      .where(
        and(
          eq(paymentOrders.id, id),
          eq(paymentOrders.status, "pending"),
          or(isNull(paymentOrders.checkedAt), lte(paymentOrders.checkedAt, checkedBefore)),
        ),
      );
    return affected(result) === 1;
  },

  async claimRefund(id, now, opts = {}) {
    // После отменённого кассой возврата можно отправить новый; после
    // «без ответа кассы» — только если root подтвердил, что проверил кабинет.
    const allowed = opts.allowUncertain ? ["canceled", "uncertain"] : ["canceled"];
    const result = await db
      .update(paymentOrders)
      .set({ refundStatus: "sending", refundRequestId: null, refundRequestedAt: now })
      .where(
        and(
          eq(paymentOrders.id, id),
          eq(paymentOrders.status, "paid"),
          or(isNull(paymentOrders.refundStatus), inArray(paymentOrders.refundStatus, allowed)),
        ),
      );
    return affected(result) === 1;
  },

  async setRefund(id, patch) {
    await db
      .update(paymentOrders)
      .set({ refundStatus: patch.refundStatus, ...(patch.refundRequestId !== undefined ? { refundRequestId: patch.refundRequestId } : {}) })
      .where(eq(paymentOrders.id, id));
  },

  async listRefundsInProgress(staleSendingBefore, limit) {
    return guard([], () =>
      db
        .select()
        .from(paymentOrders)
        .where(
          and(
            eq(paymentOrders.status, "paid"),
            or(
              inArray(paymentOrders.refundStatus, ["pending", "uncertain"]),
              and(eq(paymentOrders.refundStatus, "sending"), lte(paymentOrders.refundRequestedAt, staleSendingBefore)),
            ),
          ),
        )
        .orderBy(asc(paymentOrders.checkedAt))
        .limit(limit),
    );
  },

  async markChecked(id, now) {
    await db.update(paymentOrders).set({ checkedAt: now }).where(eq(paymentOrders.id, id));
  },

  async finishRefund(id, now) {
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, id)).for("update");
      if (!order || order.status !== "paid" || (order.refundStatus !== "pending" && order.refundStatus !== "uncertain")) return null;
      const [company] = await tx
        .select({ plan: companies.plan, planUntil: companies.planUntil })
        .from(companies)
        .where(eq(companies.id, order.companyId))
        .for("update");
      let rolledBack: RefundFinish["rolledBack"] = null;
      // Срок откатываем, только если после этой оплаты тариф не менялся
      // (иначе вернули бы и чужие, более поздние оплаты) и известно, каким
      // он был до неё (у оплат до 11.2026 снимка нет).
      if (company && order.planUntilAfter !== null && company.planUntil === order.planUntilAfter && order.planBefore !== null) {
        let target = { plan: order.planBefore || null, until: order.planUntilBefore };
        // Срок до этой оплаты дала оплата, деньги за которую уже вернули, —
        // откатываем и её период.
        for (let i = 0; i < 24 && target.until !== null; i++) {
          const [prev] = await tx
            .select()
            .from(paymentOrders)
            .where(and(eq(paymentOrders.companyId, order.companyId), eq(paymentOrders.status, "refunded"), eq(paymentOrders.planUntilAfter, target.until)))
            .limit(1);
          if (!prev || prev.planBefore === null) break;
          target = { plan: prev.planBefore || null, until: prev.planUntilBefore };
        }
        rolledBack = target;
        await tx.update(companies).set({ plan: target.plan, planUntil: target.until }).where(eq(companies.id, order.companyId));
      }
      // Баллы: за заказ — назад; пополнение — списать, если ещё не списано.
      const ledger = refundLedger(order, order.orderKind === "topup" && order.pointsState === "credited" ? await lockBalance(tx, order.companyId, now) : 0);
      let postedRub = 0;
      if (ledger.entry) {
        const posted = await post(tx, ledger.entry, now);
        if (posted.ok) postedRub = ledger.entry.amountRub;
      }
      const pointsState = ledger.pointsState ?? order.pointsState;
      await tx.update(paymentOrders).set({ status: "refunded", refundStatus: "finished", refundedAt: now, pointsState }).where(eq(paymentOrders.id, id));
      // Постоянную скидку дала эта оплата — деньги вернули, скидки нет (другие остаются).
      const revoked = await tx
        .update(companyDiscounts)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(companyDiscounts.companyId, order.companyId), eq(companyDiscounts.orderId, id), isNull(companyDiscounts.revokedAt)));
      return {
        order: { ...order, status: "refunded", refundStatus: "finished", refundedAt: now, pointsState },
        rolledBack,
        points: { postedRub, short: ledger.short },
        discountRevoked: affected(revoked) > 0,
      };
    });
  },

  async listExpiringPlans(fromUntil, toUntil) {
    return guard([], async () => {
      const rows = await db
        .select({
          companyId: companies.id,
          companyName: companies.name,
          plan: companies.plan,
          planUntil: companies.planUntil,
          expiryNoticeFor: companyBilling.expiryNoticeFor,
          expiredNoticeFor: companyBilling.expiredNoticeFor,
          recurringActive: companyBilling.recurringActive,
        })
        .from(companies)
        // Только срок, оплаченный онлайн: тариф по счёту продлевают вручную,
        // «продлите в кабинете» ему не нужно.
        .innerJoin(
          paymentOrders,
          and(eq(paymentOrders.companyId, companies.id), eq(paymentOrders.status, "paid"), eq(paymentOrders.planUntilAfter, companies.planUntil)),
        )
        .leftJoin(companyBilling, eq(companyBilling.companyId, companies.id))
        .where(and(isNotNull(companies.plan), gte(companies.planUntil, fromUntil), lte(companies.planUntil, toUntil)))
        .limit(500);
      const seen = new Set<number>();
      return rows
        .filter((r) => !r.recurringActive && r.plan && r.planUntil !== null && !seen.has(r.companyId) && seen.add(r.companyId))
        .map((r) => ({
          companyId: r.companyId,
          companyName: r.companyName,
          plan: r.plan!,
          planUntil: r.planUntil!,
          expiryNoticeFor: r.expiryNoticeFor ?? null,
          expiredNoticeFor: r.expiredNoticeFor ?? null,
        }));
    });
  },

  async claimExpiryNotice(companyId, kind, until, now) {
    const column = kind === "expiry" ? companyBilling.expiryNoticeFor : companyBilling.expiredNoticeFor;
    // Строки автопродления может ещё не быть: создаём пустую, затем условный
    // UPDATE — второй процесс то же напоминание не получит.
    await db.insert(companyBilling).values({ companyId, updatedAt: now }).onDuplicateKeyUpdate({ set: { companyId } });
    const result = await db
      .update(companyBilling)
      .set(kind === "expiry" ? { expiryNoticeFor: until, updatedAt: now } : { expiredNoticeFor: until, updatedAt: now })
      .where(and(eq(companyBilling.companyId, companyId), or(isNull(column), sql`${column} <> ${until}`)));
    return affected(result) === 1;
  },

  async stats() {
    try {
      const statusRows = await db.select({ status: paymentOrders.status, n: count() }).from(paymentOrders).groupBy(paymentOrders.status);
      const [paid] = await db.select({ at: max(paymentOrders.paidAt) }).from(paymentOrders);
      const [series] = await db.select({ n: count() }).from(companyBilling).where(eq(companyBilling.recurringActive, true));
      return {
        tables: true,
        byStatus: Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)])),
        lastPaidAt: paid?.at == null ? null : Number(paid.at),
        activeSeries: Number(series?.n ?? 0),
      };
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      return { tables: false, byStatus: {}, lastPaidAt: null, activeSeries: 0 };
    }
  },

  async getPromo(code) {
    const [row] = await guard([] as PromoCodeRow[], () => db.select().from(promoCodes).where(eq(promoCodes.code, code)));
    return row ?? null;
  },

  async listPromos() {
    const rows = await guard([] as PromoCodeRow[], () => db.select().from(promoCodes).orderBy(desc(promoCodes.id)).limit(500));
    if (!rows.length) return [];
    const uses = await db
      .select({ code: paymentOrders.promoCode, n: count() })
      .from(paymentOrders)
      .where(and(eq(paymentOrders.status, "paid"), codeUse(), inArray(paymentOrders.promoCode, rows.map((r) => r.code))))
      .groupBy(paymentOrders.promoCode);
    const byCode = new Map(uses.map((u) => [u.code, Number(u.n)]));
    const ids = Array.from(new Set(rows.map((r) => r.companyId).filter((id): id is number => id !== null)));
    const names = ids.length ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids)) : [];
    const byId = new Map(names.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, paidUses: byCode.get(r.code) ?? 0, companyName: r.companyId ? byId.get(r.companyId) ?? null : null }));
  },

  async createPromo(row) {
    try {
      const result = await db.insert(promoCodes).values(row);
      const [created] = await db.select().from(promoCodes).where(eq(promoCodes.id, insertId(result)));
      return created ?? null;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e?.code ?? e?.cause?.code) === "ER_DUP_ENTRY") return null;
      throw err;
    }
  },

  async updatePromo(id, patch, now) {
    await db.update(promoCodes).set({ ...patch, updatedAt: now }).where(eq(promoCodes.id, id));
    const [row] = await db.select().from(promoCodes).where(eq(promoCodes.id, id));
    return row ?? null;
  },

  async promoPaidUses(code) {
    const [row] = await guard([{ n: 0 }] as Array<{ n: number }>, () =>
      db.select({ n: count() }).from(paymentOrders).where(and(eq(paymentOrders.promoCode, code), codeUse(), eq(paymentOrders.status, "paid"))),
    );
    return Number(row?.n ?? 0);
  },

  async promoPaidByCompany(code, companyId) {
    const [row] = await guard([] as Array<{ id: number }>, () =>
      db
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(and(eq(paymentOrders.promoCode, code), codeUse(), eq(paymentOrders.companyId, companyId), eq(paymentOrders.status, "paid")))
        .limit(1),
    );
    return Boolean(row);
  },

  async hasPaidOrders(companyId) {
    const [row] = await guard([] as Array<{ id: number }>, () =>
      db
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(and(eq(paymentOrders.companyId, companyId), eq(paymentOrders.orderKind, "plan"), inArray(paymentOrders.status, ["paid", "refunded"])))
        .limit(1),
    );
    return Boolean(row);
  },

  async getRequisites(companyId) {
    const [row] = await guard([] as CompanyRequisitesRow[], () =>
      db.select().from(companyRequisites).where(eq(companyRequisites.companyId, companyId)),
    );
    return row ?? null;
  },

  async saveRequisites(companyId, r, now) {
    const values = {
      kind: r.kind,
      name: r.name,
      inn: r.inn,
      kpp: r.kpp,
      ogrn: r.ogrn,
      address: r.address,
      headPost: r.headPost,
      headName: r.headName,
      email: r.email,
      updatedAt: now,
    };
    await db.insert(companyRequisites).values({ companyId, ...values }).onDuplicateKeyUpdate({ set: values });
  },

  async listOpenInvoices(companyId) {
    return guard([], () =>
      db
        .select()
        .from(paymentOrders)
        .where(and(eq(paymentOrders.companyId, companyId), eq(paymentOrders.paymentMethod, "invoice"), eq(paymentOrders.status, "pending")))
        .orderBy(desc(paymentOrders.id)),
    );
  },

  async cancelInvoice(id) {
    const result = await db
      .update(paymentOrders)
      .set({ status: "cancelled" })
      .where(and(eq(paymentOrders.id, id), eq(paymentOrders.paymentMethod, "invoice"), eq(paymentOrders.status, "pending")));
    return affected(result) === 1;
  },

  async getClosingDocument(orderId) {
    const [row] = await guard([] as ClosingDocumentRow[], () => db.select().from(closingDocuments).where(eq(closingDocuments.orderId, orderId)));
    return row ?? null;
  },

  async insertClosingDocument(doc) {
    try {
      await db.insert(closingDocuments).values(doc);
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e?.code ?? e?.cause?.code) !== "ER_DUP_ENTRY") throw err;
    }
    const [row] = await db.select().from(closingDocuments).where(eq(closingDocuments.orderId, doc.orderId));
    if (!row) throw new Error("closing document was not created");
    return row;
  },

  async setClosingBuyer(orderId, buyer) {
    await db.update(closingDocuments).set({ buyer }).where(eq(closingDocuments.orderId, orderId));
  },

  async voidClosingDocument(orderId, now) {
    await guard(null, () =>
      db
        .update(closingDocuments)
        .set({ status: "voided", voidedAt: now })
        .where(and(eq(closingDocuments.orderId, orderId), eq(closingDocuments.status, "issued"))),
    );
  },

  async activePromotions() {
    if (promotionsCache && Date.now() - promotionsCache.at < PRICES_TTL_MS) return promotionsCache.list;
    const now = Math.floor(Date.now() / 1000);
    const rows = await guard([] as PricePromotionRow[], () =>
      db.select().from(pricePromotions).where(and(eq(pricePromotions.active, true), gt(pricePromotions.endsAt, now))).limit(100),
    );
    const list = rows.map((r) => ({ id: r.id, title: r.title, percent: r.discountPercent, startsAt: r.startsAt, endsAt: r.endsAt }));
    promotionsCache = { at: Date.now(), list };
    return list;
  },

  async listPromotions() {
    const rows = await guard([] as PricePromotionRow[], () => db.select().from(pricePromotions).orderBy(desc(pricePromotions.id)).limit(200));
    if (!rows.length) return [];
    const uses = await db
      .select({ id: paymentOrders.promotionId, n: count() })
      .from(paymentOrders)
      .where(and(eq(paymentOrders.status, "paid"), inArray(paymentOrders.promotionId, rows.map((r) => r.id))))
      .groupBy(paymentOrders.promotionId);
    const byId = new Map(uses.map((u) => [u.id, Number(u.n)]));
    return rows.map((r) => ({ ...r, paidOrders: byId.get(r.id) ?? 0 }));
  },

  async getPromotion(id) {
    const [row] = await guard([] as PricePromotionRow[], () => db.select().from(pricePromotions).where(eq(pricePromotions.id, id)));
    if (!row) return null;
    const [uses] = await db
      .select({ n: count() })
      .from(paymentOrders)
      .where(and(eq(paymentOrders.status, "paid"), eq(paymentOrders.promotionId, id)));
    return { ...row, paidOrders: Number(uses?.n ?? 0) };
  },

  async createPromotion(row) {
    const result = await db.insert(pricePromotions).values(row);
    resetPricesCache();
    const [created] = await db.select().from(pricePromotions).where(eq(pricePromotions.id, insertId(result)));
    if (!created) throw new Error("promotion was not created");
    return created;
  },

  async updatePromotion(id, patch, now) {
    await db.update(pricePromotions).set({ ...patch, updatedAt: now }).where(eq(pricePromotions.id, id));
    resetPricesCache();
    const [row] = await db.select().from(pricePromotions).where(eq(pricePromotions.id, id));
    return row ?? null;
  },

  async getCompanyDiscounts(companyId) {
    return guard([] as CompanyDiscountRow[], () =>
      db.select().from(companyDiscounts).where(eq(companyDiscounts.companyId, companyId)).orderBy(asc(companyDiscounts.boundAt)),
    );
  },

  async listCompanyDiscounts() {
    const rows = await guard([] as CompanyDiscountRow[], () => db.select().from(companyDiscounts).orderBy(desc(companyDiscounts.boundAt)).limit(500));
    const ids = Array.from(new Set(rows.map((r) => r.companyId)));
    const names = ids.length ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids)) : [];
    const byId = new Map(names.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ ...r, companyName: byId.get(r.companyId) ?? null }));
  },

  async revokeCompanyDiscount(id, now, by) {
    const result = await db
      .update(companyDiscounts)
      .set({ revokedAt: now, revokedBy: by, updatedAt: now })
      .where(and(eq(companyDiscounts.id, id), isNull(companyDiscounts.revokedAt)));
    if (affected(result) !== 1) return null;
    const [row] = await db.select().from(companyDiscounts).where(eq(companyDiscounts.id, id));
    return row ?? null;
  },

  async getBalance(companyId) {
    const [row] = await guard([] as Array<{ balance: number }>, () =>
      db.select({ balance: companyBilling.balanceRub }).from(companyBilling).where(eq(companyBilling.companyId, companyId)),
    );
    return row?.balance ?? 0;
  },

  async getPointsHeld(companyId) {
    const [row] = await guard([] as Array<{ n: string | number | null }>, () =>
      db
        .select({ n: sql<string | number | null>`COALESCE(SUM(${paymentOrders.pointsRub}), 0)` })
        .from(paymentOrders)
        .where(releasable(companyId)),
    );
    return Number(row?.n ?? 0);
  },

  async listBalanceEntries(companyId, limit) {
    return guard([], () =>
      db.select().from(balanceTransactions).where(eq(balanceTransactions.companyId, companyId)).orderBy(desc(balanceTransactions.id)).limit(limit),
    );
  },

  async listBalances(limit) {
    return guard([], async () => {
      const rows = await db
        .select({ companyId: companyBilling.companyId, balanceRub: companyBilling.balanceRub, updatedAt: companyBilling.updatedAt, companyName: companies.name })
        .from(companyBilling)
        .leftJoin(companies, eq(companies.id, companyBilling.companyId))
        .where(ne(companyBilling.balanceRub, 0))
        .orderBy(desc(companyBilling.updatedAt))
        .limit(limit);
      return rows.map((r) => ({ ...r, companyName: r.companyName ?? null }));
    });
  },

  async postLedger(entry, now) {
    return db.transaction((tx) => post(tx, entry, now));
  },

  async holdTopupRefund(orderId, now) {
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).for("update");
      const hold = order && order.status === "paid" ? topupRefundHoldEntry(order) : null;
      if (!order || !hold) return { ok: false as const, reason: "state" as const };
      const posted = await post(tx, hold, now);
      if (!posted.ok) return { ok: false as const, reason: "balance" as const, balanceRub: await lockBalance(tx, order.companyId, now) };
      await tx.update(paymentOrders).set({ pointsState: "refund_hold" }).where(eq(paymentOrders.id, orderId));
      return { ok: true as const };
    });
  },

  async releaseTopupRefund(orderId, now) {
    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).for("update");
      const back = order && order.status === "paid" ? topupRefundBackEntry(order) : null;
      if (!order || !back) return;
      await post(tx, back, now);
      await tx.update(paymentOrders).set({ pointsState: "credited" }).where(eq(paymentOrders.id, orderId));
    });
  },
};
