import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getScanJournalConfig } from "@/lib/scan-journal-config";

function getContentType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const config = getScanJournalConfig(code);
  if (!config) {
    return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
  }

  const folderPath = path.join(process.cwd(), "journals", config.folderName);
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(folderPath, { withFileTypes: true });
  } catch {
    return NextResponse.json(
      { error: "РџР°РєРѕРґ РјРЅРёРІРµС‚Р°Р·РёС‚Рµ РЅРµ РЅР°Р№РґРµРЅР°" },
      { status: 404 }
    );
  }
  const imageEntries = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => /\.(jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => ({
      file: entry.name,
      order: Number((entry.name.match(/^\s*(\d+)/) || [])[1] || Number.POSITIVE_INFINITY),
    }))
    .sort((a, b) => (a.order - b.order) || a.file.localeCompare(b.file));

  if (page > imageEntries.length || imageEntries.length === 0) {
    return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  }

  const fileName = imageEntries[page - 1].file;
  const filePath = path.join(folderPath, fileName);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": getContentType(fileName),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось открыть скан" }, { status: 404 });
  }
}
