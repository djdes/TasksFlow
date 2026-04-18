import type { Composer, Context } from "grammy";
import {
  hashBotInviteToken,
  stripBotInvitePrefix,
} from "@/lib/bot-invite-tokens";
import {
  buildTelegramLinkedStartReply,
  buildTelegramUnlinkedStartReply,
  type TelegramStartActor,
} from "@/lib/bot/start-response";
import { db } from "@/lib/db";

function getMiniAppBaseUrl(): string | null {
  return (
    process.env.MINI_APP_BASE_URL ||
    (process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL.replace(/\/+$/, "")}/mini`
      : null)
  );
}

async function replyWithLinkedStart(
  ctx: Context,
  actor: TelegramStartActor
): Promise<void> {
  const reply = buildTelegramLinkedStartReply(actor, getMiniAppBaseUrl());
  await ctx.reply(
    reply.text,
    reply.buttonLabel && reply.buttonUrl
      ? {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: reply.buttonLabel,
                  web_app: { url: reply.buttonUrl },
                },
              ],
            ],
          },
        }
      : undefined
  );
}

/**
 * Handle `/start <payload>` messages.
 *
 * The only payload shape Stage 1 recognises is `inv_<raw>`: a TG-first
 * invite. When a match is found we bind the caller's TG user id to the
 * pending `User`, flip `isActive`, mark the token consumed, then reply
 * with a Mini App Web App button.
 *
 * Every branch that results in a DM reply MUST use plain text (no HTML /
 * Markdown) to avoid accidental entity escaping issues. The bot never
 * echoes the raw token back.
 */
export function registerStartHandler(composer: Composer<Context>): void {
  composer.command("start", async (ctx) => {
    const payload = ctx.match?.trim();
    if (!payload) {
      const fromId = ctx.from?.id;
      if (!fromId) {
        await ctx.reply("Не удалось определить ваш Telegram-аккаунт.");
        return;
      }

      const linkedUser = await db.user.findFirst({
        where: {
          telegramChatId: String(fromId),
          isActive: true,
          archivedAt: null,
        },
        select: {
          name: true,
          role: true,
          isRoot: true,
        },
      });

      if (!linkedUser) {
        await ctx.reply(buildTelegramUnlinkedStartReply().text);
        return;
      }

      await replyWithLinkedStart(ctx, linkedUser);
      return;
    }

    if (!stripBotInvitePrefix(payload)) {
      await ctx.reply(
        "Ссылка-приглашение некорректна. Попросите руководителя создать новую."
      );
      return;
    }

    const tokenHash = hashBotInviteToken(payload);
    const fromId = ctx.from?.id;
    if (!fromId) {
      await ctx.reply("Не удалось определить ваш Telegram-аккаунт.");
      return;
    }

    const token = await db.botInviteToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token) {
      await ctx.reply(
        "Приглашение не найдено или уже использовано. Попросите новую ссылку."
      );
      return;
    }
    if (token.consumedAt) {
      await ctx.reply("Это приглашение уже использовано.");
      return;
    }
    if (token.expiresAt.getTime() < Date.now()) {
      await ctx.reply("Срок действия приглашения истек. Попросите новую ссылку.");
      return;
    }

    const chatIdStr = String(fromId);

    // Forbid reusing a TG account that's already tied to a different user:
    // otherwise two physical employees could share one Telegram, and our
    // `User.telegramChatId` lookup would silently route Mini App sessions
    // to whichever row is found first.
    const collision = await db.user.findFirst({
      where: {
        telegramChatId: chatIdStr,
        id: { not: token.userId },
      },
      select: { id: true },
    });
    if (collision) {
      await ctx.reply(
        "Этот Telegram уже привязан к другому сотруднику. Используйте другой аккаунт."
      );
      return;
    }

    await db.$transaction([
      db.user.update({
        where: { id: token.userId },
        data: {
          telegramChatId: chatIdStr,
          isActive: true,
        },
      }),
      db.botInviteToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    await replyWithLinkedStart(ctx, {
      name: token.user.name,
      role: token.user.role,
      isRoot: token.user.isRoot,
    });
  });
}
