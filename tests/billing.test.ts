/**
 * Оплата через Робокассу: подписи и параметры, срок тарифа после оплаты,
 * правило автопродления, сервис (заказ, ResultURL, автосписания) на
 * хранилище в памяти и маршруты.
 */
import { createHash, createHmac } from "node:crypto";
import { inflateSync } from "node:zlib";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMonths,
  checkoutSchema,
  formatRub,
  periodEvery,
  periodLabel,
  planAfterPayment,
  pricesSchema,
  isValidInn,
  isValidOgrn,
  normalizePromoCode,
  OFFER_REVISION,
  pickPromotion,
  priceBreakdown,
  promoDiscountRub,
  promoLabel,
  recurringAction,
  recurringStatement,
  requisitesSchema,
  type PlanPrice,
} from "../shared/billing";
import type {
  BalanceTransactionRow,
  ClosingDocumentRow,
  CompanyBillingRow,
  CompanyDiscountRow,
  CompanyRequisitesRow,
  PaymentOrderRow,
  PricePromotionRow,
  PromoCodeRow,
} from "../shared/schema";
import { refundLedger, releaseEntry, settleLedger, spendEntry, topupRefundBackEntry, topupRefundHoldEntry, type LedgerEntry } from "../server/billing/ledger";
import {
  buildPaymentParams,
  buildPaymentUrl,
  buildReceipt,
  chargeRecurring,
  createRefund,
  formatOutSum,
  isAppUserAgent,
  isConfigured,
  OP_STATE_URL,
  opState,
  parseOpState,
  REFUND_CREATE_URL,
  REFUND_STATE_URL,
  refundState,
  refundToken,
  robokassaConfig,
  verifyResultSignature,
  verifySuccessSignature,
  type RobokassaConfig,
} from "../server/billing/robokassa";
import {
  billingDiagnostics,
  billingInfo,
  checkConnection,
  coversAmount,
  checkWhilePolling,
  createCheckout,
  decideSettlement,
  formatDay,
  disableRecurring,
  handleResult,
  PROBE_INV_ID,
  reconcileOne,
  refundOrder,
  runBillingTick,
  type BillingDeps,
  type BillingNotice,
} from "../server/billing/service";
import type { BillingStore, NewConsent, SettleContext, SettlePatch } from "../server/billing/store";
import { amountInWords, documentFont, formatRuDate, money } from "../server/billing/documents";
import { cancelInvoiceOrder, closingPdf, createInvoice, ensureClosingDocument, invoicePdf, markInvoicePaid, saveCompanyRequisites } from "../server/billing/invoices";
import { sellerMissing, sellerRequisites } from "../server/billing/legal";
import { drawTable, PdfDocument } from "../server/billing/pdf/pdf";
import { parseTrueType, subsetTrueType } from "../server/billing/pdf/ttf";
import { adjustBalance, createTopup } from "../server/billing/balance";
import { createRootPromotion, revokeRootDiscount, updateRootPromotion } from "../server/billing/promotions";
import { DADATA_PARTY_URL, lookupInn, mapParty } from "../server/billing/dadata";

const storageMock = { getUserById: vi.fn() };
vi.mock("../server/storage", () => ({ storage: storageMock }));

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const DAY = 86400;

const CFG: RobokassaConfig = {
  login: "shop",
  password1: "p1",
  password2: "p2",
  testPassword1: "t1",
  testPassword2: "t2",
  password3: "p3",
  isTest: false,
  hash: "md5",
  recurring: true,
  receipt: false,
  sno: null,
  tax: "none",
};

describe("протокол Робокассы", () => {
  it("сумма — всегда с двумя знаками", () => {
    expect(formatOutSum(990)).toBe("990.00");
    expect(formatOutSum("990.000000")).toBe("990.00");
    expect(formatOutSum(12.5)).toBe("12.50");
  });

  it("подпись оплаты: login:OutSum:InvId:Пароль#1; Recurring и Email в подпись не входят", () => {
    const params = buildPaymentParams(CFG, { id: 15, amountRub: 990, description: "Тариф", email: "a@b.ru", isTest: false, recurring: true });
    expect(params.SignatureValue).toBe(md5("shop:990.00:15:p1"));
    expect(params).toMatchObject({ MerchantLogin: "shop", OutSum: "990.00", InvId: "15", Recurring: "true", Email: "a@b.ru", Culture: "ru" });
    expect(params.IsTest).toBeUndefined();
    expect(buildPaymentUrl(params)).toMatch(/^https:\/\/auth\.robokassa\.ru\/Merchant\/Index\.aspx\?MerchantLogin=shop&/);
  });

  it("тестовый режим — тестовый пароль и IsTest=1", () => {
    const params = buildPaymentParams(CFG, { id: 7, amountRub: 100, description: "x", email: null, isTest: true, recurring: false });
    expect(params.SignatureValue).toBe(md5("shop:100.00:7:t1"));
    expect(params.IsTest).toBe("1");
    expect(params.Recurring).toBeUndefined();
    expect(params.Email).toBeUndefined();
  });

  it("с чеком: в подписи urlencoded-строка, в параметре — сам JSON", () => {
    const cfg = { ...CFG, receipt: true, sno: "usn_income" };
    const params = buildPaymentParams(cfg, { id: 3, amountRub: 990, description: "TasksFlow, тариф «Команда» на 1 месяц", email: null, isTest: false, recurring: false });
    const receipt = buildReceipt(cfg, { name: "TasksFlow, тариф «Команда» на 1 месяц", sumRub: 990 });
    expect(params.Receipt).toBe(receipt.encoded);
    expect(JSON.parse(decodeURIComponent(params.Receipt))).toEqual({
      sno: "usn_income",
      items: [{ name: "TasksFlow, тариф «Команда» на 1 месяц", quantity: 1, sum: 990, payment_method: "full_payment", payment_object: "service", tax: "none" }],
    });
    expect(params.SignatureValue).toBe(md5(`shop:990.00:3:${receipt.encoded}:p1`));
  });

  it("ResultURL: OutSum:InvId:Пароль#2, регистр не важен, Shp_ по алфавиту", () => {
    const ok = md5("990.00:15:p2");
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: ok.toUpperCase(), isTest: false })).toBe(true);
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: md5("990.00:15:p1"), isTest: false })).toBe(false);
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: ok, isTest: true })).toBe(false);
    const shp = md5("990.00:15:p2:Shp_a=1:Shp_b=2");
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: shp, isTest: false, params: { Shp_b: "2", Shp_a: "1" } })).toBe(true);
    const encoded = encodeURIComponent('{"items":[]}');
    const withReceipt = md5(`990.00:15:${encoded}:p2`);
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: withReceipt, isTest: false, params: { Receipt: '{"items":[]}' } })).toBe(true);
    expect(verifyResultSignature(CFG, { outSum: "990.00", invId: "15", signature: withReceipt, isTest: false, params: { Receipt: encoded } })).toBe(true);
    expect(verifyResultSignature({ ...CFG, password2: "" }, { outSum: "990.00", invId: "15", signature: md5("990.00:15:"), isTest: false })).toBe(false);
  });

  it("SuccessURL подписан Паролем #1", () => {
    expect(verifySuccessSignature(CFG, { outSum: "990.00", invId: "15", signature: md5("990.00:15:p1"), isTest: false })).toBe(true);
    expect(verifySuccessSignature(CFG, { outSum: "990.00", invId: "15", signature: md5("990.00:15:p2"), isTest: false })).toBe(false);
  });

  it("алгоритм подписи — как в кабинете магазина", () => {
    const params = buildPaymentParams({ ...CFG, hash: "sha256" }, { id: 1, amountRub: 1, description: "x", email: null, isTest: false, recurring: false });
    expect(params.SignatureValue).toBe(createHash("sha256").update("shop:1.00:1:p1").digest("hex"));
  });

  it("env: тестовый режим, алгоритм, рекуррент; настроено — только с обоими паролями", () => {
    const cfg = robokassaConfig({ ROBOKASSA_MERCHANT_LOGIN: " shop ", ROBOKASSA_TEST_PASSWORD1: "a", ROBOKASSA_IS_TEST: "1", ROBOKASSA_HASH: "SHA512", ROBOKASSA_RECURRING: "1" });
    expect(cfg).toMatchObject({ login: "shop", isTest: true, hash: "sha512", recurring: true, receipt: false });
    expect(isConfigured(cfg)).toBe(false);
    expect(isConfigured({ ...cfg, testPassword2: "b" })).toBe(true);
    expect(robokassaConfig({ ROBOKASSA_HASH: "crc32" }).hash).toBe("md5");
    expect(isConfigured(robokassaConfig({}))).toBe(false);
  });

  it("автосписание: PreviousInvoiceID не в подписи, «OK…» — принято", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "OK501" });
    const res = await chargeRecurring(CFG, { invId: 501, previousInvId: 15, amountRub: 990, description: "Продление" }, fetchMock as unknown as typeof fetch);
    expect(res.accepted).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://auth.robokassa.ru/Merchant/Recurring");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("InvoiceID")).toBe("501");
    expect(body.get("PreviousInvoiceID")).toBe("15");
    expect(body.get("OutSum")).toBe("990.00");
    expect(body.get("SignatureValue")).toBe(md5("shop:990.00:501:p1"));

    expect(res.definitive).toBe(true);

    const declined = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ERROR: card declined" });
    expect(await chargeRecurring(CFG, { invId: 502, previousInvId: 15, amountRub: 990, description: "x" }, declined as unknown as typeof fetch)).toMatchObject({ accepted: false, definitive: true });
    // Нет ответа или 5xx — списание могло пройти: это не отказ.
    const timeout = vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout"));
    expect(await chargeRecurring(CFG, { invId: 503, previousInvId: 15, amountRub: 990, description: "x" }, timeout as unknown as typeof fetch)).toMatchObject({ accepted: false, definitive: false });
    const down = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "Bad Gateway" });
    expect(await chargeRecurring(CFG, { invId: 504, previousInvId: 15, amountRub: 990, description: "x" }, down as unknown as typeof fetch)).toMatchObject({ accepted: false, definitive: false });
  });

  it("iOS-приложение узнаём по метке в User-Agent", () => {
    expect(isAppUserAgent("Mozilla/5.0 (iPhone) Mobile/15E148 TasksFlowApp/1.0.0")).toBe(true);
    expect(isAppUserAgent("Mozilla/5.0 (iPhone) Safari/604.1")).toBe(false);
    expect(isAppUserAgent(undefined)).toBe(false);
  });
});

const PRICES: PlanPrice[] = [
  { plan: "team", months: 1, priceRub: 990 },
  { plan: "team", months: 12, priceRub: 9900 },
  { plan: "business", months: 1, priceRub: 1980 },
];
// 15.03.2026 12:00 UTC
const NOW = Date.UTC(2026, 2, 15, 12) / 1000;

