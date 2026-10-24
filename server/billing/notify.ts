import { logger } from "../logger";
import { publishToCompany } from "../live-events";
import { sendNoticeMail } from "../mailer";
import { sendOwnerAlert } from "../owner-alert";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { sendInBackground } from "../push";
import { storage } from "../storage";
import { escapeHtml } from "../telegram/util";
import type { BillingNotice, BillingNotifier } from "./service";

/**
 * Уведомления об оплате: админам компании — push, Telegram (если бот
 * привязан) и письмо (если есть почта); владельцу — Telegram-алерт.
 * Всё best-effort: деньги уже получены, упавшая почта ничего не ломает.
 */
export const billingNotifier: BillingNotifier = {
  async admins(companyId: number, notice: BillingNotice, extraEmails: Array<string | null> = []) {
    const url = `${getPublicTasksflowBaseUrl()}/admin/billing`;
    const admins = (await storage.getAllUsers(companyId)).filter((u) => u.isAdmin);
    if (admins.length) sendInBackground(admins.map((u) => u.id), { title: notice.title, body: notice.body, url: "/admin/billing", tag: "billing" });

    const { getTelegramRuntime } = await import("../telegram");
    const runtime = getTelegramRuntime();
    if (runtime) {
      const html = `<b>${escapeHtml(notice.title)}</b>\n${notice.paragraphs.map(escapeHtml).join("\n\n")}`;
      for (const admin of admins) {
        if (!admin.tgChatId) continue;
        await runtime.client
          .sendMessage({
            chat_id: admin.tgChatId,
            parse_mode: "HTML",
            text: html,
            reply_markup: { inline_keyboard: [[{ text: "Тариф и оплата", url }]] },
          })
          .catch((err: unknown) => logger.warn({ err, userId: admin.id }, "[billing] Telegram не доставлен"));
      }
    }

    const emails = new Set(
      [...admins.map((u) => u.email), ...extraEmails].filter((e): e is string => !!e).map((e) => e.trim().toLowerCase()),
    );
    for (const to of Array.from(emails)) {
      await sendNoticeMail(to, {
        subject: `TasksFlow: ${notice.title.toLowerCase()}`,
        heading: notice.title,
        paragraphs: notice.paragraphs,
        button: { url, label: "Тариф и оплата →" },
      }).catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[billing] письмо не отправлено"));
    }
  },
  owner: sendOwnerAlert,
  live(companyId: number) {
    publishToCompany(companyId, { type: "billing" });
  },
};
