import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { getServerSession } from "@/lib/server-session";
import {
  StaffTelegramManagementError,
  unlinkStaffTelegram,
} from "@/lib/staff-telegram-management";
import { isManagerRole } from "@/lib/user-roles";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!isManagerRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const result = await unlinkStaffTelegram({
      employeeId: id,
      organizationId: getActiveOrgId(session),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StaffTelegramManagementError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("staff unlink-tg route error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