describe("срок тарифа после оплаты", () => {
  it("календарные месяцы; 31-е — в последний день короткого месяца", () => {
    expect(new Date(addMonths(Date.UTC(2026, 0, 31, 10) / 1000, 1) * 1000).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(new Date(addMonths(Date.UTC(2028, 0, 31) / 1000, 1) * 1000).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(new Date(addMonths(NOW, 12) * 1000).toISOString()).toBe("2027-03-15T12:00:00.000Z");
  });

  it("бесплатный или истёкший — с сегодняшнего дня", () => {
    expect(planAfterPayment({ currentPlan: "start", currentUntil: null, plan: "team", months: 1, now: NOW, prices: PRICES }).until).toBe(addMonths(NOW, 1));
    expect(planAfterPayment({ currentPlan: "start", currentUntil: NOW - DAY, plan: "team", months: 1, now: NOW, prices: PRICES }).until).toBe(addMonths(NOW, 1));
  });

  it("тот же тариф — к оставшемуся сроку", () => {
    const r = planAfterPayment({ currentPlan: "team", currentUntil: NOW + 10 * DAY, plan: "team", months: 1, now: NOW, prices: PRICES });
    expect(r.until).toBe(addMonths(NOW + 10 * DAY, 1));
    expect(r.carriedSec).toBe(10 * DAY);
    expect(r.convertedFrom).toBeNull();
  });

  it("другой тариф — остаток пересчитывается по цене месяца", () => {
    const up = planAfterPayment({ currentPlan: "team", currentUntil: NOW + 10 * DAY, plan: "business", months: 1, now: NOW, prices: PRICES });
    expect(up.carriedSec).toBe(5 * DAY);
    expect(up.convertedFrom).toBe("team");
    expect(up.until).toBe(addMonths(NOW + 5 * DAY, 1));
    const down = planAfterPayment({ currentPlan: "business", currentUntil: NOW + 5 * DAY, plan: "team", months: 1, now: NOW, prices: PRICES });
    expect(down.carriedSec).toBe(10 * DAY);
  });

  it("подписи и форматы", () => {
    expect(formatRub(9900)).toBe("9 900 ₽");
    expect(periodLabel(1)).toBe("1 месяц");
    expect(periodLabel(3)).toBe("3 месяца");
    expect(periodLabel(12)).toBe("12 месяцев");
    expect(periodEvery(1)).toBe("раз в месяц");
    expect(periodEvery(12)).toBe("раз в год");
    expect(periodEvery(3)).toBe("раз в 3 месяца");
    expect(recurringStatement(990, 1)).toMatch(/^Я согласен на автоматические списания согласно условиям оферты\. Спишем 990 ₽ раз в месяц/);
  });

  it("форма: почта по желанию, цены без повторов", () => {
    const bare = checkoutSchema.parse({ plan: "team", months: 1 });
    expect(bare.recurringConsent).toBe(false);
    expect(bare.email).toBeUndefined();
    expect(checkoutSchema.parse({ plan: "team", months: 1, email: " Boss@Cafe.RU " }).email).toBe("boss@cafe.ru");
    expect(checkoutSchema.safeParse({ plan: "team", months: 1, email: "нет" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: "start", months: 1 }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: "team", months: 2 }).success).toBe(false);
    expect(pricesSchema.safeParse(PRICES).success).toBe(true);
    expect(pricesSchema.safeParse([...PRICES, { plan: "team", months: 1, priceRub: 1 }]).success).toBe(false);
    expect(pricesSchema.safeParse([{ plan: "team", months: 1, priceRub: 0 }]).success).toBe(false);
  });
});

describe("правило автопродления", () => {
  const until = NOW + 10 * DAY;
  const base = { active: true, until, attempts: 0, lastAttemptAt: null, noticeFor: null };

  it("выключено или без срока — ничего", () => {
    expect(recurringAction({ ...base, active: false }, until)).toBe("none");
    expect(recurringAction({ ...base, until: null }, NOW)).toBe("none");
  });

  it("за 3 дня — предупреждение, один раз", () => {
    expect(recurringAction(base, until - 4 * DAY)).toBe("none");
    expect(recurringAction(base, until - 3 * DAY)).toBe("notice");
    expect(recurringAction({ ...base, noticeFor: until }, until - 2 * DAY)).toBe("none");
  });

  it("последние сутки — списание, повтор не раньше чем через сутки, три попытки", () => {
    expect(recurringAction(base, until - DAY + 1)).toBe("charge");
    expect(recurringAction({ ...base, attempts: 1, lastAttemptAt: until - 3600 }, until)).toBe("none");
    expect(recurringAction({ ...base, attempts: 1, lastAttemptAt: until - DAY }, until)).toBe("charge");
    expect(recurringAction({ ...base, attempts: 3, lastAttemptAt: until + DAY }, until + 2 * DAY)).toBe("give-up");
    expect(recurringAction({ ...base, attempts: 3, lastAttemptAt: until + DAY }, until + DAY + 60)).toBe("none");
  });
});

// --- Сервис на хранилище в памяти ------------------------------------------------

type Company = { id: number; name: string; plan: string | null; planUntil: number | null };

function memoryStore(prices: PlanPrice[] = PRICES) {
  const orders = new Map<number, PaymentOrderRow>();
  const billing = new Map<number, CompanyBillingRow>();
  const companies = new Map<number, Company>();
  const consents: NewConsent[] = [];
  const promos = new Map<string, PromoCodeRow>();
  const requisites = new Map<number, CompanyRequisitesRow>();
  const documents = new Map<number, ClosingDocumentRow>();
  const promotions = new Map<number, PricePromotionRow>();
  const discounts: CompanyDiscountRow[] = [];
  const ledger: BalanceTransactionRow[] = [];
  let nextId = 15;
  let nextPromo = 1;
  const emptyBilling = (companyId: number): CompanyBillingRow => ({
    companyId,
    recurringActive: false,
    recurringParentOrderId: null,
    recurringPlan: null,
    recurringMonths: null,
    recurringAmountRub: null,
    recurringAttempts: 0,
    recurringLastAttemptAt: null,
    recurringNoticeFor: null,
    recurringDisabledAt: null,
    expiryNoticeFor: null,
    expiredNoticeFor: null,
    balanceRub: 0,
    updatedAt: 0,
  });
  /** Как post() в MySQL: ключ повтора, без минуса, строка журнала. */
  const post = (e: LedgerEntry, now: number) => {
    if (e.dedupeKey && ledger.some((r) => r.dedupeKey === e.dedupeKey)) return { ok: false as const, reason: "duplicate" as const };
    const b = billing.get(e.companyId) ?? emptyBilling(e.companyId);
    const after = b.balanceRub + e.amountRub;
    if (after < 0) return { ok: false as const, reason: "insufficient" as const };
    billing.set(e.companyId, { ...b, balanceRub: after });
    ledger.push({ id: ledger.length + 1, ...e, balanceAfter: after, createdAt: now });
    return { ok: true as const, balanceRub: after };
  };
  const balanceOf = (companyId: number) => billing.get(companyId)?.balanceRub ?? 0;
  const codeUse = (o: PaymentOrderRow) => o.discountSource !== "lifetime";
  const expireOne = (id: number, now: number) => {
    const o = orders.get(id);
    if (!o || o.status !== "pending") return false;
    o.status = "expired";
    const back = releaseEntry(o);
    if (back) {
      post(back, now);
      o.pointsState = "released";
    }
    return true;
  };
  const store: BillingStore = {
    getPrices: async () => prices,
    setPrices: async (next) => {
      prices = next;
    },
    createOrder: async (o) => {
      const row: PaymentOrderRow = {
        ...o,
        id: nextId++,
        status: "pending",
        planUntilAfter: null,
        planBefore: null,
        planUntilBefore: null,
        checkedAt: null,
        refundStatus: null,
        refundRequestId: null,
        refundRequestedAt: null,
        refundedAt: null,
        rawResult: null,
        paidAt: null,
        paymentMethod: o.paymentMethod ?? "card",
        baseRub: o.baseRub ?? null,
        discountRub: o.discountRub ?? 0,
        promoCode: o.promoCode ?? null,
        invoiceDueAt: o.invoiceDueAt ?? null,
        orderKind: o.orderKind ?? "plan",
        promotionId: o.promotionId ?? null,
        promotionPercent: o.promotionPercent ?? null,
        promotionDiscountRub: o.promotionDiscountRub ?? 0,
        discountSource: o.discountSource ?? null,
        pointsRub: 0,
        pointsState: null,
      };
      orders.set(row.id, row);
      return { ...row };
    },
    placeOrder: async (o, r) => {
      // Как транзакция в MySQL: проверки и вставка без await между ними.
      if (r) {
        const promo = promos.get(r.code);
        if (!promo || !promo.active) return { ok: false as const, reason: "gone" as const };
        const held = (x: PaymentOrderRow) => x.status === "paid" || (x.status === "pending" && (x.paymentMethod === "invoice" || x.createdAt >= r.reservedSince));
        const withCode = Array.from(orders.values()).filter((x) => x.promoCode === r.code && codeUse(x));
        if (promo.maxUses !== null && withCode.filter(held).length >= promo.maxUses) return { ok: false as const, reason: "exhausted" as const };
        if (withCode.some((x) => x.companyId === r.companyId && (r.free ? held(x) : x.status === "paid"))) return { ok: false as const, reason: "used" as const };
        if (
          promo.newClientsOnly &&
          Array.from(orders.values()).some((x) => x.companyId === r.companyId && x.orderKind === "plan" && (x.status === "paid" || x.status === "refunded"))
        ) {
          return { ok: false as const, reason: "newClientsOnly" as const };
        }
      }
      const points = Math.max(0, o.pointsRub ?? 0);
      // Как в MySQL: только заказ с баллами забирает баллы брошенных оплат
      // картой, и только если их хватит — иначе брошенный заказ не трогаем.
      const abandoned = (points > 0 ? Array.from(orders.values()) : []).filter(
        (x) => x.companyId === o.companyId && x.status === "pending" && x.pointsState === "held" && x.paymentMethod === "card",
      );
      if (points > 0 && balanceOf(o.companyId) + abandoned.reduce((sum, x) => sum + x.pointsRub, 0) < points) {
        return { ok: false as const, reason: "balance" as const };
      }
      for (const old of abandoned) {
        const back = releaseEntry(old);
        if (back) post(back, o.createdAt);
        old.pointsState = "released";
      }
      const row = orders.get((await store.createOrder(o)).id)!;
      if (points > 0) {
        Object.assign(row, { pointsRub: points, pointsState: "held" });
        const posted = post(spendEntry(row), o.createdAt);
        if (!posted.ok) throw new Error("points were not held");
      }
      return { ok: true as const, order: { ...row } };
    },
    getOrder: async (id) => (orders.has(id) ? { ...orders.get(id)! } : null),
    listOrders: async (companyId) => Array.from(orders.values()).filter((o) => o.companyId === companyId).reverse(),
    listRecentOrders: async () => Array.from(orders.values()).map((o) => ({ ...o, companyName: companies.get(o.companyId)?.name ?? null })),
    settle: async (orderId: number, raw: string, now: number, decide: (ctx: SettleContext) => SettlePatch) => {
      const order = orders.get(orderId);
      if (!order || !["pending", "expired", "cancelled"].includes(order.status)) return { claimed: false as const, order: order ?? null };
      const company = companies.get(order.companyId)!;
      const promo = order.promoCode && order.discountSource !== "lifetime" ? promos.get(order.promoCode) ?? null : null;
      const context: SettleContext = {
        order: { ...order },
        company: { ...company },
        billing: billing.has(company.id) ? { ...billing.get(company.id)! } : null,
        promo: promo ? { ...promo } : null,
      };
      const patch = decide(context);
      const before = patch.plan ? { planBefore: company.plan ?? "", planUntilBefore: company.planUntil } : {};
      const wasState = order.pointsState;
      Object.assign(order, { status: "paid", paidAt: now, rawResult: raw, planUntilAfter: patch.plan?.until ?? null, ...before });
      if (patch.plan) Object.assign(company, { plan: patch.plan.id, planUntil: patch.plan.until });
      if (patch.billing) billing.set(company.id, { ...(billing.get(company.id) ?? emptyBilling(company.id)), ...patch.billing, updatedAt: now });
      if (patch.lifetime) {
        const bind = { ...patch.lifetime, orderId: order.id, boundAt: now, revokedAt: null, revokedBy: null, updatedAt: now };
        const same = discounts.find((d) => d.companyId === company.id && d.promoCodeId === patch.lifetime!.promoCodeId);
        if (same) Object.assign(same, bind);
        else discounts.push({ id: discounts.length + 1, companyId: company.id, ...bind });
      }
      const l = settleLedger({ ...order, pointsState: wasState }, balanceOf(company.id));
      let postedRub = 0;
      if (l.entry && post(l.entry, now).ok) postedRub = l.entry.amountRub;
      if (l.pointsState) order.pointsState = l.pointsState;
      return { claimed: true as const, order: { ...order }, context, patch, points: { postedRub, short: l.short } };
    },
    expireOrder: async (id, now) => {
      expireOne(id, now);
    },
    expirePending: async (before, now) => {
      let n = 0;
      for (const o of Array.from(orders.values())) {
        if (o.status === "pending" && (o.paymentMethod === "card" || o.paymentMethod === "balance") && o.createdAt <= before && expireOne(o.id, now)) n++;
      }
      return n;
    },
    addConsent: async (c) => {
      consents.push(c);
    },
    getCompanyBilling: async (id) => (billing.has(id) ? { ...billing.get(id)! } : null),
    disableRecurring: async (id, now) => {
      const b = billing.get(id);
      if (!b?.recurringActive) return false;
      Object.assign(b, { recurringActive: false, recurringDisabledAt: now, recurringAttempts: 0 });
      return true;
    },
    listDueRecurring: async (before) =>
      Array.from(billing.values())
        .filter((b) => b.recurringActive && (companies.get(b.companyId)?.planUntil ?? Infinity) <= before)
        .map((b) => ({ ...b, companyName: companies.get(b.companyId)!.name, plan: companies.get(b.companyId)!.plan, planUntil: companies.get(b.companyId)!.planUntil })),
    claimAttempt: async (id, now, max) => {
      // Как условный UPDATE в MySQL: проверка и запись без await между ними.
      const b = billing.get(id);
      if (!b?.recurringActive || b.recurringAttempts >= max) return false;
      if (b.recurringLastAttemptAt !== null && now - b.recurringLastAttemptAt < DAY) return false;
      b.recurringAttempts += 1;
      b.recurringLastAttemptAt = now;
      return true;
    },
    setNoticeFor: async (id, until) => {
      billing.get(id)!.recurringNoticeFor = until;
    },
    listPendingForCheck: async ({ tiers, createdBefore, limit }) =>
      Array.from(orders.values())
        .filter((o) => o.status === "pending" && !o.isTest && o.paymentMethod === "card" && o.createdAt <= createdBefore)
        .filter((o) => tiers.some((t) => o.createdAt >= t.createdAfter && (o.checkedAt === null || o.checkedAt <= t.checkedBefore)))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((o) => ({ ...o })),
    claimCheck: async (id, now, checkedBefore) => {
      const o = orders.get(id);
      if (!o || o.status !== "pending" || (o.checkedAt !== null && o.checkedAt > checkedBefore)) return false;
      o.checkedAt = now;
      return true;
    },
    claimRefund: async (id, now, opts = {}) => {
      const o = orders.get(id);
      const allowed = opts.allowUncertain ? ["canceled", "uncertain"] : ["canceled"];
      if (!o || o.status !== "paid" || (o.refundStatus !== null && !allowed.includes(o.refundStatus))) return false;
      Object.assign(o, { refundStatus: "sending", refundRequestId: null, refundRequestedAt: now });
      return true;
    },
    setRefund: async (id, patch) => {
      const o = orders.get(id)!;
      o.refundStatus = patch.refundStatus;
      if (patch.refundRequestId !== undefined) o.refundRequestId = patch.refundRequestId;
    },
    listRefundsInProgress: async (staleBefore) =>
      Array.from(orders.values())
        .filter((o) => o.status === "paid")
        .filter((o) => o.refundStatus === "pending" || o.refundStatus === "uncertain" || (o.refundStatus === "sending" && (o.refundRequestedAt ?? 0) <= staleBefore))
        .map((o) => ({ ...o })),
    markChecked: async (id, now) => {
      orders.get(id)!.checkedAt = now;
    },
    finishRefund: async (id, now) => {
      const o = orders.get(id);
      if (!o || o.status !== "paid" || (o.refundStatus !== "pending" && o.refundStatus !== "uncertain")) return null;
      const company = companies.get(o.companyId);
      let rolledBack: { plan: string | null; until: number | null } | null = null;
      if (company && o.planUntilAfter !== null && company.planUntil === o.planUntilAfter && o.planBefore !== null) {
        let target = { plan: o.planBefore || null, until: o.planUntilBefore };
        for (let i = 0; i < 24 && target.until !== null; i++) {
          const prev = Array.from(orders.values()).find((x) => x.companyId === o.companyId && x.status === "refunded" && x.planUntilAfter === target.until);
          if (!prev || prev.planBefore === null) break;
          target = { plan: prev.planBefore || null, until: prev.planUntilBefore };
        }
        rolledBack = target;
        Object.assign(company, { plan: target.plan, planUntil: target.until });
      }
      const l = refundLedger(o, balanceOf(o.companyId));
      let postedRub = 0;
      if (l.entry && post(l.entry, now).ok) postedRub = l.entry.amountRub;
      Object.assign(o, { status: "refunded", refundStatus: "finished", refundedAt: now, pointsState: l.pointsState ?? o.pointsState });
      const bound = discounts.filter((d) => d.companyId === o.companyId && d.orderId === o.id && d.revokedAt === null);
      for (const d of bound) d.revokedAt = now;
      const discountRevoked = bound.length > 0;
      return { order: { ...o }, rolledBack, points: { postedRub, short: l.short }, discountRevoked };
    },
    listExpiringPlans: async (from, to) =>
      Array.from(companies.values())
        .filter((c) => c.plan && c.planUntil !== null && c.planUntil >= from && c.planUntil <= to && !billing.get(c.id)?.recurringActive)
        .filter((c) => Array.from(orders.values()).some((o) => o.companyId === c.id && o.status === "paid" && o.planUntilAfter === c.planUntil))
        .map((c) => ({
          companyId: c.id,
          companyName: c.name,
          plan: c.plan!,
          planUntil: c.planUntil!,
          expiryNoticeFor: billing.get(c.id)?.expiryNoticeFor ?? null,
          expiredNoticeFor: billing.get(c.id)?.expiredNoticeFor ?? null,
        })),
    claimExpiryNotice: async (id, kind, until) => {
      const b = billing.get(id) ?? emptyBilling(id);
      billing.set(id, b);
      const key = kind === "expiry" ? "expiryNoticeFor" : "expiredNoticeFor";
      if (b[key] === until) return false;
      b[key] = until;
      return true;
    },
    stats: async () => {
      const byStatus: Record<string, number> = {};
      for (const o of Array.from(orders.values())) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      return { tables: true, byStatus, lastPaidAt: null, activeSeries: Array.from(billing.values()).filter((b) => b.recurringActive).length };
    },
    getPromo: async (code) => (promos.has(code) ? { ...promos.get(code)! } : null),
    listPromos: async () =>
      Array.from(promos.values()).map((p) => ({
        ...p,
        paidUses: Array.from(orders.values()).filter((o) => o.promoCode === p.code && codeUse(o) && o.status === "paid").length,
        companyName: p.companyId ? companies.get(p.companyId)?.name ?? null : null,
      })),
    createPromo: async (row) => {
      if (promos.has(row.code)) return null;
      const created = { ...row, id: nextPromo++ };
      promos.set(row.code, created);
      return { ...created };
    },
    updatePromo: async (id, patch, now) => {
      const row = Array.from(promos.values()).find((p) => p.id === id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: now });
      return { ...row };
    },
    promoPaidUses: async (code) => Array.from(orders.values()).filter((o) => o.promoCode === code && codeUse(o) && o.status === "paid").length,
    promoPaidByCompany: async (code, companyId) =>
      Array.from(orders.values()).some((o) => o.promoCode === code && codeUse(o) && o.companyId === companyId && o.status === "paid"),
    hasPaidOrders: async (companyId) =>
      Array.from(orders.values()).some((o) => o.companyId === companyId && o.orderKind === "plan" && (o.status === "paid" || o.status === "refunded")),
    getRequisites: async (companyId) => (requisites.has(companyId) ? { ...requisites.get(companyId)! } : null),
    saveRequisites: async (companyId, r, now) => {
      requisites.set(companyId, { companyId, ...r, updatedAt: now });
    },
    listOpenInvoices: async (companyId) =>
      Array.from(orders.values())
        .filter((o) => o.companyId === companyId && o.paymentMethod === "invoice" && o.status === "pending")
        .reverse()
        .map((o) => ({ ...o })),
    cancelInvoice: async (id) => {
      const o = orders.get(id);
      if (!o || o.paymentMethod !== "invoice" || o.status !== "pending") return false;
      o.status = "cancelled";
      return true;
    },
    getClosingDocument: async (orderId) => (documents.has(orderId) ? { ...documents.get(orderId)! } : null),
    insertClosingDocument: async (doc) => {
      if (!documents.has(doc.orderId)) documents.set(doc.orderId, { ...doc, id: documents.size + 1 });
      return { ...documents.get(doc.orderId)! };
    },
    setClosingBuyer: async (orderId, buyer) => {
      documents.get(orderId)!.buyer = buyer;
    },
    voidClosingDocument: async (orderId, now) => {
      const d = documents.get(orderId);
      if (d && d.status === "issued") Object.assign(d, { status: "voided", voidedAt: now });
    },
    activePromotions: async () =>
      Array.from(promotions.values())
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, title: p.title, percent: p.discountPercent, startsAt: p.startsAt, endsAt: p.endsAt })),
    listPromotions: async () =>
      Array.from(promotions.values())
        .reverse()
        .map((p) => ({ ...p, paidOrders: Array.from(orders.values()).filter((o) => o.promotionId === p.id && o.status === "paid").length })),
    getPromotion: async (id) => {
      const p = promotions.get(id);
      return p ? { ...p, paidOrders: Array.from(orders.values()).filter((o) => o.promotionId === id && o.status === "paid").length } : null;
    },
    createPromotion: async (row) => {
      const created = { ...row, id: promotions.size + 1 };
      promotions.set(created.id, created);
      return { ...created };
    },
    updatePromotion: async (id, patch, now) => {
      const row = promotions.get(id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: now });
      return { ...row };
    },
    getCompanyDiscounts: async (companyId) => discounts.filter((d) => d.companyId === companyId).map((d) => ({ ...d })),
    listCompanyDiscounts: async () => discounts.map((d) => ({ ...d, companyName: companies.get(d.companyId)?.name ?? null })),
    revokeCompanyDiscount: async (id, now, by) => {
      const d = discounts.find((x) => x.id === id);
      if (!d || d.revokedAt !== null) return null;
      Object.assign(d, { revokedAt: now, revokedBy: by });
      return { ...d };
    },
    getBalance: async (companyId) => balanceOf(companyId),
    getPointsHeld: async (companyId) =>
      Array.from(orders.values())
        .filter((o) => o.companyId === companyId && o.status === "pending" && o.pointsState === "held" && o.paymentMethod === "card")
        .reduce((sum, o) => sum + o.pointsRub, 0),
    listBalanceEntries: async (companyId, limit) =>
      ledger
        .filter((r) => r.companyId === companyId)
        .reverse()
        .slice(0, limit)
        .map((r) => ({ ...r })),
    listBalances: async () =>
      Array.from(billing.values())
        .filter((b) => b.balanceRub !== 0)
        .map((b) => ({ companyId: b.companyId, companyName: companies.get(b.companyId)?.name ?? null, balanceRub: b.balanceRub, updatedAt: b.updatedAt })),
    postLedger: async (entry, now) => post(entry, now),
    holdTopupRefund: async (id, now) => {
      const o = orders.get(id);
      const hold = o && o.status === "paid" ? topupRefundHoldEntry(o) : null;
      if (!o || !hold) return { ok: false as const, reason: "state" as const };
      if (!post(hold, now).ok) return { ok: false as const, reason: "balance" as const, balanceRub: balanceOf(o.companyId) };
      o.pointsState = "refund_hold";
      return { ok: true as const };
    },
    releaseTopupRefund: async (id, now) => {
      const o = orders.get(id);
      const back = o && o.status === "paid" ? topupRefundBackEntry(o) : null;
      if (!o || !back) return;
      post(back, now);
      o.pointsState = "credited";
    },
  };
  return { store, orders, billing, companies, consents, promos, requisites, documents, promotions, discounts, ledger };
}

function setup(over: Partial<RobokassaConfig> = {}) {
  const mem = memoryStore();
  mem.companies.set(1, { id: 1, name: "Кафе", plan: null, planUntil: null });
  const notices: Array<{ companyId: number; notice: BillingNotice }> = [];
  const owner: string[] = [];
  const live: number[] = [];
  const clock = { now: NOW };
  const fetchMock = vi.fn();
  const deps: BillingDeps = {
    store: mem.store,
    config: () => ({ ...CFG, ...over }),
    notify: {
      admins: async (companyId, notice) => {
        notices.push({ companyId, notice });
      },
      owner: async (text) => {
        owner.push(text);
      },
      live: (companyId) => live.push(companyId),
    },
    getCompany: async (id) => mem.companies.get(id) as never,
    countUsers: async () => 3,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock.now,
  };
  return { ...mem, deps, notices, owner, live, clock, fetchMock };
}

