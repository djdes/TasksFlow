import type { Express, Request, RequestHandler, Response } from "express";
import { pricesSchema } from "@shared/billing";
import { documentFilename } from "./billing/documents";
import { cancelInvoiceOrder, closingPdf, createInvoice, ensureClosingDocument, invoicePdf, markInvoicePaid, saveCompanyRequisites } from "./billing/invoices";
import { createRootPromo, listRootPromos, updateRootPromo } from "./billing/root-promo";
import { logger } from "./logger";
import { storage } from "./storage";
import { defaultBillingDeps } from "./billing/deps";
import { isAppUserAgent } from "./billing/robokassa";
import {
  billingDiagnostics,
  billingInfo,
  checkConnection,
  checkWhilePolling,
  createCheckout,
  disableRecurring,
  documentsReady,
  handleResult,
  quotePromo,
  reconcileOne,
  refundOrder,
  toBillingOrder,
  type BillingDeps,
} from "./billing/service";

/**
 * Оплата тарифа через Робокассу.
 *
 *   GET    /api/billing                 — тариф, цены, автопродление, платежи (админ)
 *   POST   /api/billing/checkout        — заказ и параметры оплаты (админ)
 *   GET    /api/billing/orders/:id      — статус заказа, пока ждём оплату (админ)
 *   DELETE /api/billing/recurring       — отключить автопродление (админ)
 *   POST   /api/billing/robokassa/result — ResultURL: уведомление кассы об оплате
 *   POST   /billing/success, /billing/fail — возврат с оплаты методом POST → GET
 *   GET    /api/root/billing, PUT /api/root/billing/prices — цены и все платежи (root)
 *   POST   /api/billing/promo           — что даст промокод на тариф и срок (админ)
 *   PUT    /api/billing/requisites      — реквизиты компании для счёта и УПД (админ)
 *   POST   /api/billing/invoice         — выставить счёт юрлицу или ИП (админ)
 *   GET    /api/billing/orders/:id/invoice.pdf, /upd.pdf — счёт и УПД (админ компании или root)
 *   GET/POST /api/root/billing/promo-codes, PATCH /api/root/billing/promo-codes/:id — промокоды (root)
 *   POST   /api/root/billing/orders/:id/invoice-paid, /invoice-cancel — оплата по счёту (root)
 *   GET    /api/root/billing/diagnostics — что задано в env, адреса для кассы (root)
 *   POST   /api/root/billing/check       — проверить логин и Пароль #2 без денег (root)
 *   POST   /api/root/billing/orders/:id/reconcile — сверить заказ с кассой (root)
 *   POST   /api/root/billing/orders/:id/refund    — вернуть деньги через API кассы (root)
 *
 * В кабинете магазина: ResultURL — https://<сайт>/api/billing/robokassa/result,
 * SuccessURL — https://<сайт>/billing/success, FailURL — https://<сайт>/billing/fail.
 */
type Deps = {
  requireAdmin: RequestHandler;
  requireRoot: RequestHandler;
  getCompanyIdFromReq: (req: Request) => Promise<number | null>;
  billing?: BillingDeps;
};

/** Заказов за 10 минут на компанию: человеку хватит, скрипту — нет. */
const CHECKOUT_LIMIT = 10;
const CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
const checkoutHits = new Map<number, number[]>();

function checkoutAllowed(companyId: number, nowMs = Date.now()): boolean {
  const recent = (checkoutHits.get(companyId) ?? []).filter((t) => nowMs - t < CHECKOUT_WINDOW_MS);
  if (recent.length >= CHECKOUT_LIMIT) {
    checkoutHits.set(companyId, recent);
    return false;
  }
  recent.push(nowMs);
  checkoutHits.set(companyId, recent);
  if (checkoutHits.size > 10_000) checkoutHits.clear();
  return true;
}

export function __resetCheckoutLimit(): void {
  checkoutHits.clear();
  promoHits.clear();
}

/** Проверок промокода за 10 минут на компанию: перебор кодов не пройдёт. */
const PROMO_LIMIT = 20;
const promoHits = new Map<number, number[]>();

function promoAllowed(companyId: number, nowMs = Date.now()): boolean {
  const recent = (promoHits.get(companyId) ?? []).filter((t) => nowMs - t < CHECKOUT_WINDOW_MS);
  if (recent.length >= PROMO_LIMIT) {
    promoHits.set(companyId, recent);
    return false;
  }
  recent.push(nowMs);
  promoHits.set(companyId, recent);
  if (promoHits.size > 10_000) promoHits.clear();
  return true;
}

