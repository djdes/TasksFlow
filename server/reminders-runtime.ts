import { sql } from "drizzle-orm";
import { companies } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import type { ReminderSender, ReminderStore } from "./services/reminders";
import type { TelegramRuntime } from "./telegram";
import { renderTasksView, sendTaskListMessage } from "./telegram/my-tasks";

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
};

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

