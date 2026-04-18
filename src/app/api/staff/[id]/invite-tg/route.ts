import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { getServerSession } from "@/lib/server-session";
import {
  botInviteExpiresAt,
  buildBotInviteUrl,
  generateBotInviteRaw,
  hashBotInviteToken,
} from "@/lib/bot-invite-tokens";
import { isManagerRole } from "@/lib/user-roles";

/**
 * POST /api/staff/[id]/invite-tg
 *
 * Issue (or re-issue) a Telegram Mini App invite for an existing staff
 * member. The caller must manage the same org as the target user.
 *
 * Unlike POST /api/users/invite/tg (which creates the User on the fly),
 * this route works on users that already exist in the /settings/users
 * page ("Сотрудники" in UI). Reissuing replaces the previous unconsumed
 * token — only one active invite per user at a time, matching the
 * `userId @unique` constraint on BotInviteToken.
 *
 * If the user already has `telegramChatId`, we still allow issuing a new
 * invite so a different Telegram account can be bound later. The grammy
 * /start handler enforces single-binding at consume time.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!process.env.TELEGRAM_BOT_USERNAME) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME не настроен на сервере" },
      { status: 500 }
    );
  }

  const orgId = getActiveOrgId(session);
  const target = await db.user.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }
  if (target.archivedAt) {
    return NextResponse.json(
      { error: "Нельзя пригласить архивного сотрудника" },
      { status: 409 }
    );
  }

  const raw = generateBotInviteRaw();
  const tokenHash = hashBotInviteToken(raw);
  const expiresAt = botInviteExpiresAt();

  await db.$transaction(async (tx) => {
    await tx.botInviteToken.deleteMany({ where: { userId: target.id } });
    await tx.botInviteToken.create({
      data: {
        userId: target.id,
        organizationId: orgId,
        tokenHash,
        expiresAt,
      },
    });
  });

  const inviteUrl = buildBotInviteUrl(raw);
  const qrPngDataUrl = await QRCode.toDataURL(inviteUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  return NextResponse.json({
    inviteUrl,
    qrPngDataUrl,
    expiresAt: expiresAt.toISOString(),
    user: { id: target.id, name: target.name },
  });
}
