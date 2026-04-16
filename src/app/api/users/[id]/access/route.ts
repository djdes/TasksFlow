import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { invalidateJournalAcl } from "@/lib/journal-acl";
import { isManagementRole } from "@/lib/user-roles";
import { ACTIVE_JOURNAL_CATALOG } from "@/lib/journal-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_CODES = new Set<string>(
  ACTIVE_JOURNAL_CATALOG.map((item) => item.code)
);

/**
 * GET /api/users/[id]/access — returns the current journal ACL rows for the
 * target user. Requires manager on the target user's org (or root).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      journalAccessMigrated: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const activeOrg = getActiveOrgId(session);
  if (!session.user.isRoot && user.organizationId !== activeOrg) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const rows = await db.userJournalAccess.findMany({
    where: { userId: id },
    select: {
      templateCode: true,
      canRead: true,
      canWrite: true,
      canFinalize: true,
    },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      journalAccessMigrated: user.journalAccessMigrated,
    },
    catalog: ACTIVE_JOURNAL_CATALOG,
    access: rows,
  });
}

/**
 * PUT /api/users/[id]/access — replace the ACL set for the target user.
 * Body: { access: [{ templateCode, canRead, canWrite, canFinalize }] }
 * Flips `journalAccessMigrated = true` on first save.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  const activeOrg = getActiveOrgId(session);
  if (!session.user.isRoot && user.organizationId !== activeOrg) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rawAccess = Array.isArray(body?.access) ? body.access : [];

  type AclIn = Record<string, unknown>;
  const sanitised = (rawAccess as unknown[])
    .filter(
      (item): item is AclIn => typeof item === "object" && item !== null
    )
    .map((item) => ({
      templateCode: String(item.templateCode ?? ""),
      canRead: item.canRead === true,
      canWrite: item.canWrite === true,
      canFinalize: item.canFinalize === true,
    }))
    .filter((item) => VALID_CODES.has(item.templateCode))
    .filter((item) => item.canRead || item.canWrite || item.canFinalize);

  await db.$transaction([
    db.userJournalAccess.deleteMany({ where: { userId: id } }),
    ...sanitised.map(
      (row: {
        templateCode: string;
        canRead: boolean;
        canWrite: boolean;
        canFinalize: boolean;
      }) =>
        db.userJournalAccess.create({
          data: {
            userId: id,
            templateCode: row.templateCode,
            canRead: row.canRead,
            canWrite: row.canWrite,
            canFinalize: row.canFinalize,
          },
        })
    ),
    db.user.update({
      where: { id },
      data: { journalAccessMigrated: true },
    }),
  ]);

  invalidateJournalAcl(id);

  return NextResponse.json({ ok: true, count: sanitised.length });
}
