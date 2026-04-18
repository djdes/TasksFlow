import assert from "node:assert/strict";
import test from "node:test";

import {
  StaffTelegramInviteError,
  buildTelegramBotChatUrl,
  issueStaffTelegramInvite,
} from "@/lib/staff-telegram-invite";

test("buildTelegramBotChatUrl returns bot chat url", () => {
  assert.equal(
    buildTelegramBotChatUrl("@wesetup_bot"),
    "https://t.me/wesetup_bot"
  );
  assert.equal(
    buildTelegramBotChatUrl("wesetup_bot"),
    "https://t.me/wesetup_bot"
  );
});

test("issueStaffTelegramInvite creates token and site notification", async () => {
  const calls: {
    notification?: Record<string, unknown>;
    telegram?: Record<string, unknown>;
  } = {};

  const result = await issueStaffTelegramInvite(
    {
      employeeId: "user-1",
      organizationId: "org-1",
      mode: "invite",
      botUsername: "wesetup_bot",
    },
    {
      findEmployeeById: async () => ({
        id: "user-1",
        name: "Иван Иванов",
        organizationId: "org-1",
        archivedAt: null,
        telegramChatId: null,
      }),
      replaceInviteToken: async () => ({
        rawToken: "inv_token_123",
        expiresAt: new Date("2026-04-25T10:00:00.000Z"),
      }),
      makeQrDataUrl: async (value) => `qr:${value}`,
      upsertSiteNotification: async (payload) => {
        calls.notification = payload as unknown as Record<string, unknown>;
      },
      sendTelegramDeepLinkMessage: async (payload) => {
        calls.telegram = payload as unknown as Record<string, unknown>;
      },
    }
  );

  assert.equal(result.inviteUrl, "https://t.me/wesetup_bot?start=inv_token_123");
  assert.equal(result.qrPngDataUrl, "qr:https://t.me/wesetup_bot?start=inv_token_123");
  assert.equal(result.user.id, "user-1");
  assert.equal(result.user.name, "Иван Иванов");
  assert.equal(
    calls.notification?.dedupeKey,
    "staff.telegram-invite:user-1"
  );
  assert.equal(
    calls.notification?.linkHref,
    "https://t.me/wesetup_bot?start=inv_token_123"
  );
  assert.equal(calls.telegram, undefined);
});

test("issueStaffTelegramInvite sends telegram message on rebind for linked employee", async () => {
  const calls: {
    notification?: Record<string, unknown>;
    telegram?: Record<string, unknown>;
  } = {};

  await issueStaffTelegramInvite(
    {
      employeeId: "user-2",
      organizationId: "org-1",
      mode: "rebind",
      botUsername: "wesetup_bot",
    },
    {
      findEmployeeById: async () => ({
        id: "user-2",
        name: "Петр Петров",
        organizationId: "org-1",
        archivedAt: null,
        telegramChatId: "777",
      }),
      replaceInviteToken: async () => ({
        rawToken: "inv_token_777",
        expiresAt: new Date("2026-04-26T10:00:00.000Z"),
      }),
      makeQrDataUrl: async (value) => `qr:${value}`,
      upsertSiteNotification: async (payload) => {
        calls.notification = payload as unknown as Record<string, unknown>;
      },
      sendTelegramDeepLinkMessage: async (payload) => {
        calls.telegram = payload as unknown as Record<string, unknown>;
      },
    }
  );

  assert.equal(calls.notification?.userId, "user-2");
  assert.equal(calls.telegram?.chatId, "777");
  assert.equal(
    calls.telegram?.inviteUrl,
    "https://t.me/wesetup_bot?start=inv_token_777"
  );
});

test("issueStaffTelegramInvite rejects archived employees", async () => {
  await assert.rejects(
    () =>
      issueStaffTelegramInvite(
        {
          employeeId: "archived-user",
          organizationId: "org-1",
          mode: "invite",
          botUsername: "wesetup_bot",
        },
        {
          findEmployeeById: async () => ({
            id: "archived-user",
            name: "Архивный",
            organizationId: "org-1",
            archivedAt: new Date("2026-04-01T00:00:00.000Z"),
            telegramChatId: null,
          }),
          replaceInviteToken: async () => {
            throw new Error("should not be called");
          },
          makeQrDataUrl: async () => {
            throw new Error("should not be called");
          },
          upsertSiteNotification: async () => {
            throw new Error("should not be called");
          },
          sendTelegramDeepLinkMessage: async () => {
            throw new Error("should not be called");
          },
        }
      ),
    (error) => {
      assert.ok(error instanceof StaffTelegramInviteError);
      assert.equal(error.status, 409);
      return true;
    }
  );
});
