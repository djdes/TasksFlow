import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLANS, isValidPlanId } from "@/lib/plans";

/**
 * YooKassa payment notification webhook.
 *
 * Security model (defence in depth):
 *  1. IP whitelist: YooKassa only sends webhooks from a fixed set of CIDR ranges
 *     (https://yookassa.ru/developers/using-api/webhooks). Requests from any other
 *     source are rejected.
 *  2. Payment provenance: the webhook must reference a payment.id that was
 *     previously created by our /api/payments/create handler. We store the last
 *     payment id in Organization.yookassaShopId and compare on arrival.
 *  3. Amount check: the reported amount must equal the current price of the plan
 *     we sell. Protects against replay with tampered metadata.
 *  4. Idempotency: YooKassa retries webhooks until it gets a 2xx. If a payment
 *     for the same plan has already been processed (subscription already extends
 *     well into the future), we return ok without re-extending.
 */

// YooKassa webhook source IPs (IPv4).
// https://yookassa.ru/developers/using-api/webhooks#ip
const YOOKASSA_CIDRS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
  "77.75.154.128/25",
  "2a02:5180::/32",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  if (cidr.includes(":")) return false; // IPv6 CIDRs handled as literal prefix match below
  const [network, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt == null || netInt == null || !Number.isInteger(bits)) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function isYookassaIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  // Normalise common prefixes/suffixes (e.g. "::ffff:185.71.76.1").
  const normalised = ip.replace(/^::ffff:/i, "");
  for (const cidr of YOOKASSA_CIDRS) {
    if (cidr.includes(":")) {
      // Very small IPv6 prefix match — YooKassa only uses 2a02:5180::/32.
      const prefix = cidr.split("::")[0].toLowerCase();
      if (normalised.toLowerCase().startsWith(prefix)) return true;
    } else if (ipInCidr(normalised, cidr)) {
      return true;
    }
  }
  return false;
}

function getClientIp(request: Request): string | null {
  // Nginx / FastPanel adds X-Forwarded-For; trust the leftmost entry.
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function POST(request: Request) {
  try {
    // 1. IP check — unless explicitly disabled for local development.
    if (process.env.YOOKASSA_TRUST_ALL_IPS !== "1") {
      const ip = getClientIp(request);
      if (!isYookassaIp(ip)) {
        console.warn("payments/webhook: rejecting request from non-YooKassa IP:", ip);
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { event, object } = body as {
      event?: unknown;
      object?: {
        id?: unknown;
        status?: unknown;
        amount?: { value?: unknown; currency?: unknown };
        metadata?: { organizationId?: unknown; plan?: unknown };
      };
    };

    if (event !== "payment.succeeded") {
      return NextResponse.json({ status: "ignored" });
    }

    if (
      !object ||
      object.status !== "succeeded" ||
      typeof object.id !== "string" ||
      typeof object.metadata?.organizationId !== "string" ||
      !isValidPlanId(object.metadata?.plan)
    ) {
      return NextResponse.json({ status: "ignored" });
    }

    const paymentId = object.id;
    const organizationId = object.metadata.organizationId;
    const plan = object.metadata.plan;
    const planInfo = PLANS[plan];

    // 3. Verify amount matches current plan price.
    const amountValue = Number(object.amount?.value);
    if (!Number.isFinite(amountValue) || amountValue !== planInfo.priceRub) {
      console.warn(
        `payments/webhook: amount mismatch for payment ${paymentId}: got ${object.amount?.value}, expected ${planInfo.priceRub}`
      );
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }
    if (object.amount?.currency !== "RUB") {
      return NextResponse.json({ error: "Currency mismatch" }, { status: 400 });
    }

    const org = await db.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    // 2. Verify the payment id was actually created by our server.
    //    yookassaShopId holds the id of the last initiated payment for this org.
    if (org.yookassaShopId !== paymentId) {
      console.warn(
        `payments/webhook: payment id ${paymentId} does not match org.yookassaShopId=${org.yookassaShopId}`
      );
      return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
    }

    // 4. Idempotency — if we've already extended for this payment (current plan
    //    already matches AND subscriptionEnd is already far in the future), skip.
    const now = new Date();
    const alreadyProcessed =
      org.subscriptionPlan === plan &&
      !!org.subscriptionEnd &&
      org.subscriptionEnd.getTime() - now.getTime() >
        (planInfo.durationDays - 1) * 24 * 60 * 60 * 1000;

    if (alreadyProcessed) {
      return NextResponse.json({ status: "already_processed" });
    }

    const baseDate =
      org.subscriptionEnd && org.subscriptionEnd > now ? org.subscriptionEnd : now;
    const newEnd = new Date(
      baseDate.getTime() + planInfo.durationDays * 24 * 60 * 60 * 1000
    );

    await db.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionPlan: plan,
        subscriptionEnd: newEnd,
        // Clear payment id so a replay of the same webhook hits the
        // "Unknown payment" branch above.
        yookassaShopId: null,
      },
    });

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Payment webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
