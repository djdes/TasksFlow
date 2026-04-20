import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import {
  TasksFlowError,
  tasksflowClientFor,
} from "@/lib/tasksflow-client";
import { syncTasksflowUsers } from "@/lib/tasksflow-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refresh the WeSetup ↔ TasksFlow user mapping for the active org.
 *
 * Algorithm:
 *   1. Pull every WeSetup user in the org (we need phone).
 *   2. Pull every TasksFlow user via the bound key.
 *   3. Match by normalized phone — first hit wins on the TasksFlow side.
 *   4. Upsert `TasksFlowUserLink` per WeSetup user. Existing rows with
 *      `source = "manual"` are left alone (the admin pinned them on
 *      purpose, e.g. when phones differ).
 *
 * Returns counts so the UI can show "Связано 7 из 12 сотрудников".
 */
export async function POST() {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const orgId = getActiveOrgId(session);
  const integration = await db.tasksFlowIntegration.findUnique({
    where: { organizationId: orgId },
    select: { id: true, baseUrl: true, apiKeyEncrypted: true, enabled: true },
  });
  if (!integration || !integration.enabled) {
    return NextResponse.json(
      { error: "Интеграция не подключена" },
      { status: 400 }
    );
  }

  const wesetupUsers = await db.user.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, name: true, phone: true, role: true },
  });

  let remoteUsers;
  try {
    remoteUsers = await tasksflowClientFor(integration).listUsers();
  } catch (err) {
    if (err instanceof TasksFlowError) {
      return NextResponse.json(
        { error: `TasksFlow ошибка: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Не удалось получить список пользователей TasksFlow" },
      { status: 502 }
    );
  }

  const existingLinks = await db.tasksFlowUserLink.findMany({
    where: { integrationId: integration.id },
    select: { id: true, wesetupUserId: true, source: true },
  });

  const client = tasksflowClientFor(integration);
  let result;
  try {
    result = await syncTasksflowUsers({
      integrationId: integration.id,
      wesetupUsers,
      existingLinks,
      remoteUsers,
      createRemoteUser: async ({ name, phone }) =>
        client.createUser({
          phone,
          ...(name ? { name } : {}),
        }),
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
            integrationId_wesetupUserId: {
              integrationId,
              wesetupUserId,
            },
          },
          create: {
            integrationId,
            wesetupUserId,
            phone,
            tasksflowUserId,
            tasksflowWorkerId,
            source,
          },
          update: {
            phone,
            tasksflowUserId,
            tasksflowWorkerId,
            source,
          },
        });
      },
    });
  } catch (err) {
    if (err instanceof TasksFlowError) {
      return NextResponse.json(
        { error: `TasksFlow ошибка: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Не удалось синхронизировать сотрудников с TasksFlow" },
      { status: 502 }
    );
  }

  await db.tasksFlowIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json(result);
}
