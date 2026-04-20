import { JournalsBrowser } from "@/components/journals/journals-browser";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { aclActorFromSession, getAllowedJournalCodes } from "@/lib/journal-acl";
import { getTemplatesFilledToday } from "@/lib/today-compliance";
import { parseDisabledCodes } from "@/lib/disabled-journals";

export default async function JournalsPage() {
  const session = await requireAuth();

  const allowedCodes = await getAllowedJournalCodes(
    aclActorFromSession(session)
  );

  const [templates, organization] = await Promise.all([
    db.journalTemplate.findMany({
      where: {
        isActive: true,
        ...(allowedCodes ? { code: { in: allowedCodes } } : {}),
      },
      orderBy: { sortOrder: "asc" },
    }),
    db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { disabledJournalCodes: true },
    }),
  ]);

  const disabledCodes = parseDisabledCodes(organization?.disabledJournalCodes);

  const filledTodayIds = await getTemplatesFilledToday(
    session.user.organizationId,
    new Date(),
    templates.map((t) => ({ id: t.id, code: t.code })),
    disabledCodes
  );

  const items = templates.map((template) => ({
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description,
    isMandatorySanpin: template.isMandatorySanpin,
    isMandatoryHaccp: template.isMandatoryHaccp,
    filledToday: filledTodayIds.has(template.id),
    disabled: disabledCodes.has(template.code),
  }));

  return <JournalsBrowser templates={items} />;
}
