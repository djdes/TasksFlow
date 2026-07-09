import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { MySqlSessionStore, ensureSessionsTable } from "./session-store";
import rateLimit from "express-rate-limit";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, httpLogger } from "./logger";
import { db } from "./db";
import { processPendingDeliveries } from "./webhook-queue";
import { runSchemaSelfCheck } from "./schema-self-check";

const app = express();
const httpServer = createServer(app);

// Trust proxy for rate limiting behind nginx/apache
app.set("trust proxy", 1);

// Rate limiting - общий лимит
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // 1000 запросов на окно
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много запросов, попробуйте позже" },
  skip: (req) =>
    req.path === "/health" || req.originalUrl === "/api/health",
  validate: false as any, // Полностью отключаем валидацию
});

// Rate limiting - строгий лимит для auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 попыток входа
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Слишком много попыток входа, попробуйте через 15 минут" },
  validate: false as any, // Полностью отключаем валидацию
});

// Применяем общий rate limiter только к API: SPA/assets не должны съедать лимит.
app.use("/api", generalLimiter);

// Применяем строгий лимит для авторизации
app.use("/api/auth/login", authLimiter);

// Security headers — без helmet (extra dep) делаем минимальный набор
// руками. Опускаем CSP: anti-flash inline-script в client/index.html
// требует точной настройки с nonce/hash, оставлено на будущее.
//
//   X-Content-Type-Options: nosniff  — браузер не «угадывает» MIME,
//     html-payload загруженный как .png не выполнится
//   X-Frame-Options: DENY            — anti-clickjacking; TasksFlow
//     не embeds в iframe ни одной интеграции, безопасно жёстко
//   Strict-Transport-Security        — после первого HTTPS-визита
//     запрещает HTTP-fallback; защита от downgrade-атак (только
//     production — на dev http://localhost ломалось бы)
//   Referrer-Policy: same-origin    — Referer на внешние URL не
//     утекает, чтобы task-title и /admin/users-id не попадали в
//     логи третьих сторон
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }
  next();
});

// Настройка сессий.
//
// SESSION_SECRET ОБЯЗАТЕЛЕН в production. Раньше был fallback на
// "your-secret-key-change-in-production" — если env не задан,
// все session-cookie подписывались публично известным секретом,
// и атакующий мог forge'ить сессии для любого юзера.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production. Set it in env before starting the server."
    );
  }
  // В dev допускаем default — но логируем чтобы было видно.
  console.warn(
    "[session] SESSION_SECRET не задан — using dev fallback. В prod это бы остановило старт."
  );
}
app.use(
  session({
    secret: sessionSecret || "dev-only-fallback-do-not-use-in-prod",
    resave: false,
    saveUninitialized: false,
    // MySQL store (table `sessions`) — переживает рестарты сервера.
    // Раньше был MemoryStore, и каждый деплой = всех вышибало.
    // См. server/session-store.ts комментарий.
    store: new MySqlSessionStore(),
    // rolling: true — каждый запрос продлевает cookie expires.
    // Активный юзер не вылетит через 30 дней с момента ПЕРВОГО входа,
    // он вылетит только если 30 дней ничего не делал. Раньше без
    // rolling cookie экспайрилась ровно через 30 дней даже при
    // ежедневном использовании.
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS в production
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
      sameSite: "lax",
    },
  })
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Настройка загрузки файлов
const uploadsDir = path.join(process.cwd(), "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Статические файлы для загрузок
app.use("/uploads", express.static(uploadsDir));

// Health check endpoint (до логирования запросов)
//
// Формат совместим с WeSetup `/api/health` — те же поля `ok`,
// `db`, `dbLatencyMs`, `buildSha`, `uptimeSec`, `now`. WeSetup
// пингует этот endpoint каждые 5 минут и показывает «зелёный/
// жёлтый/красный» в /settings/integrations/tasksflow на основе
// последнего ответа (см. P1#5 в docs/THREAD_TASKSFLOW.md).
//
// Build SHA читаем из `.build-sha` файла (пишется CI при деплое).
// Если файла нет — это dev-окружение, отдаём "dev".
let cachedBuildSha: string | null = null;
function readBuildSha(): string {
  if (cachedBuildSha !== null) return cachedBuildSha;
  try {
    const { readFileSync } = require("fs") as typeof import("fs");
    cachedBuildSha = readFileSync(
      path.join(process.cwd(), ".build-sha"),
      "utf-8",
    ).trim();
  } catch {
    cachedBuildSha = "dev";
  }
  return cachedBuildSha as string;
}

async function healthHandler(_req: Request, res: Response) {
  const startedAt = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;
  let dbError: string | undefined;
  try {
    await db.execute("SELECT 1" as any);
    dbLatencyMs = Date.now() - startedAt;
  } catch (err) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "unknown";
    logger.error({ err }, "Health check failed - database connection error");
  }

  const httpStatus = dbStatus === "ok" ? 200 : 503;
  res.status(httpStatus).json({
    ok: dbStatus === "ok",
    db: dbStatus,
    dbLatencyMs,
    ...(dbError ? { dbError } : {}),
    buildSha: readBuildSha(),
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString(),
  });
}

