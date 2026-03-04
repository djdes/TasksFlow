import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationPrefsSchema, DEFAULT_NOTIFICATION_PREFS } from "@/lib/validators";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { notificationPrefs: true, telegramChatId: true },
    });

    return NextResponse.json({
      prefs: user?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
      isLinked: !!user?.telegramChatId,
    });
  } catch (error) {
    console.error("Get notification prefs error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = notificationPrefsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Некорректные данные" },
        { status: 400 }
      );
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { notificationPrefs: parsed.data },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notification prefs update error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
