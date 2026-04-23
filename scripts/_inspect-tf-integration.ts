import { db } from "@/lib/db";

async function main() {
  const integrations = await db.tasksFlowIntegration.findMany({
    select: {
      id: true,
      organizationId: true,
      baseUrl: true,
      apiKeyPrefix: true,
      enabled: true,
    },
  });
  console.log(`Integrations: ${integrations.length}`);
  for (const i of integrations) {
    const org = await db.organization.findUnique({
      where: { id: i.organizationId },
      select: { name: true },
    });
    console.log(
      `  - org="${org?.name ?? i.organizationId}"  baseUrl=${i.baseUrl}  prefix=${i.apiKeyPrefix}  enabled=${i.enabled}`
    );
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
