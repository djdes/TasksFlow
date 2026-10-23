/**
 * Иконки и заставки PWA, Android и iOS из знака бренда (shared/brand.ts).
 *
 *   npm run app-icons
 *
 * Рисует SVG в Chromium (Playwright уже в devDependencies) и пишет PNG
 * сам — без sharp и ImageMagick. Векторные иконки Android (adaptive,
 * уведомления) — XML с теми же путями. Результат коммитится: сборкам
 * приложений и CI этот скрипт не нужен, запускать — когда меняется знак.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";
import {
  BRAND_BAND_DARK,
  BRAND_BAND_LIGHT,
  BRAND_CHECK_PATH,
  BRAND_CHECK_STROKE,
  BRAND_FRAME_PATH,
  BRAND_FRAME_STROKE,
} from "../shared/brand";

const root = path.resolve(import.meta.dirname, "..");
const out = (...p: string[]) => path.join(root, ...p);

type Background = "light" | "dark" | "black" | "none";
type IconSpec = {
  size: number;
  background: Background;
  /** Доля стороны, которую занимает знак (рамка 16 из 32 единиц). */
  mark: number;
  /** Скругление плашки в долях стороны; 0 — на весь квадрат (iOS, maskable). */
  radius?: number;
  /** Отступ плашки от края в долях стороны. */
  inset?: number;
  ink?: string;
  frameOpacity?: number;
};

function gradient(id: string, stops: readonly string[]) {
  // CSS 155deg, как у полосы шапки: сверху-слева вниз-вправо.
  return `<linearGradient id="${id}" x1="0.289" y1="0.047" x2="0.711" y2="0.953">
    <stop offset="0" stop-color="${stops[0]}"/><stop offset="0.48" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/>
  </linearGradient>`;
}

export function iconSvg(spec: IconSpec): string {
  const { size: s, background, mark, radius = 0, inset = 0, ink = "#fff", frameOpacity = 0.55 } = spec;
  const k = (s * mark) / 16;
  const t = s / 2 - 16 * k;
  const pad = s * inset;
  const plate =
    background === "none"
      ? ""
      : `<rect x="${pad}" y="${pad}" width="${s - 2 * pad}" height="${s - 2 * pad}" rx="${(s - 2 * pad) * radius}" fill="${
          background === "black" ? "#000" : "url(#bg)"
        }"/>`;
  const defs =
    background === "light" ? gradient("bg", BRAND_BAND_LIGHT) : background === "dark" ? gradient("bg", BRAND_BAND_DARK) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>${defs}</defs>${plate}
  <g transform="translate(${t} ${t}) scale(${k})" fill="none" stroke="${ink}" stroke-linecap="round">
    <path d="${BRAND_FRAME_PATH}" stroke-opacity="${frameOpacity}" stroke-width="${BRAND_FRAME_STROKE}"/>
    <path d="${BRAND_CHECK_PATH}" stroke-width="${BRAND_CHECK_STROKE}" stroke-linejoin="round"/>
  </g>
</svg>`;
}

// ---------- PNG без зависимостей: RGB(A), 8 бит, фильтр 0 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** alpha=false — без альфа-канала: App Store не принимает иконку с ним. */
export function encodePng(width: number, height: number, rgba: Buffer, alpha: boolean): Buffer {
  const ch = alpha ? 4 : 3;
  const stride = width * ch + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * stride + 1 + x * ch;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
      if (alpha) raw[di + 3] = rgba[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Android VectorDrawable: те же пути, что в SVG ----------
function vectorMark(viewport: number, markDp: number, color: string, frameAlpha = 0.55) {
  const k = markDp / 16;
  const t = viewport / 2 - 16 * k;
  return `  <group android:translateX="${t}" android:translateY="${t}" android:scaleX="${k}" android:scaleY="${k}">
    <path android:pathData="${BRAND_FRAME_PATH}" android:strokeColor="${color}" android:strokeAlpha="${frameAlpha}" android:strokeWidth="${BRAND_FRAME_STROKE}" android:strokeLineCap="round" />
    <path android:pathData="${BRAND_CHECK_PATH}" android:strokeColor="${color}" android:strokeWidth="${BRAND_CHECK_STROKE}" android:strokeLineCap="round" android:strokeLineJoin="round" />
  </group>`;
}
const GENERATED = "<!-- Сгенерировано script/generate-app-icons.ts из shared/brand.ts — не править вручную. -->";
function vectorXml(size: number, viewport: number, body: string, aapt = false) {
  return `<?xml version="1.0" encoding="utf-8"?>
${GENERATED}
<vector xmlns:android="http://schemas.android.com/apk/res/android"${aapt ? `\n    xmlns:aapt="http://schemas.android.com/aapt"` : ""}
    android:width="${size}dp" android:height="${size}dp"
    android:viewportWidth="${viewport}" android:viewportHeight="${viewport}">
${body}
</vector>
`;
}
function androidVectors(res: string) {
  // Adaptive icon: слой 108dp, гарантированно видимый круг — 66dp. Знак
  // 40dp: углы рамки на 28dp от центра, внутри безопасной зоны.
  const bg = `  <path android:pathData="M0,0h108v108h-108z">
    <aapt:attr name="android:fillColor">
      <gradient android:type="linear" android:startX="31.2" android:startY="5.1" android:endX="76.8" android:endY="102.9">
        <item android:offset="0" android:color="${BRAND_BAND_LIGHT[0]}" />
        <item android:offset="0.48" android:color="${BRAND_BAND_LIGHT[1]}" />
        <item android:offset="1" android:color="${BRAND_BAND_LIGHT[2]}" />
      </gradient>
    </aapt:attr>
  </path>`;
  const write = (file: string, xml: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, xml);
  };
  write(path.join(res, "drawable", "ic_launcher_background.xml"), vectorXml(108, 108, bg, true));
  write(path.join(res, "drawable", "ic_launcher_foreground.xml"), vectorXml(108, 108, vectorMark(108, 40, "#FFFFFF")));
  write(path.join(res, "drawable", "ic_launcher_monochrome.xml"), vectorXml(108, 108, vectorMark(108, 40, "#FFFFFF", 0.7)));
  // Значок уведомления: белый силуэт, система красит его сама.
  write(path.join(res, "drawable", "ic_notification_icon.xml"), vectorXml(24, 24, vectorMark(24, 20, "#FFFFFF", 0.8)));
  write(
    path.join(res, "mipmap-anydpi-v26", "ic_launcher.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
${GENERATED}
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`,
  );
}

