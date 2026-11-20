/**
 * Текст из PDF — без npm-зависимостей, как .docx/.xlsx в office-text.ts.
 *
 * Хватает для PDF, сохранённых из Word, Google Docs, браузера и 1С: потоки
 * FlateDecode, потоки объектов (PDF 1.5+), шрифты с таблицей ToUnicode
 * (кириллица в Identity-H) и простые однобайтовые шрифты WinAnsi. Порядок —
 * по дереву страниц, строки — по смене вертикали в текстовой матрице.
 *
 * Сканы (картинки без текстового слоя) и защищённые паролем файлы честно
 * отклоняются: распознавания изображений здесь нет. Файл — недоверенный вход:
 * распаковка ограничена по объёму, число объектов — тоже.
 */

import { inflateSync } from "node:zlib";
import { OfficeTextError } from "./office-text";

const MAX_INFLATE_TOTAL = 60 * 1024 * 1024;
const MAX_STREAM = 20 * 1024 * 1024;
const MAX_OBJECTS = 50_000;
const MAX_PAGES = 200;

type PdfObject = { dict: string; stream: Buffer | null; raw: Buffer | null };
type CMap = { bytes: 1 | 2; map: Map<number, string> };
/** Шрифт: таблица ToUnicode и ширины глифов (тысячные кегля) — для пробелов между кусками. */
type Font = { cmap: CMap | null; width: (code: number) => number | null; twoByte: boolean };

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹",
  0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™",
  0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

class Reader {
  private objects = new Map<number, PdfObject>();
  private budget = MAX_INFLATE_TOTAL;

  constructor(private buf: Buffer) {
    this.parseObjects();
  }

  private inflate(data: Buffer): Buffer | null {
    try {
      const out = inflateSync(data, { maxOutputLength: Math.min(MAX_STREAM, this.budget) });
      this.budget -= out.length;
      if (this.budget <= 0) throw new OfficeTextError("PDF слишком большой.");
      return out;
    } catch (err) {
      if (err instanceof OfficeTextError) throw err;
      return null;
    }
  }

  private decode(dict: string, raw: Buffer): Buffer | null {
    const filter = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? "";
    if (!filter) return raw;
    const names = filter.match(/\/\w+/g) ?? [];
    if (names.length === 1 && (names[0] === "/FlateDecode" || names[0] === "/Fl")) return this.inflate(raw);
    return null; // DCT/JBIG2 и прочее — картинки, текста там нет
  }

