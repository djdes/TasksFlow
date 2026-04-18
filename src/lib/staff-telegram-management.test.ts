import assert from "node:assert/strict";
import test from "node:test";

import { unlinkStaffTelegram } from "@/lib/staff-telegram-management";

test("unlinkStaffTelegram clears telegram link and stale invite artifacts", async () => {
  const calls: Array<string> = [];

  const result = await unlinkStaffTelegram(
    {
      employeeId: "user-9",
      organizationId: "org-1",
    },
    {
      findEmployeeById: async () => ({
        id: "user-9",
        name: "РђРЅРЅР° РЎРјРёСЂРЅРѕРІР°",
        organizationId: "org-1",
        archivedAt: null,
        telegramChatId: "123456",
      }),
      clearTelegramLink: async () => {
        calls.push("clear-link");
      },
      deleteInviteToken: async () => {
        calls.push("delete-token");
      },
      dismissInviteNotification: async () => {
        calls.push("dismiss-notification");
      },
    }
  );

  assert.deepEqual(calls, [
    "clear-link",
    "delete-token",
    "dismiss-notification",
  ]);
  assert.equal(result.user.id, "user-9");
  assert.equal(result.user.telegramLinked, false);
});
