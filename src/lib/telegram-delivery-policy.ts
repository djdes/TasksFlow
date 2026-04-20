export type TelegramDeliveryMetadata = {
  kind?: string | null;
  dedupeKey?: string | null;
};

export type TelegramDeliveryPolicyOptions = {
  skipOnRerun?: boolean;
  now?: Date;
  lookbackMs?: number;
};

type TelegramDeliveryLookupArgs = {
  userId: string;
  kind: string;
  dedupeKey: string;
  since: Date;
  statuses: string[];
};

type TelegramDeliveryPolicyDeps = {
  findRecentDelivery: (args: TelegramDeliveryLookupArgs) => Promise<{ id: string } | null>;
};

const DEFAULT_LOOKBACK_MS = 36 * 60 * 60 * 1000;
const RERUN_SKIP_STATUSES = ["queued", "sent", "rate_limited"] as const;

function normalizeDeliveryMetadata(
  delivery: TelegramDeliveryMetadata | null | undefined
): { kind: string; dedupeKey: string } | null {
  const kind = delivery?.kind?.trim();
  const dedupeKey = delivery?.dedupeKey?.trim();

  if (!kind || !dedupeKey) {
    return null;
  }

  return { kind, dedupeKey };
}

function defaultDeps(): TelegramDeliveryPolicyDeps {
  return {
    async findRecentDelivery(args) {
      const { db } = await import("./db");
      return db.telegramLog.findFirst({
        where: {
          userId: args.userId,
          kind: args.kind,
          dedupeKey: args.dedupeKey,
          status: { in: args.statuses },
          createdAt: { gte: args.since },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    },
  };
}

export async function shouldSkipTelegramDelivery(
  args: {
    userId?: string | null;
    delivery?: TelegramDeliveryMetadata | null;
    now?: Date;
    lookbackMs?: number;
  },
  overrides?: Partial<TelegramDeliveryPolicyDeps>
): Promise<boolean> {
  const userId = args.userId?.trim();
  const delivery = normalizeDeliveryMetadata(args.delivery);

  if (!userId || !delivery) {
    return false;
  }

  const now = args.now ?? new Date();
  const lookbackMs = args.lookbackMs ?? DEFAULT_LOOKBACK_MS;
  const deps = { ...defaultDeps(), ...overrides };
  const existing = await deps.findRecentDelivery({
    userId,
    kind: delivery.kind,
    dedupeKey: delivery.dedupeKey,
    since: new Date(now.getTime() - lookbackMs),
    statuses: [...RERUN_SKIP_STATUSES],
  });

  return Boolean(existing);
}
