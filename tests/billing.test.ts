/**
 * Оплата через Робокассу: подписи и параметры, срок тарифа после оплаты,
 * правило автопродления, сервис (заказ, ResultURL, автосписания) на
 * хранилище в памяти и маршруты.
 */
import { createHash } from "node:crypto";
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
  recurringAction,
  recurringStatement,
  type PlanPrice,
} from "../shared/billing";
import type { CompanyBillingRow, PaymentOrderRow } from "../shared/schema";
import {
  buildPaymentParams,
  buildPaymentUrl,
  buildReceipt,
  chargeRecurring,
  formatOutSum,
  isAppUserAgent,
  isConfigured,
  robokassaConfig,
  verifyResultSignature,
  verifySuccessSignature,
  type RobokassaConfig,
} from "../server/billing/robokassa";
import {
  billingInfo,
  createCheckout,
  decideSettlement,
  formatDay,
  disableRecurring,
  handleResult,
  runBillingTick,
  type BillingDeps,
  type BillingNotice,
} from "../server/billing/service";
import type { BillingStore, NewConsent, SettleContext, SettlePatch } from "../server/billing/store";

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
  let nextId = 15;
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
    updatedAt: 0,
  });
  const store: BillingStore = {
    getPrices: async () => prices,
    setPrices: async (next) => {
      prices = next;
    },
    createOrder: async (o) => {
      const row: PaymentOrderRow = { ...o, id: nextId++, status: "pending", planUntilAfter: null, rawResult: null, paidAt: null };
      orders.set(row.id, row);
      return { ...row };
    },
    getOrder: async (id) => (orders.has(id) ? { ...orders.get(id)! } : null),
    listOrders: async (companyId) => Array.from(orders.values()).filter((o) => o.companyId === companyId).reverse(),
    listRecentOrders: async () => Array.from(orders.values()).map((o) => ({ ...o, companyName: companies.get(o.companyId)?.name ?? null })),
    settle: async (orderId: number, raw: string, now: number, decide: (ctx: SettleContext) => SettlePatch) => {
      const order = orders.get(orderId);
      if (!order || order.status === "paid") return { claimed: false as const, order: order ?? null };
      const company = companies.get(order.companyId)!;
      const context: SettleContext = { order: { ...order }, company: { ...company }, billing: billing.has(company.id) ? { ...billing.get(company.id)! } : null };
      const patch = decide(context);
      Object.assign(order, { status: "paid", paidAt: now, rawResult: raw, planUntilAfter: patch.plan?.until ?? null });
      if (patch.plan) Object.assign(company, { plan: patch.plan.id, planUntil: patch.plan.until });
      if (patch.billing) billing.set(company.id, { ...(billing.get(company.id) ?? emptyBilling(company.id)), ...patch.billing, updatedAt: now });
      return { claimed: true as const, order: { ...order }, context, patch };
    },
    expireOrder: async (id) => {
      const o = orders.get(id);
      if (o && o.status === "pending") o.status = "expired";
    },
    expirePending: async (before) => {
      let n = 0;
      for (const o of Array.from(orders.values())) if (o.status === "pending" && o.createdAt <= before) (o.status = "expired"), n++;
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
  };
  return { store, orders, billing, companies, consents };
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
    expect(t.consents[0]).toMatchObject({ companyId: 1, userId: 5, orderId: r.invId, granted: true, ip: "1.2.3.4", offerRevision: "2026-10-24" });
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

  it("серия из тестового режима не списывает, а выключается", async () => {
    const t = setup({ isTest: true });
    const { invId } = (await checkout(t.deps, { plan: "team", months: 1, recurringConsent: true })).json as { invId: number };
    await handleResult(t.deps, resultFor({ id: invId, amountRub: 990 }, "t2"));
    t.clock.now = t.companies.get(1)!.planUntil! - 3600;
    await runBillingTick(t.deps);
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