const admin = { id: 5, email: "boss@cafe.ru" };
const checkout = (deps: BillingDeps, body: unknown) => createCheckout(deps, { companyId: 1, user: admin, body, ip: "1.2.3.4", userAgent: "UA" });
const resultFor = (order: { id: number; amountRub: number }, password = "p2") => ({
  OutSum: formatOutSum(order.amountRub),
  InvId: String(order.id),
  SignatureValue: md5(`${formatOutSum(order.amountRub)}:${order.id}:${password}`),
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("заказ", () => {
  it("касса не настроена — 503 с понятным текстом", async () => {
    const t = setup({ password2: "" });
    const r = await checkout(t.deps, { plan: "team", months: 1 });
    expect(r.status).toBe(503);
    expect((r.json as { message: string }).message).toMatch(/Онлайн-оплата пока не подключена/);
  });

  it("сумма — с сервера; сверка с ценой на странице", async () => {
    const t = setup();
    const r = await checkout(t.deps, { plan: "team", months: 12, expectedRub: 9900 });
    expect(r.status).toBe(200);
    const json = r.json as { invId: number; amountRub: number; params: Record<string, string>; paymentUrl: string };
    expect(json.amountRub).toBe(9900);
    expect(json.params.SignatureValue).toBe(md5(`shop:9900.00:${json.invId}:p1`));
    expect(json.params.Email).toBe("boss@cafe.ru");
    expect(t.orders.get(json.invId)).toMatchObject({ companyId: 1, userId: 5, plan: "team", months: 12, amountRub: 9900, status: "pending", recurringConsent: false });

    const changed = await checkout(t.deps, { plan: "team", months: 1, expectedRub: 1 });
    expect(changed.status).toBe(409);
    expect(changed.json).toMatchObject({ code: "price_changed", priceRub: 990 });
    expect((await checkout(t.deps, { plan: "business", months: 12 })).status).toBe(400);
  });

  it("бессрочный тариф не оплачивается", async () => {
    const t = setup();
    t.companies.get(1)!.plan = "team";
    expect((await checkout(t.deps, { plan: "team", months: 1 })).json).toMatchObject({ code: "perpetual" });
  });

  it("галочка автосписаний — флаг Recurring и запись согласия, только если магазину подключён рекуррент", async () => {
    const t = setup();
    const r = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number; params: Record<string, string> };
    expect(r.params.Recurring).toBe("true");
    expect(t.consents).toHaveLength(1);
    expect(t.consents[0]).toMatchObject({ companyId: 1, userId: 5, orderId: r.invId, granted: true, ip: "1.2.3.4", offerRevision: OFFER_REVISION });
    expect(t.consents[0].statementText).toBe(recurringStatement(990, 1));

    const off = setup({ recurring: false });
    const r2 = (await checkout(off.deps, { plan: "team", months: 1, recurringConsent: true })).json as { params: Record<string, string> };
    expect(r2.params.Recurring).toBeUndefined();
    expect(off.consents).toHaveLength(0);
  });
});

describe("уведомление об оплате (ResultURL)", () => {
  it("подпись, сумма и повтор: тариф продлевается один раз", async () => {
    const t = setup();
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    const order = { id: invId, amountRub: 990 };

    expect(await handleResult(t.deps, { ...resultFor(order), SignatureValue: md5(`990.00:${invId}:p1`) })).toEqual({ status: 400, body: "bad signature" });
    expect(await handleResult(t.deps, { ...resultFor({ id: invId, amountRub: 1 }) })).toEqual({ status: 400, body: "amount mismatch" });
    expect(await handleResult(t.deps, { ...resultFor({ id: 999, amountRub: 990 }) })).toEqual({ status: 400, body: "unknown order" });
    expect(t.companies.get(1)!.plan).toBeNull();

    expect(await handleResult(t.deps, resultFor(order))).toEqual({ status: 200, body: `OK${invId}` });
    const until = addMonths(NOW, 1);
    expect(t.companies.get(1)).toMatchObject({ plan: "team", planUntil: until });
    expect(t.orders.get(invId)).toMatchObject({ status: "paid", paidAt: NOW, planUntilAfter: until });

    // Повтор уведомления — снова OK, но срок не растёт.
    expect(await handleResult(t.deps, resultFor(order))).toEqual({ status: 200, body: `OK${invId}` });
    expect(t.companies.get(1)!.planUntil).toBe(until);
    await flush();
    expect(t.notices).toHaveLength(1);
    expect(t.notices[0].notice.title).toBe("Оплата получена");
    expect(t.owner[0]).toMatch(/Оплата 990 ₽ — «Кафе» \(#1\)/);
    expect(t.live).toContain(1);
  });

  it("тестовый заказ проверяется тестовым паролем, даже если режим уже выключен", async () => {
    const t = setup({ isTest: true });
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    const live = { ...t.deps, config: () => ({ ...CFG, isTest: false }) };
    expect((await handleResult(live, resultFor({ id: invId, amountRub: 990 }))).status).toBe(400);
    expect(await handleResult(live, resultFor({ id: invId, amountRub: 990 }, "t2"))).toEqual({ status: 200, body: `OK${invId}` });
  });

  it("оплата истёкшего заказа всё равно засчитывается", async () => {
    const t = setup();
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    t.orders.get(invId)!.status = "expired";
    expect((await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }))).status).toBe(200);
    expect(t.companies.get(1)!.plan).toBe("team");
  });

  it("решение по оплате: серия, разовая оплата другого тарифа выключает старую серию", () => {
    const order = (over: Partial<PaymentOrderRow>): PaymentOrderRow => ({
      id: 20, companyId: 1, userId: 5, email: null, plan: "team", months: 1, amountRub: 990, description: "", status: "pending",
      isTest: false, recurringConsent: false, recurringChargeOf: null, planUntilAfter: null, rawResult: null, createdAt: NOW, paidAt: null, ...over,
    });
    const company = { id: 1, name: "Кафе", plan: "team", planUntil: NOW + 5 * DAY };
    const series = { companyId: 1, recurringActive: true, recurringParentOrderId: 15, recurringPlan: "team", recurringMonths: 1, recurringAmountRub: 990, recurringAttempts: 2, recurringLastAttemptAt: NOW, recurringNoticeFor: NOW + 5 * DAY, recurringDisabledAt: null, updatedAt: 0 };

    const fresh = decideSettlement({ order: order({ recurringConsent: true }), company, billing: null }, PRICES, NOW);
    expect(fresh.billing).toMatchObject({ recurringActive: true, recurringParentOrderId: 20, recurringPlan: "team", recurringMonths: 1, recurringAmountRub: 990 });
    expect(fresh.plan).toEqual({ id: "team", until: addMonths(NOW + 5 * DAY, 1) });

    const child = decideSettlement({ order: order({ recurringChargeOf: 15 }), company, billing: series }, PRICES, NOW);
    expect(child.billing).toEqual({ recurringAttempts: 0, recurringNoticeFor: null });

    const other = decideSettlement({ order: order({ plan: "business", amountRub: 1980 }), company, billing: series }, PRICES, NOW);
    expect(other.billing).toMatchObject({ recurringActive: false, recurringDisabledAt: NOW });
    expect(other.plan).toEqual({ id: "business", until: addMonths(NOW + Math.floor((5 * DAY * 990) / 1980), 1) });

    const same = decideSettlement({ order: order({}), company, billing: series }, PRICES, NOW);
    expect(same.billing).toEqual({ recurringAttempts: 0, recurringNoticeFor: null });

    const perpetual = decideSettlement({ order: order({}), company: { ...company, planUntil: null }, billing: null }, PRICES, NOW);
    expect(perpetual.plan).toBeNull();
  });
});

describe("автопродление", () => {
  async function paidSeries(t: ReturnType<typeof setup>) {
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    await flush();
    t.notices.length = 0;
    t.owner.length = 0;
    return invId;
  }

  it("предупреждение за 3 дня, списание в последний день, продление по уведомлению", async () => {
    const t = setup();
    const parent = await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    expect(t.billing.get(1)).toMatchObject({ recurringActive: true, recurringParentOrderId: parent });

    t.clock.now = until - 3 * DAY;
    await runBillingTick(t.deps);
    expect(t.notices.map((n) => n.notice.title)).toEqual(["Скоро продление тарифа"]);
    await runBillingTick(t.deps);
    expect(t.notices).toHaveLength(1);
    expect(t.fetchMock).not.toHaveBeenCalled();

    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    t.clock.now = until - 3600;
    await runBillingTick(t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(t.fetchMock.mock.calls[0][1].body as string);
    const childId = Number(body.get("InvoiceID"));
    expect(body.get("PreviousInvoiceID")).toBe(String(parent));
    expect(t.orders.get(childId)).toMatchObject({ recurringChargeOf: parent, amountRub: 990, userId: null, status: "pending" });
    expect(t.billing.get(1)).toMatchObject({ recurringAttempts: 1, recurringLastAttemptAt: until - 3600 });

    // Пока ждём уведомление — второй раз не списываем.
    await runBillingTick(t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);

    expect(await handleResult(t.deps, resultFor({ id: childId, amountRub: 990 }))).toEqual({ status: 200, body: `OK${childId}` });
    expect(t.companies.get(1)!.planUntil).toBe(addMonths(until, 1));
    expect(t.billing.get(1)).toMatchObject({ recurringActive: true, recurringAttempts: 0, recurringNoticeFor: null });
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Тариф продлён");
  });

  it("три неудачи подряд — автопродление выключается, админы и владелец знают", async () => {
    const t = setup();
    await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "ERROR: недостаточно средств" });
    for (let i = 0; i < 3; i++) {
      t.clock.now = until - 3600 + i * DAY;
      await runBillingTick(t.deps);
    }
    expect(t.fetchMock).toHaveBeenCalledTimes(3);
    expect(Array.from(t.orders.values()).filter((o) => o.recurringChargeOf !== null).every((o) => o.status === "expired")).toBe(true);
    t.clock.now = until - 3600 + 3 * DAY;
    await runBillingTick(t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(3);
    expect(t.billing.get(1)!.recurringActive).toBe(false);
    expect(t.notices.at(-1)!.notice.title).toBe("Автопродление выключено");
    expect(t.notices.at(-1)!.notice.paragraphs[0]).toMatch(/попробовали 3 раза/);
    expect(t.owner.at(-1)).toMatch(/Автопродление выключено — «Кафе»/);
  });

  it("серия из тестового режима списывается тестово: IsTest=1 и тестовый пароль", async () => {
    const t = setup({ isTest: true });
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }, "t2"));
    const until = t.companies.get(1)!.planUntil!;
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    t.clock.now = until - 3600;
    await runBillingTick(t.deps);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(t.fetchMock.mock.calls[0][1].body as string);
    const childId = Number(body.get("InvoiceID"));
    expect(body.get("IsTest")).toBe("1");
    expect(body.get("SignatureValue")).toBe(md5(`shop:990.00:${childId}:t1`));
    expect(t.orders.get(childId)).toMatchObject({ isTest: true, recurringChargeOf: invId });
    // Уведомление тестового списания — тоже по тестовому паролю.
    expect((await handleResult(t.deps, resultFor({ id: childId, amountRub: 990 }, "t2"))).body).toBe(`OK${childId}`);
    expect(t.companies.get(1)!.planUntil).toBe(addMonths(until, 1));
  });

  it("тестовая серия в боевом режиме не списывается, а выключается — иначе тариф продлевался бы даром", async () => {
    const t = setup({ isTest: true });
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }, "t2"));
    const live = { ...t.deps, config: () => ({ ...CFG, isTest: false }) };
    t.clock.now = t.companies.get(1)!.planUntil! - 3600;
    await runBillingTick(live);
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.billing.get(1)!.recurringActive).toBe(false);
    expect(t.owner.at(-1)).toMatch(/тестовом режиме/);
  });

  it("отключение — сразу, с записью отказа в историю согласий; повтор — без новой записи", async () => {
    const t = setup();
    await paidSeries(t);
    const ctx = { companyId: 1, user: admin, ip: "5.6.7.8", userAgent: "UA" };
    expect(await disableRecurring(t.deps, ctx)).toBe(true);
    expect(t.billing.get(1)!.recurringActive).toBe(false);
    expect(t.consents.at(-1)).toMatchObject({ granted: false, ip: "5.6.7.8" });
    expect(await disableRecurring(t.deps, ctx)).toBe(false);
    expect(t.consents.filter((c) => !c.granted)).toHaveLength(1);
    // Оплаченный срок не тронут.
    expect(t.companies.get(1)!.plan).toBe("team");
  });

  it("день списания — за сутки до конца срока: его же видят на странице и в предупреждении", async () => {
    const t = setup();
    await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    const info = await billingInfo(t.deps, { companyId: 1, user: admin });
    expect(info!.recurring.nextChargeAt).toBe(until - DAY);
    t.clock.now = until - 3 * DAY;
    await runBillingTick(t.deps);
    const notice = t.notices.at(-1)!.notice;
    expect(notice.body.startsWith(formatDay(until - DAY))).toBe(true);
    expect(notice.paragraphs[0]).toContain(`оплачен до ${formatDay(until)}`);
  });

  it("два тика одновременно (перезапуск при деплое) — одно списание", async () => {
    const t = setup();
    await paidSeries(t);
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    t.clock.now = t.companies.get(1)!.planUntil! - 3600;
    await Promise.all([runBillingTick(t.deps), runBillingTick(t.deps)]);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(Array.from(t.orders.values()).filter((o) => o.recurringChargeOf !== null)).toHaveLength(1);
  });

  it("касса не ответила — заказ ждёт уведомления, владелец предупреждён; позднее уведомление засчитывается", async () => {
    const t = setup();
    const parent = await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    t.fetchMock.mockRejectedValue(new Error("timeout"));
    t.clock.now = until - 3600;
    await runBillingTick(t.deps);
    const child = Array.from(t.orders.values()).find((o) => o.recurringChargeOf === parent)!;
    expect(child.status).toBe("pending");
    expect(t.owner.at(-1)).toMatch(/не ответила на автосписание/);
    expect(await handleResult(t.deps, resultFor({ id: child.id, amountRub: 990 }))).toEqual({ status: 200, body: `OK${child.id}` });
    expect(t.companies.get(1)!.planUntil).toBe(addMonths(until, 1));
  });

  it("автосписание пришло после отключения — тариф не меняется, деньги к возврату", async () => {
    const t = setup();
    const parent = await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    t.clock.now = until - 3600;
    await runBillingTick(t.deps);
    const child = Array.from(t.orders.values()).find((o) => o.recurringChargeOf === parent)!;
    await disableRecurring(t.deps, { companyId: 1, user: admin, ip: null, userAgent: null });
    expect((await handleResult(t.deps, resultFor({ id: child.id, amountRub: 990 }))).status).toBe(200);
    expect(t.companies.get(1)!.planUntil).toBe(until);
    expect(t.orders.get(child.id)!.status).toBe("paid");
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Вернём автосписание");
    expect(t.owner.at(-1)).toMatch(/Верните деньги/);
  });

  it("выключение сервисом пишется в историю согласий", async () => {
    const t = setup();
    await paidSeries(t);
    const until = t.companies.get(1)!.planUntil!;
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "ERROR" });
    for (let i = 0; i <= 3; i++) {
      t.clock.now = until - 3600 + i * DAY;
      await runBillingTick(t.deps);
    }
    expect(t.consents.at(-1)).toMatchObject({ granted: false, userId: null });
    expect(t.consents.at(-1)!.statementText).toMatch(/выключено сервисом/);
  });

  it("неоплаченные заказы через 3 дня — «не оплачен»", async () => {
    const t = setup();
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    t.clock.now = NOW + 3 * DAY;
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)!.status).toBe("expired");
  });
});

// --- Сверка, возвраты, напоминания, диагностика ------------------------------------------

/** Ответ OpStateExt: Result/Code, State/Code и Info, как присылает касса (с пространством имён). */
const opXml = (code: number, state?: number, incSum = "990.000000") =>
  `<?xml version="1.0" encoding="utf-8"?><OperationStateResponse xmlns="http://merchant.roboxchange.com/WebService/">` +
  `<Result><Code>${code}</Code><Description>${code === 3 ? "Операция не найдена" : ""}</Description></Result>` +
  (state === undefined ? "" : `<State><Code>${state}</Code><RequestDate>2026-03-15T12:00:00+03:00</RequestDate></State>`) +
  `<Info><IncCurrLabel>BankCardPSR</IncCurrLabel><IncSum>${incSum}</IncSum><PaymentMethod><Code>BankCard</Code><Description>Банковская карта</Description></PaymentMethod><OutSum>950.000000</OutSum><OpKey>op-key-1</OpKey></Info>` +
  `</OperationStateResponse>`;
const http = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

/** Касса в памяти: состояние операции по номеру, ответы API возвратов. */
function cashbox(t: ReturnType<typeof setup>) {
  const box = {
    states: new Map<number, number>(),
    refund: http(200, JSON.stringify({ success: true, requestId: "req-1", message: null })) as ReturnType<typeof http> | Error,
    refundLabel: "processing",
    calls: [] as string[],
  };
  t.fetchMock.mockImplementation(async (url: string) => {
    box.calls.push(url.split("?")[0]);
    if (url.startsWith(OP_STATE_URL)) {
      const id = Number(new URL(url).searchParams.get("InvoiceID"));
      return box.states.has(id) ? http(200, opXml(0, box.states.get(id))) : http(200, opXml(3));
    }
    if (url === REFUND_CREATE_URL) {
      if (box.refund instanceof Error) throw box.refund;
      return box.refund;
    }
    if (url.startsWith(REFUND_STATE_URL)) return http(200, JSON.stringify({ requestId: "req-1", label: box.refundLabel }));
    return http(200, "OK");
  });
  return box;
}

