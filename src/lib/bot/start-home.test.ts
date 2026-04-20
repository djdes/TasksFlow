import assert from "node:assert/strict";
import test from "node:test";

import { loadTelegramStartHome } from "@/lib/bot/start-home";

test("loadTelegramStartHome returns unlinked for chats without a linked user", async () => {
  const home = await loadTelegramStartHome(
    {
      chatId: "777",
      miniAppBaseUrl: "https://wesetup.ru/mini",
    },
    {
      findLinkedUserByChatId: async () => null,
    }
  );

  assert.deepEqual(home, { kind: "unlinked" });
});

test("loadTelegramStartHome gives staff the next open obligation url and reuses one request timestamp", async () => {
  const syncCalls: Date[] = [];
  const listCalls: Date[] = [];

  const home = await loadTelegramStartHome(
    {
      chatId: "777",
      miniAppBaseUrl: "https://wesetup.ru/mini",
    },
    {
      findLinkedUserByChatId: async () => ({
        id: "user_1",
        name: "Ivan",
        role: "cook",
        isRoot: false,
        organizationId: "org_1",
      }),
      syncDailyJournalObligationsForUser: async (args) => {
        if (!args.now) {
          throw new Error("expected request-scoped now for staff sync");
        }
        syncCalls.push(args.now);
        return [];
      },
      listOpenJournalObligationsForUser: async (_userId, now) => {
        if (!now) {
          throw new Error("expected request-scoped now for staff reads");
        }
        listCalls.push(now);
        return [
          {
            id: "obl_1",
            journalCode: "incoming_control",
            targetPath: "/mini/journals/incoming_control/new",
            template: { name: "Incoming control", description: null },
          },
        ];
      },
      syncDailyJournalObligationsForOrganization: async () => undefined,
      getManagerObligationSummary: async () => ({
        total: 0,
        pending: 0,
        done: 0,
        employeesWithPending: 0,
      }),
    }
  );

  assert.equal(home.kind, "staff");
  if (home.kind !== "staff") {
    throw new Error("expected staff home");
  }

  assert.equal(syncCalls.length, 1);
  assert.equal(listCalls.length, 1);
  assert.equal(syncCalls[0], listCalls[0]);
  assert.equal(home.nextAction?.label, "Incoming control");
  assert.equal(home.nextAction?.journalCode, "incoming_control");
  assert.equal(home.buttonUrl, "https://wesetup.ru/mini/o/obl_1");
});

test("loadTelegramStartHome gives managers a summary and reuses one request timestamp", async () => {
  const syncCalls: Date[] = [];
  const summaryCalls: Date[] = [];

  const home = await loadTelegramStartHome(
    {
      chatId: "888",
      miniAppBaseUrl: "https://wesetup.ru/mini",
    },
    {
      findLinkedUserByChatId: async () => ({
        id: "user_2",
        name: "Olga",
        role: "manager",
        isRoot: false,
        organizationId: "org_1",
      }),
      syncDailyJournalObligationsForUser: async () => [],
      listOpenJournalObligationsForUser: async () => [],
      syncDailyJournalObligationsForOrganization: async (_organizationId, now) => {
        if (!now) {
          throw new Error("expected request-scoped now for manager sync");
        }
        syncCalls.push(now);
      },
      getManagerObligationSummary: async (_organizationId, now) => {
        if (!now) {
          throw new Error("expected request-scoped now for manager summary");
        }
        summaryCalls.push(now);
        return {
          total: 10,
          pending: 4,
          done: 6,
          employeesWithPending: 2,
        };
      },
    }
  );

  assert.equal(home.kind, "manager");
  if (home.kind !== "manager") {
    throw new Error("expected manager home");
  }

  assert.equal(syncCalls.length, 1);
  assert.equal(summaryCalls.length, 1);
  assert.equal(syncCalls[0], summaryCalls[0]);
  assert.deepEqual(home.summary, {
    total: 10,
    pending: 4,
    done: 6,
    employeesWithPending: 2,
  });
  assert.equal(home.buttonUrl, "https://wesetup.ru/mini");
});
