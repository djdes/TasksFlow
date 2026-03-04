import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const YOOKASSA_API = "https://api.yookassa.ru/v3";

const PLANS: Record<string, { name: string; amount: number }> = {
  starter: { name: "Стартовый", amount: 3000 },
  standard: { name: "Стандарт", amount: 5000 },
  pro: { name: "Про", amount: 8000 },
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "owner") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { plan } = await request.json();
    const planInfo = PLANS[plan];
    if (!planInfo) {
      return NextResponse.json({ error: "Неизвестный тариф" }, { status: 400 });
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return NextResponse.json({ error: "Платёжная система не настроена" }, { status: 500 });
    }

    const idempotenceKey = `${session.user.organizationId}-${plan}-${Date.now()}`;

    const response = await fetch(`${YOOKASSA_API}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey,
        Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: {
          value: planInfo.amount.toFixed(2),
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: `${process.env.NEXTAUTH_URL}/settings/subscription?status=success`,
        },
        description: `HACCP-Online: тариф "${planInfo.name}" (1 мес)`,
        metadata: {
          organizationId: session.user.organizationId,
          plan,
        },
        save_payment_method: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("YooKassa error:", err);
      return NextResponse.json({ error: "Ошибка создания платежа" }, { status: 500 });
    }

    const payment = await response.json();

    // Store payment ID for webhook matching
    await db.organization.update({
      where: { id: session.user.organizationId },
      data: { yookassaShopId: payment.id },
    });

    return NextResponse.json({
      confirmationUrl: payment.confirmation.confirmation_url,
      paymentId: payment.id,
    });
  } catch (error) {
    console.error("Payment create error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
