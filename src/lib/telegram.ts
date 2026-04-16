import { Bot } from "grammy";
import crypto from "node:crypto";
import { escapeHtml } from "@/lib/html-escape";
import { getDbRoleValuesWithLegacy, MANAGEMENT_ROLES } from "@/lib/user-roles";

// Initialize bot (only if token is set). In regions where api.telegram.org is
// blocked (e.g. RU), set TELEGRAM_API_ROOT to a reverse proxy URL, such as a
// Cloudflare Worker that forwards requests to https://api.telegram.org. Grammy
// will use that as its API base.
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiRoot = process.env.TELEGRAM_API_ROOT?.replace(/\/+$/, "") || undefined;
const bot = token
  ? new Bot(token, apiRoot ? { client: { apiRoot } } : undefined)
  : null;

/**
 * Escape user-provided text before interpolating into a Telegram HTML message.
 * Telegram `parse_mode: "HTML"` supports <b>, <i>, <a>, <code>, <pre> — any
 * other `<` / `>` / `&` in user data must be escaped, otherwise attackers can
 * inject phishing <a href> links, forged tags or break message parsing.
 *
 * Re-exported for use in API routes that build Telegram message bodies.
 */
export const escapeTelegramHtml = escapeHtml;

const MAX_RETRIES = 3;
const RETRY_HARD_CAP_SECONDS = 30;

type GrammyRetryError = {
  error_code?: number;
  parameters?: { retry_after?: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryAfterSeconds(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as GrammyRetryError;
  if (candidate.error_code !== 429) return null;
  const ra = candidate.parameters?.retry_after;
  if (typeof ra !== "number" || !Number.isFinite(ra) || ra <= 0) return null;
  return Math.min(ra, RETRY_HARD_CAP_SECONDS);
}

/**
 * Send a Telegram message and log every attempt to TelegramLog.
 *
 * Retry policy: on HTTP 429 we honour Telegram's `retry_after` (capped at
 * 30s) up to 3 attempts. Other errors are logged as `failed` immediately.
 * Persistent 429s end as `rate_limited`. Caller context (userId) is
 * optional — cron jobs that fan out to many users pass it so the log is
 * per-user.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts?: { userId?: string | null }
): Promise<void> {
  const { db } = await import("./db");
  const log = await db.telegramLog.create({
    data: {
      chatId,
      body: text,
      userId: opts?.userId ?? null,
      status: "queued",
      attempts: 0,
    },
  });

  if (!bot) {
    await db.telegramLog.update({
      where: { id: log.id },
      data: { status: "failed", error: "bot not configured" },
    });
    return;
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
      await db.telegramLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          attempts: attempt,
          sentAt: new Date(),
        },
      });
      return;
    } catch (error) {
      lastError = error;
      const retryAfter = extractRetryAfterSeconds(error);
      if (retryAfter === null || attempt >= MAX_RETRIES) {
        break;
      }
      await sleep(retryAfter * 1000);
    }
  }

  const rateLimited = extractRetryAfterSeconds(lastError) !== null;
  const errorText =
    lastError instanceof Error
      ? lastError.message
      : typeof lastError === "string"
        ? lastError
        : JSON.stringify(lastError);
  await db.telegramLog.update({
    where: { id: log.id },
    data: {
      status: rateLimited ? "rate_limited" : "failed",
      error: errorText?.slice(0, 500) ?? "unknown",
      attempts: attempt,
    },
  });
  console.error("Telegram send error:", lastError);
}

export type NotificationType = "temperature" | "deviations" | "compliance" | "expiry";

// Send notification to all owners/technologists of an organization
export async function notifyOrganization(
  organizationId: string,
  message: string,
  roles: string[] = ["owner", "technologist"],
  type?: NotificationType
): Promise<void> {
  // Import db here to avoid circular deps
  const { db } = await import("./db");

  const dbRoles =
    roles[0] === "owner" || roles[0] === "manager"
      ? getDbRoleValuesWithLegacy(MANAGEMENT_ROLES)
      : roles;

  const users = await db.user.findMany({
    where: {
      organizationId,
      role: { in: dbRoles },
      telegramChatId: { not: null },
      isActive: true,
    },
    select: { id: true, telegramChatId: true, notificationPrefs: true },
  });

  // Filter by notification preference if type is specified
  const filtered = type
    ? users.filter((u) => {
        if (!u.notificationPrefs) return true; // null = all enabled
        const prefs = u.notificationPrefs as Record<string, boolean>;
        return prefs[type] !== false;
      })
    : users;

  await Promise.allSettled(
    filtered.map((u) =>
      sendTelegramMessage(u.telegramChatId!, message, {
        userId: (u as { id?: string }).id ?? null,
      })
    )
  );
}

// --- Telegram account link tokens ---
//
// Tokens are issued when a user visits /settings/notifications. They encode
// { userId, exp } and are signed with HMAC-SHA256 so that only our server
// can produce a valid token. Tokens expire after 15 minutes, preventing
// hijack via leaked browser history, screen sharing or log capture.

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

function getLinkTokenSecret(): string {
  // Prefer a dedicated secret; fall back to NEXTAUTH_SECRET which is always
  // required in production (see auth.ts).
  const secret =
    process.env.TELEGRAM_LINK_TOKEN_SECRET ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Telegram link token secret is not configured (set TELEGRAM_LINK_TOKEN_SECRET or NEXTAUTH_SECRET)"
    );
  }
  return secret;
}

function hmacBase64Url(payload: string): string {
  return crypto
    .createHmac("sha256", getLinkTokenSecret())
    .update(payload)
    .digest("base64url");
}

export function generateLinkToken(userId: string): string {
  const exp = Date.now() + LINK_TOKEN_TTL_MS;
  const payload = `${userId}:${exp}`;
  const sig = hmacBase64Url(payload);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function parseLinkToken(
  token: string
): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const idx1 = decoded.indexOf(":");
    const idx2 = decoded.indexOf(":", idx1 + 1);
    if (idx1 < 0 || idx2 < 0) return null;

    const userId = decoded.slice(0, idx1);
    const expStr = decoded.slice(idx1 + 1, idx2);
    const sig = decoded.slice(idx2 + 1);
    if (!userId || !expStr || !sig) return null;

    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const expected = hmacBase64Url(`${userId}:${expStr}`);
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    return { userId };
  } catch {
    return null;
  }
}
