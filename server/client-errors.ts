/**
 * Отчёты об ошибках браузера.
 *
 * Кабинет и публичные страницы шлют сюда короткую сводку о необработанной
 * ошибке (window.onerror, unhandledrejection, ErrorBoundary) — см.
 * client/src/lib/error-reporting.ts. Пишем её в pino-лог, а если заданы
 * ALERT_TELEGRAM_BOT_TOKEN и ALERT_TELEGRAM_CHAT_ID — ещё и алерт в Telegram,
 * не чаще раза в 10 минут на одну сигнатуру.
 *
 * Роут намеренно стоит до сессий и общего JSON-парсера: свой лимит тела
 * (8 КБ), свой rate-limit, без чтения/создания сессии. Персональные данные
 * клиент вырезает сам; сервер на всякий случай повторяет вычистку.
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { logger } from "./logger";

const STACK_LIMIT = 4096;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_TRACKED_SIGNATURES = 500;

const clientErrorSchema = z.object({
  kind: z.enum(["error", "unhandledrejection", "react"]),
  message: z.string().max(2000).default(""),
  stack: z.string().max(20_000).optional(),
  path: z.string().max(500).optional(),
  release: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorSchema>;

/** Email, телефоны и длинные токены — не для логов. */
export function scrubSensitive(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s()-]{9,}\d/g, "[phone]")
    // Токен = 32+ символов и в нём есть и буквы, и цифры (имена чанков короче).
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, "[token]");
}

function cleanPath(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const pathname = raw.split(/[?#]/)[0];
  return pathname
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{16,}$/.test(segment) ? ":token" : segment))
    .join("/");
}

const lastAlertAt = new Map<string, number>();

/** Только для тестов: сбросить таймеры алертов. */
export function __resetClientErrorAlerts(): void {
  lastAlertAt.clear();
}

function signatureOf(report: ClientErrorReport): string {
  const firstFrame = (report.stack ?? "").split("\n").find((line) => line.includes("at ")) ?? "";
  return `${report.kind}|${report.message.slice(0, 200)}|${firstFrame.trim().slice(0, 200)}`;
}

async function sendTelegramAlert(report: ClientErrorReport): Promise<void> {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const signature = signatureOf(report);
  const now = Date.now();
  const previous = lastAlertAt.get(signature);
  if (previous !== undefined && now - previous < ALERT_COOLDOWN_MS) return;
  if (lastAlertAt.size >= MAX_TRACKED_SIGNATURES) lastAlertAt.clear();
  lastAlertAt.set(signature, now);

  const text = [
    `⚠️ TasksFlow: ошибка в браузере (${report.kind})`,
    report.message || "(без сообщения)",
    report.path ? `Страница: ${report.path}` : "",
    report.release ? `Сборка: ${report.release}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3500);
  const base = (process.env.TELEGRAM_API_BASE_URL?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
  try {
    await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.debug({ err }, "[client-errors] Telegram alert failed");
  }
}

export function registerClientErrorRoutes(app: Express): void {
  const router = express.Router();

  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Слишком много отчётов об ошибках" },
      validate: false as any,
    }),
  );
  // sendBeacon шлёт Blob application/json; text/plain — на случай старых браузеров.
  router.use(express.json({ limit: "8kb", type: ["application/json", "text/plain"] }));

  router.post("/", (req: Request, res: Response) => {
    const parsed = clientErrorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректный отчёт об ошибке" });
    }
    const report: ClientErrorReport = {
      ...parsed.data,
      message: scrubSensitive(parsed.data.message),
      stack: parsed.data.stack ? scrubSensitive(parsed.data.stack.slice(0, STACK_LIMIT)) : undefined,
      path: cleanPath(parsed.data.path),
    };
    logger.warn({ clientError: report }, "client error");
    void sendTelegramAlert(report);
    res.status(204).end();
  });

  // Ошибки парсера (слишком большое тело, битый JSON) — JSON-ответ, а не HTML.
  router.use((err: { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status === 413 || err?.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({ message: status === 413 ? "Отчёт слишком большой" : "Некорректный отчёт об ошибке" });
  });

  app.use("/api/client-errors", router);
}
