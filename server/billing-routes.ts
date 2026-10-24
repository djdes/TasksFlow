import type { Express, Request, RequestHandler, Response } from "express";
import { pricesSchema } from "@shared/billing";
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
  handleResult,
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
      res.set("Cache-Control", "no-store").json(toBillingOrder(order));
    } catch (err) {
      logger.error({ err }, "[billing] статус заказа");
      res.status(500).json({ message: "Не удалось проверить оплату" });
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
      res.set("Cache-Control", "no-store").json({
        prices,
        orders: orders.map((o) => ({ ...toBillingOrder(o), companyId: o.companyId, companyName: o.companyName, email: o.email })),
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
