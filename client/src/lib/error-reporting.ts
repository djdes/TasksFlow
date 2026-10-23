/**
 * Отчёты о необработанных ошибках браузера → POST /api/client-errors
 * (server/client-errors.ts). Работает только в production-сборке.
 *
 * Без персональных данных: из сообщения и стека вырезаются email, телефоны
 * и токены, путь отправляется без query/hash и с замаскированными токенами
 * (/join/<token>). Одинаковые ошибки шлются один раз, всего не больше 10
 * отчётов на вкладку — зацикленная ошибка не забьёт лог.
 */

export type ErrorKind = "error" | "unhandledrejection" | "react";

export type ErrorReport = {
  kind: ErrorKind;
  message: string;
  stack?: string;
  path?: string;
  release?: string;
  userAgent?: string;
};

const ENDPOINT = "/api/client-errors";
const MAX_REPORTS_PER_TAB = 10;
const MESSAGE_LIMIT = 1000;
const STACK_LIMIT = 4000;

// Шум, по которому ничего не исправить: кросс-доменные скрипты без деталей,
// ResizeObserver, расширения браузера.
const IGNORED_MESSAGES = [/^Script error\.?$/i, /ResizeObserver loop/i];
const IGNORED_STACKS = [/chrome-extension:\/\//, /moz-extension:\/\//, /safari-(web-)?extension:\/\//];

export function scrubSensitive(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s()-]{9,}\d/g, "[phone]")
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, "[token]");
}

export function maskPath(pathname: string): string {
  return pathname
    .split(/[?#]/)[0]
    .split("/")
    .map((segment) => (/^[A-Za-z0-9_-]{16,}$/.test(segment) ? ":token" : segment))
    .join("/");
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

export function buildReport(
  error: unknown,
  kind: ErrorKind,
  context: { path?: string; release?: string; userAgent?: string; extraStack?: string } = {},
): ErrorReport {
  const { message, stack } = describe(error);
  const fullStack = [stack, context.extraStack].filter(Boolean).join("\n");
  return {
    kind,
    message: scrubSensitive(message).slice(0, MESSAGE_LIMIT),
    stack: fullStack ? scrubSensitive(fullStack).slice(0, STACK_LIMIT) : undefined,
    path: context.path ? maskPath(context.path) : undefined,
    release: context.release,
    userAgent: context.userAgent?.slice(0, 300),
  };
}

function isNoise(report: ErrorReport): boolean {
  return (
    IGNORED_MESSAGES.some((re) => re.test(report.message)) ||
    IGNORED_STACKS.some((re) => re.test(report.stack ?? ""))
  );
}

function signatureOf(report: ErrorReport): string {
  const firstFrame = (report.stack ?? "").split("\n").find((line) => line.includes("at ")) ?? "";
  return `${report.kind}|${report.message}|${firstFrame.trim()}`;
}

/**
 * Фабрика для тестов и для приложения: дедупликация и лимит живут внутри.
 * `send` вернёт false, если отчёт не ушёл (тогда он не тратит лимит).
 */
export function createReporter(options: { enabled: boolean; send: (report: ErrorReport) => boolean; maxReports?: number }) {
  const seen = new Set<string>();
  const limit = options.maxReports ?? MAX_REPORTS_PER_TAB;
  let sent = 0;
  return function report(report: ErrorReport): boolean {
    if (!options.enabled || sent >= limit || isNoise(report)) return false;
    const signature = signatureOf(report);
    if (seen.has(signature)) return false;
    seen.add(signature);
    if (!options.send(report)) return false;
    sent += 1;
    return true;
  };
}

function currentRelease(): string | undefined {
  try {
    // Имя чанка содержит хеш сборки: /assets/main-0ASrbHcW.js.
    return new URL(import.meta.url).pathname.split("/").pop() || undefined;
  } catch {
    return undefined;
  }
}

function sendToServer(report: ErrorReport): boolean {
  const body = JSON.stringify(report);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))) return true;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

const reportToServer = createReporter({ enabled: Boolean(import.meta.env.PROD), send: sendToServer });

/** Сообщить об ошибке вручную (ErrorBoundary). extraStack — например componentStack. */
export function reportError(error: unknown, kind: ErrorKind = "error", extraStack?: string): boolean {
  if (typeof window === "undefined") return false;
  return reportToServer(
    buildReport(error, kind, {
      path: window.location.pathname,
      release: currentRelease(),
      userAgent: navigator.userAgent,
      extraStack,
    }),
  );
}

let installed = false;

/** Подписка на window.onerror и unhandledrejection. Повторный вызов безопасен. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined" || !import.meta.env.PROD) return;
  installed = true;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, "error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, "unhandledrejection");
  });
}
