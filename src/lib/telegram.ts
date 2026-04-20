import { Bot } from "grammy";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import crypto from "node:crypto";
import { escapeHtml } from "@/lib/html-escape";
import {
  shouldSkipTelegramDelivery,
  type TelegramDeliveryMetadata,
  type TelegramDeliveryPolicyOptions,
} from "@/lib/telegram-delivery-policy";
import { getDbRoleValuesWithLegacy, MANAGEMENT_ROLES } from "@/lib/user-roles";

// Initialize bot (only if token is set).
//
// `TELEGRAM_API_ROOT` — optional reverse proxy URL for regions where the
// primary api.telegram.org is fully blocked (Cloudflare Worker, self-hosted
// tdlib/telegram-bot-api, etc). Forwarded to grammy as apiRoot.
//
// `TELEGRAM_FORCE_IP` — IPv4 that still routes to Telegram's API edge when
// DNS returns a blocked IP (e.g. Roskomnadzor selectively nulls some of
// 149.154.160.0/20 but leaves 149.154.167.220 reachable). We install an
// undici Agent that overrides only api.telegram.org's DNS lookup; TLS SNI
// stays "api.telegram.org", so the certificate still validates.
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiRoot = process.env.TELEGRAM_API_ROOT?.replace(/\/+$/, "") || undefined;
const forceIp = process.env.TELEGRAM_FORCE_IP?.trim() || undefined;

// Grammy doesn't forward undici's `dispatcher` option through its
// baseFetchConfig. setGlobalDispatcher is the only reliable way to hook
// into Node's global fetch used by grammy. It affects every fetch() call in
// the process, but the lookup override only fires for hostname ===
// "api.telegram.org"; all other hostnames fall back to system DNS unchanged.
if (forceIp) {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup: ((
          hostname: string,
          options: object,
          callback: (
            err: NodeJS.ErrnoException | null,
            addresses: { address: string; family: number }[]
          ) => void
        ) => {
          if (hostname === "api.telegram.org") {
            callback(null, [{ address: forceIp, family: 4 }]);
            return;
          }
          import("node:dns").then(({ lookup }) => {
            lookup(hostname, { ...options, all: true }, callback);
          });
        }) as unknown as undefined,
      },
    })
  );
}

// Grammy's shim.node.js pins `node-fetch` hard, which ignores undici's
// global dispatcher. Pass undici's native `fetch` through BotConfig.client.fetch
// so our setGlobalDispatcher above actually takes effect for grammy calls too.
// Grammy's shim.node.js pins `node-fetch` hard, which ignores undici's
// global dispatcher. Pass a wrapper over undici's native `fetch` through
// BotConfig.client.fetch so our setGlobalDispatcher takes effect.
//
// Two real-world incompatibilities to handle:
//   1. Types clash (node-fetch Request vs undici Request) — cast via unknown.
//   2. Grammy ships an `abort-controller` polyfill whose AbortSignal is NOT
//      an instanceof the native AbortSignal that undici validates. If we
//      forward init.signal verbatim, undici throws "Expected signal to be
//      an instance of AbortSignal". Strip the polyfill signal (loses
//      grammy's soft-timeout, but undici has its own 300s cap) OR forward
//      only native signals.
const tgFetch = forceIp
  ? async (url: unknown, init: unknown) => {
      const opts = (init as { signal?: unknown } | undefined) ?? {};
      const signal = opts.signal;
      const forwarded =
        signal && !(signal instanceof AbortSignal)
          ? { ...(init as object), signal: undefined }
          : (init as object | undefined);
      return undiciFetch(
        url as Parameters<typeof undiciFetch>[0],
        forwarded as Parameters<typeof undiciFetch>[1]
      );
    }
  : undefined;