  private parseObjects() {
    const text = this.buf.toString("latin1");
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(text))) {
      if (++count > MAX_OBJECTS) throw new OfficeTextError("PDF слишком сложный — сохраните инструкцию как .docx.");
      const num = Number(m[1]);
      const start = m.index + m[0].length;
      const streamAt = text.indexOf("stream", start);
      const endObj = text.indexOf("endobj", start);
      if (endObj < 0) break;
      if (streamAt >= 0 && streamAt < endObj && !/endstream$/.test(text.slice(streamAt - 3, streamAt + 6))) {
        const dict = text.slice(start, streamAt);
        let dataStart = streamAt + 6;
        if (text[dataStart] === "\r") dataStart++;
        if (text[dataStart] === "\n") dataStart++;
        const len = Number(dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)?.[1]);
        let dataEnd = Number.isFinite(len) && len > 0 && text.startsWith("endstream", text.indexOf("endstream", dataStart + len - 1)) && dataStart + len <= this.buf.length
          ? dataStart + len
          : text.indexOf("endstream", dataStart);
        if (dataEnd < 0) dataEnd = endObj;
        const raw = this.buf.subarray(dataStart, dataEnd);
        this.objects.set(num, { dict, stream: null, raw });
        re.lastIndex = text.indexOf("endobj", dataEnd) + 6;
        if (re.lastIndex < 6) break;
      } else {
        this.objects.set(num, { dict: text.slice(start, endObj), stream: null, raw: null });
        re.lastIndex = endObj + 6;
      }
    }
    // Потоки объектов (PDF 1.5+): внутри лежат словари страниц и шрифтов.
    for (const obj of Array.from(this.objects.values())) {
      if (!obj.raw || !/\/Type\s*\/ObjStm/.test(obj.dict)) continue;
      const data = this.decode(obj.dict, obj.raw);
      if (!data) continue;
      const n = Number(obj.dict.match(/\/N\s+(\d+)/)?.[1]);
      const first = Number(obj.dict.match(/\/First\s+(\d+)/)?.[1]);
      if (!Number.isFinite(n) || !Number.isFinite(first)) continue;
      const s = data.toString("latin1");
      const head = s.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < n && i * 2 + 1 < head.length; i++) {
        const num = head[i * 2];
        const off = first + head[i * 2 + 1];
        const next = i + 1 < n && (i + 1) * 2 + 1 < head.length ? first + head[(i + 1) * 2 + 1] : s.length;
        if (!this.objects.has(num)) this.objects.set(num, { dict: s.slice(off, next), stream: null, raw: null });
      }
    }
  }

  get(num: number): PdfObject | undefined {
    return this.objects.get(num);
  }

  streamOf(num: number): Buffer | null {
    const obj = this.objects.get(num);
    if (!obj?.raw) return null;
    if (!obj.stream) obj.stream = this.decode(obj.dict, obj.raw);
    return obj.stream;
  }

  /** Словарь по значению: «5 0 R» → тело объекта 5, «<< … >>» — как есть. */
  resolveDict(value: string | undefined): string {
    if (!value) return "";
    const ref = value.trim().match(/^(\d+)\s+\d+\s+R/);
    return ref ? this.get(Number(ref[1]))?.dict ?? "" : value;
  }

  isEncrypted(): boolean {
    return /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(this.buf.toString("latin1", Math.max(0, this.buf.length - 4096)))
      || Array.from(this.objects.values()).some((o) => /\/Type\s*\/XRef/.test(o.dict) && /\/Encrypt\b/.test(o.dict));
  }

  /** Страницы по дереву /Pages; если дерево не нашлось — все /Type /Page по номеру. */
  pages(): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    const walk = (num: number) => {
      if (seen.has(num) || out.length >= MAX_PAGES) return;
      seen.add(num);
      const dict = this.get(num)?.dict ?? "";
      if (/\/Type\s*\/Page\b(?!s)/.test(dict)) { out.push(num); return; }
      const kids = dict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1] ?? "";
      for (const k of Array.from(kids.matchAll(/(\d+)\s+\d+\s+R/g))) walk(Number(k[1]));
    };
    for (const obj of Array.from(this.objects.values())) {
      if (/\/Type\s*\/Catalog/.test(obj.dict)) {
        const pagesRef = obj.dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/)?.[1];
        if (pagesRef) walk(Number(pagesRef));
        if (out.length) return out;
      }
    }
    return Array.from(this.objects)
      .filter(([, o]) => /\/Type\s*\/Page\b(?!s)/.test(o.dict))
      .map(([n]) => n)
      .sort((a, b) => a - b)
      .slice(0, MAX_PAGES);
  }
}

/** Значение ключа словаря: ссылка «N 0 R», вложенный словарь «<< … >>» или массив. */
function dictValue(dict: string, key: string): string | undefined {
  const at = dict.search(new RegExp(`/${key}(?![A-Za-z0-9])`));
  if (at < 0) return undefined;
  let i = at + key.length + 1;
  while (i < dict.length && /\s/.test(dict[i])) i++;
  if (dict.startsWith("<<", i)) {
    let depth = 0;
    for (let j = i; j < dict.length - 1; j++) {
      if (dict.startsWith("<<", j)) { depth++; j++; } else if (dict.startsWith(">>", j)) { depth--; j++; if (depth === 0) return dict.slice(i, j + 1); }
    }
    return dict.slice(i);
  }
  if (dict[i] === "[") {
    let depth = 0;
    for (let j = i; j < dict.length; j++) {
      if (dict[j] === "[") depth++;
      else if (dict[j] === "]" && --depth === 0) return dict.slice(i, j + 1);
    }
    return dict.slice(i);
  }
  return dict.slice(i).match(/^(\d+\s+\d+\s+R|\/\w+|[\d.]+)/)?.[1];
}