app.get("/api/health", healthHandler);
// Alias без `/api` — для load-balancer probes и для обратной совместимости
// с потребителями, ожидающими «прямой» URL вида GET /health.
app.get("/health", healthHandler);

// HTTP request logging
app.use((req, res, next) => {
  const start = Date.now();
  const requestPath = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (requestPath.startsWith("/api") && requestPath !== "/api/health") {
      httpLogger.info({
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        duration,
        ip: req.ip,
      });
    }
  });

  next();
});

// Graceful shutdown handler
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Received shutdown signal, starting graceful shutdown...");

  // Перестаем принимать новые соединения
  httpServer.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Принудительное завершение через 30 секунд
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
}

// Регистрируем обработчики сигналов
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Обработка необработанных ошибок
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled rejection");
});

(async () => {
  // Startup self-check: убеждаемся что verification-колонки добавлены.
  // Если миграция _add-verification-cols.ts не применилась через
  // deploy.yml (упала или skipped), здесь догоняем — иначе createTask
  // и submitForVerification будут валиться с Unknown column. Не блокирует
  // старт сервера если check failed — feature просто disabled.
  try {
    await runSchemaSelfCheck();
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[schema-self-check] uncaught — continuing without verification",
    );
  }

  // Auto-migration таблицы sessions. Раньше деплоился новый код, и
  // первый же запрос валился с «Table 'tasksflow.sessions' doesn't
  // exist» — нужно было руками гонять `tsx script/add-sessions-table.ts`.
  // Теперь делаем CREATE TABLE IF NOT EXISTS на старте — идемпотентно
  // и безопасно. Аналогично для webhook_deliveries — она уже лежит
  // на проде, но если кто-то поднимет fresh-инстанс, таблица создастся
  // автоматически.
  await ensureSessionsTable();
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`webhook_deliveries\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`task_id\` int NOT NULL,
        \`event_type\` varchar(20) NOT NULL,
        \`target_url\` varchar(500) NOT NULL,
        \`api_key\` varchar(255) NOT NULL,
        \`payload\` text NOT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`status\` int NOT NULL DEFAULT 0,
        \`next_retry_at\` int NOT NULL,
        \`last_error\` text,
        \`created_at\` int NOT NULL DEFAULT 0,
        \`updated_at\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        KEY \`status_next_retry_idx\` (\`status\`, \`next_retry_at\`),
        KEY \`task_id_idx\` (\`task_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[webhook-deliveries] auto-create failed — миграция не прошла, retry-queue не работает",
    );
  }

  // Auto-migration колонок email-авторизации (лендинг). Идемпотентно:
  // пытаемся добавить users.email; если уже есть (ER_DUP_FIELDNAME) —
  // значит миграция пройдена, выходим. Если добавили впервые — досоздаём
  // остальные колонки и делаем phone nullable. Без этого первый
  // /api/auth/start падал с «Unknown column 'email'».
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`email\` VARCHAR(255) NULL`);
    // email не было — впервые мигрируем остальное (каждый под своим catch).
    await db.execute(sql`ALTER TABLE \`users\` MODIFY COLUMN \`phone\` VARCHAR(20) NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`password_hash\` VARCHAR(255) NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`magic_token\` VARCHAR(64) NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`magic_token_expires_at\` INT NULL`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`users\` ADD UNIQUE INDEX \`users_email_unique\` (\`email\`)`).catch(() => {});
    logger.info("[email-auth] колонки добавлены (auto-migration)");
  } catch (err: any) {
    if (err?.code !== "ER_DUP_FIELDNAME") {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[email-auth] auto-migration не прошла — email-вход может не работать",
      );
    }
  }

  // Auto-migration колонки users.is_root (root-доступ к управлению сайтом).
  // Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`is_root\` BOOLEAN NOT NULL DEFAULT false`);
    logger.info("[root] колонка users.is_root добавлена (auto-migration)");
  } catch (err: any) {
    if (err?.code !== "ER_DUP_FIELDNAME") {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[root] auto-migration is_root не прошла",
      );
    }
  }

  // Auto-migration колонки tasks.checklist (подзадачи/чек-лист внутри задачи).
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE \`tasks\` ADD COLUMN \`checklist\` TEXT NULL`);
    logger.info("[checklist] колонка tasks.checklist добавлена (auto-migration)");
  } catch (err: any) {
    if (err?.code !== "ER_DUP_FIELDNAME") {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[checklist] auto-migration tasks.checklist не прошла",
      );
    }
  }

  // Auto-migration таблицы промо-баннеров. Идемпотентно (CREATE TABLE IF NOT EXISTS).
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`banners\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`text\` varchar(500) NOT NULL,
        \`link_url\` varchar(500),
        \`link_label\` varchar(120),
        \`placement\` varchar(16) NOT NULL DEFAULT 'top',
        \`bg_color\` varchar(64),
        \`text_color\` varchar(64),
        \`active\` boolean NOT NULL DEFAULT true,
        \`starts_at\` int,
        \`ends_at\` int,
        \`position\` int NOT NULL DEFAULT 0,
        \`created_at\` int NOT NULL DEFAULT 0,
        \`updated_at\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        KEY \`banners_active_placement_idx\` (\`active\`, \`placement\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[banners] auto-create таблицы не прошла — баннеры не работают",
    );
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({ err, status }, "Request error");
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const nodeEnv = process.env.NODE_ENV || "development";
  logger.info({ nodeEnv }, "Starting server");

  if (nodeEnv === "production") {
    logger.info("Using production mode - serving static files");
    serveStatic(app);
  } else {
    logger.info("Using development mode - setting up Vite");
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    port,
    "0.0.0.0",
    () => {
      logger.info({ port }, "Server listening");
    },
  );

  // Webhook delivery worker — каждые 30 секунд тянет до 50 pending
  // доставок чьё nextRetryAt уже наступило. Backoff и max attempts
  // живут в server/webhook-queue.ts.
  //
  // Single-instance assumption: TasksFlow деплоится в одном процессе,
  // так что race на одной строке невозможен. Если когда-нибудь поедем
  // на multi-instance — добавить SELECT … FOR UPDATE SKIP LOCKED.
  setInterval(() => {
    processPendingDeliveries()
      .then((stats) => {
        if (stats.processed > 0) {
          logger.info({ ...stats }, "[webhook-queue] tick");
        }
      })
      .catch((err: unknown) => {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[webhook-queue] tick failed",
        );
      });
  }, 30_000);
})();

// Export for potential testing
export { app, httpServer };
