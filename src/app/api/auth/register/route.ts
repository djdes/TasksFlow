import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    const existingUser = await db.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(validatedData.password, 12);

    const result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: validatedData.organizationName,
          type: validatedData.organizationType,
          subscriptionPlan: "trial",
          subscriptionEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      const user = await tx.user.create({
        data: {
          email: validatedData.email,
          name: validatedData.name,
          phone: validatedData.phone || null,
          passwordHash,
          role: "owner",
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    sendWelcomeEmail({
      to: result.user.email,
      name: result.user.name,
      organizationName: result.organization.name,
    });

    return NextResponse.json(
      {
        message: "Регистрация успешна",
        userId: result.user.id,
        organizationId: result.organization.id,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Некорректные данные", details: error },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