describe("протокол: состояние операции и возвраты", () => {
  it("OpStateExt: подпись login:InvId:Пароль#2 заглавными, ответ с пространством имён", async () => {
    const fetchMock = vi.fn().mockResolvedValue(http(200, opXml(0, 100)));
    const state = await opState(CFG, 42, fetchMock as unknown as typeof fetch);
    expect(state).toEqual({ ok: true, resultCode: 0, description: "", stateCode: 100, opKey: "op-key-1", incSum: "990.000000", paymentMethod: "Банковская карта" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(OP_STATE_URL);
    expect(url.searchParams.get("MerchantLogin")).toBe("shop");
    expect(url.searchParams.get("InvoiceID")).toBe("42");
    expect(url.searchParams.get("Signature")).toBe(md5("shop:42:p2").toUpperCase());

    expect(parseOpState(opXml(3))).toMatchObject({ ok: true, resultCode: 3, stateCode: null, description: "Операция не найдена" });
    expect(parseOpState("<html>502 Bad Gateway</html>")).toMatchObject({ ok: false });
    const down = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await opState(CFG, 42, down as unknown as typeof fetch)).toEqual({ ok: false, error: "ECONNRESET" });
    expect(await opState({ ...CFG, password2: "" }, 42, fetchMock as unknown as typeof fetch)).toMatchObject({ ok: false });
  });

  it("возврат: тело — JWT HS256 на Пароле #3, без суммы — полный", async () => {
    const token = refundToken({ OpKey: "op-key-1" }, "p3");
    const [head, body, sign] = token.split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toEqual({ OpKey: "op-key-1" });
    expect(sign).toBe(createHmac("sha256", "p3").update(`${head}.${body}`).digest("base64url"));

    const fetchMock = vi.fn().mockResolvedValue(http(200, JSON.stringify({ success: true, requestId: "req-1", message: null })));
    expect(await createRefund(CFG, { opKey: "op-key-1" }, fetchMock as unknown as typeof fetch)).toEqual({ ok: true, requestId: "req-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(REFUND_CREATE_URL);
    expect(JSON.parse(init.body as string)).toBe(token);
    const partial = vi.fn().mockResolvedValue(http(200, JSON.stringify({ success: true, requestId: "req-2" })));
    await createRefund(CFG, { opKey: "op-key-1", amountRub: 100 }, partial as unknown as typeof fetch);
    const payload = JSON.parse(Buffer.from(String(JSON.parse(partial.mock.calls[0][1].body)).split(".")[1], "base64url").toString());
    expect(payload).toEqual({ OpKey: "op-key-1", RefundSum: 100 });
  });

  it("возврат: отказ — окончательный, нет ответа — нельзя повторять", async () => {
    const rejected = vi.fn().mockResolvedValue(http(401, JSON.stringify({ success: false, message: "Signature key is not exists", requestId: null })));
    expect(await createRefund(CFG, { opKey: "k" }, rejected as unknown as typeof fetch)).toEqual({ ok: false, definitive: true, error: "Signature key is not exists" });
    const timeout = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await createRefund(CFG, { opKey: "k" }, timeout as unknown as typeof fetch)).toMatchObject({ ok: false, definitive: false });
    const gateway = vi.fn().mockResolvedValue(http(502, "<html>Bad Gateway</html>"));
    expect(await createRefund(CFG, { opKey: "k" }, gateway as unknown as typeof fetch)).toMatchObject({ ok: false, definitive: false });
    const noPassword = vi.fn();
    expect(await createRefund({ ...CFG, password3: "" }, { opKey: "k" }, noPassword as unknown as typeof fetch)).toMatchObject({ ok: false, definitive: true });
    expect(noPassword).not.toHaveBeenCalled();
    const state = vi.fn().mockResolvedValue(http(200, JSON.stringify({ requestId: "req-1", label: "finished" })));
    expect(await refundState("req-1", state as unknown as typeof fetch)).toEqual({ ok: true, label: "finished" });
    expect(state.mock.calls[0][0]).toBe(`${REFUND_STATE_URL}?id=req-1`);
  });
});

describe("сверка с кассой", () => {
  async function pendingOrder(t: ReturnType<typeof setup>, body: unknown = { plan: "team", months: 1 }) {
    const { invId } = (await checkout(t.deps, body)).json as { invId: number };
    return invId;
  }

  it("уведомление потерялось — тик находит оплату в кассе, тариф продлевается, владелец знает про ResultURL", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await pendingOrder(t);
    // Свежий заказ не трогаем: человек ещё платит.
    t.clock.now = NOW + 60;
    await runBillingTick(t.deps);
    expect(box.calls).toEqual([]);

    t.clock.now = NOW + 5 * 60;
    await runBillingTick(t.deps);
    expect(box.calls).toEqual([OP_STATE_URL]);
    expect(t.orders.get(invId)!.status).toBe("pending");

    box.states.set(invId, 100);
    t.clock.now = NOW + 11 * 60;
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "paid", planUntilAfter: addMonths(NOW + 11 * 60, 1) });
    expect(JSON.parse(t.orders.get(invId)!.rawResult!)).toMatchObject({ source: "OpStateExt", state: 100 });
    expect(t.companies.get(1)).toMatchObject({ plan: "team", planUntil: addMonths(NOW + 11 * 60, 1) });
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Оплата получена");
    expect(t.owner.at(-1)).toMatch(/ResultURL не пришло/);

    // Позднее уведомление ResultURL по тому же заказу — «OK», второй раз не продлевает.
    expect((await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }))).body).toBe(`OK${invId}`);
    expect(t.companies.get(1)!.planUntil).toBe(addMonths(NOW + 11 * 60, 1));
  });

  it("старые заказы сверяются реже, тестовые — никогда", async () => {
    const t = setup();
    const box = cashbox(t);
    await pendingOrder(t);
    t.clock.now = NOW + 2 * 3600;
    await runBillingTick(t.deps);
    expect(box.calls).toHaveLength(1);
    t.clock.now += 10 * 60;
    await runBillingTick(t.deps);
    expect(box.calls).toHaveLength(1);
    t.clock.now += 60 * 60;
    await runBillingTick(t.deps);
    expect(box.calls).toHaveLength(2);

    const test = setup({ isTest: true });
    const testBox = cashbox(test);
    await pendingOrder(test);
    test.clock.now = NOW + 3600;
    await runBillingTick(test.deps);
    expect(testBox.calls).toEqual([]);
  });

  it("зачисление идёт — ждём; отменена — «не оплачен»; сумма меньше заказа — не засчитываем", async () => {
    const t = setup();
    const box = cashbox(t);
    const a = await pendingOrder(t);
    const b = await pendingOrder(t);
    box.states.set(a, 50);
    box.states.set(b, 10);
    expect((await reconcileOne(t.deps, a)).json).toMatchObject({ status: "waiting" });
    expect(t.orders.get(a)!.status).toBe("pending");
    expect((await reconcileOne(t.deps, b)).json).toMatchObject({ status: "cancelled" });
    expect(t.orders.get(b)!.status).toBe("expired");

    const c = await pendingOrder(t);
    t.fetchMock.mockResolvedValueOnce(http(200, opXml(0, 100, "1.000000")));
    expect((await reconcileOne(t.deps, c)).json).toMatchObject({ status: "error" });
    expect(t.orders.get(c)!.status).toBe("pending");
    expect(t.owner.at(-1)).toMatch(/не засчитано/i);
  });

  it("сотня брошенных заказов не забивает очередь: свежий проверяется вовремя", async () => {
    const t = setup();
    const box = cashbox(t);
    for (let i = 0; i < 60; i++) {
      const o = await t.store.createOrder({ companyId: 1, userId: null, email: null, plan: "team", months: 1, amountRub: 990, description: "old", isTest: false, recurringConsent: false, recurringChargeOf: null, createdAt: NOW - 2 * DAY });
      t.orders.get(o.id)!.checkedAt = NOW - 3600;
    }
    const fresh = await pendingOrder(t);
    t.orders.get(fresh)!.checkedAt = NOW - 6 * 60;
    t.clock.now = NOW + 10 * 60;
    await runBillingTick(t.deps);
    expect(box.calls).toHaveLength(1);
    expect(t.orders.get(fresh)!.checkedAt).toBe(NOW + 10 * 60);
  });

  it("сумма из кассы: пробелы и запятая понимаются, непонятная — не засчитываем", () => {
    expect(coversAmount("990.000000", 990)).toBe(true);
    expect(coversAmount("1 990,00", 1990)).toBe(true);
    expect(coversAmount("989.99", 990)).toBe(false);
    expect(coversAmount("abc", 990)).toBe(false);
    expect(coversAmount(null, 990)).toBe(true);
  });

  it("опрос статуса со страницы оплаты спрашивает кассу в фоне, не чаще раза в 30 секунд", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await pendingOrder(t);
    box.states.set(invId, 100);
    checkWhilePolling(t.deps, t.orders.get(invId)!);
    await flush();
    expect(box.calls).toEqual([]);
    t.clock.now = NOW + 90;
    checkWhilePolling(t.deps, t.orders.get(invId)!);
    checkWhilePolling(t.deps, t.orders.get(invId)!);
    await flush();
    await flush();
    expect(box.calls).toEqual([OP_STATE_URL]);
    expect(t.orders.get(invId)!.status).toBe("paid");
  });

  it("проверка подключения: «не найдено» — логин и Пароль #2 верны; неверная подпись — понятный текст", async () => {
    const t = setup();
    t.fetchMock.mockResolvedValueOnce(http(200, opXml(3)));
    expect(await checkConnection(t.deps)).toMatchObject({ ok: true });
    expect(new URL(t.fetchMock.mock.calls[0][0]).searchParams.get("InvoiceID")).toBe(String(PROBE_INV_ID));
    t.fetchMock.mockResolvedValueOnce(http(200, opXml(1)));
    expect(await checkConnection(t.deps)).toEqual({ ok: false, message: expect.stringMatching(/Пароль #2/) });
    t.fetchMock.mockResolvedValueOnce(http(200, opXml(2)));
    expect((await checkConnection(t.deps)).message).toMatch(/логин/);
    t.fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));
    expect(await checkConnection(t.deps)).toMatchObject({ ok: false, message: expect.stringMatching(/ENOTFOUND/) });
    expect(await checkConnection({ ...t.deps, config: () => ({ ...CFG, password2: "" }) })).toMatchObject({ ok: false });
  });

  it("диагностика: что задано — да/нет, без значений паролей; адреса для кабинета", async () => {
    const t = setup({ password3: "" });
    const diag = await billingDiagnostics({ ...t.deps, baseUrl: () => "https://tasksflow.ru/" });
    expect(diag.secrets).toEqual({ login: true, password1: true, password2: true, testPassword1: true, testPassword2: true, password3: false });
    expect(diag.urls).toEqual({
      result: "https://tasksflow.ru/api/billing/robokassa/result",
      success: "https://tasksflow.ru/billing/success",
      fail: "https://tasksflow.ru/billing/fail",
    });
    const json = JSON.stringify(diag);
    for (const secret of ["p1", "p2", "t1", "t2"]) expect(json).not.toContain(`"${secret}"`);
  });
});

describe("возвраты", () => {
  async function paid(t: ReturnType<typeof setup>, body: unknown = { plan: "team", months: 1 }) {
    const { invId } = (await checkout(t.deps, body)).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    await flush();
    return invId;
  }

  it("возврат через кассу: заявка → «возврат в обработке» → деньги ушли → «возвращён», тариф как до оплаты", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    box.states.set(invId, 100);
    // "" — до оплаты тарифа не было (NULL оставлен для оплат до снимка).
    expect(t.orders.get(invId)).toMatchObject({ planBefore: "", planUntilBefore: null });

    const reply = await refundOrder(t.deps, invId);
    expect(reply.status).toBe(200);
    expect(box.calls).toEqual([OP_STATE_URL, REFUND_CREATE_URL]);
    expect(t.orders.get(invId)).toMatchObject({ status: "paid", refundStatus: "pending", refundRequestId: "req-1" });
    expect((reply.json as { order: { refundStatus: string } }).order.refundStatus).toBe("pending");
    // Второй раз не отправить — двойной возврат.
    expect((await refundOrder(t.deps, invId)).status).toBe(409);

    await runBillingTick(t.deps);
    expect(t.orders.get(invId)!.status).toBe("paid");
    box.refundLabel = "finished";
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "refunded", refundStatus: "finished", refundedAt: NOW });
    expect(t.companies.get(1)).toMatchObject({ plan: null, planUntil: null });
    expect(t.notices.at(-1)!.notice.title).toBe("Деньги возвращены");
    expect(t.owner.at(-1)).toMatch(/Возврат .* завершён/);

    // Повторное уведомление ResultURL по возвращённому заказу тариф не включит.
    expect((await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }))).body).toBe(`OK${invId}`);
    expect(t.companies.get(1)!.plan).toBeNull();
  });

  it("после возвращённой оплаты была другая — срок не откатываем", async () => {
    const t = setup();
    const box = cashbox(t);
    const first = await paid(t);
    const second = await paid(t);
    const until = t.companies.get(1)!.planUntil!;
    box.states.set(first, 100);
    box.refundLabel = "finished";
    await refundOrder(t.deps, first);
    await runBillingTick(t.deps);
    expect(t.orders.get(first)!.status).toBe("refunded");
    expect(t.companies.get(1)!.planUntil).toBe(until);
    expect(t.notices.at(-1)!.notice.paragraphs.join(" ")).toMatch(/Срок тарифа не меняли/);
    expect(t.orders.get(second)!.status).toBe("paid");
  });

  it("вернули сначала раннюю оплату, потом позднюю — тариф откатывается до первой, без подарка", async () => {
    const t = setup();
    const box = cashbox(t);
    const first = await paid(t);
    const second = await paid(t);
    box.states.set(first, 100);
    box.states.set(second, 100);
    box.refundLabel = "finished";
    await refundOrder(t.deps, first);
    await runBillingTick(t.deps);
    await refundOrder(t.deps, second);
    await runBillingTick(t.deps);
    expect([t.orders.get(first)!.status, t.orders.get(second)!.status]).toEqual(["refunded", "refunded"]);
    expect(t.companies.get(1)).toMatchObject({ plan: null, planUntil: null });
  });

  it("оплата до снимка «до оплаты» (planBefore NULL) — срок не трогаем, владельцу — поправить вручную", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    const until = t.companies.get(1)!.planUntil;
    Object.assign(t.orders.get(invId)!, { planBefore: null, planUntilBefore: null });
    box.states.set(invId, 100);
    box.refundLabel = "finished";
    await refundOrder(t.deps, invId);
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)!.status).toBe("refunded");
    expect(t.companies.get(1)!.planUntil).toBe(until);
    expect(t.owner.at(-1)).toMatch(/Поправьте срок вручную/);
  });

  it("зависшее «отправляется» (процесс упал посреди отправки) — через 10 минут «проверьте кассу», State 60 заканчивает", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    expect(await t.store.claimRefund(invId, NOW)).toBe(true);
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)!.refundStatus).toBe("sending");
    box.states.set(invId, 60);
    t.clock.now = NOW + 11 * 60;
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "refunded", refundStatus: "finished" });
    expect(t.owner.some((m) => /завис на отправке/.test(m))).toBe(true);
  });

  it("«касса не ответила» — повтор только с force; перед отправкой касса спрашивается снова", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    box.states.set(invId, 100);
    box.refund = new Error("timeout");
    expect((await refundOrder(t.deps, invId)).status).toBe(202);
    expect(await refundOrder(t.deps, invId)).toMatchObject({ status: 409, json: { code: "refund_uncertain" } });
    box.refund = http(200, JSON.stringify({ success: true, requestId: "req-2" }));
    const before = box.calls.length;
    expect((await refundOrder(t.deps, invId, { force: true })).status).toBe(200);
    expect(box.calls.slice(before)).toEqual([OP_STATE_URL, REFUND_CREATE_URL]);
    expect(t.orders.get(invId)).toMatchObject({ refundStatus: "pending", refundRequestId: "req-2" });
    // Если касса уже вернула — повтор не отправляет вторую заявку.
    const other = await paid(t);
    box.states.set(other, 100);
    box.refund = new Error("timeout");
    await refundOrder(t.deps, other);
    box.states.set(other, 60);
    const mark = box.calls.length;
    expect((await refundOrder(t.deps, other, { force: true })).status).toBe(200);
    expect(box.calls.slice(mark)).toEqual([OP_STATE_URL]);
    expect(t.orders.get(other)!.status).toBe("refunded");
  });

  it("возврат оплаты серии выключает автопродление — иначе откат срока сразу вызвал бы списание", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t, { plan: "team", months: 1, recurringConsent: true });
    expect(t.billing.get(1)!.recurringActive).toBe(true);
    box.states.set(invId, 100);
    await refundOrder(t.deps, invId);
    expect(t.billing.get(1)!.recurringActive).toBe(false);
    expect(t.consents.at(-1)).toMatchObject({ granted: false, statementText: expect.stringMatching(/возврат оплаты/) });
  });

  it("касса не ответила на возврат — «проверьте кассу», без повтора; сверка видит State 60 и заканчивает", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    box.states.set(invId, 100);
    box.refund = new Error("timeout");
    const reply = await refundOrder(t.deps, invId);
    expect(reply.status).toBe(202);
    expect(t.orders.get(invId)!.refundStatus).toBe("uncertain");
    expect(t.owner.at(-1)).toMatch(/не повторяйте/);
    expect((await refundOrder(t.deps, invId)).status).toBe(409);

    box.states.set(invId, 60);
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "refunded", refundStatus: "finished" });
  });

  it("касса отклонила или отменила возврат — можно отправить снова", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    box.states.set(invId, 100);
    box.refund = http(400, JSON.stringify({ success: false, message: "Недостаточно средств на балансе", requestId: null }));
    const rejected = await refundOrder(t.deps, invId);
    expect(rejected.status).toBe(502);
    expect((rejected.json as { message: string }).message).toMatch(/Недостаточно средств/);
    expect(t.orders.get(invId)!.refundStatus).toBeNull();

    box.refund = http(200, JSON.stringify({ success: true, requestId: "req-1" }));
    expect((await refundOrder(t.deps, invId)).status).toBe(200);
    box.refundLabel = "canceled";
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "paid", refundStatus: "canceled" });
    expect((await refundOrder(t.deps, invId)).status).toBe(200);
  });

  it("деньги вернули в кабинете кассы — «Проверить в кассе» отмечает возврат", async () => {
    const t = setup();
    const box = cashbox(t);
    const invId = await paid(t);
    box.states.set(invId, 60);
    expect((await reconcileOne(t.deps, invId)).json).toMatchObject({ status: "refunded", order: { status: "refunded" } });
    expect(t.companies.get(1)!.plan).toBeNull();
    expect(box.calls).not.toContain(REFUND_CREATE_URL);
  });

  it("без Пароля #3, тестовый или неоплаченный заказ — понятный отказ, касса не трогается", async () => {
    const t = setup({ password3: "" });
    const box = cashbox(t);
    const invId = await paid(t);
    expect(await refundOrder(t.deps, invId)).toMatchObject({ status: 503, json: { code: "no_password3" } });
    const { invId: pending } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    expect((await refundOrder(t.deps, pending)).status).toBe(409);
    expect((await refundOrder(t.deps, 9999)).status).toBe(404);

    const test = setup({ isTest: true });
    cashbox(test);
    const { invId: testId } = (await checkout(test.deps, { plan: "team", months: 1 })).json as { invId: number };
    await handleResult(test.deps, resultFor({ id: testId, amountRub: 990 }, "t2"));
    expect((await refundOrder(test.deps, testId)).status).toBe(409);
    expect(box.calls).toEqual([]);
  });
});

