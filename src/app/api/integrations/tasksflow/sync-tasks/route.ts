import { NextResponse } from "next/server";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { pullCompletionsForOrganization } from "@/lib/tasksflow-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual / scheduled poll: ask TasksFlow for the current state of every
 * remote task we created on behalf of this org, and mirror new
 * completions back into the journal matrix.
 *
 * Used as a fallback while TasksFlow doesn't yet ship outbound
 * webhooks. The cleaning document UI calls this on mount so the user
 * sees today's marks immediately on open without waiting for cron.
 */
export async function POST() {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const orgId = getActiveOrgId(session);
  const summary = await pullCompletionsForOrganization({
    organizationId: orgId,
  });
  return NextResponse.json(summary);
}
