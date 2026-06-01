/**
 * Рендер Markdown статей блога в HTML + извлечение оглавления (TOC) и
 * времени чтения. Серверная часть (используется в server/blog.ts при SSR).
 */
import MarkdownIt from "markdown-it";

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

const md = new MarkdownIt({
  html: false, // не доверяем сырому HTML в статьях
  linkify: true,
  typographer: true,
  breaks: false,
});

// Транслитерация кириллицы для чистых #якорей (латиница в URL).
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";
}

export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export interface RenderedMarkdown {
  html: string;
  toc: TocEntry[];
}

/** Рендерит Markdown в HTML, навешивает id на h2/h3 и собирает оглавление. */
export function renderMarkdown(markdown: string): RenderedMarkdown {
  const tokens = md.parse(markdown, {});
  const toc: TocEntry[] = [];
  const used = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && (t.tag === "h2" || t.tag === "h3")) {
      const inline = tokens[i + 1];
      const text = inline && inline.type === "inline" ? inline.content : "";
      let id = slugifyHeading(text);
      let n = 2;
      while (used.has(id)) id = `${slugifyHeading(text)}-${n++}`;
      used.add(id);
      t.attrSet("id", id);
      toc.push({ id, text, level: t.tag === "h2" ? 2 : 3 });
    }
  }

  return { html: md.renderer.render(tokens, (md as any).options, {}), toc };
}
