import { JournalsBrowser } from "@/components/journals/journals-browser";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getJournalTariff, getJournalTariffSortOrder } from "@/lib/journal-tariffs";

export default async function JournalsPage() {
  const session = await getServerSession(authOptions);

  const [templates, organization] = await Promise.all([
    db.journalTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    session?.user.organizationId
      ? db.organization.findUnique({
          where: { id: session.user.organizationId },
          select: { subscriptionPlan: true },
        })
      : Promise.resolve(null),
  ]);

  const annotated = templates
    .map((template) => ({
      id: template.id,
      code: template.code,
      name: template.name,
      description: template.description,
      isMandatorySanpin: template.isMandatorySanpin,
      isMandatoryHaccp: template.isMandatoryHaccp,
      tariff: getJournalTariff(template.code),
      tariffOrder: getJournalTariffSortOrder(template.code),
    }))
    .sort((a, b) => a.tariffOrder - b.tariffOrder);

  return (
    <JournalsBrowser
      templates={annotated}
      subscriptionPlan={organization?.subscriptionPlan ?? "trial"}
    />
  );
}
