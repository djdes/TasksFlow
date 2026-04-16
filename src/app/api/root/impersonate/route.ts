import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/root/impersonate — validates the target org and writes an
 * AuditLog row. The client then calls `useSession().update()` to refresh
 * its JWT with the new `actingAsOrganizationId` claim. This endpoint does
 * not return a cookie — the browser keeps the same session, just with the
 * claim overwritten, so stopping impersonation is a clean mirror.
 *
 * DELETE — clears the claim (logs a matching stop entry).
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isRoot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const organizationId =
    typeof body?.organizationId === "string" ? body.organizationId : null;
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId обязателен" },
      { status: 400 }
    );
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Организация не найдена" }, { status: 404 });
  }

  await db.auditLog.create({
    data: {
      organizationId: org.id,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? "root",
      action: "impersonate.start",
      entity: "Organization",
      entityId: org.id,
      details: { organizationName: org.name },
    },
  });

  return NextResponse.json({ ok: true, organization: org });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isRoot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const target = session.user.actingAsOrganizationId;
  if (target) {
    await db.auditLog.create({
      data: {
        organizationId: target,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "root",
        action: "impersonate.stop",
        entity: "Organization",
        entityId: target,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
