import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/server-session";
import {
  aclActorFromSession,
  getAllowedJournalCodes,
} from "@/lib/journal-acl";
import { getDisabledJournalCodes } from "@/lib/disabled-journals";

/**
 * GET /api/mini/home
 *
 * One-shot payload for the Mini App home screen. Returns:
 *   - user: minimal identity for the greeting
 *   - today: journals with at least one scheduled obligation today that
 *     the caller has not yet completed
 *   - all:   every other journal the caller can at least read
 *
 * "Today" is heuristically defined as "no JournalEntry by this user for
 * this template since the start of the local day". We don't encode each
 * journal's scheduling rules in Stage 2 — that lives in the template
 * metadata and can grow over later stages without a breaking change to
 * this endpoint's shape.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

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

  const rawTemplates = await db.journalTemplate.findMany({
    where:
      allowedCodes === null ? undefined : { code: { in: allowedCodes } },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
    },
    orderBy: { name: "asc" },
  });

  // Hide org-disabled journals from the mini app — employees can't
  // re-enable them, and they're not expected to fill data for a
  // journal their organization has switched off.
  const templates = rawTemplates.filter((t) => !disabledCodes.has(t.code));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const templateIds = templates.map((t) => t.id);
  const todaysEntries =
    templateIds.length === 0
      ? []
      : await db.journalEntry.findMany({
          where: {
            filledById: session.user.id,
            templateId: { in: templateIds },
            createdAt: { gte: startOfDay },
          },
          select: { templateId: true },
        });

  const filledByTemplateId = new Set(todaysEntries.map((e) => e.templateId));

  const today = templates.filter((t) => !filledByTemplateId.has(t.id));
  const all = templates;

  return NextResponse.json({
    user: {
      name: session.user.name ?? "",
      organizationName: session.user.organizationName ?? "",
    },
    today: today.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
    })),
    all: all.map((t) => ({
      code: t.code,
      name: t.name,
      description: t.description,
      filled: filledByTemplateId.has(t.id),
    })),
  });
}
