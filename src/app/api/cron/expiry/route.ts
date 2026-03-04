import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyOrganization } from "@/lib/telegram";
import { sendComplianceReminderEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find products expiring within the next 3 days
    // Look at incoming_control journal entries with expiryDate field
    const template = await db.journalTemplate.findUnique({
      where: { code: "incoming_control" },
    });

    if (!template) {
      return NextResponse.json({ message: "No incoming_control template", alerts: 0 });
    }

    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Find entries with expiryDate approaching
    const entries = await db.journalEntry.findMany({
      where: {
        templateId: template.id,
        createdAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) }, // last 90 days
      },
      include: {
        organization: { select: { id: true, name: true } },
        filledBy: { select: { name: true } },
      },
    });

    const alerts: Array<{ org: string; product: string; expiryDate: string }> = [];

    // Group by organization
    const byOrg = new Map<string, Array<{ product: string; expiryDate: string }>>();

    for (const entry of entries) {
      const data = entry.data as Record<string, unknown>;
      const expiryStr = data.expiryDate as string | undefined;
      if (!expiryStr) continue;

      const expiryDate = new Date(expiryStr);
      if (isNaN(expiryDate.getTime())) continue;

      // Check if expiry is within next 3 days or already expired
      if (expiryDate <= threeDaysLater) {
        const productName = (data.productName as string) || "Без названия";
        const orgId = entry.organizationId;

        if (!byOrg.has(orgId)) byOrg.set(orgId, []);
        byOrg.get(orgId)!.push({ product: productName, expiryDate: expiryStr });

        alerts.push({ org: orgId, product: productName, expiryDate: expiryStr });
      }
    }

    // Send notifications per org
    for (const [orgId, products] of byOrg) {
      const list = products
        .map((p) => `- ${p.product} (срок: ${new Date(p.expiryDate).toLocaleDateString("ru-RU")})`)
        .join("\n");

      const message =
        `<b>Внимание: истекающие сроки годности!</b>\n\n` +
        `${list}\n\n` +
        `Проверьте наличие и примите решение о списании.`;

      notifyOrganization(orgId, message, ["owner", "technologist"], "expiry").catch(
        (err) => console.error("Telegram expiry alert error:", err)
      );

      // Email
      const users = await db.user.findMany({
        where: {
          organizationId: orgId,
          role: { in: ["owner", "technologist"] },
          isActive: true,
        },
        select: { email: true },
      });

      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      for (const user of users) {
        sendComplianceReminderEmail({
          to: user.email,
          missingJournals: products.map((p) => `${p.product} — срок до ${new Date(p.expiryDate).toLocaleDateString("ru-RU")}`),
          organizationName: org?.name || "",
        }).catch((err) => console.error("Email expiry alert error:", err));
      }
    }

    return NextResponse.json({
      alerts: alerts.length,
      organizations: byOrg.size,
    });
  } catch (error) {
    console.error("Expiry cron error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
