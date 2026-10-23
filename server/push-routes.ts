import type { Express, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { isAllowedPushEndpoint, pushSubscriptionSchema, pushUnsubscribeSchema } from "@shared/push";
import { storage } from "./storage";
import { pushConfig, sendToUsers } from "./push";
import { pushStore, type PushStore } from "./push/store";

/**
 * Подписки на push.
 *
 *   GET    /api/push/config         — включён ли Web Push / APNs, ключ VAPID
 *   POST   /api/push/subscriptions  — это устройство получает уведомления
 *   DELETE /api/push/subscriptions  — больше не получает (выход, выключатель)
 *   POST   /api/push/test           — проверочное уведомление себе
 *
 * Подписка всегда принадлежит тому, кто вошёл: тот же браузер на общем
 * планшете переходит к новому человеку, а не шлёт ему чужие задачи.
 */
type Deps = {
  requireAuth: RequestHandler;
  store?: PushStore;
  send?: typeof sendToUsers;
  /** Доп. хосты push-сервисов через запятую (PUSH_ENDPOINT_HOSTS). */
  extraHosts?: string[];
};

const TEST_COOLDOWN_MS = 10_000;
const lastTest = new Map<number, number>();

function noTable(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "ER_NO_SUCH_TABLE";
}

export function registerPushRoutes(app: Express, deps: Deps) {
  const store = deps.store ?? pushStore;
  const send = deps.send ?? sendToUsers;
  const extraHosts =
    deps.extraHosts ??
    (process.env.PUSH_ENDPOINT_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

  app.get("/api/push/config", (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-cache").json(pushConfig());
  });

  app.post("/api/push/subscriptions", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const input = pushSubscriptionSchema.parse(req.body);
      const config = pushConfig();
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Войдите заново" });
      const userAgent = String(req.headers["user-agent"] || "");

      if (input.kind === "web") {
        if (!config.web.enabled) return res.status(503).json({ message: "Уведомления на сервере пока не включены" });
        if (!isAllowedPushEndpoint(input.subscription.endpoint, extraHosts)) {
          return res.status(400).json({ message: "Этот браузер не поддерживается для уведомлений. Откройте TasksFlow в Chrome, Safari, Edge или Firefox." });
        }
        if (input.replaces && input.replaces !== input.subscription.endpoint) {
          await store.removeEndpoint(input.replaces, user.id);
        }
        await store.save({
          userId: user.id,
          companyId: user.companyId ?? null,
          kind: "web",
          endpoint: input.subscription.endpoint,
          p256dh: input.subscription.keys.p256dh,
          auth: input.subscription.keys.auth,
          userAgent,
        });
      } else {
        if (!config.apns.enabled) return res.status(503).json({ message: "Уведомления для iPhone на сервере пока не включены" });
        await store.save({
          userId: user.id,
          companyId: user.companyId ?? null,
          kind: "apns",
          endpoint: input.token.toLowerCase(),
          environment: input.environment,
          userAgent,
        });
      }
      res.status(201).json({ ok: true, devices: await store.countForUser(user.id) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Неверная подписка" });
      }
      if (noTable(err)) return res.status(503).json({ message: "Уведомления на сервере пока не включены" });
      console.error("[push] subscribe failed:", err);
      res.status(500).json({ message: "Не удалось включить уведомления" });
    }
  });

  app.delete("/api/push/subscriptions", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const input = pushUnsubscribeSchema.parse(req.body ?? {});
      const value = input.endpoint || input.token!.toLowerCase();
      const removed = await store.removeEndpoint(value, req.session.userId!);
      res.json({ ok: true, removed });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Неверный запрос" });
      console.error("[push] unsubscribe failed:", err);
      res.status(500).json({ message: "Не удалось выключить уведомления" });
    }
  });

  app.post("/api/push/test", deps.requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const last = lastTest.get(userId) ?? 0;
    if (Date.now() - last < TEST_COOLDOWN_MS) {
      return res.status(429).json({ message: "Подождите несколько секунд" });
    }
    lastTest.set(userId, Date.now());
    try {
      const result = await send([userId], {
        title: "Уведомления работают",
        body: "Так придут новые задачи, возвраты на доработку и напоминания.",
        url: "/account",
        tag: "test",
        ttl: 600,
      });
      res.json(result);
    } catch (err) {
      console.error("[push] test failed:", err);
      res.status(500).json({ message: "Не удалось отправить проверочное уведомление" });
    }
  });
}
