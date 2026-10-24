/**
 * Оплата в MySQL: цены, заказы, согласия и автопродление компании.
 * Таблицы создаёт script/_add-billing.ts. Пока миграции нет, цены —
 * по умолчанию, история пустая, а оплата честно говорит, что недоступна.
 */
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  billingPrices,
  companies,
  companyBilling,
  paymentConsents,
  paymentOrders,
  type CompanyBillingRow,
  type PaymentOrderRow,
} from "@shared/schema";
import { DEFAULT_PRICES, isPaidPlan, type BillingMonths, type PlanPrice } from "@shared/billing";
import { db } from "../db";
import { logger } from "../logger";

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
};

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

export type SettleContext = { order: PaymentOrderRow; company: CompanyPlanRow; billing: CompanyBillingRow | null };

/** Что записать по оплаченному заказу (решает server/billing/service.ts). */
export type SettlePatch = {
  /** null — тариф не трогать (например, он подключён бессрочно). */
  plan: { id: string; until: number } | null;
  /** null — автопродление не трогать. */
  billing: Partial<Omit<CompanyBillingRow, "companyId">> | null;
};

export type SettleResult =
  | { claimed: false; order: PaymentOrderRow | null }
  | { claimed: true; order: PaymentOrderRow; context: SettleContext; patch: SettlePatch };

export type DueRecurring = CompanyBillingRow & { companyName: string; plan: string | null; planUntil: number | null };

export interface BillingStore {
  getPrices(): Promise<PlanPrice[]>;
  setPrices(prices: PlanPrice[], now: number): Promise<void>;
  createOrder(order: NewOrder): Promise<PaymentOrderRow>;
  getOrder(id: number): Promise<PaymentOrderRow | null>;
  listOrders(companyId: number, limit: number): Promise<PaymentOrderRow[]>;
  listRecentOrders(limit: number): Promise<Array<PaymentOrderRow & { companyName: string | null }>>;
  /**
   * Атомарно: заказ pending/expired → paid и продление тарифа. Повторное
   * уведомление по уже оплаченному заказу вернёт claimed=false.
   */
  settle(orderId: number, raw: string, now: number, decide: (ctx: SettleContext) => SettlePatch): Promise<SettleResult>;
  /** Не принятое кассой автосписание — сразу «не оплачен». */
  expireOrder(id: number): Promise<void>;
  expirePending(createdBefore: number): Promise<number>;
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

/** Цены живут несколько секунд в памяти: их читают лендинг и каждая страница оплаты. */
const PRICES_TTL_MS = 30_000;
let pricesCache: { at: number; prices: PlanPrice[] } | null = null;

export function resetPricesCache(): void {
  pricesCache = null;
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
      if (!order || order.status === "paid") return { claimed: false as const, order: order ?? null };
      const [company] = await tx
        .select({ id: companies.id, name: companies.name, plan: companies.plan, planUntil: companies.planUntil })
        .from(companies)
        .where(eq(companies.id, order.companyId))
        .for("update");
      if (!company) return { claimed: false as const, order };
      const [billing] = await tx.select().from(companyBilling).where(eq(companyBilling.companyId, company.id)).for("update");
      const context: SettleContext = { order, company, billing: billing ?? null };
      const patch = decide(context);

      await tx
        .update(paymentOrders)
        .set({ status: "paid", paidAt: now, rawResult: raw.slice(0, 4000), planUntilAfter: patch.plan?.until ?? null })
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
      const paid: PaymentOrderRow = { ...order, status: "paid", paidAt: now, planUntilAfter: patch.plan?.until ?? null };
      return { claimed: true as const, order: paid, context, patch };
    });
  },

  async expireOrder(id) {
    await db.update(paymentOrders).set({ status: "expired" }).where(and(eq(paymentOrders.id, id), eq(paymentOrders.status, "pending")));
  },

  async expirePending(createdBefore) {
    return guard(0, async () =>
      affected(
        await db
          .update(paymentOrders)
          .set({ status: "expired" })
          .where(and(eq(paymentOrders.status, "pending"), lte(paymentOrders.createdAt, createdBefore))),
      ),
    );
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
};
