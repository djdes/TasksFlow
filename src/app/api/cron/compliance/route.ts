import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyOrganization } from "@/lib/telegram";
import { sendComplianceReminderEmail } from "@/lib/email";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!CRON_SECRET || searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all organizations
    const organizations = await db.organization.findMany({
      select: { id: true, name: true },
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: { org: string; missing: string[] }[] = [];

    for (const org of organizations) {
      // Get today's entries for this org
      const todayEntries = await db.journalEntry.findMany({
        where: {
          organizationId: org.id,
          createdAt: { gte: today },
        },
        select: { templateId: true },
      });

      const filledTemplateIds = new Set(todayEntries.map((e) => e.templateId));

      // Find mandatory templates not filled today
      const missingTemplates = mandatoryTemplates.filter(
        (t) => !filledTemplateIds.has(t.id)
      );

      if (missingTemplates.length === 0) continue;

      const missingNames = missingTemplates.map((t) => t.name);

      results.push({ org: org.name, missing: missingNames });

      // Telegram alert
      const telegramMsg =
        `<b>Незаполненные журналы за сегодня</b>\n\n` +
        missingNames.map((n) => `• ${n}`).join("\n") +
        `\n\nВсего не заполнено: ${missingNames.length} из ${mandatoryTemplates.length}`;

      notifyOrganization(org.id, telegramMsg).catch((err) =>
        console.error(`Compliance telegram error (${org.name}):`, err)
      );

      // Email to owners/technologists
      const users = await db.user.findMany({
        where: {
          organizationId: org.id,
          role: { in: ["owner", "technologist"] },
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
