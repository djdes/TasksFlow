import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLinkToken, sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (headerSecret !== webhookSecret) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
    }

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

    // Handle /stop command — unlink Telegram
    if (text === "/stop" || text.startsWith("/stop ")) {
      const user = await db.user.findFirst({
        where: { telegramChatId: chatId },
      });

      if (!user) {
        await sendTelegramMessage(
          chatId,
          "Ваш аккаунт не привязан к HACCP-Online."
        );
        return NextResponse.json({ ok: true });
      }

      await db.user.update({
        where: { id: user.id },
        data: { telegramChatId: null },
      });

      await sendTelegramMessage(
        chatId,
        "Аккаунт отвязан. Вы больше не будете получать уведомления.\nДля повторной привязки используйте ссылку из настроек HACCP-Online."
      );

      return NextResponse.json({ ok: true });
    }

    // For any other message, send a help message
    await sendTelegramMessage(
      chatId,
      "Этот бот отправляет уведомления из HACCP-Online.\n\nКоманды:\n/stop — отвязать аккаунт\n\nДля привязки аккаунта используйте ссылку из настроек."
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
