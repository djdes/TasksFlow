// Привязка Telegram к аккаунту, проверка бота и его вебхук.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { requireAuth } from "./common";

export function registerTelegramLinkRoutes(app: Express): void {
  // ===== Привязка Telegram (бот @thetasksflowbot) =====

  /**
   * Публичная проверка «поднялся ли бот».
   *
   * Нужна, чтобы не гадать вслепую: положили токен в .env, перезапустили —
   * и одним curl видно, подхватил сервер бота или нет. Секретов не
   * отдаёт: username бота публичен по определению, токена и chat_id тут
   * нет. Без неё диагностика упиралась в «залогинься и посмотри глазами».
   */
  app.get("/api/telegram/health", async (_req, res) => {
    try {
      const { getTelegramRuntime, getTelegramStartupError } = await import("../telegram");
      const rt = getTelegramRuntime();
      res.json({
        configured: Boolean(rt),
        username: rt?.me.username ?? null,
        mode: rt?.config.mode ?? null,
        // Токен есть, но бот не встал — почти всегда сеть до Bot API.
        // Без этого поля причину было видно только в логе сервера.
        startupError: getTelegramStartupError(),
        // Чем бот разбирает текст. "none" = разбирать нечем, каждая
        // задача уйдёт в ручной черновик — самая частая жалоба
        // «AI не работает», которую иначе не видно снаружи.
        ai: await (async () => {
          const { loadPfAiConfig } = await import("../telegram/pf-ai");
          if (loadPfAiConfig()) return "projectsflow";
          const { isLocalAiAvailable } = await import("../telegram/local-ai");
          return isLocalAiAvailable() ? "local" : "none";
        })(),
        // Какое имя переменной сработало — самая частая причина «токен
        // положил, а бот молчит»: в ProjectsFlow и DocsFlow оно другое.
        tokenEnv: process.env.TASKSFLOW_BOT_TOKEN
          ? "TASKSFLOW_BOT_TOKEN"
          : process.env.TELEGRAM_BOT_TOKEN
            ? "TELEGRAM_BOT_TOKEN"
            : null,
      });
    } catch {
      res.json({ configured: false, username: null, mode: null });
    }
  });

  /**
   * Статус привязки для страницы «Аккаунт».
   * botId отдаём осознанно — Login Widget'у он нужен на клиенте, и это
   * публичная часть токена (всё до двоеточия).
   */
  app.get("/api/me/telegram", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      const { getTelegramRuntime } = await import("../telegram");
      const rt = getTelegramRuntime();
      res.json({
        connected: user.telegramUserId != null,
        telegramUsername: user.telegramUsername ?? null,
        telegramFirstName: user.telegramFirstName ?? null,
        tgStarted: user.tgStartedAt != null,
        botConfigured: Boolean(rt),
        botId: rt?.config.botId ?? null,
        botUsername: rt?.config.botUsername ?? null,
        botDeepLink: rt?.config.botDeepLink ?? null,
      });
    } catch (err) {
      console.error("Error reading telegram status:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/me/telegram/connect", requireAuth, async (req, res) => {
    try {
      const { getTelegramRuntime } = await import("../telegram");
      const rt = getTelegramRuntime();
      if (!rt) {
        return res.status(503).json({ message: "Telegram-бот не настроен" });
      }
      const {
        telegramLoginPayloadSchema,
        connectTelegramAccount,
        isTelegramLinkError,
      } = await import("../telegram/link");

      const payload = telegramLoginPayloadSchema.parse(req.body);
      try {
        await connectTelegramAccount({
          userId: req.session.userId!,
          payload,
          botToken: rt.config.botToken,
        });
      } catch (linkErr) {
        if (isTelegramLinkError(linkErr)) {
          return res
            .status(linkErr.status)
            .json({ message: linkErr.message, code: linkErr.code });
        }
        throw linkErr;
      }

      res.json({
        ok: true,
        connected: true,
        telegramUsername: payload.username ?? null,
        botDeepLink: rt.config.botDeepLink,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error connecting telegram:", err);
      res.status(500).json({ message: "Ошибка привязки Telegram" });
    }
  });

  /**
   * Ссылка привязки через бота — основной путь.
   *
   * Login Widget требует /setdomain в BotFather, доступного telegram.org
   * в браузере и неблокированного попапа. Здесь ничего этого не нужно:
   * пользователь просто открывает бота по ссылке с одноразовым кодом.
   */
  app.post("/api/me/telegram/link-code", requireAuth, async (req, res) => {
    try {
      const { getTelegramRuntime } = await import("../telegram");
      const rt = getTelegramRuntime();
      if (!rt) return res.status(503).json({ message: "Telegram-бот не настроен" });
      if (!rt.me.username) {
        return res.status(503).json({ message: "Не удалось определить имя бота" });
      }

      const { issueTelegramLinkCode } = await import("../telegram/link");
      const { code, expiresAt } = await issueTelegramLinkCode(req.session.userId!);

      res.json({
        url: `https://t.me/${rt.me.username}?start=${code}`,
        expiresAt,
      });
    } catch (err) {
      console.error("Error issuing telegram link code:", err);
      res.status(500).json({ message: "Не удалось создать ссылку привязки" });
    }
  });

  app.delete("/api/me/telegram", requireAuth, async (req, res) => {
    try {
      await storage.clearTelegramLink(req.session.userId!);
      res.status(204).end();
    } catch (err) {
      console.error("Error unlinking telegram:", err);
      res.status(500).json({ message: "Ошибка отвязки Telegram" });
    }
  });

  /**
   * Webhook Telegram. Отвечаем 200 всегда, когда апдейт принят или отброшен
   * осознанно: 4xx заставит Telegram ретраить одно и то же сообщение.
   * На реальной ошибке обработки отдаём 503 — вот тогда ретрай уместен.
   */
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const { getTelegramRuntime } = await import("../telegram");
      const rt = getTelegramRuntime();
      if (!rt) return res.status(200).json({ ok: false });

      // Секрет обязателен: без него вебхук принимает апдейты от кого угодно.
      if (!rt.config.webhookSecret) {
        console.warn("[telegram] webhook без TELEGRAM_WEBHOOK_SECRET — апдейт отброшен");
        return res.status(200).json({ ok: false });
      }
      const got = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (got !== rt.config.webhookSecret) {
        return res.status(200).json({ ok: false });
      }

      const { handleUpdate } = await import("../telegram/handle-update");
      await handleUpdate(req.body, rt);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error handling telegram webhook:", err);
      res.status(503).json({ ok: false });
    }
  });
}