const utf16 = (hex: string): string => {
  let s = "";
  for (let i = 0; i + 3 < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return s;
};

export function parseToUnicode(cmap: string): CMap {
  const map = new Map<number, string>();
  let bytes: 1 | 2 = 1;
  const range = cmap.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
  if (range && range[1].length >= 4) bytes = 2;
  for (const block of Array.from(cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))) {
    for (const m of Array.from(block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g))) {
      if (m[1].length >= 4) bytes = 2;
      map.set(parseInt(m[1], 16), utf16(m[2]));
    }
  }
  for (const block of Array.from(cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))) {
    for (const m of Array.from(block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g))) {
      const lo = parseInt(m[1], 16);
      const hi = Math.min(parseInt(m[2], 16), lo + 0xffff);
      if (m[1].length >= 4) bytes = 2;
      if (m[3].startsWith("[")) {
        const items = Array.from(m[3].matchAll(/<([0-9a-fA-F]+)>/g)).map((x) => utf16(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      } else {
        const base = m[3].slice(1, -1);
        const head = base.slice(0, -4);
        const last = parseInt(base.slice(-4) || "0", 16);
        for (let c = lo; c <= hi; c++) map.set(c, utf16(head) + String.fromCharCode(last + (c - lo)));
      }
    }
  }
  return { bytes, map };
}

/** Ширина куска текста в тысячных кегля; без таблицы ширин — по полкегля на знак. */
function runWidth(bytes: number[], font: Font | undefined): number {
  const two = font?.twoByte ?? false;
  let w = 0;
  for (let i = 0; i < bytes.length; i += two ? 2 : 1) {
    const code = two ? (bytes[i] << 8) | (bytes[i + 1] ?? 0) : bytes[i];
    w += font?.width(code) ?? 500;
  }
  return w;
}

/** Массив /W CID-шрифта: «c [w1 w2 …]» и «c_first c_last w». */
function parseCidWidths(w: string, dw: number): (code: number) => number | null {
  const map = new Map<number, number>();
  const ranges: Array<[number, number, number]> = [];
  const toks = w.replace(/\[/g, " [ ").replace(/\]/g, " ] ").trim().split(/\s+/);
  for (let i = 0; i < toks.length; ) {
    const first = Number(toks[i]);
    if (toks[i + 1] === "[") {
      let j = i + 2;
      let c = first;
      while (j < toks.length && toks[j] !== "]") map.set(c++, Number(toks[j++]));
      i = j + 1;
    } else if (i + 2 < toks.length) {
      ranges.push([first, Number(toks[i + 1]), Number(toks[i + 2])]);
      i += 3;
    } else break;
  }
  return (code) => map.get(code) ?? ranges.find(([a, b]) => code >= a && code <= b)?.[2] ?? dw;
}

function loadFont(reader: Reader, fdict: string): Font {
  const tu = fdict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
  const cmapBuf = tu ? reader.streamOf(Number(tu)) : null;
  const cmap = cmapBuf ? parseToUnicode(cmapBuf.toString("latin1")) : null;
  if (/\/Subtype\s*\/Type0/.test(fdict)) {
    const desc = dictValue(fdict, "DescendantFonts") ?? "";
    const ref = desc.match(/(\d+)\s+\d+\s+R/)?.[1];
    const cid = ref ? reader.get(Number(ref))?.dict ?? "" : desc;
    const dw = Number(cid.match(/\/DW\s+(\d+)/)?.[1] ?? 1000);
    let w = dictValue(cid, "W") ?? "";
    const wRef = w.match(/^(\d+)\s+\d+\s+R$/)?.[1];
    if (wRef) w = reader.get(Number(wRef))?.dict ?? "";
    return { cmap, width: parseCidWidths(w.replace(/^\s*\[|\]\s*$/g, ""), dw), twoByte: true };
  }
  const firstChar = Number(fdict.match(/\/FirstChar\s+(\d+)/)?.[1] ?? 0);
  let widths = dictValue(fdict, "Widths") ?? "";
  const wRef = widths.match(/^(\d+)\s+\d+\s+R$/)?.[1];
  if (wRef) widths = reader.get(Number(wRef))?.dict ?? "";
  const list = (widths.match(/-?[\d.]+/g) ?? []).map(Number);
  return { cmap, width: (code) => (list.length ? list[code - firstChar] ?? null : null), twoByte: cmap?.bytes === 2 };
}

function decodeBytes(bytes: number[], font: Font | undefined): string {
  const cmap = font?.cmap;
  let out = "";
  if (cmap && cmap.bytes === 2) {
    for (let i = 0; i + 1 < bytes.length; i += 2) out += cmap.map.get((bytes[i] << 8) | bytes[i + 1]) ?? "";
    return out;
  }
  for (const b of bytes) {
    const mapped = cmap?.map.get(b);
    if (mapped !== undefined) out += mapped;
    else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else if (WIN_ANSI_HIGH[b]) out += WIN_ANSI_HIGH[b];
    else if (b >= 0xa0) out += String.fromCharCode(b);
    else if (b === 0x09) out += " ";
  }
  return out;
}