describe("напоминания об окончании тарифа", () => {
  it("без автопродления: за 3 дня — «скоро закончится», после конца — «закончился», по разу", async () => {
    const t = setup();
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    await flush();
    t.notices.length = 0;
    const until = t.companies.get(1)!.planUntil!;
    await runBillingTick(t.deps);
    expect(t.notices).toHaveLength(0);

    t.clock.now = until - 3 * DAY + 60;
    await runBillingTick(t.deps);
    await runBillingTick(t.deps);
    expect(t.notices.map((n) => n.notice.title)).toEqual(["Тариф скоро закончится"]);
    expect(t.notices[0].notice.paragraphs[0]).toContain(formatDay(until));

    t.clock.now = until + 600;
    await runBillingTick(t.deps);
    await runBillingTick(t.deps);
    expect(t.notices.map((n) => n.notice.title)).toEqual(["Тариф скоро закончится", "Тариф закончился"]);
    expect(t.notices[1].notice.paragraphs[0]).toMatch(/«Старт»/);

    // Через сутки после конца — уже не напоминаем (и старые тарифы при выкладке не всплывут).
    t.clock.now = until + DAY + 600;
    t.billing.get(1)!.expiredNoticeFor = null;
    await runBillingTick(t.deps);
    expect(t.notices).toHaveLength(2);
  });

  it("тариф, подключённый root вручную (по счёту), напоминаний не получает", async () => {
    const t = setup();
    t.companies.set(1, { id: 1, name: "Кафе", plan: "team", planUntil: NOW + 2 * DAY } as never);
    await runBillingTick(t.deps);
    t.clock.now = NOW + 2 * DAY + 600;
    await runBillingTick(t.deps);
    expect(t.notices).toHaveLength(0);
  });

  it("с автопродлением и бессрочный тариф — без этих напоминаний", async () => {
    const t = setup();
    t.companies.set(1, { id: 1, name: "Кафе", plan: "team", planUntil: null } as never);
    t.clock.now = NOW + DAY;
    await runBillingTick(t.deps);
    expect(t.notices).toHaveLength(0);

    t.companies.set(1, { id: 1, name: "Кафе", plan: null, planUntil: null } as never);
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    await flush();
    t.notices.length = 0;
    t.clock.now = t.companies.get(1)!.planUntil! - 2 * DAY;
    await runBillingTick(t.deps);
    expect(t.notices.map((n) => n.notice.title)).toEqual(["Скоро продление тарифа"]);
  });
});

describe("маршруты оплаты", () => {
  async function buildApp(t: ReturnType<typeof setup>, role: "admin" | "worker" | "root" = "admin") {
    const { registerBillingRoutes, __resetCheckoutLimit } = await import("../server/billing-routes");
    __resetCheckoutLimit();
    storageMock.getUserById.mockResolvedValue({ id: 5, email: "boss@cafe.ru", companyId: 1, isAdmin: role !== "worker", isRoot: role === "root" });
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req: any, _res, next) => {
      req.session = { userId: 5 };
      next();
    });
    const requireAdmin = (_req: any, res: any, next: any) => (role === "worker" ? res.status(403).json({ message: "Требуются права администратора" }) : next());
    const requireRoot = (_req: any, res: any, next: any) => (role === "root" ? next() : res.status(403).json({ message: "Доступ только для root" }));
    registerBillingRoutes(app, { requireAdmin, requireRoot, getCompanyIdFromReq: async () => 1, billing: t.deps });
    app.get("/billing/success", (_req, res) => res.send("spa"));
    return app;
  }

  it("страница тарифа — только админу; цены, тариф и история", async () => {
    const t = setup();
    expect((await request(await buildApp(t, "worker")).get("/api/billing")).status).toBe(403);
    const res = await request(await buildApp(t)).get("/api/billing");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: true, testMode: false, recurringAvailable: true, plan: { id: "start", usersCount: 3 }, email: "boss@cafe.ru" });
    expect(res.body.prices).toHaveLength(3);
  });

  it("из iOS-приложения оплату не начать", async () => {
    const t = setup();
    const res = await request(await buildApp(t)).post("/api/billing/checkout").set("User-Agent", "Mozilla/5.0 TasksFlowApp/1.0.0").send({ plan: "team", months: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("app_payment");
    expect(t.orders.size).toBe(0);
  });

  it("ResultURL формой: ответ «OK{InvId}» текстом", async () => {
    const t = setup();
    const app = await buildApp(t);
    const created = await request(app).post("/api/billing/checkout").send({ plan: "team", months: 1 });
    expect(created.status).toBe(200);
    const res = await request(app).post("/api/billing/robokassa/result").type("form").send(resultFor({ id: created.body.invId, amountRub: 990 }));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toBe(`OK${created.body.invId}`);
    const status = await request(app).get(`/api/billing/orders/${created.body.invId}`);
    expect(status.body).toMatchObject({ id: created.body.invId, status: "paid", planUntil: addMonths(NOW, 1) });
  });

  it("чужой заказ — 404", async () => {
    const t = setup();
    const order = await t.store.createOrder({ companyId: 2, userId: null, email: null, plan: "team", months: 1, amountRub: 990, description: "x", isTest: false, recurringConsent: false, recurringChargeOf: null, createdAt: NOW });
    expect((await request(await buildApp(t)).get(`/api/billing/orders/${order.id}`)).status).toBe(404);
  });

  it("возврат с оплаты: POST → GET, в рамке окна оплаты — SAMEORIGIN", async () => {
    const t = setup();
    const app = await buildApp(t);
    const post = await request(app).post("/billing/success").type("form").send({ InvId: "15", OutSum: "990.00", SignatureValue: "x" });
    expect(post.status).toBe(303);
    expect(post.headers.location).toBe("/billing/success?InvId=15&OutSum=990.00");
    const get = await request(app).get("/billing/success?InvId=15");
    expect(get.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("касса для root: диагностика, проверка, сверка и возврат — только root", async () => {
    const t = setup();
    const box = cashbox(t);
    const adminApp = await buildApp(t);
    for (const [method, url] of [
      ["get", "/api/root/billing/diagnostics"],
      ["post", "/api/root/billing/check"],
      ["post", "/api/root/billing/orders/15/reconcile"],
      ["post", "/api/root/billing/orders/15/refund"],
    ] as const) {
      expect((await request(adminApp)[method](url)).status).toBe(403);
    }
    const app = await buildApp(t, "root");
    const diag = await request(app).get("/api/root/billing/diagnostics");
    expect(diag.status).toBe(200);
    expect(diag.body).toMatchObject({ configured: true, testMode: false, secrets: { password3: true }, stats: { tables: true } });
    expect((await request(app).post("/api/root/billing/check")).body).toMatchObject({ ok: true });
    expect((await request(app).post("/api/root/billing/orders/abc/refund")).status).toBe(404);

    const created = await request(await buildApp(t)).post("/api/billing/checkout").send({ plan: "team", months: 1 });
    box.states.set(created.body.invId, 100);
    const rec = await request(app).post(`/api/root/billing/orders/${created.body.invId}/reconcile`);
    expect(rec.body).toMatchObject({ status: "paid", order: { id: created.body.invId, status: "paid", companyName: "Кафе" } });
    const refund = await request(app).post(`/api/root/billing/orders/${created.body.invId}/refund`);
    expect(refund.status).toBe(200);
    expect(refund.body.order).toMatchObject({ refundStatus: "pending" });
  });

  it("цены меняет только root, с проверкой", async () => {
    const t = setup();
    expect((await request(await buildApp(t)).put("/api/root/billing/prices").send({ prices: [] })).status).toBe(403);
    const app = await buildApp(t, "root");
    expect((await request(app).put("/api/root/billing/prices").send({ prices: [{ plan: "team", months: 1, priceRub: -5 }] })).status).toBe(400);
    const ok = await request(app).put("/api/root/billing/prices").send({ prices: [{ plan: "business", months: 1, priceRub: 2990 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.prices).toEqual([{ plan: "business", months: 1, priceRub: 2990 }]);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
beforeEach(() => {
  storageMock.getUserById.mockReset();
});

// --- Промокоды, счета, УПД, PDF --------------------------------------------------------

const SELLER = sellerRequisites({
  LEGAL_OPERATOR_NAME: "ИП Петров Пётр Петрович",
  LEGAL_OPERATOR_INN: "500100732259",
  LEGAL_OPERATOR_OGRN: "304500116000157",
  LEGAL_OPERATOR_ADDRESS: "123456, г. Москва, ул. Примерная, д. 1",
  LEGAL_BANK_NAME: "АО «ТБанк»",
  LEGAL_BANK_BIK: "044525974",
  LEGAL_BANK_ACCOUNT: "40802810000000000001",
  LEGAL_BANK_CORR_ACCOUNT: "30101810145250000974",
  LEGAL_SIGNER_NAME: "Петров П. П.",
} as NodeJS.ProcessEnv);
const BUYER = { kind: "org", name: "ООО «Кафе»", inn: "7707083893", kpp: "773601001", address: "117312, г. Москва, ул. Вавилова, д. 19", headPost: "Директор", headName: "Сидорова А. Б." };

function withDocs(t: ReturnType<typeof setup>) {
  t.deps.seller = () => SELLER;
  t.deps.baseUrl = () => "https://tasksflow.ru";
  return t;
}

async function addPromo(t: ReturnType<typeof setup>, over: Partial<PromoCodeRow> = {}) {
  return (await t.store.createPromo({
    code: "START",
    kind: "percent",
    value: 20,
    active: true,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    newClientsOnly: false,
    companyId: null,
    note: null,
    lifetime: false,
    durationMonths: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }))!;
}

/** PDF разбирается: заголовок, xref указывает ровно на начала объектов. */
function checkPdf(pdf: Buffer) {
  const text = pdf.toString("latin1");
  expect(text.startsWith("%PDF-1.7")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
  expect(text.slice(startxref, startxref + 4)).toBe("xref");
  const entries = text.slice(startxref).split("\n").filter((l) => / 00000 n $/.test(l));
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
  });
  expect(text).toContain("/FontFile2");
  expect(text).toContain("/ToUnicode");
}

describe("реквизиты: ИНН, ОГРН, схема", () => {
  it("контрольные цифры ИНН и ОГРН — по алгоритму ФНС", () => {
    expect(isValidInn("7707083893")).toBe(true);
    expect(isValidInn("500100732259")).toBe(true);
    expect(isValidInn("7707083894")).toBe(false);
    expect(isValidInn("500100732258")).toBe(false);
    expect(isValidInn("12345")).toBe(false);
    expect(isValidOgrn("1027700132195")).toBe(true);
    expect(isValidOgrn("304500116000157")).toBe(true);
    expect(isValidOgrn("1027700132196")).toBe(false);
  });

  it("организации нужен КПП, у ИП его нет; ИНН — по виду; пробелы убираются", () => {
    expect(requisitesSchema.safeParse({ ...BUYER, kpp: "" }).success).toBe(false);
    expect(requisitesSchema.safeParse({ ...BUYER, inn: "500100732259" }).success).toBe(false);
    const ip = requisitesSchema.parse({ kind: "ip", name: "ИП Иванов", inn: "5001 0073 2259", kpp: "773601001", address: "г. Москва, ул. Ленина, 1" });
    expect(ip).toMatchObject({ inn: "500100732259", kpp: null, ogrn: null, email: null });
    expect(requisitesSchema.safeParse({ ...BUYER, ogrn: "1027700132196" }).success).toBe(false);
  });

  it("реквизиты исполнителя: чего не хватает — по имени секрета", () => {
    expect(sellerMissing(SELLER)).toEqual([]);
    const missing = sellerMissing(sellerRequisites({ LEGAL_OPERATOR_NAME: "ООО «Ромашка»", LEGAL_OPERATOR_INN: "7707083893" } as NodeJS.ProcessEnv));
    expect(missing.some((m) => m.startsWith("LEGAL_OPERATOR_KPP"))).toBe(true);
    expect(missing.some((m) => m.startsWith("LEGAL_BANK_BIK"))).toBe(true);
    expect(missing.some((m) => m.startsWith("LEGAL_SIGNER_POST"))).toBe(true);
    // ИП подписывает сам: должность выводится из ИНН из 12 цифр.
    expect(SELLER.head).toEqual({ post: "Индивидуальный предприниматель", name: "Петров П. П." });
  });
});

describe("промокоды", () => {
  it("скидка: процент и рубли, не больше цены; код — в верхнем регистре", () => {
    expect(promoDiscountRub("percent", 20, 990)).toBe(198);
    expect(promoDiscountRub("fixed", 500, 990)).toBe(500);
    expect(promoDiscountRub("fixed", 5000, 990)).toBe(990);
    expect(promoDiscountRub("percent", 150, 990)).toBe(990);
    expect(normalizePromoCode("  start 2026 ")).toBe("START2026");
    expect(promoLabel("percent", 20)).toBe("−20 %");
  });

  it("заказ с кодом: сумма со скидкой, серия — по полной цене, согласие говорит об этом", async () => {
    const t = setup();
    await addPromo(t);
    // Сумма на странице без скидки — заказ не создаётся.
    expect((await checkout(t.deps, { plan: "team", months: 1, promoCode: "START", expectedRub: 990 })).status).toBe(409);
    const r = await checkout(t.deps, { plan: "team", months: 1, promoCode: "start", recurringConsent: true, expectedRub: 792 });
    expect(r.status).toBe(200);
    const { invId, amountRub, params } = r.json as { invId: number; amountRub: number; params: Record<string, string> };
    expect(amountRub).toBe(792);
    expect(params.OutSum).toBe("792.00");
    expect(t.orders.get(invId)).toMatchObject({ amountRub: 792, baseRub: 990, discountRub: 198, promoCode: "START", paymentMethod: "card" });
    expect(t.consents.at(-1)!.statementText).toMatch(/Спишем 990\s₽.*Первый платёж — 792\s₽ \(по промокоду START\)/);
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 792 }));
    expect(t.billing.get(1)).toMatchObject({ recurringActive: true, recurringAmountRub: 990 });
  });

  it("неподходящий код — понятная причина, заказ не создаётся", async () => {
    const t = setup();
    t.companies.set(2, { id: 2, name: "Бар", plan: null, planUntil: null } as never);
    await addPromo(t, { code: "OFF", active: false });
    await addPromo(t, { code: "LATER", startsAt: NOW + DAY });
    await addPromo(t, { code: "OLD", endsAt: NOW - 1 });
    await addPromo(t, { code: "BAR", companyId: 2 });
    const reason = async (code: string) => ((await checkout(t.deps, { plan: "team", months: 1, promoCode: code })).json as { message: string; code?: string });
    expect(await reason("NOPE")).toEqual({ message: "Такого промокода нет", code: "promo" });
    expect((await reason("OFF")).message).toBe("Промокод отключён");
    expect((await reason("LATER")).message).toBe("Промокод ещё не начал действовать");
    expect((await reason("OLD")).message).toBe("Срок действия промокода истёк");
    expect((await reason("BAR")).message).toBe("Этот промокод выдан другой компании");
    expect(t.orders.size).toBe(0);
  });

  it("лимит использований и «только первая оплата»: после оплаты код не подходит", async () => {
    const t = setup();
    await addPromo(t, { code: "ONCE", maxUses: 1 });
    await addPromo(t, { code: "FIRST", newClientsOnly: true });
    const first = (await checkout(t.deps, { plan: "team", months: 1, promoCode: "ONCE" })).json as { invId: number; amountRub: number };
    await handleResult(t.deps, resultFor({ id: first.invId, amountRub: first.amountRub }));
    expect(((await checkout(t.deps, { plan: "team", months: 1, promoCode: "ONCE" })).json as { message: string }).message).toMatch(/максимальное число раз/);
    expect(((await checkout(t.deps, { plan: "team", months: 1, promoCode: "FIRST" })).json as { message: string }).message).toMatch(/только для первой оплаты/);
  });

  it("промокод на всю сумму включает тариф сразу — даже без кассы, без автопродления", async () => {
    const t = setup({ login: "", password1: "", password2: "" });
    await addPromo(t, { code: "FREE", kind: "percent", value: 100 });
    const r = await checkout(t.deps, { plan: "team", months: 1, promoCode: "FREE", recurringConsent: true, expectedRub: 0 });
    expect(r.status).toBe(200);
    const json = r.json as { free: boolean; order: { status: string; method: string } };
    expect(json.free).toBe(true);
    expect(json.order).toMatchObject({ status: "paid", method: "promo" });
    expect(t.companies.get(1)).toMatchObject({ plan: "team", planUntil: addMonths(NOW, 1) });
    expect(t.billing.get(1)?.recurringActive ?? false).toBe(false);
    expect(t.fetchMock).not.toHaveBeenCalled();
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Тариф включён");
    expect(t.owner.at(-1)).toMatch(/Промокод на всю сумму/);
    // Без кассы обычная оплата по-прежнему недоступна.
    expect((await checkout(t.deps, { plan: "team", months: 1 })).status).toBe(503);
  });
});

describe("промокоды: гонки и повторы", () => {
  it("два одновременных включения по коду с лимитом 1 — одно; одна компания не включает код дважды", async () => {
    const t = setup();
    t.companies.set(2, { id: 2, name: "Бар", plan: null, planUntil: null } as never);
    await addPromo(t, { code: "GIFT", value: 100, maxUses: 1 });
    const [a, b] = await Promise.all([
      checkout(t.deps, { plan: "team", months: 1, promoCode: "GIFT" }),
      createCheckout(t.deps, { companyId: 2, user: admin, body: { plan: "team", months: 1, promoCode: "GIFT" }, ip: null, userAgent: null }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(Array.from(t.orders.values()).filter((o) => o.status === "paid")).toHaveLength(1);

    await addPromo(t, { code: "MONTH", value: 100 });
    expect((await checkout(t.deps, { plan: "team", months: 1, promoCode: "MONTH" })).status).toBe(200);
    const again = await checkout(t.deps, { plan: "team", months: 1, promoCode: "MONTH" });
    expect(again).toMatchObject({ status: 400, json: { code: "promo" } });
    expect((again.json as { message: string }).message).toMatch(/уже использовали/);
  });

  it("ждущий оплаты заказ держит лимит час, счёт — пока не оплачен или не отменён", async () => {
    const t = setup();
    t.companies.set(2, { id: 2, name: "Бар", plan: null, planUntil: null } as never);
    await addPromo(t, { code: "ONE", maxUses: 1 });
    expect((await checkout(t.deps, { plan: "team", months: 1, promoCode: "ONE" })).status).toBe(200);
    const other = () => createCheckout(t.deps, { companyId: 2, user: admin, body: { plan: "team", months: 1, promoCode: "ONE" }, ip: null, userAgent: null });
    expect((await other()).status).toBe(400);
    t.clock.now = NOW + 2 * 3600;
    expect((await other()).status).toBe(200);
  });
});

describe("оплата по счёту", () => {
  const invoiceFor = (t: ReturnType<typeof setup>, body: unknown) => createInvoice(t.deps, { companyId: 1, user: admin, body });

  it("без реквизитов исполнителя или компании счёт не выставить", async () => {
    const t = setup();
    expect((await invoiceFor(t, { plan: "team", months: 1 })).status).toBe(503);
    withDocs(t);
    expect(await invoiceFor(t, { plan: "team", months: 1 })).toMatchObject({ status: 400, json: { code: "requisites" } });
  });

  it("счёт: заказ без кассы на 7 дней; повтор — тот же счёт, другие условия — новый, старый отменён", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: { ...BUYER, email: "buh@cafe.ru" } });
    const first = await invoiceFor(t, { plan: "team", months: 1 });
    expect(first.status).toBe(200);
    const order = (first.json as { order: { id: number } }).order;
    expect(t.orders.get(order.id)).toMatchObject({ paymentMethod: "invoice", status: "pending", isTest: false, email: "buh@cafe.ru", invoiceDueAt: NOW + 7 * DAY });
    await flush();
    expect(t.owner.at(-1)).toMatch(/Счёт №\d+ — «Кафе».*ИНН 7707083893.*Отметить оплату/);
    expect(t.fetchMock).not.toHaveBeenCalled();

    const again = await invoiceFor(t, { plan: "team", months: 1 });
    expect(again.json).toMatchObject({ existing: true, order: { id: order.id } });
    const other = await invoiceFor(t, { plan: "team", months: 12 });
    expect((other.json as { existing: boolean }).existing).toBe(false);
    expect(t.orders.get(order.id)!.status).toBe("cancelled");

    // Счёт не «протухает» через 3 дня и не сверяется с кассой.
    t.clock.now = NOW + 4 * DAY;
    await runBillingTick(t.deps);
    expect(t.orders.get((other.json as { order: { id: number } }).order.id)!.status).toBe("pending");
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it("root отмечает оплату — тариф продлевается, как по кассе; оплаченный отменённый счёт — тоже", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const id = ((await invoiceFor(t, { plan: "team", months: 1 })).json as { order: { id: number } }).order.id;
    expect((await markInvoicePaid(t.deps, id, { userId: 9 })).status).toBe(200);
    expect(t.orders.get(id)).toMatchObject({ status: "paid", planUntilAfter: addMonths(NOW, 1) });
    expect(t.companies.get(1)).toMatchObject({ plan: "team", planUntil: addMonths(NOW, 1) });
    expect((await markInvoicePaid(t.deps, id, { userId: 9 })).status).toBe(409);
    await flush();
    expect(t.notices.at(-1)!.notice.paragraphs.join(" ")).toMatch(/по счёту.*УПД/s);
    // Возврат по счёту — не через кассу.
    expect((await refundOrder(t.deps, id)).status).toBe(409);

    const late = ((await invoiceFor(t, { plan: "team", months: 12 })).json as { order: { id: number } }).order.id;
    expect((await cancelInvoiceOrder(t.deps, late)).status).toBe(200);
    expect((await markInvoicePaid(t.deps, late, { userId: 9 })).status).toBe(200);
    expect(t.orders.get(late)!.status).toBe("paid");
  });

  it("промокод на счёт; промокод на всю сумму — счёт не нужен", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    await addPromo(t, { code: "FIX", kind: "fixed", value: 190 });
    await addPromo(t, { code: "FREE", value: 100 });
    const r = await invoiceFor(t, { plan: "team", months: 1, promoCode: "FIX", expectedRub: 800 });
    expect(r.json).toMatchObject({ order: { amountRub: 800, promoCode: "FIX", discountRub: 190 } });
    expect(await invoiceFor(t, { plan: "team", months: 1, promoCode: "FREE" })).toMatchObject({ status: 400, json: { code: "free" } });
  });
});

describe("закрывающие документы (УПД)", () => {
  async function paidOrder(t: ReturnType<typeof setup>) {
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    t.clock.now = NOW + 3600;
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    return t.orders.get(invId)!;
  }

  it("снимок на дату оплаты: номер — номер заказа, период — оплаченный, повтор — тот же документ", async () => {
    const t = withDocs(setup());
    const order = await paidOrder(t);
    const doc = (await ensureClosingDocument(t.deps, order))!;
    expect(doc).toMatchObject({ orderId: order.id, number: String(order.id), issuedAt: NOW + 3600, totalRub: 990, status: "issued" });
    const lines = JSON.parse(doc.lines);
    expect(lines[0].title).toContain(`период ${formatRuDate(addMonths(order.planUntilAfter!, -1))} — ${formatRuDate(order.planUntilAfter!)}`);
    expect(JSON.parse(doc.seller)).toMatchObject({ name: "ИП Петров Пётр Петрович", inn: "500100732259", site: "tasksflow.ru" });
    // Без реквизитов покупателя — только название; заполнили — документ дополнится.
    expect(JSON.parse(doc.buyer)).toMatchObject({ name: "Кафе", inn: null });
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const refreshed = (await ensureClosingDocument(t.deps, order))!;
    expect(JSON.parse(refreshed.buyer)).toMatchObject({ name: "ООО «Кафе»", inn: "7707083893", kpp: "773601001", head: { post: "Директор", name: "Сидорова А. Б." } });
    expect(t.documents.size).toBe(1);
    checkPdf(closingPdf(refreshed));
  });

  it("нет документа: не оплачен, тестовый, без денег или реквизиты исполнителя не заполнены", async () => {
    const plain = setup();
    expect(await ensureClosingDocument(plain.deps, await paidOrder(plain))).toBeNull();
    const t = withDocs(setup());
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    expect(await ensureClosingDocument(t.deps, t.orders.get(invId)!)).toBeNull();
    const test = withDocs(setup({ isTest: true }));
    const { invId: testId } = (await checkout(test.deps, { plan: "team", months: 1 })).json as { invId: number };
    await handleResult(test.deps, resultFor({ id: testId, amountRub: 990 }, "t2"));
    expect(await ensureClosingDocument(test.deps, test.orders.get(testId)!)).toBeNull();
  });

  it("возврат денег аннулирует УПД", async () => {
    const t = withDocs(setup());
    const box = cashbox(t);
    const order = await paidOrder(t);
    await ensureClosingDocument(t.deps, order);
    box.states.set(order.id, 100);
    box.refundLabel = "finished";
    await refundOrder(t.deps, order.id);
    await runBillingTick(t.deps);
    expect(t.documents.get(order.id)).toMatchObject({ status: "voided" });
  });

  it("счёт PDF — по текущим реквизитам; документы скачивает админ своей компании или root", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const invoiceId = ((await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 1 } })).json as { order: { id: number } }).order.id;
    const pdf = (await invoicePdf(t.deps, t.orders.get(invoiceId)!))!;
    checkPdf(pdf);
    expect(pdf.length).toBeLessThan(150_000);
    const card = await paidOrder(t);
    expect(await invoicePdf(t.deps, card)).toBeNull();
  });
});

describe("УПД на дату оплаты и сверка только по карте", () => {
  it("УПД выпускается сразу после оплаты: реквизиты исполнителя — на дату оплаты, не скачивания", async () => {
    const t = withDocs(setup());
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    await flush();
    await flush();
    expect(t.documents.get(invId)).toBeTruthy();
    t.deps.seller = () => ({ ...SELLER, bank: { ...SELLER.bank, account: "40802810999999999999" } });
    const doc = (await ensureClosingDocument(t.deps, t.orders.get(invId)!))!;
    expect(JSON.parse(doc.seller).bank.account).toBe(SELLER.bank.account);
  });

  it("идёт возврат — новый УПД не выпускается", async () => {
    const t = withDocs(setup());
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }));
    t.documents.clear();
    Object.assign(t.orders.get(invId)!, { refundStatus: "pending" });
    expect(await ensureClosingDocument(t.deps, t.orders.get(invId)!)).toBeNull();
  });

  it("опрос статуса счёта не спрашивает кассу", async () => {
    const t = withDocs(setup());
    cashbox(t);
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const id = ((await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 1 } })).json as { order: { id: number } }).order.id;
    t.clock.now = NOW + 600;
    checkWhilePolling(t.deps, t.orders.get(id)!);
    await flush();
    expect(t.fetchMock).not.toHaveBeenCalled();
  });
});

