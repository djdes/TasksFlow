import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDisabledJournalCodes } from "@/lib/disabled-journals";
import {
  getManagerObligationSummary,
  listOpenJournalObligationsForUser,
  syncDailyJournalObligationsForOrganization,
  syncDailyJournalObligationsForUser,
} from "@/lib/journal-obligations";
import {
  aclActorFromSession,
  getAllowedJournalCodes,
} from "@/lib/journal-acl";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { getServerSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const requestNow = new Date();

  const actor = aclActorFromSession({
    user: {
      id: session.user.id,
      role: session.user.role,
      isRoot: session.user.isRoot === true,
    },
  });
  const [allowedCodes, disabledCodes] = await Promise.all([
    getAllowedJournalCodes(actor),
    getDisabledJournalCodes(session.user.organizationId),
  ]);
  const fullAccess = hasFullWorkspaceAccess({
    role: session.user.role,
    isRoot: session.user.isRoot === true,
  });

  const rawTemplates = await db.journalTemplate.findMany({
    where:
      allowedCodes === null
        ? { isActive: true }
        : { isActive: true, code: { in: allowedCodes } },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
    },
    orderBy: { name: "asc" },
  });

  const templates = rawTemplates.filter((template) => !disabledCodes.has(template.code));
  const user = {
    name: session.user.name ?? "",
    organizationName: session.user.organizationName ?? "",
  };

  if (fullAccess) {
    await syncDailyJournalObligationsForOrganization(
      session.user.organizationId,
      requestNow
    );
    const summary = await getManagerObligationSummary(
      session.user.organizationId,
      requestNow
    );

    return NextResponse.json({
      user,
      mode: "manager",
      summary,
      all: templates.map((template) => ({
        code: template.code,
        name: template.name,
        description: template.description,
        filled: false,
      })),
    });
  }

  await syncDailyJournalObligationsForUser({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    now: requestNow,
  });
  const now = await listOpenJournalObligationsForUser(
    session.user.id,
    requestNow
  );
  const openJournalCodes = new Set(now.map((row) => row.journalCode));

  return NextResponse.json({
    user,
    mode: "staff",
    now: now.map((row) => ({
      id: row.id,
      code: row.journalCode,
      name: row.template.name,
      description: row.template.description,
      href: `/mini/o/${row.id}`,
    })),
    all: templates.map((template) => ({
      code: template.code,
      name: template.name,
      description: template.description,
      filled: !openJournalCodes.has(template.code),
    })),
  });
}
