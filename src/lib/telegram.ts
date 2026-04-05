import { Bot } from "grammy";
import crypto from "node:crypto";
import { escapeHtml } from "@/lib/html-escape";

// Initialize bot (only if token is set)
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new Bot(token) : null;

/**
 * Escape user-provided text before interpolating into a Telegram HTML message.
 * Telegram `parse_mode: "HTML"` supports <b>, <i>, <a>, <code>, <pre> — any
 * other `<` / `>` / `&` in user data must be escaped, otherwise attackers can
 * inject phishing <a href> links, forged tags or break message parsing.
 *
 * Re-exported for use in API routes that build Telegram message bodies.
 */
export const escapeTelegramHtml = escapeHtml;

// Send a message to a specific chat
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  if (!bot) return; // silently skip if no bot configured
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Telegram send error:", error);
  }
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

  const users = await db.user.findMany({
    where: {
      organizationId,
      role: { in: roles },
      telegramChatId: { not: null },
      isActive: true,
    },
    select: { telegramChatId: true, notificationPrefs: true },
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
    filtered.map((u) => sendTelegramMessage(u.telegramChatId!, message))
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
