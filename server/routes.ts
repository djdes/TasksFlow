import type { Express } from "express";
import type { Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { db } from "./db";
import { hashPin, notifyPinEvent } from "./pin-auth";
import { registerHistoryRoutes } from "./history-routes";
import { openLiveStream, publishToCompany } from "./live-events";
import { registerCompanyRoutes } from "./company-routes";
import { dbRootUsersStore, registerRootUserRoutes } from "./root-users";
import { registerPushRoutes } from "./push-routes";
import { registerBillingRoutes } from "./billing-routes";
import { registerRoleRoutes } from "./role-routes";
import {
  requireAuth,
  requireAdmin,
  requireRoot,
  requireUserManager,
  requireAuthOrApiKey,
  getCompanyIdFromReq,
  stripSensitive,
} from "./routes/common";
import { registerBannerRoutes } from "./routes/banners";
import { registerAuthRoutes } from "./routes/auth";
import { registerQuickLoginRoutes } from "./routes/quick-login";
import { registerTelegramLinkRoutes } from "./routes/telegram-link";
import { registerCompanyMeRoutes } from "./routes/company-me";
import { registerWorkerRoutes } from "./routes/workers";
import { registerTaskRoutes } from "./routes/tasks";
import { registerTaskPhotoRoutes } from "./routes/task-photos";
import { registerTaskStatusRoutes } from "./routes/task-status";
import { registerUserRoutes, canTouchUser } from "./routes/users";
import { registerInvitationRoutes } from "./routes/invitations";
import { registerApiKeyRoutes } from "./routes/api-keys";
import { registerWesetupRoutes } from "./routes/wesetup";
import { registerAdminToolRoutes } from "./routes/admin-tools";
import { guardImpersonation, registerImpersonationRoutes } from "./impersonation";

// Маршруты кабинета и API по разделам — server/routes/*.ts. Порядок вызовов ниже —
// порядок регистрации в Express: middleware и лимиты стоят перед маршрутами,
// которые они защищают, а статичные пути — перед динамическими.
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use(guardImpersonation);
  registerImpersonationRoutes(app);

  // Глобально оборачиваем res.json, чтобы вырезать чувствительные поля
  // юзера (passwordHash / magicToken) из всех ответов. Ставим первым.
  app.use((_req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body: any) => orig(stripSensitive(body));
    next();
  });

  // Любое успешное изменение задач и сотрудников по HTTP (кабинет, API-ключ,
  // WeSetup) — сигнал открытым кабинетам компании обновиться. Бот и ночной
  // сброс шлют такой же сигнал из сервисов.
  app.use(["/api/tasks", "/api/wesetup", "/api/users"], (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      getCompanyIdFromReq(req)
        .then((companyId) => publishToCompany(companyId, { type: "tasks" }))
        .catch(() => {});
    });
    next();
  });

  registerBannerRoutes(app);

  // Rate-limit login и публичные регистрационные endpoint'ы. Вход по
  // телефону защищён PIN с блокировкой аккаунта (server/pin-auth.ts),
  // а этот лимит не даёт быстро перебирать номера.
  // 20 запросов / минуту с одного IP. Вход идёт в два запроса (номер,
  // затем PIN); более строгий лимит /api/auth/login — в server/index.ts.
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Слишком много попыток входа. Подождите минуту." },
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/start", authLimiter);
  app.use("/api/auth/login-email", authLimiter);
  app.use("/api/auth/recover", authLimiter);
  app.use("/api/companies/register", authLimiter);
  // /api/users/register — открытый endpoint регистрации воркера к
  // существующей компании. Без strict-лимита бот мог через
  // generalLimiter (1000/15min) зарегистрировать сотни фейковых
  // аккаунтов в чужой компании (если узнает adminPhone) и спамить
  // её админу уведомлениями. Симметрия с companies/register.
  app.use("/api/users/register", authLimiter);

  // Photo upload limiter — heavy endpoint (multer + diskStorage). Без
  // отдельного лимита злоумышленник с одной сессии может через
  // generalLimiter (1000/15min в server/index.ts) залить 1000×10MB =
  // 10GB на диск и положить сервер.
  // 60 загрузок за 15 минут на IP: воркер делает 5-15 фото в день,
  // админ массово ставит example-photo на ~50 задач — оба укладываются.
  const photoUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Слишком много загрузок фото. Подождите 15 минут.",
    },
  });
  app.use("/api/tasks/:id/photo", photoUploadLimiter);
  app.use("/api/tasks/:id/example-photo", photoUploadLimiter);
  app.use("/api/users/register", authLimiter);

  registerAuthRoutes(app);
  registerQuickLoginRoutes(app);

  registerTelegramLinkRoutes(app);

  registerCompanyMeRoutes(app);

  registerWorkerRoutes(app);

  registerTaskRoutes(app);

  registerTaskPhotoRoutes(app);

  registerTaskStatusRoutes(app);

  registerUserRoutes(app);

  registerInvitationRoutes(app);

  registerApiKeyRoutes(app);

  registerWesetupRoutes(app);

  registerAdminToolRoutes(app);

  // История выполнения и отчёты (server/history-routes.ts).
  registerHistoryRoutes(app, { requireAuthOrApiKey, getCompanyIdFromReq });

  // Точки, привязка к точке, root «Компании» (server/company-routes.ts).
  registerCompanyRoutes(app, {
    requireAuthOrApiKey,
    requireAuth,
    requireAdmin,
    requireRoot,
    requireUserManager,
    canTouchUser,
    getCompanyIdFromReq,
  });

  // Root: люди всех компаний — поиск и правка (server/root-users.ts).
  registerRootUserRoutes(app, {
    requireRoot,
    store: dbRootUsersStore(db, storage),
    hashPin,
    notifyPin: notifyPinEvent,
    audit: async (args) => (await import("./audit-log")).recordAudit(args),
  });

  // Роли компании и настройка проверки выполненного (server/role-routes.ts).
  registerRoleRoutes(app, { requireAuth, requireAdmin, requireUserManager, getCompanyIdFromReq });

  // Push-уведомления: подписки устройств (server/push-routes.ts).
  registerPushRoutes(app, { requireAuth });

  // Оплата тарифа через Робокассу (server/billing-routes.ts).
  registerBillingRoutes(app, { requireAdmin, requireRoot, getCompanyIdFromReq });

  // Живые обновления кабинета (server/live-events.ts).
  app.get("/api/events", requireAuth, async (req, res) => {
    const companyId = await getCompanyIdFromReq(req).catch(() => null);
    if (!companyId) return res.status(404).json({ message: "Компания не найдена" });
    openLiveStream(req, res, companyId, req.session.userId!);
  });

  return httpServer;
}
