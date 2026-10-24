/**
 * Минимальный разбор TrueType: ровно то, что нужно, чтобы вшить шрифт в
 * PDF (server/billing/pdf/pdf.ts) — метрики, ширины глифов и таблица
 * «символ → глиф». Без зависимостей: шрифт читается один раз на процесс.
 */
export type TrueTypeFont = {
  data: Buffer;
  postscriptName: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  bbox: [number, number, number, number];
  numGlyphs: number;
  /** Ширина глифа в единицах шрифта. */
  advance(gid: number): number;
  /** Глиф символа; 0 — нет в шрифте (.notdef). */
  glyph(codePoint: number): number;
};

type Tables = Map<string, { offset: number; length: number }>;

function readTables(data: Buffer): Tables {
  const version = data.readUInt32BE(0);
  // 0x00010000 — TrueType, «true» — старый Mac. CFF (OTTO) в PDF так не вшить.
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error("Нужен шрифт TrueType (.ttf)");
  const count = data.readUInt16BE(4);
  const tables: Tables = new Map();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    tables.set(data.toString("latin1", at, at + 4), { offset: data.readUInt32BE(at + 8), length: data.readUInt32BE(at + 12) });
  }
  return tables;
}

function need(tables: Tables, tag: string) {
  const t = tables.get(tag);
  if (!t) throw new Error(`В шрифте нет таблицы ${tag}`);
  return t;
}

/** cmap: формат 12 (вся Юникод-плоскость) или 4 (BMP), платформа Windows/Unicode. */
function readCmap(data: Buffer, base: number): Map<number, number> {
  const map = new Map<number, number>();
  const count = data.readUInt16BE(base + 2);
  const subtables: Array<{ platform: number; encoding: number; offset: number }> = [];
  for (let i = 0; i < count; i++) {
    const at = base + 4 + i * 8;
    subtables.push({ platform: data.readUInt16BE(at), encoding: data.readUInt16BE(at + 2), offset: base + data.readUInt32BE(at + 4) });
  }
  const pick =
    subtables.find((s) => s.platform === 3 && s.encoding === 10 && data.readUInt16BE(s.offset) === 12) ??
    subtables.find((s) => s.platform === 0 && data.readUInt16BE(s.offset) === 12) ??
    subtables.find((s) => s.platform === 3 && s.encoding === 1 && data.readUInt16BE(s.offset) === 4) ??
    subtables.find((s) => s.platform === 0 && data.readUInt16BE(s.offset) === 4);
  if (!pick) throw new Error("В шрифте нет Юникод-таблицы cmap");
  const at = pick.offset;
  if (data.readUInt16BE(at) === 12) {
    const groups = data.readUInt32BE(at + 12);
    for (let g = 0; g < groups; g++) {
      const p = at + 16 + g * 12;
      const start = data.readUInt32BE(p);
      const end = data.readUInt32BE(p + 4);
      const first = data.readUInt32BE(p + 8);
      for (let cp = start; cp <= end; cp++) map.set(cp, first + (cp - start));
    }
    return map;
  }
  const segX2 = data.readUInt16BE(at + 6);
  const ends = at + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = data.readUInt16BE(ends + s * 2);
    const start = data.readUInt16BE(starts + s * 2);
    const delta = data.readInt16BE(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const range = data.readUInt16BE(rangeAt);
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      let gid: number;
      if (range === 0) gid = (cp + delta) & 0xffff;
      else {
        const raw = data.readUInt16BE(rangeAt + range + (cp - start) * 2);
        gid = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (gid) map.set(cp, gid);
    }
  }
  return map;
}

function readPostscriptName(data: Buffer, tables: Tables): string | null {
  const t = tables.get("name");
  if (!t) return null;
  const count = data.readUInt16BE(t.offset + 2);
  const strings = t.offset + data.readUInt16BE(t.offset + 4);
  for (let i = 0; i < count; i++) {
    const at = t.offset + 6 + i * 12;
    if (data.readUInt16BE(at + 6) !== 6) continue;
    const platform = data.readUInt16BE(at);
    const length = data.readUInt16BE(at + 8);
    const offset = strings + data.readUInt16BE(at + 10);
    const raw = data.subarray(offset, offset + length);
    // Windows — UTF-16BE, Mac — однобайтовая латиница.
    const name = platform === 3 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
    const clean = name.replace(/[^A-Za-z0-9_-]/g, "");
    if (clean) return clean;
  }
  return null;
}

export function parseTrueType(data: Buffer): TrueTypeFont {
  const tables = readTables(data);
  const head = need(tables, "head").offset;
  const hhea = need(tables, "hhea").offset;
  const maxp = need(tables, "maxp").offset;
  const hmtx = need(tables, "hmtx").offset;
  const unitsPerEm = data.readUInt16BE(head + 18);
  const bbox: [number, number, number, number] = [
    data.readInt16BE(head + 36),
    data.readInt16BE(head + 38),
    data.readInt16BE(head + 40),
    data.readInt16BE(head + 42),
  ];
  const ascent = data.readInt16BE(hhea + 4);
  const descent = data.readInt16BE(hhea + 6);
  const metrics = data.readUInt16BE(hhea + 34);
  const numGlyphs = data.readUInt16BE(maxp + 4);
  const os2 = tables.get("OS/2");
  const capHeight = os2 && data.readUInt16BE(os2.offset) >= 2 && os2.length >= 90 ? data.readInt16BE(os2.offset + 88) : Math.round(ascent * 0.7);
  const cmap = readCmap(data, need(tables, "cmap").offset);
  const lastAdvance = data.readUInt16BE(hmtx + (metrics - 1) * 4);
  return {
    data,
    postscriptName: readPostscriptName(data, tables) ?? "EmbeddedFont",
    unitsPerEm,
    ascent,
    descent,
    capHeight,
    bbox,
    numGlyphs,
    advance: (gid) => (gid < metrics ? data.readUInt16BE(hmtx + gid * 4) : lastAdvance),
    glyph: (cp) => cmap.get(cp) ?? 0,
  };
}

