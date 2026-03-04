import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "OCR не настроен: отсутствует ANTHROPIC_API_KEY" },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Фото не загружено" },
        { status: 400 }
      );
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Determine media type
    const mediaType = file.type as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Ты помощник для системы ХАССП на пищевом производстве. Проанализируй фото этикетки/упаковки продукта и извлеки данные.

Верни ТОЛЬКО JSON (без markdown, без \`\`\`) в формате:
{
  "productName": "название продукта",
  "supplier": "производитель/поставщик",
  "manufactureDate": "YYYY-MM-DD или null",
  "expiryDate": "YYYY-MM-DD или null",
  "quantity": null,
  "unit": "kg" | "l" | "pcs" | null,
  "barcode": "штрих-код если виден или null",
  "batchNumber": "номер партии если виден или null",
  "storageTemp": "температура хранения если указана или null",
  "composition": "краткий состав если виден или null",
  "confidence": "high" | "medium" | "low"
}

Если дату невозможно распознать — пиши null. Даты всегда в формате YYYY-MM-DD.
Если поле невозможно определить — пиши null.`,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Не удалось распознать данные" },
        { status: 422 }
      );
    }

    // Parse JSON from response
    const jsonStr = textBlock.text.trim();
    const result = JSON.parse(jsonStr);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("OCR error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Не удалось разобрать ответ AI. Попробуйте другое фото." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Ошибка распознавания. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
