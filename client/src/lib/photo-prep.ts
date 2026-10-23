/**
 * Фото перед отправкой: уменьшаем до 1600 px по длинной стороне и
 * перекодируем в JPEG. Снимок с телефона весит 3–8 МБ и на мобильном
 * интернете грузится минуту; после — 200–400 КБ. Перекодирование заодно
 * убирает EXIF с координатами съёмки.
 *
 * stamp — подпись в углу («24.10 09:42 · Кафе»), чтобы на фото было видно,
 * когда его сделали. Если браузер не умеет открыть файл (HEIC в Chrome),
 * отправляем оригинал — сервер его примет.
 */
export const MAX_SIDE = 1600;
const QUALITY = 0.82;

/** Размер, вписанный в квадрат max × max, без увеличения. */
export function fitWithin(width: number, height: number, max: number = MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** «24.10.2026 09:42» по часам телефона. */
export function stampText(date: Date, place?: string | null): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return place ? `${when} · ${place}` : when;
}

export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // ниже — запасной путь через <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawStamp(ctx: CanvasRenderingContext2D, width: number, height: number, text: string) {
  const size = Math.max(14, Math.round(Math.min(width, height) * 0.032));
  ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padX = Math.round(size * 0.6);
  const padY = Math.round(size * 0.4);
  const textWidth = Math.min(ctx.measureText(text).width, width - padX * 4);
  const boxW = textWidth + padX * 2;
  const boxH = size + padY * 2;
  const x = width - boxW - padX;
  const y = height - boxH - padX;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, boxW, boxH, Math.round(size * 0.4));
  else ctx.rect(x, y, boxW, boxH);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + boxH / 2, textWidth);
}

export async function preparePhoto(file: File, opts: { stamp?: string | null } = {}): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return file;
  }
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const { width, height } = fitWithin(srcW, srcH);
  if (!width || !height) return file;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();
  if (opts.stamp) drawStamp(ctx, width, height, opts.stamp);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) return file;
  // Маленький оригинал без подписи может весить меньше перекодированного.
  if (!opts.stamp && blob.size >= file.size) return file;
  return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: Date.now() });
}
