import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyEmployee } from "@/lib/telegram";
import { getDbRoleValuesWithLegacy, type UserRole } from "@/lib/user-roles";

/**
 * Mini App morning digest cron.
 *
 * Runs once per day (externally scheduled — see ops docs). Sends each
 * bound line worker a Telegram DM listing today's journals that they
 * still need to fill, with a Web App button to open the Mini App
 * directly at the journal entry form.
 *
 * Scope filter: role in { cook, waiter, operator } — i.e. line-worker
 * roles. Managers already get `notifyOrganization` alerts and don't
 * need a digest. Users without `telegramChatId` are skipped silently.
 *
 * Authentication: `?secret=<CRON_SECRET>` query param. Exactly the
 * same shape as the existing `/api/cron/compliance` endpoint so one
 * cron configuration slot covers both.
 */
const CRON_SECRET = process.env.CRON_SECRET || "";

// "operator" is a legacy DB role value that pre-dates the canonical set.
// Use the canonical UserRole tuple for type safety; getDbRoleValuesWithLegacy
// expands each to include its pre-migration aliases (e.g. cook → cook+operator).
const LINE_ROLES: readonly UserRole[] = ["cook", "waiter"] as const;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!CRON_SECRET || searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const miniBase =
    process.env.MINI_APP_BASE_URL ||
    (process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL.replace(/\/+$/, "")}/mini`
      : "https://wesetup.ru/mini");

  const workers = await db.user.findMany({
    where: {
      role: { in: getDbRoleValuesWithLegacy(LINE_ROLES) },
      isActive: true,
      archivedAt: null,
      telegramChatId: { not: null },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  });

  const results: Array<{ userId: string; notified: boolean; pending: number }> =
    [];

  for (const worker of workers) {
    const [templates, org] = await Promise.all([
      db.journalTemplate.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
      }),
      db.organization.findUnique({
        where: { id: worker.organizationId },
        select: { disabledJournalCodes: true },
      }),
    ]);

    const disabledCodes = Array.isArray(org?.disabledJournalCodes)
      ? new Set(org?.disabledJournalCodes as string[])
      : new Set<string>();

    const todaysEntries = await db.journalEntry.findMany({
      where: {
        filledById: worker.id,
        createdAt: { gte: startOfDay },
      },
      select: { templateId: true },
    });
    const filled = new Set(todaysEntries.map((e) => e.templateId));
    const pending = templates.filter(
      (t) => !filled.has(t.id) && !disabledCodes.has(t.code)
    );

    if (pending.length === 0) {
      results.push({ userId: worker.id, notified: false, pending: 0 });
      continue;
    }

    const listed = pending.slice(0, 5).map((t) => `• ${t.name}`).join("\n");
    const tail = pending.length > 5 ? `\n…и ещё ${pending.length - 5}` : "";
    const body =
      `<b>Доброе утро, ${worker.name}!</b>\n\n` +
      `Сегодня нужно заполнить:\n${listed}${tail}\n\n` +
      `Откройте кабинет кнопкой ниже.`;

    try {
      await notifyEmployee(worker.id, body, {
        label: "Открыть кабинет",
        miniAppUrl: miniBase,
      });
      results.push({ userId: worker.id, notified: true, pending: pending.length });
    } catch (err) {
      console.error("[cron/mini-digest] notifyEmployee failed", {
        userId: worker.id,
        err,
      });
      results.push({ userId: worker.id, notified: false, pending: pending.length });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: workers.length,
    notified: results.filter((r) => r.notified).length,
  });
}