describe("PDF: шрифт и генератор", () => {
  const font = documentFont();

  it("DejaVu Sans: кириллица и ₽ есть, подмножество в разы меньше и с теми же глифами", () => {
    expect(font.unitsPerEm).toBe(2048);
    for (const ch of "ЖёЁ№₽«»—") expect(font.glyph(ch.codePointAt(0)!)).toBeGreaterThan(0);
    const gids = Array.from("Счёт на оплату").map((ch) => font.glyph(ch.codePointAt(0)!));
    const subset = subsetTrueType(font, gids);
    expect(subset.length).toBeLessThan(font.data.length / 4);
    const again = parseTrueType(subset);
    expect(again.numGlyphs).toBe(font.numGlyphs);
    for (const gid of gids) expect(again.advance(gid)).toBe(font.advance(gid));
  });

  it("перенос по ширине, таблица переходит на новую страницу с шапкой", () => {
    const doc = new PdfDocument(font);
    const lines = doc.wrap("Доступ к сервису TasksFlow, тариф «Команда», период 24.10.2026 — 24.11.2026.", 40, 9);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(doc.textWidth(line, 9)).toBeLessThanOrEqual(40);
    drawTable(doc, {
      x: 10,
      y: 10,
      columns: [{ width: 20 }, { width: 100 }],
      head: [["№", "Строка"]],
      body: Array.from({ length: 80 }, (_, i) => [String(i + 1), "Строка таблицы"]),
      size: 9,
      bottom: 287,
      top: 10,
    });
    expect(doc.pageCount).toBeGreaterThan(1);
    checkPdf(doc.output());
  });

  it("символ без глифа рисуется пробелом и в ToUnicode остаётся пробелом", () => {
    const doc = new PdfDocument(font);
    doc.text("中Кафе Ромашка", 10, 10);
    const pdf = doc.output().toString("latin1");
    const space = font.glyph(0x20).toString(16).padStart(4, "0").toUpperCase();
    // ToUnicode сжат; распаковываем все потоки и ищем запись для пробела.
    const streams = Array.from(pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)).map((m) => {
      try {
        return inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        return "";
      }
    });
    const cmap = streams.find((x) => x.includes("beginbfchar"))!;
    expect(cmap).toContain(`<${space}> <0020>`);
    expect(cmap).not.toContain("<4E2D>");
  });

  it("сумма прописью и формат денег", () => {
    expect(amountInWords(2490)).toBe("Две тысячи четыреста девяносто рублей 00 копеек");
    expect(amountInWords(1)).toBe("Один рубль 00 копеек");
    expect(amountInWords(21.5)).toBe("Двадцать один рубль 50 копеек");
    expect(amountInWords(1_000_001)).toBe("Один миллион один рубль 00 копеек");
    expect(money(1990)).toBe("1 990,00");
  });
});

