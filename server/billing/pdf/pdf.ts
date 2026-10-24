import { deflateSync } from "node:zlib";
import { subsetTrueType, type TrueTypeFont } from "./ttf";

/**
 * Маленький генератор PDF для счетов и УПД (server/billing/documents.ts):
 * страницы A4, текст одним вшитым TrueType-шрифтом, линии и прямоугольники.
 *
 * Кириллица: шрифт вшивается подмножеством (только глифы документа,
 * FontFile2, сжатый) как CIDFontType2 с кодировкой Identity-H — в тексте идут номера глифов, а таблица
 * ToUnicode возвращает их в символы, поэтому текст документа ищется и
 * копируется. Координаты — миллиметры от левого верхнего угла листа,
 * y текста — базовая линия.
 */
const PT_PER_MM = 72 / 25.4;
const A4 = { w: 210, h: 297 };

export type Align = "left" | "center" | "right";

type Page = { ops: string[] };

const num = (v: number) => {
  const s = v.toFixed(3);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

export class PdfDocument {
  readonly pageW: number;
  readonly pageH: number;
  private readonly pages: Page[] = [];
  private page!: Page;
  private size = 10;
  /** Глиф → символ: для ширин (/W) и обратной таблицы ToUnicode. */
  private readonly used = new Map<number, number>();
  private readonly title: string | null;

  constructor(
    private readonly font: TrueTypeFont,
    options: { orientation?: "portrait" | "landscape"; title?: string } = {},
  ) {
    const landscape = options.orientation === "landscape";
    this.pageW = landscape ? A4.h : A4.w;
    this.pageH = landscape ? A4.w : A4.h;
    this.title = options.title ?? null;
    this.addPage();
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): void {
    this.page = { ops: [] };
    this.pages.push(this.page);
  }

  setFontSize(pt: number): this {
    this.size = pt;
    return this;
  }

  /** Серый 0 (чёрный) … 1 (белый): документы печатают на ч/б принтерах. */
  setFillGray(gray: number): this {
    this.page.ops.push(`${num(gray)} g`);
    return this;
  }

  setStrokeGray(gray: number): this {
    this.page.ops.push(`${num(gray)} G`);
    return this;
  }

  setLineWidth(mm: number): this {
    this.page.ops.push(`${num(mm * PT_PER_MM)} w`);
    return this;
  }

  setDash(on: boolean): this {
    this.page.ops.push(on ? "[2 2] 0 d" : "[] 0 d");
    return this;
  }

  private glyphs(text: string): number[] {
    const out: number[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      // Нет глифа (редкий символ) — пробел, а не пустой квадрат .notdef; в
      // ToUnicode пробел остаётся пробелом.
      const real = this.font.glyph(cp);
      const gid = real || this.font.glyph(0x20);
      out.push(gid);
      if (!this.used.has(gid)) this.used.set(gid, real ? cp : 0x20);
    }
    return out;
  }

  /** Ширина строки в мм при текущем (или заданном) кегле. */
  textWidth(text: string, size = this.size): number {
    let units = 0;
    for (const ch of text) units += this.font.advance(this.font.glyph(ch.codePointAt(0)!) || this.font.glyph(0x20));
    return ((units / this.font.unitsPerEm) * size) / PT_PER_MM;
  }

  /** Высота строки в мм для кегля. */
  lineHeight(size = this.size): number {
    return (size * 1.18) / PT_PER_MM;
  }

  /** Перенос по словам в ширину; длинное слово режется по символам. */
  wrap(text: string, width: number, size = this.size): string[] {
    const lines: string[] = [];
    for (const paragraph of String(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.textWidth(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        if (this.textWidth(word, size) <= width) {
          line = word;
          continue;
        }
        let part = "";
        for (const ch of word) {
          if (this.textWidth(part + ch, size) > width && part) {
            lines.push(part);
            part = ch;
          } else part += ch;
        }
        line = part;
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, x: number, y: number, options: { align?: Align; size?: number } = {}): this {
    const size = options.size ?? this.size;
    if (!text) return this;
    const width = this.textWidth(text, size);
    const left = options.align === "right" ? x - width : options.align === "center" ? x - width / 2 : x;
    const hex = this.glyphs(text)
      .map((g) => g.toString(16).padStart(4, "0"))
      .join("");
    this.page.ops.push(`BT /F1 ${num(size)} Tf ${num(left * PT_PER_MM)} ${num((this.pageH - y) * PT_PER_MM)} Td <${hex}> Tj ET`);
    return this;
  }

  /** Несколько строк подряд; возвращает y под последней. */
  lines(lines: string[], x: number, y: number, options: { align?: Align; size?: number } = {}): number {
    const size = options.size ?? this.size;
    let at = y;
    for (const line of lines) {
      this.text(line, x, at, { ...options, size });
      at += this.lineHeight(size);
    }
    return at;
  }

  line(x1: number, y1: number, x2: number, y2: number): this {
    this.page.ops.push(
      `${num(x1 * PT_PER_MM)} ${num((this.pageH - y1) * PT_PER_MM)} m ${num(x2 * PT_PER_MM)} ${num((this.pageH - y2) * PT_PER_MM)} l S`,
    );
    return this;
  }

  /** Прямоугольник от левого верхнего угла: контур, заливка серым или оба. */
  rect(x: number, y: number, w: number, h: number, options: { fill?: number; stroke?: boolean } = {}): this {
    const stroke = options.stroke ?? options.fill === undefined;
    const box = `${num(x * PT_PER_MM)} ${num((this.pageH - y - h) * PT_PER_MM)} ${num(w * PT_PER_MM)} ${num(h * PT_PER_MM)} re`;
    if (options.fill !== undefined) {
      this.page.ops.push("q", `${num(options.fill)} g`, box, stroke ? "B" : "f", "Q");
    } else this.page.ops.push(box, "S");
    return this;
  }

  output(): Buffer {
    const objects: Array<string | Buffer> = [];
    const reserve = () => objects.push("");
    const set = (id: number, body: string | Buffer) => {
      objects[id - 1] = body;
    };
    const stream = (dict: string, data: Buffer) =>
      Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);

    const catalog = reserve();
    const pagesId = reserve();
    const type0 = reserve();
    const cidFont = reserve();
    const descriptor = reserve();
    const fontFile = reserve();
    const toUnicode = reserve();
    const info = reserve();

    const font = this.font;
    const scale = (v: number) => Math.round((v * 1000) / font.unitsPerEm);
    const gids = Array.from(this.used.keys()).sort((a, b) => a - b);
    // Подмножество шрифта по стандарту PDF помечается префиксом «ABCDEF+».
    let hash = 0;
    for (const g of gids) hash = (hash * 31 + g) >>> 0;
    const tag = Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + (Math.floor(hash / 26 ** i) % 26))).join("");
    const name = `${tag}+${font.postscriptName}`;

    // Только глифы этого документа: файл в десятки КБ вместо сотен.
    const subset = subsetTrueType(font, gids);
    set(fontFile, stream(`/Filter /FlateDecode /Length1 ${subset.length}`, deflateSync(subset)));
    set(
      descriptor,
      `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${font.bbox.map(scale).join(" ")}] /ItalicAngle 0 ` +
        `/Ascent ${scale(font.ascent)} /Descent ${scale(font.descent)} /CapHeight ${scale(font.capHeight)} /StemV 80 /FontFile2 ${fontFile} 0 R >>`,
    );
    const widths = gids.map((g) => `${g} [${scale(font.advance(g))}]`).join(" ");
    set(
      cidFont,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/FontDescriptor ${descriptor} 0 R /DW ${scale(font.advance(0))} /W [${widths}] /CIDToGIDMap /Identity >>`,
    );
    set(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`);

    const utf16 = (cp: number) => Buffer.from(String.fromCodePoint(cp), "utf16le").swap16().toString("hex").toUpperCase();
    const chunks: string[] = [];
    for (let i = 0; i < gids.length; i += 100) {
      const part = gids.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.map((g) => `<${g.toString(16).padStart(4, "0").toUpperCase()}> <${utf16(this.used.get(g)!)}>`).join("\n")}\nendbfchar`);
    }
    const cmap =
      "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n" +
      "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
      chunks.join("\n") +
      "\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    set(toUnicode, stream("/Filter /FlateDecode", deflateSync(Buffer.from(cmap, "latin1"))));

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const contentId = reserve();
      const pageId = reserve();
      set(contentId, stream("/Filter /FlateDecode", deflateSync(Buffer.from(page.ops.join("\n"), "latin1"))));
      set(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(this.pageW * PT_PER_MM)} ${num(this.pageH * PT_PER_MM)}] ` +
          `/Resources << /Font << /F1 ${type0} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      pageIds.push(pageId);
    }
    set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    set(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const text16 = (s: string) => `<FEFF${Buffer.from(s, "utf16le").swap16().toString("hex").toUpperCase()}>`;
    set(info, `<< /Producer (TasksFlow) ${this.title ? `/Title ${text16(this.title)} ` : ""}>>`);

    const parts: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    let offset = parts[0].length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const chunk = Buffer.concat([
        Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
        typeof body === "string" ? Buffer.from(body, "latin1") : body,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xref =
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    parts.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(parts);
  }
}

export type TableColumn = { width: number; align?: Align };

export type TableOptions = {
  x: number;
  y: number;
  columns: TableColumn[];
  head?: string[][];
  body: string[][];
  foot?: string[][];
  size: number;
  headSize?: number;
  padding?: number;
  headFill?: number;
  footFill?: number;
  /** Нижняя граница страницы: ниже — новая страница и снова шапка. */
  bottom: number;
  /** Верх новой страницы. */
  top: number;
};

/**
 * Таблица с сеткой: высота строки — по самой высокой ячейке, длинный
 * текст переносится. Возвращает y под таблицей.
 */
export function drawTable(doc: PdfDocument, options: TableOptions): number {
  const pad = options.padding ?? 1;
  const headSize = options.headSize ?? options.size;
  let y = options.y;

  const rowHeight = (cells: string[], size: number) =>
    Math.max(
      ...cells.map((cell, i) => doc.wrap(cell ?? "", options.columns[i].width - pad * 2, size).length * doc.lineHeight(size) + pad * 2),
    );

  const drawRow = (cells: string[], size: number, fill?: number) => {
    const h = rowHeight(cells, size);
    let x = options.x;
    cells.forEach((cell, i) => {
      const col = options.columns[i];
      doc.rect(x, y, col.width, h, fill === undefined ? {} : { fill, stroke: true });
      const lines = doc.wrap(cell ?? "", col.width - pad * 2, size);
      const tx = col.align === "right" ? x + col.width - pad : col.align === "center" ? x + col.width / 2 : x + pad;
      // Базовая линия первой строки — на высоте заглавной буквы от верха.
      doc.lines(lines, tx, y + pad + doc.lineHeight(size) * 0.78, { align: col.align ?? "left", size });
      x += col.width;
    });
    y += h;
  };

  const head = () => {
    for (const row of options.head ?? []) drawRow(row, headSize, options.headFill);
  };
  head();
  for (const row of options.body) {
    if (y + rowHeight(row, options.size) > options.bottom) {
      doc.addPage();
      y = options.top;
      head();
    }
    drawRow(row, options.size);
  }
  for (const row of options.foot ?? []) {
    if (y + rowHeight(row, options.size) > options.bottom) {
      doc.addPage();
      y = options.top;
    }
    drawRow(row, options.size, options.footFill);
  }
  return y;
}
