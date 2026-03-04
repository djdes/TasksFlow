import { Bot } from "grammy";

// Initialize bot (only if token is set)
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = token ? new Bot(token) : null;

// Send a message to a specific chat
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  if (!bot) return; // silently skip if no bot configured
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Telegram send error:", error);
  }
}

// Send notification to all owners/technologists of an organization
export async function notifyOrganization(
  organizationId: string,
  message: string,
  roles: string[] = ["owner", "technologist"]
): Promise<void> {
  // Import db here to avoid circular deps
  const { db } = await import("./db");

  const users = await db.user.findMany({
    where: {
      organizationId,
      role: { in: roles },
      telegramChatId: { not: null },
      isActive: true,
    },
    select: { telegramChatId: true },
  });

  await Promise.allSettled(
    users.map((u) => sendTelegramMessage(u.telegramChatId!, message))
  );
}

// Generate a unique link token for Telegram account linking
export function generateLinkToken(userId: string): string {
  // Simple token: base64 of userId + timestamp
  return Buffer.from(`${userId}:${Date.now()}`).toString("base64url");
}

// Parse link token
export function parseLinkToken(
  token: string
): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [userId] = decoded.split(":");
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}
