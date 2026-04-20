import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { setDisabledJournalCodes } from "@/lib/disabled-journals";
import { hasFullWorkspaceAccess } from "@/lib/role-access";

/**
 * PATCH /api/settings/journals
 *
 * Body: { disabledCodes: string[] }
 *
 * Management-only. Replaces the org's disabled journal list with the
 * given one. The UI sends the full set each save — no partial patches —
 * so concurrent toggles don't silently overwrite each other with stale
 * mutations.
 */
export async function PATCH(request: Request) {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.disabledCodes)) {
    return NextResponse.json(
      { error: "disabledCodes обязателен" },
      { status: 400 }
    );
  }

  const codes: string[] = [];
  for (const code of body.disabledCodes) {
    if (typeof code === "string" && code.length > 0) codes.push(code);
  }

  const stored = await setDisabledJournalCodes(
    session.user.organizationId,
    codes
  );
  return NextResponse.json({ disabledCodes: stored });
}
