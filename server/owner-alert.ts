import { logger } from "./logger";

/**
 * Сообщение владельцу сервиса в Telegram: ошибки в браузере, оплаты,
 * сбои автопродления. Нужны ALERT_TELEGRAM_BOT_TOKEN и
 * ALERT_TELEGRAM_CHAT_ID; без них — тихо ничего. Никогда не бросает.
 */
export function ownerAlertsEnabled(): boolean {
  return Boolean(process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim() && process.env.ALERT_TELEGRAM_CHAT_ID?.trim());
}

export async function sendOwnerAlert(text: string): Promise<void> {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;
  const base = (process.env.TELEGRAM_API_BASE_URL?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
  try {
    await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    logger.debug({ err }, "[owner-alert] Telegram недоступен");
  }
}
