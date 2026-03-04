import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const PLAN_DURATIONS: Record<string, number> = {
  starter: 30,
  standard: 30,
  pro: 30,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, object } = body;

    if (event !== "payment.succeeded") {
      return NextResponse.json({ status: "ignored" });
    }

    const { metadata, status } = object;
    if (status !== "succeeded" || !metadata?.organizationId || !metadata?.plan) {
      return NextResponse.json({ status: "ignored" });
    }

    const { organizationId, plan } = metadata;
    const days = PLAN_DURATIONS[plan] || 30;

    const org = await db.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    // Extend subscription from current end date or now
    const baseDate = org.subscriptionEnd && org.subscriptionEnd > new Date()
      ? org.subscriptionEnd
      : new Date();
    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    await db.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionPlan: plan,
        subscriptionEnd: newEnd,
      },
    });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Payment webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
