import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const products = await db.product.findMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("Products fetch error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role === "operator") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = await request.json();
    const { name, supplier, barcode, unit, category, storageTemp, shelfLifeDays } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Название продукта обязательно" },
        { status: 400 }
      );
    }

    const product = await db.product.create({
      data: {
        name: name.trim(),
        supplier: supplier?.trim() || null,
        barcode: barcode?.trim() || null,
        unit: unit || "kg",
        category: category?.trim() || null,
        storageTemp: storageTemp?.trim() || null,
        shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : null,
        organizationId: session.user.organizationId,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Product creation error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (session.user.role !== "owner") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID не указан" }, { status: 400 });
    }

    // Verify product belongs to this organization
    const product = await db.product.findFirst({
      where: { id, organizationId: session.user.organizationId },
    });

    if (!product) {
      return NextResponse.json({ error: "Продукт не найден" }, { status: 404 });
    }

    await db.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product deletion error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
