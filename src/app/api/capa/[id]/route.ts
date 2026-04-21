import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { isManagementRole } from "@/lib/user-roles";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!isManagementRole(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const ticket = await db.capaTicket.findUnique({ where: { id } });
  if (!ticket || ticket.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status) {
    data.status = body.status;
    if (body.status === "closed") data.closedAt = new Date();
    if (body.status === "verification" || body.status === "corrective_action") data.resolvedAt = new Date();
  }
  if (body.rootCause !== undefined) data.rootCause = body.rootCause;
  if (body.correctiveAction !== undefined) data.correctiveAction = body.correctiveAction;
  if (body.preventiveAction !== undefined) data.preventiveAction = body.preventiveAction;
  if (body.verificationResult !== undefined) data.verificationResult = body.verificationResult;
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId;
  if (body.priority !== undefined) data.priority = body.priority;

  const updated = await db.capaTicket.update({ where: { id }, data });
  return NextResponse.json(updated);
}
