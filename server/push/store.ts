/**
 * Подписки на push в MySQL (push_subscriptions). Если миграцию ещё не
 * накатили, таблицы нет — тогда push молча выключен, а не роняет запросы.
 */
import crypto from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { pushSubscriptions, type PushSubscriptionRow } from "@shared/schema";
import { db } from "../db";
import { logger } from "../logger";

/** Больше устройств на человека не держим: самые старые уходят. */
export const MAX_DEVICES_PER_USER = 10;
/** Столько неудач подряд (не 404/410) — и подписка считается мёртвой. */
export const MAX_FAILURES = 10;

export const endpointHash = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex");

export type NewSubscription = {
  userId: number;
  companyId: number | null;
  kind: "web" | "apns";
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
  environment?: string | null;
  userAgent?: string | null;
};

export interface PushStore {
  save(sub: NewSubscription): Promise<void>;
  removeEndpoint(endpoint: string, userId?: number): Promise<number>;
  listForUsers(userIds: number[]): Promise<PushSubscriptionRow[]>;
  remove(id: number): Promise<void>;
  markFailed(id: number): Promise<void>;
  markOk(id: number): Promise<void>;
  countForUser(userId: number): Promise<number>;
}

let warnedMissingTable = false;

function missingTable(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code !== "ER_NO_SUCH_TABLE") return false;
  if (!warnedMissingTable) {
    warnedMissingTable = true;
    logger.warn("[push] нет таблицы push_subscriptions — запустите npm run add-push-subscriptions");
  }
  return true;
}

async function guard<T>(fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (missingTable(err)) return fallback;
    throw err;
  }
}

const now = () => Math.floor(Date.now() / 1000);

export const pushStore: PushStore = {
  async save(sub) {
    const ts = now();
    await db
      .insert(pushSubscriptions)
      .values({
        userId: sub.userId,
        companyId: sub.companyId,
        kind: sub.kind,
        endpoint: sub.endpoint,
        endpointHash: endpointHash(sub.endpoint),
        p256dh: sub.p256dh ?? null,
        auth: sub.auth ?? null,
        environment: sub.environment ?? null,
        userAgent: sub.userAgent?.slice(0, 255) ?? null,
        createdAt: ts,
        lastSeenAt: ts,
        failures: 0,
      })
      // Тот же браузер у другого человека (общий планшет) — подписка переходит к нему.
      .onDuplicateKeyUpdate({
        set: {
          userId: sub.userId,
          companyId: sub.companyId,
          p256dh: sub.p256dh ?? null,
          auth: sub.auth ?? null,
          environment: sub.environment ?? null,
          userAgent: sub.userAgent?.slice(0, 255) ?? null,
          lastSeenAt: ts,
          failures: 0,
        },
      });
    // Лишние старые устройства этого человека.
    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, sub.userId))
      .orderBy(asc(pushSubscriptions.lastSeenAt), asc(pushSubscriptions.id));
    const extra = rows.slice(0, Math.max(0, rows.length - MAX_DEVICES_PER_USER)).map((r) => r.id);
    if (extra.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, extra));
  },

  async removeEndpoint(endpoint, userId) {
    return guard(0, async () => {
      const where =
        userId === undefined
          ? eq(pushSubscriptions.endpointHash, endpointHash(endpoint))
          : and(eq(pushSubscriptions.endpointHash, endpointHash(endpoint)), eq(pushSubscriptions.userId, userId));
      const result = await db.delete(pushSubscriptions).where(where);
      const header = Array.isArray(result) ? result[0] : result;
      return Number((header as { affectedRows?: number })?.affectedRows ?? 0);
    });
  },

  async listForUsers(userIds) {
    if (userIds.length === 0) return [];
    return guard([] as PushSubscriptionRow[], () =>
      db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
    );
  },

  async remove(id) {
    await guard(undefined, async () => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    });
  },

  async markFailed(id) {
    await guard(undefined, async () => {
      await db
        .update(pushSubscriptions)
        .set({ failures: sql`${pushSubscriptions.failures} + 1` })
        .where(eq(pushSubscriptions.id, id));
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.id, id), sql`${pushSubscriptions.failures} >= ${MAX_FAILURES}`));
    });
  },

  async markOk(id) {
    await guard(undefined, async () => {
      await db.update(pushSubscriptions).set({ failures: 0, lastSeenAt: now() }).where(eq(pushSubscriptions.id, id));
    });
  },

  async countForUser(userId) {
    return guard(0, async () => {
      const rows = await db
        .select({ n: sql<number>`count(*)` })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      return Number(rows[0]?.n ?? 0);
    });
  },
};
