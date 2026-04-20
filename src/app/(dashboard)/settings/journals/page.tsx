import { redirect } from "next/navigation";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { parseDisabledCodes } from "@/lib/disabled-journals";
import { JournalsSettingsClient } from "./journals-settings-client";

export const dynamic = "force-dynamic";

export default async function JournalsSettingsPage() {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) redirect("/dashboard");
  const organizationId = getActiveOrgId(session);

  const [templates, organization] = await Promise.all([
    db.journalTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isMandatorySanpin: true,
        isMandatoryHaccp: true,
      },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { disabledJournalCodes: true },
    }),
  ]);

  const disabled = parseDisabledCodes(organization?.disabledJournalCodes);

  const items = templates.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    isMandatorySanpin: t.isMandatorySanpin,
    isMandatoryHaccp: t.isMandatoryHaccp,
    enabled: !disabled.has(t.code),
  }));

  return <JournalsSettingsClient items={items} />;
}
