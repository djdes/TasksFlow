// Текст должностной инструкции из файла — общий для кабинета и Telegram-бота.
import {
  JOB_DESCRIPTION_MIN_CHARS,
  sourceFromFileName,
  type JobDescriptionSource,
} from "@shared/job-description";
import { docxToText, OfficeTextError, plainToText, tidyJobDescription, xlsxToText } from "./office-text";
import { pdfToText } from "./pdf-text";

/**
 * Имя файла приходит от busboy байтами в latin1: «Инструкция.docx» превращается
 * в «Ð˜Ð½…». Если в имени уже есть символы дальше latin1 — оно декодировано.
 */
export function fixFileName(name: string): string {
  if (Array.from(name).some((ch) => ch.charCodeAt(0) > 0xff)) return name;
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  return utf8.includes("\uFFFD") ? name : utf8;
}

export type ExtractedJobDescription = { ok: true; source: JobDescriptionSource; fileName: string | null; content: string } | { ok: false; message: string };

/** Текст инструкции из файла (Word, Excel, PDF, .txt). Ошибка — строкой для руководителя. */
export function extractJobDescriptionFile(buffer: Buffer, rawName: string): ExtractedJobDescription {
  try {
    const fileName = fixFileName(rawName).slice(0, 255);
    const source = sourceFromFileName(fileName);
    if (source === "legacy") {
      return { ok: false, message: "Это старый формат. Откройте файл в Word или Excel и сохраните как .docx или .xlsx." };
    }
    if (source !== "docx" && source !== "xlsx" && source !== "txt" && source !== "pdf") {
      return { ok: false, message: "Нужен файл Word (.docx), Excel (.xlsx) или PDF. Или вставьте текст во вкладке «Текст»." };
    }
    const text = source === "docx" ? docxToText(buffer)
      : source === "xlsx" ? xlsxToText(buffer)
      : source === "pdf" ? pdfToText(buffer)
      : plainToText(buffer);
    const content = tidyJobDescription(text);
    if (content.length < JOB_DESCRIPTION_MIN_CHARS) {
      return { ok: false, message: source === "pdf"
        ? "В PDF нет текста — похоже, это скан. Сохраните инструкцию из Word как .docx или вставьте текст."
        : "В файле почти нет текста. Проверьте, что это инструкция, а не скан." };
    }
    return { ok: true, source, fileName, content };
  } catch (err) {
    if (err instanceof OfficeTextError) return { ok: false, message: err.message };
    throw err;
  }
}