describe("маршруты: промокод, реквизиты, счёт, документы", () => {
  async function buildApp(t: ReturnType<typeof setup>, role: "admin" | "root" | "other" = "admin") {
    const { registerBillingRoutes, __resetCheckoutLimit } = await import("../server/billing-routes");
    __resetCheckoutLimit();
    storageMock.getUserById.mockResolvedValue({ id: 5, email: "boss@cafe.ru", companyId: role === "other" ? 2 : 1, isAdmin: role !== "root", isRoot: role === "root" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = { userId: 5 };
      next();
    });
    const requireAdmin = (_req: any, _res: any, next: any) => next();
    const requireRoot = (_req: any, res: any, next: any) => (role === "root" ? next() : res.status(403).json({ message: "Доступ только для root" }));
    registerBillingRoutes(app, { requireAdmin, requireRoot, getCompanyIdFromReq: async () => (role === "other" ? 2 : 1), billing: t.deps });
    return app;
  }

  it("промокод: проверка, лимит попыток; реквизиты: ошибка поля", async () => {
    const t = setup();
    await addPromo(t);
    const app = await buildApp(t);
    expect((await request(app).post("/api/billing/promo").send({ plan: "team", months: 1, promoCode: "start" })).body).toEqual({
      ok: true,
      code: "START",
      kind: "percent",
      value: 20,
      label: "−20 %",
      lifetime: false,
      durationMonths: null,
    });
    expect((await request(app).post("/api/billing/promo").send({ plan: "team", months: 1, promoCode: "NOPE" })).body).toEqual({ ok: false, message: "Такого промокода нет" });
    for (let i = 0; i < 18; i++) await request(app).post("/api/billing/promo").send({ plan: "team", months: 1, promoCode: "X" + i });
    expect((await request(app).post("/api/billing/promo").send({ plan: "team", months: 1, promoCode: "START" })).status).toBe(429);
    const bad = await request(app).put("/api/billing/requisites").send({ ...BUYER, inn: "7707083894" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("inn");
  });

  it("УПД и счёт скачивает админ своей компании и root, чужой — 404; в /api/billing видно, что есть", async () => {
    const t = withDocs(setup());
    const app = await buildApp(t);
    await request(app).put("/api/billing/requisites").send(BUYER).expect(200);
    const inv = await request(app).post("/api/billing/invoice").send({ plan: "team", months: 1 });
    expect(inv.status).toBe(200);
    expect(inv.body.pdfUrl).toBe(`/api/billing/orders/${inv.body.order.id}/invoice.pdf`);
    const pdf = await request(app).get(inv.body.pdfUrl).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(`Счёт-${inv.body.order.id}`)}`);
    checkPdf(pdf.body as Buffer);
    expect((await request(app).get(`/api/billing/orders/${inv.body.order.id}/upd.pdf`)).status).toBe(404);

    expect((await request(await buildApp(t, "other")).get(inv.body.pdfUrl)).status).toBe(404);
    expect((await request(await buildApp(t, "root")).get(inv.body.pdfUrl)).status).toBe(200);
    expect((await request(await buildApp(t, "root")).post(`/api/root/billing/orders/${inv.body.order.id}/invoice-paid`)).status).toBe(200);
    expect((await request(app).get(`/api/billing/orders/${inv.body.order.id}/upd.pdf`)).status).toBe(200);
    const info = await request(app).get("/api/billing");
    expect(info.body).toMatchObject({ invoiceAvailable: true, requisites: { inn: "7707083893" } });
    expect(info.body.orders[0]).toMatchObject({ method: "invoice", hasInvoice: true, hasUpd: true, status: "paid" });
    // Из приложения счёт не выставить.
    const fromApp = await request(app).post("/api/billing/invoice").set("User-Agent", "TasksFlowApp/1.0").send({ plan: "team", months: 1 });
    expect(fromApp.status).toBe(403);
  });

  it("root: промокоды — создать (код в верхнем регистре, дубль — 409), выключить", async () => {
    const t = setup();
    const app = await buildApp(t, "root");
    expect((await request(await buildApp(t)).post("/api/root/billing/promo-codes").send({ code: "A1B", kind: "percent", value: 10 })).status).toBe(403);
    const created = await request(app).post("/api/root/billing/promo-codes").send({ code: "spring-26", kind: "percent", value: 15, maxUses: 50 });
    expect(created.status).toBe(200);
    expect(created.body.promo).toMatchObject({ code: "SPRING-26", kind: "percent", value: 15, maxUses: 50, active: true, paidUses: 0 });
    expect((await request(app).post("/api/root/billing/promo-codes").send({ code: "SPRING-26", kind: "fixed", value: 100 })).status).toBe(409);
    expect((await request(app).post("/api/root/billing/promo-codes").send({ code: "BIG", kind: "percent", value: 150 })).status).toBe(400);
    expect((await request(app).post("/api/root/billing/promo-codes").send({ code: "Ж!", kind: "percent", value: 10 })).status).toBe(400);
    const off = await request(app).patch(`/api/root/billing/promo-codes/${created.body.promo.id}`).send({ active: false });
    expect(off.body.promo.active).toBe(false);
    expect(((await checkout(t.deps, { plan: "team", months: 1, promoCode: "SPRING-26" })).json as { message: string }).message).toBe("Промокод отключён");
    expect((await request(app).get("/api/root/billing/promo-codes")).body.promos).toHaveLength(1);
  });
});

// --- Акции, постоянные скидки, баланс, реквизиты по ИНН ------------------------------------

describe("сумма заказа: акция, промокод или постоянная скидка, баллы", () => {
  it("действует самая большая акция; при равной — та, что дольше; окно [начало, конец)", () => {
    const a = { id: 1, title: "A", percent: 10, startsAt: NOW - DAY, endsAt: NOW + DAY };
    const b = { id: 2, title: "B", percent: 20, startsAt: NOW - DAY, endsAt: NOW + DAY };
    const c = { id: 3, title: "C", percent: 20, startsAt: NOW - DAY, endsAt: NOW + 5 * DAY };
    expect(pickPromotion([a, b, c], NOW)?.id).toBe(3);
    expect(pickPromotion([a, b], NOW + DAY)).toBeNull();
    expect(pickPromotion([{ ...a, startsAt: NOW }], NOW)?.id).toBe(1);
  });

  it("код — от цены с акцией; постоянная скидка не суммируется с кодом, при равных — постоянная; баллы — не больше суммы", () => {
    const promotion = { id: 1, title: "Осень", percent: 20, startsAt: 0, endsAt: NOW * 2 };
    const code = { code: "TEN", kind: "percent" as const, value: 10 };
    const b = priceBreakdown({ listRub: 990, promotion, code, lifetimes: [], pointsAvailable: 0 });
    expect(b).toMatchObject({ listRub: 990, promotion: { discountRub: 198 }, discount: { source: "code", discountRub: 79 }, amountRub: 713 });
    const lifetime = { code: "VIP", kind: "percent" as const, value: 15 };
    expect(priceBreakdown({ listRub: 990, promotion, code, lifetimes: [lifetime], pointsAvailable: 0 })).toMatchObject({
      discount: { source: "lifetime", code: "VIP", discountRub: 119 },
      codeOutdone: true,
      amountRub: 673,
    });
    expect(priceBreakdown({ listRub: 990, promotion: null, code, lifetimes: [{ ...lifetime, value: 10 }], pointsAvailable: 0 }).discount?.source).toBe("lifetime");
    // Несколько постоянных — выгоднейшая на эту сумму: −300 ₽ лучше −20 % от 990, но не от 9 900.
    const two = [{ code: "PCT", kind: "percent" as const, value: 20 }, { code: "FIX", kind: "fixed" as const, value: 300 }];
    expect(priceBreakdown({ listRub: 990, promotion: null, code: null, lifetimes: two, pointsAvailable: 0 }).discount?.code).toBe("FIX");
    expect(priceBreakdown({ listRub: 9900, promotion: null, code: null, lifetimes: two, pointsAvailable: 0 }).discount?.code).toBe("PCT");
    expect(priceBreakdown({ listRub: 990, promotion: null, code: null, lifetimes: [], pointsAvailable: 5000 })).toMatchObject({ pointsRub: 990, amountRub: 0 });
    expect(priceBreakdown({ listRub: 990, promotion: null, code: null, lifetimes: [], pointsAvailable: 300 })).toMatchObject({ pointsRub: 300, amountRub: 690 });
  });
});

describe("акции по расписанию", () => {
  it("root создаёт акцию; цена в заказе — с ней, серия автопродления — по полной цене; кончилась — старая сумма не пройдёт", async () => {
    const t = setup();
    expect((await createRootPromotion(t.deps, { title: "Много", percent: 95, startsAt: NOW - DAY, endsAt: NOW + DAY })).status).toBe(400);
    expect((await createRootPromotion(t.deps, { title: "Прошлая", percent: 20, startsAt: NOW - 9 * DAY, endsAt: NOW - DAY })).status).toBe(400);
    const created = await createRootPromotion(t.deps, { title: "Осень", percent: 20, startsAt: NOW - DAY, endsAt: NOW + 7 * DAY });
    expect(created.status).toBe(200);
    const info = await billingInfo(t.deps, { companyId: 1, user: admin });
    expect(info!.promotion).toMatchObject({ title: "Осень", percent: 20 });
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 990 })).status).toBe(409);
    const r = await checkout(t.deps, { plan: "team", months: 1, expectedRub: 792, recurringConsent: true });
    expect(r.status).toBe(200);
    const { invId } = r.json as { invId: number };
    expect(t.orders.get(invId)).toMatchObject({ amountRub: 792, baseRub: 990, promotionId: 1, promotionPercent: 20, promotionDiscountRub: 198, discountRub: 0 });
    expect(t.consents.at(-1)!.statementText).toMatch(/Спишем 990\s₽.*Первый платёж — 792\s₽ \(по акции\)/);
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 792 }));
    expect(t.billing.get(1)).toMatchObject({ recurringActive: true, recurringAmountRub: 990 });

    t.clock.now = NOW + 8 * DAY;
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 792 })).status).toBe(409);
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 990 })).status).toBe(200);
  });

  it("выключенная акция не действует; конец раньше начала — нельзя", async () => {
    const t = setup();
    await createRootPromotion(t.deps, { title: "Осень", percent: 30, startsAt: NOW - DAY, endsAt: NOW + DAY });
    expect((await updateRootPromotion(t.deps, 1, { endsAt: NOW - 2 * DAY })).status).toBe(400);
    expect((await updateRootPromotion(t.deps, 1, { active: false })).status).toBe(200);
    expect((await billingInfo(t.deps, { companyId: 1, user: admin }))!.promotion).toBeNull();
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 990 })).status).toBe(200);
  });
});

describe("постоянные скидки", () => {
  async function bindVip(t: ReturnType<typeof setup>) {
    await addPromo(t, { code: "VIP", value: 10, lifetime: true, durationMonths: 12 });
    const r = await checkout(t.deps, { plan: "team", months: 1, promoCode: "vip", expectedRub: 891, recurringConsent: true });
    const { invId } = r.json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 891 }));
    await flush();
    return invId;
  }

  it("оплата с «постоянным» кодом закрепляет скидку; дальше она применяется сама и не тратит код", async () => {
    const t = setup();
    const first = await bindVip(t);
    expect(t.discounts).toEqual([expect.objectContaining({ companyId: 1, code: "VIP", kind: "percent", value: 10, orderId: first, boundAt: NOW, expiresAt: addMonths(NOW, 12), revokedAt: null })]);
    expect(t.notices.at(-1)!.notice.paragraphs.join(" ")).toMatch(/Постоянная скидка −10 % по коду VIP закреплена/);
    const info = await billingInfo(t.deps, { companyId: 1, user: admin });
    expect(info!.lifetimeDiscounts).toEqual([expect.objectContaining({ code: "VIP", label: "−10 %", expiresAt: addMonths(NOW, 12) })]);

    const r = await checkout(t.deps, { plan: "team", months: 1, expectedRub: 891 });
    expect(r.status).toBe(200);
    const second = (r.json as { invId: number }).invId;
    expect(t.orders.get(second)).toMatchObject({ discountSource: "lifetime", promoCode: "VIP", discountRub: 99, amountRub: 891 });
    await handleResult(t.deps, resultFor({ id: second, amountRub: 891 }));
    expect(await t.store.promoPaidUses("VIP")).toBe(1);
  });

  it("код хуже постоянной скидки — применяется постоянная, код не тратится; тот же код — «уже действует»", async () => {
    const t = setup();
    await bindVip(t);
    await addPromo(t, { code: "FIVE", value: 5 });
    const quote = await quotePromoFor(t, "FIVE");
    expect(quote).toMatchObject({ ok: true, code: "FIVE", value: 5 });
    const r = await checkout(t.deps, { plan: "team", months: 1, promoCode: "FIVE", expectedRub: 891 });
    const order = t.orders.get((r.json as { invId: number }).invId)!;
    expect(order).toMatchObject({ discountSource: "lifetime", promoCode: "VIP" });
    expect(await quotePromoFor(t, "VIP")).toMatchObject({ ok: true, code: "VIP", lifetime: true });
  });

  it("автопродление — со скидкой: в предупреждении и в списании", async () => {
    const t = setup();
    await bindVip(t);
    t.notices.length = 0;
    const until = t.companies.get(1)!.planUntil!;
    t.clock.now = until - 3 * DAY;
    await runBillingTick(t.deps);
    expect(t.notices.at(-1)!.notice.body).toMatch(/спишем 891\s₽/);
    t.fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "OK" });
    t.clock.now = until - 3600;
    await runBillingTick(t.deps);
    const child = Array.from(t.orders.values()).find((o) => o.recurringChargeOf !== null)!;
    expect(child).toMatchObject({ amountRub: 891, baseRub: 990, discountRub: 99, discountSource: "lifetime", promoCode: "VIP" });
    expect(String(t.fetchMock.mock.calls.at(-1)![1]?.body ?? t.fetchMock.mock.calls.at(-1)![0])).toMatch(/OutSum=891\.00/);
  });

  it("возврат оплаты, которая дала скидку, снимает её; root может снять скидку сам", async () => {
    const t = setup();
    const box = cashbox(t);
    const first = await bindVip(t);
    box.states.set(first, 100);
    expect((await refundOrder(t.deps, first)).status).toBe(200);
    box.refundLabel = "finished";
    await runBillingTick(t.deps);
    expect(t.discounts[0].revokedAt).toBe(NOW);
    expect((await billingInfo(t.deps, { companyId: 1, user: admin }))!.lifetimeDiscounts).toEqual([]);

    const t2 = setup();
    await bindVip(t2);
    expect((await revokeRootDiscount(t2.deps, 1, { userId: 9 })).status).toBe(200);
    expect((await revokeRootDiscount(t2.deps, 1, { userId: 9 })).status).toBe(404);
    expect((await checkout(t2.deps, { plan: "team", months: 1, expectedRub: 990 })).status).toBe(200);
    expect(t2.notices.at(-1)!.notice.title).toBe("Постоянная скидка снята");
  });

  it("скидка с истёкшим сроком не применяется", async () => {
    const t = setup();
    await bindVip(t);
    t.clock.now = addMonths(NOW, 12) + 1;
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 990 })).status).toBe(200);
  });
});

async function quotePromoFor(t: ReturnType<typeof setup>, code: string) {
  const { quotePromo } = await import("../server/billing/service");
  return quotePromo(t.deps, { companyId: 1, body: { plan: "team", months: 1, promoCode: code } });
}

describe("баланс и баллы", () => {
  const adjust = (t: ReturnType<typeof setup>, amountRub: number, reason = "бонус за отзыв") => adjustBalance(t.deps, 1, { amountRub, reason }, { userId: 9 });

  it("корректировка root: журнал, уведомление; в минус — нельзя", async () => {
    const t = setup();
    expect((await adjust(t, 500)).json).toMatchObject({ balanceRub: 500 });
    expect((await adjust(t, -600)).status).toBe(409);
    expect((await adjust(t, -200, "ошибка")).json).toMatchObject({ balanceRub: 300 });
    expect(t.ledger.map((r) => [r.kind, r.amountRub, r.balanceAfter])).toEqual([
      ["adjust", 500, 500],
      ["adjust", -200, 300],
    ]);
    expect(t.ledger[0]).toMatchObject({ description: "Корректировка: бонус за отзыв", actorUserId: 9 });
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Баллы списаны");
    expect((await adjust(t, 0)).status).toBe(400);
  });

  it("пополнение картой: аванс в чеке, баллы — по уведомлению кассы, один раз", async () => {
    const t = setup({ receipt: true });
    expect((await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 100 } })).status).toBe(400);
    const r = await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1500 } });
    expect(r.status).toBe(200);
    const { invId, params } = r.json as { invId: number; params: Record<string, string> };
    expect(JSON.parse(decodeURIComponent(params.Receipt)).items[0]).toMatchObject({ payment_method: "advance", payment_object: "payment", sum: 1500 });
    expect(t.orders.get(invId)).toMatchObject({ orderKind: "topup", plan: "topup", months: 0, amountRub: 1500, paymentMethod: "card" });
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 1500 }));
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 1500 }));
    expect(t.billing.get(1)!.balanceRub).toBe(1500);
    expect(t.ledger).toHaveLength(1);
    expect(t.ledger[0]).toMatchObject({ kind: "topup", amountRub: 1500, dedupeKey: `topup:${invId}` });
    expect(t.companies.get(1)!.plan).toBeNull();
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Баланс пополнен");
    const info = await billingInfo(t.deps, { companyId: 1, user: admin });
    expect(info!.balance.amountRub).toBe(1500);
    expect(info!.orders[0]).toMatchObject({ kind: "topup" });
  });

  it("часть суммы баллами: баллы заняты заказом; не оплачен — вернулись; новый заказ освобождает брошенный", async () => {
    const t = setup();
    await adjust(t, 500);
    // Сумма на странице без баллов — заказ не создаётся: человек видел другое.
    expect((await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 990 })).status).toBe(409);
    const a = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number; params: Record<string, string> };
    expect(a.params.OutSum).toBe("490.00");
    expect(t.orders.get(a.invId)).toMatchObject({ amountRub: 490, pointsRub: 500, pointsState: "held" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);
    // На странице баллы брошенного заказа доступны: новый заказ их освободит.
    expect((await billingInfo(t.deps, { companyId: 1, user: admin }))!.balance).toMatchObject({ amountRub: 500, heldRub: 500 });

    // Брошенный заказ: новый возвращает его баллы и занимает их сам.
    const b = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number };
    expect(t.orders.get(a.invId)).toMatchObject({ status: "pending", pointsState: "released" });
    expect(t.orders.get(b.invId)).toMatchObject({ pointsState: "held" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);

    // Не оплачен за 3 дня — баллы на балансе.
    t.clock.now = NOW + 4 * DAY;
    await runBillingTick(t.deps);
    expect(t.orders.get(b.invId)).toMatchObject({ status: "expired", pointsState: "released" });
    expect(t.billing.get(1)!.balanceRub).toBe(500);
    expect(t.ledger.map((r) => r.kind)).toEqual(["adjust", "order_spend", "order_release", "order_spend", "order_release"]);
  });

  it("оплата брошенного заказа после возврата баллов: списываем снова, а нет баллов — владельцу", async () => {
    const t = setup();
    await adjust(t, 500);
    const a = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number };
    t.clock.now = NOW + 4 * DAY;
    await runBillingTick(t.deps);
    expect(t.billing.get(1)!.balanceRub).toBe(500);
    await handleResult(t.deps, resultFor({ id: a.invId, amountRub: 490 }));
    expect(t.orders.get(a.invId)).toMatchObject({ status: "paid", pointsState: "spent" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);

    const t2 = setup();
    await adjust(t2, 500);
    const c = (await checkout(t2.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number };
    t2.clock.now = NOW + 4 * DAY;
    await runBillingTick(t2.deps);
    await adjust(t2, -400, "списали");
    await handleResult(t2.deps, resultFor({ id: c.invId, amountRub: 490 }));
    expect(t2.orders.get(c.invId)).toMatchObject({ status: "paid", pointsState: "short" });
    expect(t2.billing.get(1)!.balanceRub).toBe(100);
    await flush();
    expect(t2.owner.some((m) => /баллы .* вернулись на баланс, а там их уже нет/.test(m))).toBe(true);
  });

  it("баллов хватает на всю сумму: тариф сразу, без кассы и автопродления; УПД нет — денег не было", async () => {
    const t = withDocs(setup());
    await adjust(t, 2000);
    const r = await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 0, recurringConsent: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ free: true, amountRub: 0, order: { method: "balance", pointsRub: 990, status: "paid", hasUpd: false } });
    expect(t.billing.get(1)).toMatchObject({ balanceRub: 1010, recurringActive: false });
    expect(t.companies.get(1)!.plan).toBe("team");
    expect(t.fetchMock).not.toHaveBeenCalled();
    // Root «отменяет оплату баллами»: баллы назад, срок — как до оплаты.
    const id = (r.json as { invId: number }).invId;
    expect((await refundOrder(t.deps, id)).status).toBe(200);
    expect(t.billing.get(1)!.balanceRub).toBe(2000);
    expect(t.orders.get(id)).toMatchObject({ status: "refunded", pointsState: "returned" });
    expect(t.companies.get(1)).toMatchObject({ plan: null, planUntil: null });
  });

  it("возврат денег за заказ с баллами возвращает и баллы; по счёту баллы не списываются", async () => {
    const t = withDocs(setup());
    const box = cashbox(t);
    await adjust(t, 300);
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 690 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 690 }));
    box.states.set(invId, 100);
    expect((await refundOrder(t.deps, invId)).status).toBe(200);
    box.refundLabel = "finished";
    await runBillingTick(t.deps);
    expect(t.billing.get(1)!.balanceRub).toBe(300);
    expect(t.ledger.at(-1)).toMatchObject({ kind: "order_refund", amountRub: 300, dedupeKey: `order_refund:${invId}` });

    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const inv = await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 1, expectedRub: 990 } });
    expect(inv.status).toBe(200);
    expect((inv.json as { order: { pointsRub: number; amountRub: number } }).order).toMatchObject({ pointsRub: 0, amountRub: 990 });
  });

  it("возврат пополнения: сначала баллы с баланса; потратили — нельзя; касса отменила — баллы назад", async () => {
    const t = setup();
    const box = cashbox(t);
    const { invId } = (await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1000 } })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 1000 }));
    box.states.set(invId, 100);
    await adjust(t, -100, "потратили");
    const refused = await refundOrder(t.deps, invId);
    expect(refused.status).toBe(409);
    expect((refused.json as { message: string }).message).toMatch(/На балансе 900\s₽/);
    expect(t.orders.get(invId)!.refundStatus).toBeNull();

    await adjust(t, 100, "вернули");
    expect((await refundOrder(t.deps, invId)).status).toBe(200);
    expect(t.billing.get(1)!.balanceRub).toBe(0);
    expect(t.orders.get(invId)!.pointsState).toBe("refund_hold");
    box.refundLabel = "canceled";
    await runBillingTick(t.deps);
    expect(t.billing.get(1)!.balanceRub).toBe(1000);
    expect(t.orders.get(invId)).toMatchObject({ refundStatus: "canceled", pointsState: "credited" });

    box.refundLabel = "finished";
    expect((await refundOrder(t.deps, invId)).status).toBe(200);
    await runBillingTick(t.deps);
    expect(t.orders.get(invId)).toMatchObject({ status: "refunded", pointsState: "refunded" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);
  });

  it("деньги за пополнение вернули в кабинете кассы — списываем, сколько есть, недостачу — владельцу", async () => {
    const t = setup();
    const box = cashbox(t);
    const { invId } = (await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1000 } })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 1000 }));
    await adjust(t, -700, "потратили");
    box.states.set(invId, 60);
    await reconcileOne(t.deps, invId);
    expect(t.orders.get(invId)).toMatchObject({ status: "refunded", pointsState: "refunded" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);
    expect(t.owner.at(-1)).toMatch(/не хватило 700\s₽/);
  });

  it("пополнение по счёту: баллы — когда root отметит оплату; в УПД — предоплата", async () => {
    const t = withDocs(setup());
    expect((await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 5000, method: "invoice" } })).status).toBe(400);
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const r = await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 5000, method: "invoice" } });
    expect(r.json).toMatchObject({ method: "invoice", existing: false, order: { kind: "topup", method: "invoice", amountRub: 5000 } });
    const again = await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 5000, method: "invoice" } });
    expect(again.json).toMatchObject({ existing: true });
    const id = (r.json as { order: { id: number } }).order.id;
    expect((await markInvoicePaid(t.deps, id, { userId: 9 })).status).toBe(200);
    expect(t.billing.get(1)!.balanceRub).toBe(5000);
    await flush();
    const doc = await ensureClosingDocument(t.deps, t.orders.get(id)!);
    expect(JSON.parse(doc!.lines)[0].title).toMatch(/Предоплата за доступ к сервису TasksFlow: пополнение баланса/);
    expect(doc!.totalRub).toBe(5000);
  });
});

describe("баллы и скидки: граничные случаи", () => {
  const adjust = (t: ReturnType<typeof setup>, amountRub: number) => adjustBalance(t.deps, 1, { amountRub, reason: "бонус" }, { userId: 9 });
  const placeBalanceOrder = (t: ReturnType<typeof setup>, points: number) =>
    t.store.placeOrder(
      { companyId: 1, userId: 5, email: null, plan: "team", months: 1, amountRub: 0, description: "x", isTest: false, recurringConsent: false, recurringChargeOf: null, createdAt: NOW, paymentMethod: "balance", pointsRub: points },
      null,
    );

  it("двойной клик «Оплатить баллами»: второй заказ не забирает баллы первого, ещё не зачтённого", async () => {
    const t = setup();
    await adjust(t, 990);
    // Первый запрос создал заказ «баллами», но ещё не успел его зачесть.
    expect((await placeBalanceOrder(t, 990)).ok).toBe(true);
    const second = await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 0 });
    expect(second.status).toBe(409);
    expect(t.billing.get(1)!.balanceRub).toBe(0);
  });

  it("заказ «баллами», который не успели зачесть, через 3 дня истекает — баллы назад", async () => {
    const t = setup();
    await adjust(t, 990);
    const placed = await placeBalanceOrder(t, 990);
    t.clock.now = NOW + 4 * DAY;
    await runBillingTick(t.deps);
    expect(t.orders.get(placed.ok ? placed.order.id : 0)).toMatchObject({ status: "expired", pointsState: "released" });
    expect(t.billing.get(1)!.balanceRub).toBe(990);
  });

  it("пополнение не забирает баллы, которые держит открытая оплата тарифа", async () => {
    const t = setup();
    await adjust(t, 500);
    const plan = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number };
    expect((await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1000 } })).status).toBe(200);
    expect(t.orders.get(plan.invId)!.pointsState).toBe("held");
    await handleResult(t.deps, resultFor({ id: plan.invId, amountRub: 490 }));
    expect(t.orders.get(plan.invId)).toMatchObject({ status: "paid", pointsState: "spent" });
  });

  it("счёт на пополнение и счёт за тариф друг друга не отменяют", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const plan = await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 1, expectedRub: 990 } });
    const topup = await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 5000, method: "invoice" } });
    const planId = (plan.json as { order: { id: number } }).order.id;
    const topupId = (topup.json as { order: { id: number } }).order.id;
    await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 7000, method: "invoice" } });
    expect(t.orders.get(planId)!.status).toBe("pending");
    expect(t.orders.get(topupId)!.status).toBe("cancelled");
    await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 12, expectedRub: 9900 } });
    expect(t.orders.get(planId)!.status).toBe("cancelled");
    expect(Array.from(t.orders.values()).filter((o) => o.orderKind === "topup" && o.status === "pending")).toHaveLength(1);
  });

  it("две постоянные скидки: обе остаются, действует выгоднейшая; возврат снимает только свою", async () => {
    const t = setup();
    const box = cashbox(t);
    await addPromo(t, { code: "PCT", value: 20, lifetime: true });
    await addPromo(t, { code: "FIX", kind: "fixed", value: 300, lifetime: true });
    const a = (await checkout(t.deps, { plan: "team", months: 12, promoCode: "PCT", expectedRub: 7920 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: a.invId, amountRub: 7920 }));
    // На месяц −300 ₽ выгоднее −20 %: код применяется и закрепляется второй скидкой.
    const b = (await checkout(t.deps, { plan: "team", months: 1, promoCode: "FIX", expectedRub: 690 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: b.invId, amountRub: 690 }));
    expect(t.discounts.map((d) => [d.code, d.revokedAt])).toEqual([
      ["PCT", null],
      ["FIX", null],
    ]);
    expect((await checkout(t.deps, { plan: "team", months: 12, expectedRub: 7920 })).status).toBe(200);
    box.states.set(b.invId, 100);
    await refundOrder(t.deps, b.invId);
    box.refundLabel = "finished";
    await runBillingTick(t.deps);
    expect(t.discounts.map((d) => [d.code, d.revokedAt])).toEqual([
      ["PCT", null],
      ["FIX", NOW],
    ]);
    expect((await checkout(t.deps, { plan: "team", months: 1, expectedRub: 792 })).status).toBe(200);
  });

  it("тестовый режим кассы: пополнение без баллов, «постоянный» код не закрепляется", async () => {
    const t = setup({ isTest: true });
    const top = (await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1000 } })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: top.invId, amountRub: 1000 }, "t2"));
    expect(t.orders.get(top.invId)!.status).toBe("paid");
    expect(t.billing.get(1)?.balanceRub ?? 0).toBe(0);
    await flush();
    expect(t.notices.at(-1)!.notice.title).toBe("Тестовое пополнение прошло");
    await addPromo(t, { code: "VIP", value: 10, lifetime: true });
    const vip = (await checkout(t.deps, { plan: "team", months: 1, promoCode: "VIP", expectedRub: 891 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: vip.invId, amountRub: 891 }, "t2"));
    expect(t.discounts).toEqual([]);
  });

  it("тестовый режим кассы: баллы на оплату картой не списываются", async () => {
    const t = setup({ isTest: true });
    await adjust(t, 500);
    expect((await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).status).toBe(409);
    const r = await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 990 });
    expect(r.status).toBe(200);
    expect(t.orders.get((r.json as { invId: number }).invId)).toMatchObject({ pointsRub: 0, pointsState: null });
    expect(t.billing.get(1)!.balanceRub).toBe(500);
  });

  it("новому заказу не хватило баллов — брошенный заказ остаётся с баллами", async () => {
    const t = setup();
    await adjust(t, 500);
    const a = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 490 })).json as { invId: number };
    const b = await t.store.placeOrder(
      { companyId: 1, userId: 5, email: null, plan: "team", months: 12, amountRub: 9300, description: "x", isTest: false, recurringConsent: false, recurringChargeOf: null, createdAt: NOW, pointsRub: 600 },
      null,
    );
    expect(b).toEqual({ ok: false, reason: "balance" });
    expect(t.orders.get(a.invId)!.pointsState).toBe("held");
    expect(t.ledger.map((r) => r.kind)).toEqual(["adjust", "order_spend"]);
  });

  it("повтор «неуверенного» возврата пополнения не возвращает баллы, если касса снова не ответила", async () => {
    const t = setup();
    const box = cashbox(t);
    const { invId } = (await createTopup(t.deps, { companyId: 1, user: admin, body: { amountRub: 1000 } })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 1000 }));
    box.states.set(invId, 100);
    box.refund = new Error("timeout");
    expect((await refundOrder(t.deps, invId)).status).toBe(202);
    expect(t.orders.get(invId)).toMatchObject({ refundStatus: "uncertain", pointsState: "refund_hold" });
    box.states.delete(invId);
    expect((await refundOrder(t.deps, invId, { force: true })).status).toBe(502);
    expect(t.orders.get(invId)).toMatchObject({ refundStatus: "uncertain", pointsState: "refund_hold" });
    expect(t.billing.get(1)!.balanceRub).toBe(0);
  });

  it("отмена оплаты баллами прервалась — тик доводит её", async () => {
    const t = setup();
    await adjust(t, 990);
    const r = (await checkout(t.deps, { plan: "team", months: 1, usePoints: true, expectedRub: 0 })).json as { invId: number };
    const finish = t.store.finishRefund;
    t.store.finishRefund = async () => {
      throw new Error("deadlock");
    };
    await expect(refundOrder(t.deps, r.invId)).rejects.toThrow("deadlock");
    expect(t.orders.get(r.invId)!.refundStatus).toBe("pending");
    t.store.finishRefund = finish;
    await runBillingTick(t.deps);
    expect(t.orders.get(r.invId)).toMatchObject({ status: "refunded", pointsState: "returned" });
    expect(t.billing.get(1)!.balanceRub).toBe(990);
  });

  it("новый счёт не выставился — прежний не отменён", async () => {
    const t = withDocs(setup());
    await saveCompanyRequisites(t.deps, { companyId: 1, body: BUYER });
    const first = (await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 1, expectedRub: 990 } })).json as { order: { id: number } };
    const place = t.store.placeOrder;
    t.store.placeOrder = async () => ({ ok: false, reason: "gone" });
    expect((await createInvoice(t.deps, { companyId: 1, user: admin, body: { plan: "team", months: 12, expectedRub: 9900 } })).status).toBe(400);
    expect(t.orders.get(first.order.id)!.status).toBe("pending");
    t.store.placeOrder = place;
  });

  it("код, который уже действует постоянной скидкой: правило — из снимка, даже если код потом выключили", async () => {
    const t = setup();
    await addPromo(t, { code: "VIP", value: 10, lifetime: true });
    const vip = (await checkout(t.deps, { plan: "team", months: 1, promoCode: "VIP", expectedRub: 891 })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: vip.invId, amountRub: 891 }));
    await t.store.updatePromo(1, { active: false }, NOW);
    expect(await quotePromoFor(t, "vip")).toMatchObject({ ok: true, code: "VIP", value: 10, lifetime: true });
  });
});

describe("реквизиты по ИНН (DaData)", () => {
  it("организация и ИП: название с кавычками-ёлочками, КПП, руководитель; ликвидирована — предупреждение", () => {
    const org = mapParty("7707083893", {
      value: 'ПАО "СБЕРБАНК"',
      data: {
        type: "LEGAL",
        inn: "7707083893",
        kpp: "773601001",
        ogrn: "1027700132195",
        name: { short_with_opf: 'ПАО "СБЕРБАНК"' },
        management: { name: "Греф Герман Оскарович", post: "ПРЕЗИДЕНТ, ПРЕДСЕДАТЕЛЬ ПРАВЛЕНИЯ" },
        address: { value: "г Москва, ул Вавилова, д 19", unrestricted_value: "117312, г Москва, ул Вавилова, д 19" },
        state: { status: "ACTIVE" },
      },
    });
    expect(org).toEqual({
      ok: true,
      requisites: {
        kind: "org",
        name: "ПАО «СБЕРБАНК»",
        inn: "7707083893",
        kpp: "773601001",
        ogrn: "1027700132195",
        address: "117312, г Москва, ул Вавилова, д 19",
        headPost: "Президент, председатель правления",
        headName: "Греф Герман Оскарович",
      },
      warning: null,
    });
    expect(requisitesSchema.safeParse({ ...(org as { requisites: object }).requisites }).success).toBe(true);
    const ip = mapParty("500100732259", {
      value: "ИП Иванов Иван Иванович",
      data: { type: "INDIVIDUAL", ogrn: "304500116000157", fio: { surname: "Иванов", name: "Иван", patronymic: "Иванович" }, address: { value: "г Москва" }, state: { status: "LIQUIDATED" } },
    });
    expect(ip).toMatchObject({ ok: true, requisites: { kind: "ip", kpp: null, headPost: null, headName: "Иванов Иван Иванович" }, warning: expect.stringMatching(/ликвидирована/) });
  });

  it("запрос: ключ в заголовке Token, ИНН проверяется до запроса, ошибки — понятным текстом", async () => {
    const fetchMock = vi.fn().mockResolvedValue(http(200, JSON.stringify({ suggestions: [{ value: "ООО Ромашка", data: { type: "LEGAL", kpp: "773601001", name: {} } }] })));
    expect(await lookupInn("key", "7707083894", fetchMock as never)).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await lookupInn("key", "7707 083 893", fetchMock as never)).toMatchObject({ ok: true, requisites: { name: "ООО Ромашка", inn: "7707083893" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DADATA_PARTY_URL);
    expect(init.headers.Authorization).toBe("Token key");
    expect(JSON.parse(init.body)).toMatchObject({ query: "7707083893", count: 1 });
    fetchMock.mockResolvedValueOnce(http(200, JSON.stringify({ suggestions: [] })));
    expect(await lookupInn("key", "7707083893", fetchMock as never)).toMatchObject({ ok: false, message: expect.stringMatching(/ничего не нашли/) });
    fetchMock.mockResolvedValueOnce(http(403, "{}"));
    expect(await lookupInn("key", "7707083893", fetchMock as never)).toMatchObject({ ok: false, message: expect.stringMatching(/недоступно/) });
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await lookupInn("key", "7707083893", fetchMock as never)).toMatchObject({ ok: false });
  });
});

describe("маршруты: баланс, акции, постоянные скидки, ИНН", () => {
  async function buildApp(t: ReturnType<typeof setup>, role: "admin" | "root" = "admin") {
    const { registerBillingRoutes, __resetCheckoutLimit } = await import("../server/billing-routes");
    __resetCheckoutLimit();
    storageMock.getUserById.mockResolvedValue({ id: 5, email: "boss@cafe.ru", companyId: 1, isAdmin: true, isRoot: role === "root" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = { userId: 5 };
      next();
    });
    const requireAdmin = (_req: any, _res: any, next: any) => next();
    const requireRoot = (_req: any, res: any, next: any) => (role === "root" ? next() : res.status(403).json({ message: "Доступ только для root" }));
    registerBillingRoutes(app, { requireAdmin, requireRoot, getCompanyIdFromReq: async () => 1, billing: t.deps });
    return app;
  }

  it("ИНН: без ключа — 503, с ключом — реквизиты; страница знает, есть ли кнопка", async () => {
    const t = setup();
    const app = await buildApp(t);
    expect((await request(app).post("/api/billing/requisites/lookup").send({ inn: "7707083893" })).status).toBe(503);
    expect((await request(app).get("/api/billing")).body.innLookup).toBe(false);
    t.deps.dadata = () => "key";
    t.fetchMock.mockResolvedValue(http(200, JSON.stringify({ suggestions: [{ value: "ООО Ромашка", data: { type: "LEGAL", kpp: "773601001" } }] })));
    const res = await request(app).post("/api/billing/requisites/lookup").send({ inn: "7707083893" });
    expect(res.body).toMatchObject({ ok: true, requisites: { kind: "org", name: "ООО Ромашка" } });
    expect((await request(app).get("/api/billing")).body.innLookup).toBe(true);
  });

  it("пополнение из приложения — нельзя; root-разделы — только root", async () => {
    const t = setup();
    const app = await buildApp(t);
    expect((await request(app).post("/api/billing/topup").set("User-Agent", "Mozilla/5.0 TasksFlowApp/1.0.0").send({ amountRub: 1000 })).status).toBe(403);
    expect((await request(app).post("/api/billing/topup").send({ amountRub: 1000 })).body).toMatchObject({ method: "card", amountRub: 1000 });
    for (const [method, url] of [
      ["get", "/api/root/billing/promotions"],
      ["post", "/api/root/billing/promotions"],
      ["get", "/api/root/billing/discounts"],
      ["post", "/api/root/billing/discounts/1/revoke"],
      ["get", "/api/root/billing/balances"],
      ["get", "/api/root/billing/balances/1"],
      ["post", "/api/root/billing/balances/1/adjust"],
    ] as const) {
      expect((await request(app)[method](url)).status).toBe(403);
    }
    const root = await buildApp(t, "root");
    await request(root).post("/api/root/billing/promotions").send({ title: "Осень", percent: 15, startsAt: NOW - DAY, endsAt: NOW + DAY }).expect(200);
    expect((await request(root).get("/api/root/billing/promotions")).body.promotions).toMatchObject([{ title: "Осень", percent: 15, active: true }]);
    await request(root).post("/api/root/billing/balances/1/adjust").send({ amountRub: 700, reason: "бонус" }).expect(200);
    expect((await request(root).get("/api/root/billing/balances")).body.balances).toMatchObject([{ companyId: 1, balanceRub: 700 }]);
    expect((await request(root).get("/api/root/billing/balances/1")).body).toMatchObject({ balanceRub: 700, history: [{ kind: "adjust", amountRub: 700 }] });
    expect((await request(root).get("/api/root/billing/balances/99")).status).toBe(404);
    const page = (await request(app).get("/api/billing")).body;
    expect(page).toMatchObject({ promotion: { percent: 15 }, balance: { amountRub: 700 }, lifetimeDiscounts: [] });
  });
});