type Token = { t: "str"; v: number[] } | { t: "num"; v: number } | { t: "name"; v: string } | { t: "arr"; v: Token[] } | { t: "op"; v: string };

/** Лексер содержимого страницы: строки (литеральные и hex), числа, имена, массивы, операторы. */
function tokens(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = s.length;
  const readString = (): number[] => {
    const bytes: number[] = [];
    let depth = 1;
    i++;
    while (i < n && depth > 0) {
      const c = s[i];
      if (c === "\\") {
        const d = s[i + 1];
        i += 2;
        if (d === "n") bytes.push(10); else if (d === "r") bytes.push(13); else if (d === "t") bytes.push(9);
        else if (d === "b") bytes.push(8); else if (d === "f") bytes.push(12);
        else if (d === "\r" || d === "\n") { if (d === "\r" && s[i] === "\n") i++; }
        else if (d >= "0" && d <= "7") {
          let oct = d;
          while (oct.length < 3 && s[i] >= "0" && s[i] <= "7") oct += s[i++];
          bytes.push(parseInt(oct, 8) & 0xff);
        } else if (d !== undefined) bytes.push(d.charCodeAt(0));
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") { depth--; if (depth === 0) { i++; break; } }
      bytes.push(c.charCodeAt(0) & 0xff);
      i++;
    }
    return bytes;
  };
  const readHex = (): number[] => {
    const end = s.indexOf(">", i);
    const hex = s.slice(i + 1, end < 0 ? n : end).replace(/[^0-9a-fA-F]/g, "");
    i = end < 0 ? n : end + 1;
    const bytes: number[] = [];
    for (let j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.slice(j, j + 2).padEnd(2, "0"), 16));
    return bytes;
  };
  const stack: Token[][] = [];
  const emit = (tok: Token) => {
    if (stack.length) stack[stack.length - 1].push(tok);
    else out.push(tok);
  };
  while (i < n) {
    const c = s[i];
    if (c === "%") { const e = s.indexOf("\n", i); i = e < 0 ? n : e; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { emit({ t: "str", v: readString() }); continue; }
    if (c === "<" && s[i + 1] !== "<") { emit({ t: "str", v: readHex() }); continue; }
    if (c === "<" || c === ">") { i += 2; continue; } // словари внутри содержимого (BDC) не нужны
    if (c === "[") { stack.push([]); i++; continue; }
    if (c === "]") { const arr = stack.pop() ?? []; i++; emit({ t: "arr", v: arr }); continue; }
    if (c === "/") {
      const m = s.slice(i + 1).match(/^[^\s/[\]()<>{}%]*/)![0];
      i += 1 + m.length;
      emit({ t: "name", v: m });
      continue;
    }
    const num = s.slice(i).match(/^[+-]?(\d+\.?\d*|\.\d+)/);
    if (num) { i += num[0].length; emit({ t: "num", v: Number(num[0]) }); continue; }
    const op = s.slice(i).match(/^[A-Za-z'"*]+/);
    if (op) {
      i += op[0].length;
      // Встроенная картинка: от ID до EI — двоичные данные, пропускаем.
      if (op[0] === "ID") { const e = s.indexOf("EI", i); i = e < 0 ? n : e + 2; continue; }
      emit({ t: "op", v: op[0] });
      continue;
    }
    i++;
  }
  return out;
}

function pageText(reader: Reader, pageNum: number): string {
  // Ресурсы могут наследоваться от родительских узлов дерева страниц.
  let resources = "";
  let node = reader.get(pageNum)?.dict ?? "";
  for (let hops = 0; hops < 20 && node; hops++) {
    const res = dictValue(node, "Resources");
    if (res) { resources = reader.resolveDict(res); break; }
    const parent = node.match(/\/Parent\s+(\d+)\s+\d+\s+R/)?.[1];
    node = parent ? reader.get(Number(parent))?.dict ?? "" : "";
  }
  const fontDict = reader.resolveDict(dictValue(resources, "Font"));
  const fonts = new Map<string, Font>();
  for (const m of Array.from(fontDict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g))) {
    fonts.set(m[1], loadFont(reader, reader.get(Number(m[2]))?.dict ?? ""));
  }

  const pageDict = reader.get(pageNum)?.dict ?? "";
  const contents = dictValue(pageDict, "Contents") ?? "";
  const parts: string[] = [];
  for (const ref of Array.from(contents.matchAll(/(\d+)\s+\d+\s+R/g))) {
    const data = reader.streamOf(Number(ref[1]));
    if (data) parts.push(data.toString("latin1"));
  }

  const lines: string[] = [];
  let line = "";
  let font: Font | undefined;
  let size = 12;
  let scale = 1;
  let lineX = 0;
  let curX = 0;
  let y: number | null = null;
  const ops: Token[] = [];
  const newline = () => { if (line.trim()) lines.push(line.replace(/\s+/g, " ").trim()); line = ""; };
  // Новое начало строки текста: другая вертикаль — новая строка; та же — пробел,
  // только если между концом прошлого куска и этим заметный зазор (Chromium и
  // Word режут слова на куски по несколько букв).
  const moveTo = (nx: number, ny: number) => {
    if (y !== null && Math.abs(ny - y) > 0.5 * scale) newline();
    else if (line && !line.endsWith(" ") && nx - curX > 0.2 * size * scale) line += " ";
    y = ny;
    lineX = nx;
    curX = nx;
  };
  const show = (bytes: number[]) => {
    line += decodeBytes(bytes, font);
    curX += (runWidth(bytes, font) / 1000) * size * scale;
  };
  for (const tok of tokens(parts.join("\n"))) {
    if (tok.t !== "op") { ops.push(tok); if (ops.length > 64) ops.shift(); continue; }
    const args = ops.splice(0);
    const num = (k: number) => { const a = args[args.length - k]; return a && a.t === "num" ? a.v : 0; };
    switch (tok.v) {
      case "Tf": {
        const name = args.find((a) => a.t === "name");
        font = name && name.t === "name" ? fonts.get(name.v) : undefined;
        size = Math.abs(num(1)) || size;
        break;
      }
      case "Tj": case "'": case "\"": {
        if (tok.v !== "Tj") { newline(); curX = lineX; }
        const str = [...args].reverse().find((a) => a.t === "str");
        if (str && str.t === "str") show(str.v);
        break;
      }
      case "TJ": {
        const arr = args.find((a) => a.t === "arr");
        if (arr && arr.t === "arr") {
          for (const el of arr.v) {
            if (el.t === "str") show(el.v);
            else if (el.t === "num") {
              curX -= (el.v / 1000) * size * scale;
              if (el.v < -200 && line && !line.endsWith(" ")) line += " ";
            }
          }
        }
        break;
      }
      case "Td": case "TD": moveTo(lineX + num(2) * scale, (y ?? 0) + num(1) * scale); break;
      case "Tm": {
        const a = args.filter((x) => x.t === "num").map((x) => (x as { v: number }).v);
        if (a.length >= 6) {
          scale = Math.hypot(a[0], a[1]) || 1;
          moveTo(a[4], a[5]);
        }
        break;
      }
      case "T*": newline(); curX = lineX; break;
    }
  }
  newline();
  return lines.join("\n");
}

/** Доля «нормальных» символов: кириллица, латиница, цифры, пунктуация, пробелы. */
function readable(text: string): number {
  if (!text) return 0;
  const ok = text.match(/[A-Za-z\u0400-\u04FF0-9\s.,;:!?«»"'()\-–—%№/+*=•…°]/g)?.length ?? 0;
  return ok / text.length;
}

export function pdfToText(buf: Buffer): string {
  if (buf.length < 8 || buf.toString("latin1", 0, 5) !== "%PDF-") {
    throw new OfficeTextError("Это не PDF. Нужен файл Word (.docx), Excel (.xlsx) или PDF.");
  }
  const reader = new Reader(buf);
  if (reader.isEncrypted()) throw new OfficeTextError("PDF защищён паролем. Снимите защиту или вставьте текст.");
  const text = reader.pages().map((p) => pageText(reader, p)).filter(Boolean).join("\n");
  // Шрифт без таблицы ToUnicode даёт кракозябры вместо кириллицы — честно говорим.
  if (text.replace(/\s/g, "").length >= 20 && readable(text) < 0.85) {
    throw new OfficeTextError("Не получилось прочитать текст из этого PDF. Сохраните инструкцию как .docx или вставьте текст.");
  }
  return text;
}
