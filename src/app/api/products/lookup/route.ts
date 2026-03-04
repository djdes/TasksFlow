import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Barcode lookup — finds product by barcode OR name, auto-computes expiryDate
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get("barcode");
    const name = searchParams.get("name");

    if (!barcode && !name) {
      return NextResponse.json(
        { error: "Укажите barcode или name" },
        { status: 400 }
      );
    }

    const product = await db.product.findFirst({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
        ...(barcode
          ? { barcode }
          : { name: { contains: name!, mode: "insensitive" as const } }),
      },
    });

    if (!product) {
      return NextResponse.json({ found: false });
    }

    // Auto-compute expiry date from today + shelfLifeDays
    let computedExpiryDate: string | null = null;
    if (product.shelfLifeDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + product.shelfLifeDays);
      computedExpiryDate = expiry.toISOString().split("T")[0];
    }

    return NextResponse.json({
      found: true,
      product: {
        id: product.id,
        name: product.name,
        supplier: product.supplier,
        barcode: product.barcode,
        unit: product.unit,
        category: product.category,
        storageTemp: product.storageTemp,
        shelfLifeDays: product.shelfLifeDays,
        computedExpiryDate,
      },
    });
  } catch (error) {
    console.error("Product lookup error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
