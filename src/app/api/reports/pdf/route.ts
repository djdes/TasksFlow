import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateJournalPDF } from "@/lib/pdf";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    // Only owner and technologist can generate reports
    if (!["owner", "technologist"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const templateCode = searchParams.get("template");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");
    const areaId = searchParams.get("area") || undefined;

    if (!templateCode || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "Укажите шаблон журнала, дату начала и дату окончания" },
        { status: 400 }
      );
    }

    // Validate date format (basic check)
    if (isNaN(Date.parse(dateFrom)) || isNaN(Date.parse(dateTo))) {
      return NextResponse.json(
        { error: "Некорректный формат даты" },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateJournalPDF({
      templateCode,
      organizationId: session.user.organizationId,
      organizationName: session.user.organizationName,
      dateFrom,
      dateTo,
      areaId,
    });

    const fileName = `report_${templateCode}_${dateFrom}_${dateTo}.pdf`;

    const uint8 = new Uint8Array(pdfBuffer);

    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(uint8.length),
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    const message =
      error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
