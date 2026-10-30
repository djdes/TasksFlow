import { sql } from "drizzle-orm";
import { companies } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import type { ReminderSender, ReminderStore } from "./services/reminders";
import type { TelegramRuntime } from "./telegram";
import { renderTasksView, sendTaskListMessage } from "./telegram/my-tasks";
import type { PushMessage } from "@shared/push";
import { sendToUsers } from "./push";
import { pushStore } from "./push/store";

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header
    ? Number((header as { affectedRows: number }).affectedRows)
    : 0;
}

export const reminderStore: ReminderStore = {
  async listCompanies() {
    return db
      .select({
        id: companies.id,
        timezone: companies.timezone,
        notifySettings: companies.notifySettings,
        notifyState: companies.notifyState,
      })
      .from(companies);
  },
  async claimNotify(companyId, prev, next) {
    // <=> — сравнение с учётом NULL (первое напоминание у компании).
    const result = await db
      .update(companies)
      .set({ notifyState: next })
      .where(sql`${companies.id} = ${companyId} AND ${companies.notifyState} <=> ${prev}`);
    return affected(result) === 1;
  },
  getUsers: (companyId) => storage.getAllUsers(companyId),
  getTasks: (companyId) => storage.getTasks(companyId),
  getRoles: (companyId) => storage.listCompanyRoles(companyId),
  listTaskReminders: () => storage.getTasksWithReminders(),
  claimTaskReminder: (taskId, day) => storage.claimTaskReminder(taskId, day),
};

/** Telegram (если бот запущен) и push (если включён) — одной рассылкой. */
export function reminderSender(runtime: TelegramRuntime | null, pushOn: boolean): ReminderSender {
  return {
    ...(runtime ? telegramSender(runtime) : {}),
    ...(pushOn
      ? {
          async pushRecipients(userIds: number[]) {
            const subs = await pushStore.listForUsers(userIds);
            return new Set(subs.map((s) => s.userId));
          },
          async push(userId: number, message: PushMessage) {
            return (await sendToUsers([userId], message)).sent > 0;
          },
        }
      : {}),
  };
}

export function telegramSender(runtime: TelegramRuntime): ReminderSender {
  return {
    sendTaskList: (chatId, tasks, header) => sendTaskListMessage(runtime, chatId, renderTasksView(tasks, header)),
    async sendText(chatId, html, button) {
      await runtime.client.sendMessage({
        chat_id: chatId,
        parse_mode: "HTML",
        text: html,
        reply_markup: button ? { inline_keyboard: [[{ text: button.text, url: button.url }]] } : undefined,
      });
    },
  };
}

