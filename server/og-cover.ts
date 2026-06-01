/**
 * Детерминированная SVG-обложка статьи (og:image 1200×630). Никаких
 * растровых картинок и внешних зависимостей: градиент по кластеру +
 * вариация по slug + декоративные фигуры + заголовок + лейбл кластера.
 */
import { CLUSTER_BY_KEY } from "@shared/blog-clusters";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapTitle(title: string, maxChars = 24, maxLines = 4): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
    if (lines.length === maxLines - 1 && (cur + " ").length > maxChars) break;
  }
  if (cur) lines.push(cur.trim());
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

export function coverSvg(opts: { title: string; cluster: string; slug: string }): string {
  const c = CLUSTER_BY_KEY[opts.cluster];
  const hue = c?.hue ?? 233;
  const h = hash(opts.slug);
  const hue2 = (hue + 30 + (h % 30)) % 360;
  const angle = 110 + (h % 60);
  const short = c?.short ?? "TasksFlow";
  const lines = wrapTitle(opts.title || "TasksFlow", 24, 4);

  const titleTspans = lines
    .map((ln, i) => `<tspan x="80" dy="${i === 0 ? 0 : 78}">${esc(ln)}</tspan>`)
    .join("");

  // декоративные круги, позиции зависят от хэша
  const cx = 980 + (h % 120);
  const cy = 140 + ((h >> 4) % 120);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${esc(opts.title)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="hsl(${hue} 72% 52%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 70% 40%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="${cx}" cy="${cy}" r="220" fill="#ffffff" opacity="0.08"/>
  <circle cx="${cx - 120}" cy="${cy + 260}" r="160" fill="#ffffff" opacity="0.06"/>
  <circle cx="120" cy="540" r="180" fill="#000000" opacity="0.06"/>
  <text x="80" y="90" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#ffffff">Tasks<tspan fill="#ffffff" opacity="0.7">Flow</tspan></text>
  <rect x="80" y="120" rx="18" ry="18" width="${Math.min(560, 60 + short.length * 22)}" height="48" fill="#ffffff" opacity="0.18"/>
  <text x="104" y="153" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" fill="#ffffff">${esc(short)}</text>
  <text x="80" y="300" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="#ffffff">${titleTspans}</text>
  <text x="80" y="585" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#ffffff" opacity="0.85">tasksflow.ru · контроль задач для команд</text>
</svg>`;
}