/** Заголовки PDF: кириллическое имя файла — в filename*, ASCII — для старых браузеров. */
function sendPdf(res: Response, pdf: Buffer, name: { ascii: string; utf8: string }) {
  res
    .status(200)
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name.ascii}"; filename*=UTF-8''${encodeURIComponent(name.utf8)}`,
      "Cache-Control": "private, no-store",
    })
    .send(pdf);
}

/** Поля формы и query как строки: Робокасса шлёт уведомление POST или GET. */
function flatParams(...sources: unknown[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number") out[key] = String(value);
    }
  }
  return out;
}

const ua = (req: Request) => String(req.headers["user-agent"] || "").slice(0, 255) || null;

export function registerBillingRoutes(app: Express, deps: Deps): void {
  const billing = deps.billing ?? defaultBillingDeps();

  const adminContext = async (req: Request, res: Response) => {
    const companyId = await deps.getCompanyIdFromReq(req);
    const user = req.session.userId ? await storage.getUserById(req.session.userId) : undefined;
    if (!companyId || !user) {
      res.status(404).json({ message: "Компания не найдена" });
      return null;
    }
    return { companyId, user };
  };

  app.get("/api/billing", deps.requireAdmin, async (req, res) => {
    try {
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      const info = await billingInfo(billing, ctx);
      if (!info) return res.status(404).json({ message: "Компания не найдена" });
      res.set("Cache-Control", "no-store").json(info);
    } catch (err) {
      logger.error({ err }, "[billing] страница тарифа");
      res.status(500).json({ message: "Не удалось загрузить тариф и платежи" });
    }
  });

  app.post("/api/billing/checkout", deps.requireAdmin, async (req, res) => {
    try {
      // App Store (3.1.1): в приложении подписку не продают мимо встроенных
      // покупок. Кнопок оплаты там нет — это страховка для старой страницы.
      if (isAppUserAgent(req.headers["user-agent"])) {
        return res.status(403).json({ message: "Оплата в приложении недоступна", code: "app_payment" });
      }
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      if (!checkoutAllowed(ctx.companyId)) {
        return res.status(429).json({ message: "Слишком много попыток оплаты. Попробуйте через несколько минут." });
      }
      const reply = await createCheckout(billing, { ...ctx, body: req.body, ip: req.ip ?? null, userAgent: ua(req) });
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err }, "[billing] заказ");
      res.status(500).json({ message: "Не удалось начать оплату. Попробуйте ещё раз." });
    }
  });

  app.get("/api/billing/orders/:id", deps.requireAdmin, async (req, res) => {
    try {
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      const id = Number(req.params.id);
      const order = Number.isInteger(id) && id > 0 ? await billing.store.getOrder(id) : null;
      // Чужой заказ — как несуществующий: номер заказа не раскрывает чужие оплаты.
      if (!order || order.companyId !== ctx.companyId) return res.status(404).json({ message: "Заказ не найден" });
      // Завис в «ожидает оплаты» — в фоне спросим кассу: потерянное
      // уведомление не оставит человека ждать.
      checkWhilePolling(billing, order);
      res.set("Cache-Control", "no-store").json(toBillingOrder(order, { docs: documentsReady(billing) }));
    } catch (err) {
      logger.error({ err }, "[billing] статус заказа");
      res.status(500).json({ message: "Не удалось проверить оплату" });
    }
  });

  app.post("/api/billing/promo", deps.requireAdmin, async (req, res) => {
    try {
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      if (!promoAllowed(ctx.companyId)) return res.status(429).json({ ok: false, message: "Слишком много попыток — подождите несколько минут" });
      res.json(await quotePromo(billing, { companyId: ctx.companyId, body: req.body }));
    } catch (err) {
      logger.error({ err }, "[billing] проверка промокода");
      res.status(500).json({ ok: false, message: "Не удалось проверить промокод" });
    }
  });

  app.put("/api/billing/requisites", deps.requireAdmin, async (req, res) => {
    try {
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      const reply = await saveCompanyRequisites(billing, { companyId: ctx.companyId, body: req.body });
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err }, "[billing] реквизиты компании");
      res.status(500).json({ message: "Не удалось сохранить реквизиты. Попробуйте ещё раз." });
    }
  });

  app.post("/api/billing/invoice", deps.requireAdmin, async (req, res) => {
    try {
      // Счёт — тоже покупка подписки: в приложениях её нет (App Store 3.1.1).
      if (isAppUserAgent(req.headers["user-agent"])) {
        return res.status(403).json({ message: "Оплата в приложении недоступна", code: "app_payment" });
      }
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      if (!checkoutAllowed(ctx.companyId)) {
        return res.status(429).json({ message: "Слишком много попыток. Попробуйте через несколько минут." });
      }
      const reply = await createInvoice(billing, { ...ctx, body: req.body });
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err }, "[billing] счёт");
      res.status(500).json({ message: "Не удалось выставить счёт. Попробуйте ещё раз." });
    }
  });

  /** Заказ для документа: админ своей компании или root. Чужой — как несуществующий. */
  const documentOrder = async (req: Request, res: Response) => {
    const user = req.session.userId ? await storage.getUserById(req.session.userId) : undefined;
    if (!user) {
      res.status(401).json({ message: "Требуется авторизация" });
      return null;
    }
    const id = Number(req.params.id);
    const order = Number.isInteger(id) && id > 0 ? await billing.store.getOrder(id) : null;
    const companyId = user.isRoot ? null : user.isAdmin ? await deps.getCompanyIdFromReq(req) : null;
    if (!order || (!user.isRoot && order.companyId !== companyId)) {
      res.status(404).json({ message: "Документ не найден" });
      return null;
    }
    return order;
  };

  app.get("/api/billing/orders/:id/invoice.pdf", async (req, res) => {
    try {
      const order = await documentOrder(req, res);
      if (!order) return;
      const pdf = await invoicePdf(billing, order);
      if (!pdf) return res.status(404).json({ message: "Счёта по этому заказу нет" });
      sendPdf(res, pdf, documentFilename("invoice", String(order.id)));
    } catch (err) {
      logger.error({ err }, "[billing] PDF счёта");
      res.status(500).json({ message: "Не удалось сформировать счёт" });
    }
  });

  app.get("/api/billing/orders/:id/upd.pdf", async (req, res) => {
    try {
      const order = await documentOrder(req, res);
      if (!order) return;
      const doc = await ensureClosingDocument(billing, order);
      if (!doc) return res.status(404).json({ message: "Закрывающего документа по этому заказу нет" });
      sendPdf(res, closingPdf(doc), documentFilename("upd", doc.number));
    } catch (err) {
      logger.error({ err }, "[billing] PDF УПД");
      res.status(500).json({ message: "Не удалось сформировать УПД" });
    }
  });

  app.delete("/api/billing/recurring", deps.requireAdmin, async (req, res) => {
    try {
      const ctx = await adminContext(req, res);
      if (!ctx) return;
      await disableRecurring(billing, { ...ctx, ip: req.ip ?? null, userAgent: ua(req) });
      // Повторное нажатие — тот же результат, а не ошибка.
      res.json({ ok: true, active: false });
    } catch (err) {
      logger.error({ err }, "[billing] отключение автопродления");
      res.status(500).json({ message: "Не удалось отключить автопродление. Попробуйте ещё раз." });
    }
  });

  // ResultURL. Публичный по природе: защищают подпись Пароля #2, сверка
  // суммы и атомарный переход заказа в «оплачен».
  const result = async (req: Request, res: Response) => {
    try {
      const reply = await handleResult(billing, flatParams(req.query, req.body));
      res.status(reply.status).type("text/plain; charset=utf-8").send(reply.body);
    } catch (err) {
      logger.error({ err }, "[billing] уведомление об оплате");
      // Не «OK» — касса повторит уведомление.
      res.status(500).type("text/plain; charset=utf-8").send("error");
    }
  };
  app.post("/api/billing/robokassa/result", result);
  app.get("/api/billing/robokassa/result", result);

  // Возврат с оплаты. В окне оплаты поверх страницы Робокасса открывает
  // SuccessURL внутри рамки нашей же страницы — SAMEORIGIN, а не DENY.
  // Методом POST (настройка магазина) — переводим в GET для кабинета.
  for (const path of ["/billing/success", "/billing/fail"]) {
    app.get(path, (_req, res, next) => {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      next();
    });
    app.post(path, (req, res) => {
      const params = flatParams(req.body, req.query);
      const query = new URLSearchParams();
      for (const key of ["InvId", "OutSum"]) if (params[key]) query.set(key, params[key]);
      const qs = query.toString();
      res.redirect(303, qs ? `${path}?${qs}` : path);
    });
  }

  app.get("/api/root/billing", deps.requireRoot, async (_req, res) => {
    try {
      const [prices, orders] = await Promise.all([billing.store.getPrices(), billing.store.listRecentOrders(200)]);
      const docs = documentsReady(billing);
      res.set("Cache-Control", "no-store").json({
        prices,
        orders: orders.map((o) => ({ ...toBillingOrder(o, { docs }), companyId: o.companyId, companyName: o.companyName, email: o.email })),
      });
    } catch (err) {
      logger.error({ err }, "[root] платежи");
      res.status(500).json({ message: "Не удалось загрузить платежи" });
    }
  });

  app.get("/api/root/billing/diagnostics", deps.requireRoot, async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(await billingDiagnostics(billing));
    } catch (err) {
      logger.error({ err }, "[root] диагностика оплаты");
      res.status(500).json({ message: "Не удалось собрать настройки кассы" });
    }
  });

  app.post("/api/root/billing/check", deps.requireRoot, async (_req, res) => {
    try {
      res.json(await checkConnection(billing));
    } catch (err) {
      logger.error({ err }, "[root] проверка кассы");
      res.status(500).json({ message: "Не удалось проверить подключение" });
    }
  });

  const orderId = (req: Request) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  app.post("/api/root/billing/orders/:id/reconcile", deps.requireRoot, async (req, res) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ message: "Заказ не найден" });
    try {
      const reply = await reconcileOne(billing, id);
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err, id }, "[root] сверка заказа");
      res.status(500).json({ message: "Не удалось сверить заказ с кассой" });
    }
  });

  app.post("/api/root/billing/orders/:id/refund", deps.requireRoot, async (req, res) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ message: "Заказ не найден" });
    try {
      // force — повтор после «касса не ответила», root подтвердил, что проверил кабинет.
      const reply = await refundOrder(billing, id, { force: (req.body as { force?: unknown } | undefined)?.force === true });
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err, id }, "[root] возврат");
      res.status(500).json({ message: "Возврат не отправлен из-за ошибки сервера. Проверьте статус заказа перед повтором." });
    }
  });

  app.get("/api/root/billing/promo-codes", deps.requireRoot, async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store").json({ promos: await listRootPromos(billing) });
    } catch (err) {
      logger.error({ err }, "[root] промокоды");
      res.status(500).json({ message: "Не удалось загрузить промокоды" });
    }
  });

  app.post("/api/root/billing/promo-codes", deps.requireRoot, async (req, res) => {
    try {
      const reply = await createRootPromo(billing, req.body);
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err }, "[root] новый промокод");
      res.status(500).json({ message: "Не удалось создать промокод" });
    }
  });

  app.patch("/api/root/billing/promo-codes/:id", deps.requireRoot, async (req, res) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ message: "Промокод не найден" });
    try {
      const reply = await updateRootPromo(billing, id, req.body);
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err, id }, "[root] промокод");
      res.status(500).json({ message: "Не удалось сохранить промокод" });
    }
  });

  app.post("/api/root/billing/orders/:id/invoice-paid", deps.requireRoot, async (req, res) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ message: "Счёт не найден" });
    try {
      const reply = await markInvoicePaid(billing, id, { userId: req.session.userId ?? 0 });
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err, id }, "[root] оплата счёта");
      res.status(500).json({ message: "Не удалось отметить оплату. Проверьте статус счёта перед повтором." });
    }
  });

  app.post("/api/root/billing/orders/:id/invoice-cancel", deps.requireRoot, async (req, res) => {
    const id = orderId(req);
    if (!id) return res.status(404).json({ message: "Счёт не найден" });
    try {
      const reply = await cancelInvoiceOrder(billing, id);
      res.status(reply.status).json(reply.json);
    } catch (err) {
      logger.error({ err, id }, "[root] отмена счёта");
      res.status(500).json({ message: "Не удалось отменить счёт" });
    }
  });

  app.put("/api/root/billing/prices", deps.requireRoot, async (req, res) => {
    const parsed = pricesSchema.safeParse((req.body as { prices?: unknown } | undefined)?.prices);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Проверьте цены" });
    try {
      await billing.store.setPrices(parsed.data, Math.floor(Date.now() / 1000));
      res.json({ ok: true, prices: await billing.store.getPrices() });
    } catch (err) {
      logger.error({ err }, "[root] цены");
      res.status(500).json({ message: "Не удалось сохранить цены. Таблица цен создана? npm run add-billing" });
    }
  });
}
