import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyOrganization, escapeTelegramHtml as esc } from "@/lib/telegram";
import { sendComplianceReminderEmail } from "@/lib/email";
import { getDbRoleValuesWithLegacy, MANAGEMENT_ROLES } from "@/lib/user-roles";
import { getTemplatesFilledToday } from "@/lib/today-compliance";
import { parseDisabledCodes } from "@/lib/disabled-journals";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!CRON_SECRET || searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all organizations (with their disabled-journal toggle).
    const organizations = await db.organization.findMany({
      select: { id: true, name: true, disabledJournalCodes: true },
    });

    // Get all mandatory journal templates
    const mandatoryTemplates = await db.journalTemplate.findMany({
      where: {
        isActive: true,
        OR: [
          { isMandatorySanpin: true },
          { isMandatoryHaccp: true },
        ],
      },
      select: { id: true, name: true, code: true },
    });

    const results: { org: string; missing: string[] }[] = [];

    for (const org of organizations) {
      const disabledCodes = parseDisabledCodes(org.disabledJournalCodes);

      // Use the same compliance helper the dashboard uses. Aperiodic
      // journals are already treated as filled by default, disabled
      // ones are added to the «filled» set, so what's left in
      // `missingTemplates` is «daily + enabled + not filled today» —
      // exactly what a reminder should cover.
      const filledTemplateIds = await getTemplatesFilledToday(
        org.id,
        new Date(),
        mandatoryTemplates.map((t) => ({ id: t.id, code: t.code })),
        disabledCodes
      );

      const missingTemplates = mandatoryTemplates.filter(
        (t) => !filledTemplateIds.has(t.id) && !disabledCodes.has(t.code)
      );

      if (missingTemplates.length === 0) continue;

      const missingNames = missingTemplates.map((t) => t.name);

      results.push({ org: org.name, missing: missingNames });

      // Telegram alert
      const telegramMsg =
        `<b>Незаполненные журналы за сегодня</b>\n\n` +
        missingNames.map((n) => `• ${esc(n)}`).join("\n") +
        `\n\nВсего не заполнено: ${missingNames.length} из ${mandatoryTemplates.length}`;

      notifyOrganization(org.id, telegramMsg, ["owner", "technologist"], "compliance").catch((err) =>
        console.error(`Compliance telegram error (${org.name}):`, err)
      );

      // Email to owners/technologists
      const users = await db.user.findMany({
        where: {
          organizationId: org.id,
          role: { in: getDbRoleValuesWithLegacy(MANAGEMENT_ROLES) },
          isActive: true,
        },
        select: { email: true },
      });

      for (const user of users) {
        sendComplianceReminderEmail({
          to: user.email,
          missingJournals: missingNames,
          organizationName: org.name,
        }).catch((err) =>
          console.error(`Compliance email error:`, err)
        );
      }
    }

    return NextResponse.json({
      ok: true,
      checked: organizations.length,
      withMissing: results.length,
      details: results,
    });
  } catch (error) {
    console.error("Compliance cron error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