/** Таблицы, которые нужны для вывода глифов в PDF; остальное (GSUB, GPOS, kern…) не нужно. */
const KEEP_TABLES = ["head", "hhea", "maxp", "hmtx", "loca", "glyf", "cmap", "name", "OS/2", "post", "cvt ", "fpgm", "prep", "gasp"];

function checksum(buf: Buffer): number {
  let sum = 0;
  const padded = buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]) : buf;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/**
 * Подмножество шрифта: глифы, которых нет в документе, становятся пустыми,
 * номера глифов не меняются (в PDF — CIDToGIDMap /Identity). Составные
 * глифы тянут свои части. Шрифт в 750 КБ превращается в десятки КБ.
 */
export function subsetTrueType(font: TrueTypeFont, used: Iterable<number>): Buffer {
  const data = font.data;
  const tables = readTables(data);
  const head = need(tables, "head");
  const loca = need(tables, "loca");
  const glyf = need(tables, "glyf");
  const longLoca = data.readInt16BE(head.offset + 50) === 1;
  const offsetOf = (gid: number) =>
    longLoca ? data.readUInt32BE(loca.offset + gid * 4) : data.readUInt16BE(loca.offset + gid * 2) * 2;

  const keep = new Set<number>([0]);
  const queue = [0, ...Array.from(used)];
  while (queue.length) {
    const gid = queue.pop()!;
    if (gid >= font.numGlyphs) continue;
    keep.add(gid);
    const start = offsetOf(gid);
    const end = offsetOf(gid + 1);
    if (end <= start) continue;
    const at = glyf.offset + start;
    if (data.readInt16BE(at) >= 0) continue;
    // Составной глиф: ссылки на другие глифы после заголовка в 10 байт.
    let p = at + 10;
    for (;;) {
      const flags = data.readUInt16BE(p);
      const component = data.readUInt16BE(p + 2);
      if (!keep.has(component)) queue.push(component);
      p += 4 + (flags & 0x0001 ? 4 : 2);
      if (flags & 0x0008) p += 2;
      else if (flags & 0x0040) p += 4;
      else if (flags & 0x0080) p += 8;
      if (!(flags & 0x0020)) break;
    }
  }

  const pieces: Buffer[] = [];
  const newLoca = Buffer.alloc((font.numGlyphs + 1) * 4);
  let size = 0;
  for (let gid = 0; gid < font.numGlyphs; gid++) {
    newLoca.writeUInt32BE(size, gid * 4);
    if (!keep.has(gid)) continue;
    const start = offsetOf(gid);
    const end = offsetOf(gid + 1);
    if (end <= start) continue;
    const piece = data.subarray(glyf.offset + start, glyf.offset + end);
    const padded = piece.length % 4 ? Buffer.concat([piece, Buffer.alloc(4 - (piece.length % 4))]) : piece;
    pieces.push(padded);
    size += padded.length;
  }
  newLoca.writeUInt32BE(size, font.numGlyphs * 4);

  const out = new Map<string, Buffer>();
  for (const tag of KEEP_TABLES) {
    const t = tables.get(tag);
    if (!t) continue;
    out.set(tag, Buffer.from(data.subarray(t.offset, t.offset + t.length)));
  }
  out.set("glyf", Buffer.concat(pieces));
  out.set("loca", newLoca);
  const newHead = out.get("head")!;
  newHead.writeInt16BE(1, 50); // loca — длинный формат
  newHead.writeUInt32BE(0, 8); // checkSumAdjustment считаем ниже

  const tags = Array.from(out.keys()).sort();
  const dirSize = 12 + tags.length * 16;
  const header = Buffer.alloc(dirSize);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(tags.length, 4);
  const entry = 2 ** Math.floor(Math.log2(tags.length));
  header.writeUInt16BE(entry * 16, 6);
  header.writeUInt16BE(Math.log2(entry), 8);
  header.writeUInt16BE(tags.length * 16 - entry * 16, 10);
  const bodies: Buffer[] = [];
  let offset = dirSize;
  tags.forEach((tag, i) => {
    const body = out.get(tag)!;
    const at = 12 + i * 16;
    header.write(tag, at, 4, "latin1");
    header.writeUInt32BE(checksum(body), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(body.length, at + 12);
    const padded = body.length % 4 ? Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]) : body;
    bodies.push(padded);
    offset += padded.length;
  });
  const file = Buffer.concat([header, ...bodies]);
  const headAt = file.readUInt32BE(12 + tags.indexOf("head") * 16 + 8);
  file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headAt + 8);
  return file;
}
