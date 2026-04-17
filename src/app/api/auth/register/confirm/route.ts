import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  VERIFICATION_MAX_ATTEMPTS,
  compareVerificationCode,
} from "@/lib/registration";
import { sendWelcomeEmail } from "@/lib/email";
import { seedDefaultJobPositions } from "@/lib/default-job-positions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PLANS = new Set(["basic", "extended", "trial"]);

/**
 * POST /api/auth/register/confirm
 *
 * Step 2 of the wizard. Validates the 6-digit code issued by /request,
 * then creates the Organization + manager User in a single transaction.
 * Plan is taken from the request body (`basic` | `extended`, default
 * `trial` for legacy compatibility). On success the EmailVerification row
 * is deleted so a token can't be replayed.
 *
 * Returns 400 on expired/wrong code, 409 if the email has been claimed
 * between /request and /confirm (very unlikely but possible), 201 on
 * success with the new user id.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone =
    typeof body.phone === "string" && body.phone.trim().length > 0
      ? body.phone.trim()
      : null;
  const organizationName =
    typeof body.organizationName === "string"
      ? body.organizationName.trim()
      : "";
  const organizationType =
    typeof body.organizationType === "string" && body.organizationType
      ? body.organizationType
      : "other";
  const inn =
    typeof body.inn === "string" && body.inn.trim().length > 0
      ? body.inn.trim()
      : null;
  const plan =
    typeof body.plan === "string" && VALID_PLANS.has(body.plan)
      ? body.plan
      : "trial";

  if (!email || !code || !password || !name || !organizationName) {
    return NextResponse.json(
      { error: "Не все поля заполнены" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 6 символов" },
      { status: 400 }
    );
  }

  const verification = await db.emailVerification.findUnique({
    where: { email },
  });
  if (!verification) {
    return NextResponse.json(
      { error: "Сначала запросите код подтверждения" },
      { status: 400 }
    );
  }
  if (verification.expiresAt.getTime() < Date.now()) {
    await db.emailVerification.delete({ where: { email } });
    return NextResponse.json(
      { error: "Код устарел. Запросите новый" },
      { status: 400 }
    );
  }
  if (verification.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Слишком много попыток. Запросите новый код" },
      { status: 429 }
    );
  }

  const codeOk = await compareVerificationCode(code, verification.codeHash);
  if (!codeOk) {
    await db.emailVerification.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json(
      { error: "Неверный код" },
      { status: 400 }
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже существует" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
        type: organizationType,
        inn,
        subscriptionPlan: plan,
        subscriptionEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    // Seed the standard JobPosition catalogue so the new owner's journals
    // have the full Руководство / Сотрудники dropdown from day one. The
    // manager is linked to "Управляющий" right away for nice default UX
    // on /settings/users.
    await seedDefaultJobPositions(tx, organization.id);
    const managerPosition = await tx.jobPosition.findUnique({
      where: {
        organizationId_categoryKey_name: {
          organizationId: organization.id,
          categoryKey: "management",
          name: "Управляющий",
        },
      },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        email,
        name,
        phone,
        passwordHash,
        role: "manager",
        organizationId: organization.id,
        jobPositionId: managerPosition?.id ?? null,
        // Manager bypasses ACL anyway, but flip for cleanliness so any future
        // code that reads the flag sees "yes, owner has reviewed access".
        journalAccessMigrated: true,
      },
    });

    await tx.emailVerification.delete({ where: { email } });

    return { organization, user };
  });

  sendWelcomeEmail({
    to: result.user.email,
    name: result.user.name,
    organizationName: result.organization.name,
  }).catch((err) => console.error("sendWelcomeEmail failed", err));

  return NextResponse.json(
    {
      ok: true,
      userId: result.user.id,
      organizationId: result.organization.id,
    },
    { status: 201 }
  );
}
