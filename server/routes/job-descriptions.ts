// Должностная инструкция сотрудника → задачи (shared/job-description.ts,
// server/job-description/*). Загрузка — текстом или файлом Word/Excel;
// разбирает диспетчер Ralph через шлюз ProjectsFlow, задачи создаёт сервер.
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import {
  JOB_DESCRIPTION_MAX_FILE_BYTES,
  JOB_DESCRIPTION_MIN_CHARS,
  sourceFromFileName,
  type JobDescriptionSource,
} from "@shared/job-description";
import { storage } from "../storage";
import { logger } from "../logger";
import { requireUserManager, getCompanyIdFromReq } from "./common";
import { canTouchUser, findCompanyUser, NOT_YOUR_PEOPLE } from "./users";
import { docxToText, OfficeTextError, plainToText, tidyJobDescription, xlsxToText } from "../job-description/office-text";
import {
  isGatewayConfigured,
  listJobDescriptionStates,
  retryJobDescription,
  runJobDescription,
  saveJobDescription,
  toState,
} from "../job-description/service";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: JOB_DESCRIPTION_MAX_FILE_BYTES, files: 1, fields: 4 },
});

/** multer в JSON: большой файл — 413 с текстом, а не HTML-страница ошибки. */
function acceptFile(req: Request, res: Response, next: NextFunction) {
  memoryUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Файл больше 5 МБ. Сохраните инструкцию без картинок или вставьте текстом.", field: "file" });
    }
    return res.status(400).json({ message: "Не удалось принять файл", field: "file" });
  });
}

/** Не больше 30 инструкций в час на компанию: шлюз общий, а инструкция — не чат. */
const LIMIT_PER_HOUR = 30;
const submissions = new Map<number, number[]>();
export function allowSubmission(companyId: number, nowMs = Date.now()): boolean {
  const hourAgo = nowMs - 3600_000;
  const recent = (submissions.get(companyId) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= LIMIT_PER_HOUR) {
    submissions.set(companyId, recent);
    return false;
  }
  recent.push(nowMs);
  submissions.set(companyId, recent);
  return true;
}

/**
 * Имя файла приходит от busboy байтами в latin1: «Инструкция.docx» превращается
 * в «Ð˜Ð½…». Если в имени уже есть символы дальше latin1 — оно декодировано.
 */
export function fixFileName(name: string): string {
  if (Array.from(name).some((ch) => ch.charCodeAt(0) > 0xff)) return name;
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  return utf8.includes("\uFFFD") ? name : utf8;
}

/** Текст инструкции из запроса: файл или поле text. Ошибка — строкой для руководителя. */
export function extractJobDescription(file: Express.Multer.File | undefined, rawText: unknown):
  { ok: true; source: JobDescriptionSource; fileName: string | null; content: string } | { ok: false; message: string } {
  try {
    if (file) {
      const fileName = fixFileName(file.originalname).slice(0, 255);
      const source = sourceFromFileName(fileName);
      if (source === "legacy") {
        return { ok: false, message: "Это старый формат. Откройте файл в Word или Excel и сохраните как .docx или .xlsx." };
      }
      if (!source || source === "text") {
        return { ok: false, message: "Нужен файл Word (.docx) или Excel (.xlsx). Или вставьте текст во вкладке «Текст»." };
      }
      const text = source === "docx" ? docxToText(file.buffer) : source === "xlsx" ? xlsxToText(file.buffer) : plainToText(file.buffer);
      const content = tidyJobDescription(text);
      if (content.length < JOB_DESCRIPTION_MIN_CHARS) {
        return { ok: false, message: "В файле почти нет текста. Проверьте, что это инструкция, а не скан." };
      }
      return { ok: true, source, fileName, content };
    }
    const content = tidyJobDescription(typeof rawText === "string" ? rawText : "");
    if (content.length < JOB_DESCRIPTION_MIN_CHARS) {
      return { ok: false, message: "Вставьте текст инструкции — хотя бы пару обязанностей." };
    }
    return { ok: true, source: "text", fileName: null, content };
  } catch (err) {
    if (err instanceof OfficeTextError) return { ok: false, message: err.message };
    throw err;
  }
}

export function registerJobDescriptionRoutes(app: Express): void {
  // Состояния инструкций для «Сотрудников»: статус, сколько задач создано.
  app.get("/api/job-descriptions", requireUserManager, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) return res.status(400).json({ message: "Company не определена" });
      const states = await listJobDescriptionStates(companyId);
      const visible = [];
      for (const state of states) {
        const target = await storage.getUserById(state.userId);
        if (target && target.companyId === companyId && (await canTouchUser(req, target))) visible.push(state);
      }
      res.json({ gatewayReady: isGatewayConfigured(), items: visible });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] список не загрузился");
      res.status(500).json({ message: "Не удалось загрузить инструкции" });
    }
  });

  app.post("/api/users/:id/job-description", requireUserManager, acceptFile, async (req, res) => {
    try {
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target || !target.companyId) return res.status(404).json({ message: "Пользователь не найден" });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });

      const parsed = extractJobDescription(req.file, (req.body as { text?: unknown } | undefined)?.text);
      if (!parsed.ok) return res.status(400).json({ message: parsed.message, field: req.file ? "file" : "text" });
      if (!allowSubmission(target.companyId)) {
        return res.status(429).json({ message: "Слишком много инструкций за час. Попробуйте позже." });
      }

      const row = await saveJobDescription({
        userId: target.id,
        companyId: target.companyId,
        createdBy: req.session.userId ?? null,
        source: parsed.source,
        fileName: parsed.fileName,
        content: parsed.content,
      });
      // Не ждём: разбор идёт минуту-две, статус кабинет спрашивает сам.
      void runJobDescription(target.id);
      res.status(202).json({ gatewayReady: isGatewayConfigured(), state: toState(row), chars: parsed.content.length });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] не сохранили");
      res.status(500).json({ message: "Не удалось сохранить инструкцию" });
    }
  });

  app.post("/api/users/:id/job-description/retry", requireUserManager, async (req, res) => {
    try {
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const row = await retryJobDescription(target.id);
      if (!row) return res.status(404).json({ message: "Инструкции нет" });
      void runJobDescription(target.id);
      res.json({ gatewayReady: isGatewayConfigured(), state: toState(row) });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] повтор не прошёл");
      res.status(500).json({ message: "Не удалось повторить" });
    }
  });
}