type PngJob = { file: string; spec: IconSpec; alpha: boolean };

function jobs(): PngJob[] {
  const list: PngJob[] = [];
  const add = (file: string, spec: IconSpec, alpha = true) => list.push({ file, spec, alpha });
  const rounded = { background: "light" as const, mark: 0.5, radius: 9 / 32 };
  const fullBleed = { background: "light" as const, mark: 0.5 };

  // Web / PWA
  add(out("client/public/favicon.png"), { size: 128, ...rounded });
  add(out("client/public/icons/icon-192.png"), { size: 192, ...rounded });
  add(out("client/public/icons/icon-512.png"), { size: 512, ...rounded });
  // maskable: система сама обрезает до круга/сквирла — знак внутри зоны 80%.
  add(out("client/public/icons/maskable-192.png"), { size: 192, ...fullBleed });
  add(out("client/public/icons/maskable-512.png"), { size: 512, ...fullBleed });
  add(out("client/public/icons/badge-96.png"), { size: 96, background: "none", mark: 0.8, frameOpacity: 0.85 });
  add(out("client/public/apple-touch-icon.png"), { size: 180, ...fullBleed }, false);

  // Android: PNG для лаунчеров до Android 8 (дальше — adaptive из XML).
  const densities: Array<[string, number]> = [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]];
  for (const [d, m] of densities) {
    add(out(`mobile/android/app/src/main/res/mipmap-${d}/ic_launcher.png`), {
      size: Math.round(48 * m),
      ...rounded,
      inset: 1 / 24,
    });
    // Заставка TWA: белый знак 144dp на indigo-фоне (цвет фона — в manifest).
    add(out(`mobile/android/app/src/main/res/drawable-${d}/splash.png`), {
      size: Math.round(144 * m),
      background: "none",
      mark: 0.62,
      frameOpacity: 0.7,
    });
  }
  add(out("mobile/store/android/icon-512.png"), { size: 512, ...fullBleed });

  // iOS: одна иконка 1024 (Xcode режет остальные) + тёмная и tinted.
  const appIcon = out("mobile/ios/TasksFlow/Assets.xcassets/AppIcon.appiconset");
  add(path.join(appIcon, "icon-1024.png"), { size: 1024, ...fullBleed }, false);
  add(path.join(appIcon, "icon-1024-dark.png"), { size: 1024, background: "dark", mark: 0.5, frameOpacity: 0.6 }, false);
  add(path.join(appIcon, "icon-1024-tinted.png"), { size: 1024, background: "black", mark: 0.5, frameOpacity: 0.6 }, false);
  const launch = out("mobile/ios/TasksFlow/Assets.xcassets/LaunchLogo.imageset");
  for (const scale of [1, 2, 3]) {
    add(path.join(launch, `launch-logo@${scale}x.png`), { size: 120 * scale, background: "none", mark: 0.62, frameOpacity: 0.7 });
  }
  return list;
}

async function main() {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  for (const job of jobs()) {
    const svg = iconSvg(job.spec);
    const b64 = await page.evaluate(async ({ svg, size }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let s = "";
      for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return btoa(s);
    }, { svg, size: job.spec.size });
    fs.mkdirSync(path.dirname(job.file), { recursive: true });
    fs.writeFileSync(job.file, encodePng(job.spec.size, job.spec.size, Buffer.from(b64, "base64"), job.alpha));
    console.log(`png  ${path.relative(root, job.file)}`);
  }
  await browser.close();

  fs.writeFileSync(out("client/public/favicon.svg"), iconSvg({ size: 32, background: "light", mark: 0.5, radius: 9 / 32 }) + "\n");
  console.log("svg  client/public/favicon.svg");
  androidVectors(out("mobile/android/app/src/main/res"));
  console.log("xml  mobile/android/app/src/main/res/{drawable,mipmap-anydpi-v26}");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
