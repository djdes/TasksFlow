/**
 * Текст из Word (.docx), Excel (.xlsx) и .txt — без npm-зависимостей.
 *
 * .docx и .xlsx — это ZIP с XML внутри. Нам нужен только текст: абзацы
 * документа и ячейки таблицы. Свой маленький разбор ZIP на встроенном zlib
 * вместо mammoth/xlsx: тех же 150 строк, без чужого кода с доступом к
 * файлам руководителей (тот же подход, что у PDF в server/billing/pdf).
 *
 * Файл — недоверенный вход: размер распаковки ограничен (zip-бомба), битый
 * архив и старые .doc/.xls дают понятную ошибку, а не 500.
 */

import { inflateRawSync } from "node:zlib";
import { JOB_DESCRIPTION_MAX_CHARS } from "@shared/job-description";

/** Ошибка с текстом для руководителя. */
export class OfficeTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeTextError";
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** Одна часть документа больше — это не текст, а картинки или бомба. */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function readEntries(buf: Buffer): ZipEntry[] {
  // Конец центрального каталога ищем с хвоста: за ним может быть комментарий до 64 КБ.
  const minStart = Math.max(0, buf.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new OfficeTextError("Файл повреждён или это не документ Word/Excel.");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new OfficeTextError("Файл повреждён: не удалось прочитать содержимое.");
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry, budget: { left: number }): string {
  const at = entry.localOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== LOCAL_SIGNATURE) {
    throw new OfficeTextError("Файл повреждён: не удалось прочитать содержимое.");
  }
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  let out: Buffer;
  if (entry.method === 0) {
    out = Buffer.from(data);
  } else if (entry.method === 8) {
    try {
      out = inflateRawSync(data, { maxOutputLength: Math.min(MAX_ENTRY_BYTES, budget.left) });
    } catch {
      throw new OfficeTextError("Файл слишком большой или повреждён.");
    }
  } else {
    throw new OfficeTextError("Файл сжат неизвестным способом — сохраните его заново в Word или Excel.");
  }
  budget.left -= out.length;
  if (budget.left <= 0) throw new OfficeTextError("Файл слишком большой.");
  return out.toString("utf8");
}

function unzip(buf: Buffer, wanted: (name: string) => boolean): Map<string, string> {
  if (buf.length < 22 || buf.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    throw new OfficeTextError("Это не файл Word (.docx) или Excel (.xlsx). Старые .doc и .xls сохраните заново в новом формате.");
  }
  const budget = { left: MAX_TOTAL_BYTES };
  const files = new Map<string, string>();
  for (const entry of readEntries(buf)) {
    if (wanted(entry.name)) files.set(entry.name, readEntry(buf, entry, budget));
  }
  return files;
}

export function decodeXmlText(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, code: string) => {
    switch (code) {
      case "lt": return "<";
      case "gt": return ">";
      case "amp": return "&";
      case "quot": return "\"";
      case "apos": return "'";
    }
    const n = code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}

/** Абзацы Word построчно; пункт списка — с «• », ячейки таблиц — отдельными строками. */
export function docxToText(buf: Buffer): string {
  const files = unzip(buf, (n) => n === "word/document.xml");
  const xml = files.get("word/document.xml");
  if (!xml) throw new OfficeTextError("В файле нет текста документа — это точно .docx?");
  const lines: string[] = [];
  for (const para of xml.split(/<\/w:p>/)) {
    const isList = /<w:numPr\b/.test(para);
    let line = "";
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\b[^>]*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para))) {
      if (m[1] !== undefined) line += decodeXmlText(m[1]);
      else if (m[0].startsWith("<w:tab")) line += "\t";
      else line += "\n";
    }
    for (const part of line.split("\n")) {
      const t = part.replace(/[ \t]+/g, " ").trim();
      if (t) lines.push((isList ? "• " : "") + t);
    }
  }
  return lines.join("\n");
}

/** Листы Excel: строка таблицы — строка текста, ячейки через « | ». */
export function xlsxToText(buf: Buffer): string {
  const files = unzip(buf, (n) =>
    n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml");
  if (sst) {
    for (const si of sst.split(/<\/si>/).slice(0, -1)) {
      let s = "";
      for (const t of Array.from(si.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g))) s += decodeXmlText(t[1]);
      shared.push(s);
    }
  }
  const sheetNames = Array.from((files.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g))
    .map((m) => decodeXmlText(m[1]));
  const sheets = Array.from(files.keys())
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1]));
  if (sheets.length === 0) throw new OfficeTextError("В файле нет листов — это точно .xlsx?");

  const out: string[] = [];
  sheets.forEach((name, index) => {
    const xml = files.get(name) ?? "";
    const rows: string[] = [];
    for (const row of Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))) {
      const cells: string[] = [];
      for (const c of Array.from(row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
        const attrs = c[1] ?? "";
        const inner = c[2] ?? "";
        const type = attrs.match(/\bt="([^"]*)"/)?.[1] ?? "";
        let value = "";
        if (type === "s") {
          const idx = Number(inner.match(/<v>([^<]*)<\/v>/)?.[1]);
          value = Number.isInteger(idx) ? shared[idx] ?? "" : "";
        } else if (type === "inlineStr") {
          for (const t of Array.from(inner.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g))) value += decodeXmlText(t[1]);
        } else if (type === "b") {
          value = inner.includes("<v>1</v>") ? "да" : "нет";
        } else {
          value = decodeXmlText(inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? "");
        }
        value = value.replace(/\s+/g, " ").trim();
        if (value) cells.push(value);
      }
      if (cells.length) rows.push(cells.join(" | "));
    }
    if (rows.length === 0) return;
    if (sheets.length > 1) out.push(`Лист «${sheetNames[index] ?? `Лист ${index + 1}`}»`);
    out.push(...rows);
  });
  return out.join("\n");
}

/** .txt: UTF-8, а если там кракозябры — Windows-1251 (Блокнот на старых Windows). */
export function plainToText(buf: Buffer): string {
  const utf8 = buf.toString("utf8").replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1251").decode(buf);
  } catch {
    return utf8;
  }
}

/** Общая чистка: без пустых строк подряд, без пробелов по краям, в пределах лимита. */
export function tidyJobDescription(text: string): string {
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > JOB_DESCRIPTION_MAX_CHARS ? cleaned.slice(0, JOB_DESCRIPTION_MAX_CHARS) : cleaned;
}
