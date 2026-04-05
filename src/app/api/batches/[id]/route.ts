import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const batch = await db.batch.findUnique({ where: { id } });
  if (!batch || batch.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(batch);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const batch = await db.batch.findUnique({ where: { id } });
  if (!batch || batch.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const body = await req.json();
  const updated = await db.batch.update({
    where: { id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.productName && { productName: body.productName }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.expiryDate && { expiryDate: new Date(body.expiryDate) }),
    },
  });

  return NextResponse.json(updated);
}