const bot = token
  ? new Bot(token, {
      client: {
        ...(apiRoot ? { apiRoot } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(tgFetch ? { fetch: tgFetch as any } : {}),
      },
    })
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

type TelegramSendOptions = {
  userId?: string | null;
  delivery?: TelegramDeliveryMetadata | null;
  policy?: TelegramDeliveryPolicyOptions;
};

function normalizeTelegramDeliveryMetadata(
  delivery: TelegramDeliveryMetadata | null | undefined
): { kind: string | null; dedupeKey: string | null } {
  const kind = delivery?.kind?.trim();
  const dedupeKey = delivery?.dedupeKey?.trim();

  return {
    kind: kind || null,
    dedupeKey: dedupeKey || null,
  };
}

async function shouldSkipTelegramSendOnRerun(
  opts: TelegramSendOptions | undefined
): Promise<boolean> {
  if (!opts?.policy?.skipOnRerun) {
    return false;
  }

  return shouldSkipTelegramDelivery({
    userId: opts.userId ?? null,
    delivery: opts.delivery,
    now: opts.policy.now,
    lookbackMs: opts.policy.lookbackMs,
  });
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
  opts?: TelegramSendOptions
): Promise<void> {
  const { db } = await import("./db");
  if (await shouldSkipTelegramSendOnRerun(opts)) {
    return;
  }

  const delivery = normalizeTelegramDeliveryMetadata(opts?.delivery);
  const log = await db.telegramLog.create({
    data: {
      chatId,
      body: text,
      userId: opts?.userId ?? null,
      kind: delivery.kind,
      dedupeKey: delivery.dedupeKey,
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

/**
 * DM a specific employee with an optional Mini App button.
 *
 * Unlike `notifyOrganization` (which fans out to management roles on
 * temperature/deviation events), this one is targeted: cron jobs use it
 * for per-worker morning digests and per-worker pre-deadline reminders.
 * Returns silently if the user has no `telegramChatId` on file — callers
 * aren't expected to filter the list themselves.
 */
export async function notifyEmployee(
  userId: string,
  text: string,
  action?: { label: string; miniAppUrl: string },
  opts?: Omit<TelegramSendOptions, "userId">
): Promise<void> {
  const { db } = await import("./db");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, telegramChatId: true, isActive: true },
  });
  if (!user || !user.isActive || !user.telegramChatId) {
    return;
  }

  if (
    await shouldSkipTelegramSendOnRerun({
      userId: user.id,
      delivery: opts?.delivery,
      policy: opts?.policy,
    })
  ) {
    return;
  }

  const delivery = normalizeTelegramDeliveryMetadata(opts?.delivery);
  const log = await db.telegramLog.create({
    data: {
      chatId: user.telegramChatId,
      body: text,
      userId: user.id,
      kind: delivery.kind,
      dedupeKey: delivery.dedupeKey,
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

  const replyMarkup = action
    ? {
        inline_keyboard: [
          [
            {
              text: action.label,
              web_app: { url: action.miniAppUrl },
            },
          ],
        ],
      }
    : undefined;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      await bot.api.sendMessage(user.telegramChatId, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      await db.telegramLog.update({
        where: { id: log.id },
        data: { status: "sent", attempts: attempt, sentAt: new Date() },
      });
      return;
    } catch (error) {
      lastError = error;
      const retryAfter = extractRetryAfterSeconds(error);
      if (retryAfter === null || attempt >= MAX_RETRIES) break;
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
  console.error("Telegram employee notification error:", lastError);
}

/**
 * Send a direct deep-link invite message to an already linked Telegram chat.
 *
 * Used when a manager requests a rebind for an employee who already has
 * `telegramChatId`: the employee gets the same fresh invite link in Telegram
 * itself, in addition to the in-app site notification.
 */
export async function sendTelegramInviteLinkMessage(args: {
  chatId: string;
  userId: string;
  employeeName: string;
  inviteUrl: string;
  delivery?: TelegramDeliveryMetadata | null;
  policy?: TelegramDeliveryPolicyOptions;
}): Promise<void> {
  const { db } = await import("./db");
  const text = [
    `Руководитель обновил привязку Telegram для сотрудника ${escapeTelegramHtml(args.employeeName)}.`,
    "Откройте кнопку ниже, чтобы подтвердить перепривязку.",
  ].join("\n\n");

  if (
    await shouldSkipTelegramSendOnRerun({
      userId: args.userId,
      delivery: args.delivery,
      policy: args.policy,
    })
  ) {
    return;
  }

  const delivery = normalizeTelegramDeliveryMetadata(args.delivery);
  const log = await db.telegramLog.create({
    data: {
      chatId: args.chatId,
      body: text,
      userId: args.userId,
      kind: delivery.kind,
      dedupeKey: delivery.dedupeKey,
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

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: "Перепривязать Telegram",
          url: args.inviteUrl,
        },
      ],
    ],
  };

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      await bot.api.sendMessage(args.chatId, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      await db.telegramLog.update({
        where: { id: log.id },
        data: { status: "sent", attempts: attempt, sentAt: new Date() },
      });
      return;
    } catch (error) {
      lastError = error;
      const retryAfter = extractRetryAfterSeconds(error);
      if (retryAfter === null || attempt >= MAX_RETRIES) break;
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
  console.error("Telegram invite link message error:", lastError);
}

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
