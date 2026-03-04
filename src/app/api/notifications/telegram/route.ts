import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLinkToken, sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const update = await request.json();

    // We only handle messages
    const message = update?.message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text: string = message.text;

    // Handle /start command
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const token = parts[1]; // /start {token}

      if (!token) {
        await sendTelegramMessage(
          chatId,
          "Для привязки аккаунта используйте ссылку из настроек HACCP-Online."
        );
        return NextResponse.json({ ok: true });
      }

      // Parse the link token
      const parsed = parseLinkToken(token);
      if (!parsed) {
        await sendTelegramMessage(
          chatId,
          "Неверная ссылка привязки. Попробуйте получить новую ссылку в настройках HACCP-Online."
        );
        return NextResponse.json({ ok: true });
      }

      // Update user's telegramChatId
      const user = await db.user.findUnique({
        where: { id: parsed.userId },
      });

      if (!user) {
        await sendTelegramMessage(
          chatId,
          "Пользователь не найден. Проверьте ссылку привязки."
        );
        return NextResponse.json({ ok: true });
      }

      await db.user.update({
        where: { id: parsed.userId },
        data: { telegramChatId: chatId },
      });

      await sendTelegramMessage(
        chatId,
        "Аккаунт успешно привязан! Вы будете получать уведомления."
      );

      return NextResponse.json({ ok: true });
    }

    // For any other message, send a help message
    await sendTelegramMessage(
      chatId,
      "Этот бот отправляет уведомления из HACCP-Online. Для привязки аккаунта используйте ссылку из настроек."
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
