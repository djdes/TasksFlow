import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { logger, httpLogger } from "./logger";
import { db } from "./db";

const app = express();
const httpServer = createServer(app);

// Настройка хранилища сессий
const MemoryStore = createMemoryStore(session);

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

// Настройка сессий
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // Очистка просроченных сессий каждые 24 часа
    }),
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
app.get("/api/health", async (req, res) => {
  try {
    // Проверяем подключение к БД простым запросом
    await db.execute("SELECT 1" as any);
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (err) {
    logger.error({ err }, "Health check failed - database connection error");
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Database connection failed",
    });
  }
});

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
})();

// Export for potential testing
export { app, httpServer };
