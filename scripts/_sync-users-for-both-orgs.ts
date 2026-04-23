import { db } from "@/lib/db";
import { tasksflowClientFor } from "@/lib/tasksflow-client";
import { syncTasksflowUsers } from "@/lib/tasksflow-user-sync";

const ORG_IDS = ["demo-screenshots", "cmmbrt40y0000rotsr41p4xh6"];

async function main() {
  for (const orgId of ORG_IDS) {
    const integration = await db.tasksFlowIntegration.findUnique({
      where: { organizationId: orgId },
    });
    if (!integration || !integration.enabled) {
      console.log(`${orgId}: нет включённой интеграции, пропускаем`);
      continue;
    }
    const wesetupUsers = await db.user.findMany({
      where: { organizationId: orgId, isActive: true, archivedAt: null },
      select: { id: true, name: true, phone: true, role: true },
    });
    const remoteUsers = await tasksflowClientFor(integration).listUsers();
    const existingLinks = await db.tasksFlowUserLink.findMany({
      where: { integrationId: integration.id },
      select: { id: true, wesetupUserId: true, source: true },
    });
    const client = tasksflowClientFor(integration);
    const result = await syncTasksflowUsers({
      integrationId: integration.id,
      wesetupUsers,
      existingLinks,
      remoteUsers,
      createRemoteUser: async ({ name, phone }) =>
        client.createUser({ phone, ...(name ? { name } : {}) }),
      upsertLink: async ({
        integrationId,
        wesetupUserId,
        phone,
        tasksflowUserId,
        tasksflowWorkerId,
        source,
      }) => {
        await db.tasksFlowUserLink.upsert({
          where: {
            integrationId_wesetupUserId: { integrationId, wesetupUserId },
          },
          create: {
            integrationId,
            wesetupUserId,
            phone,
            tasksflowUserId,
            tasksflowWorkerId,
            source,
          },
          update: { phone, tasksflowUserId, tasksflowWorkerId, source },
        });
      },
    });
    console.log(`${orgId}:`, result.totals);
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
