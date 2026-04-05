import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, isValidPlanId } from "@/lib/plans";

const YOOKASSA_API = "https://api.yookassa.ru/v3";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "owner") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = (body as { plan?: unknown }).plan;
    if (!isValidPlanId(plan)) {
      return NextResponse.json({ error: "Неизвестный тариф" }, { status: 400 });
    }
    const planInfo = PLANS[plan];

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;

    if (!shopId || !secretKey) {
      return NextResponse.json(
        { error: "Платёжная система не настроена" },
        { status: 500 }
      );
    }

    const idempotenceKey = `${session.user.organizationId}-${plan}-${Date.now()}`;

    // YooKassa requires a 15s-or-less response; abort if it takes longer.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(`${YOOKASSA_API}/payments`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotence-Key": idempotenceKey,
          Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
        },
        body: JSON.stringify({
          amount: {
            value: planInfo.priceRub.toFixed(2),
            currency: "RUB",
          },
          capture: true,
          confirmation: {
            type: "redirect",
            return_url: `${process.env.NEXTAUTH_URL}/settings/subscription?status=success`,
          },
          description: `HACCP-Online: тариф "${planInfo.name}" (${planInfo.durationDays} дн)`,
          metadata: {
            organizationId: session.user.organizationId,
            plan,
          },
          save_payment_method: true,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("YooKassa error:", err);
      return NextResponse.json({ error: "Ошибка создания платежа" }, { status: 502 });
    }

    const payment = (await response.json()) as {
      id: string;
      confirmation: { confirmation_url: string };
    };

    // Store payment ID so the webhook can verify it actually originated from our
    // server. Field is historically named yookassaShopId but stores the pending
    // payment identifier.
    await db.organization.update({
      where: { id: session.user.organizationId },
      data: { yookassaShopId: payment.id },
    });

    return NextResponse.json({
      confirmationUrl: payment.confirmation.confirmation_url,
      paymentId: payment.id,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Платёжная система не отвечает" },
        { status: 504 }
      );
    }
    console.error("Payment create error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
