import assert from "node:assert/strict";
import test from "node:test";

import { shouldSkipTelegramDelivery } from "@/lib/telegram-delivery-policy";

test("shouldSkipTelegramDelivery returns false without a user id", async () => {
  let called = false;

  const skipped = await shouldSkipTelegramDelivery(
    {
      userId: null,
      delivery: {
        kind: "digest.staff",
        dedupeKey: "org_1:2026-04-20:user_1",
      },
      now: new Date("2026-04-20T08:00:00.000Z"),
    },
    {
      findRecentDelivery: async () => {
        called = true;
        return { id: "log_1" };
      },
    }
  );

  assert.equal(skipped, false);
  assert.equal(called, false);
});

test("shouldSkipTelegramDelivery returns false when metadata is incomplete", async () => {
  let called = false;

  const skipped = await shouldSkipTelegramDelivery(
    {
      userId: "user_1",
      delivery: {
        kind: "digest.staff",
        dedupeKey: "",
      },
      now: new Date("2026-04-20T08:00:00.000Z"),
    },
    {
      findRecentDelivery: async () => {
        called = true;
        return { id: "log_1" };
      },
    }
  );

  assert.equal(skipped, false);
  assert.equal(called, false);
});

test("shouldSkipTelegramDelivery checks recent queued or sent deliveries by user kind and key", async () => {
  const calls: Array<{
    userId: string;
    kind: string;
    dedupeKey: string;
    since: Date;
    statuses: string[];
  }> = [];

  const skipped = await shouldSkipTelegramDelivery(
    {
      userId: "user_1",
      delivery: {
        kind: "digest.staff",
        dedupeKey: "org_1:2026-04-20:user_1",
      },
      now: new Date("2026-04-20T08:00:00.000Z"),
    },
    {
      findRecentDelivery: async (args) => {
        calls.push(args);
        return { id: "log_1" };
      },
    }
  );

  assert.equal(skipped, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    userId: "user_1",
    kind: "digest.staff",
    dedupeKey: "org_1:2026-04-20:user_1",
    since: new Date("2026-04-18T20:00:00.000Z"),
    statuses: ["queued", "sent", "rate_limited"],
  });
});

test("shouldSkipTelegramDelivery ignores logs outside the configured lookback window", async () => {
  const skipped = await shouldSkipTelegramDelivery(
    {
      userId: "user_1",
      delivery: {
        kind: "digest.staff",
        dedupeKey: "org_1:2026-04-20:user_1",
      },
      now: new Date("2026-04-20T08:00:00.000Z"),
      lookbackMs: 60 * 60 * 1000,
    },
    {
      findRecentDelivery: async ({ since }) => {
        assert.equal(since.toISOString(), "2026-04-20T07:00:00.000Z");
        return null;
      },
    }
  );

  assert.equal(skipped, false);
});
