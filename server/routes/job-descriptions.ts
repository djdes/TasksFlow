// Должностная инструкция сотрудника → задачи (shared/job-description.ts,
// server/job-description/*). Инструкция — текстом или файлом Word, Excel, PDF;
// без неё — «по должности» или «как у коллеги». Разбирает диспетчер Ralph через
// шлюз ProjectsFlow; руководитель проверяет предложения и создаёт выбранные.
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  JOB_DESCRIPTION_MAX_FILE_BYTES,
  JOB_DESCRIPTION_MIN_CHARS,
  JOB_POSITION_MIN_CHARS,
} from "@shared/job-description";
import { storage } from "../storage";
import { logger } from "../logger";
import { requireRoot, requireUserManager, getCompanyIdFromReq } from "./common";
import { canTouchUser, findCompanyUser, NOT_YOUR_PEOPLE } from "./users";
import { tidyJobDescription } from "../job-description/office-text";
import { extractJobDescriptionFile, type ExtractedJobDescription } from "../job-description/extract";

export { extractJobDescriptionFile, fixFileName } from "../job-description/extract";
import {
  applyJobDescription,
  findPositionTemplate,
  getJobDescription,
  getJobDescriptionDetails,
  isGatewayConfigured,
  jobDescriptionFeedback,
  listJobDescriptionStates,
  retryJobDescription,
  runJobDescription,
  saveJobDescription,
  toState,
} from "../job-description/service";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: JOB_DESCRIPTION_MAX_FILE_BYTES, files: 1, fields: 8 },
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

/** Текст инструкции из запроса: файл или поле text. Ошибка — строкой для руководителя. */
export function extractJobDescription(file: Express.Multer.File | undefined, rawText: unknown): ExtractedJobDescription {
  if (file) return extractJobDescriptionFile(file.buffer, file.originalname);
  const content = tidyJobDescription(typeof rawText === "string" ? rawText : "");
  if (content.length < JOB_DESCRIPTION_MIN_CHARS) {
    return { ok: false, message: "Вставьте текст инструкции — хотя бы пару обязанностей." };
  }
  return { ok: true, source: "text", fileName: null, content };
}

const flag = (v: unknown) => v === true || v === "true" || v === "1" || v === "on";

const applySchema = z.object({
  include: z.array(z.string().max(32)).max(50),
  titles: z.record(z.string().max(32), z.string().max(255)).optional(),
  remove: z.array(z.number().int().positive()).max(100).optional(),
});

export function registerJobDescriptionRoutes(app: Express): void {
  // Состояния инструкций для «Сотрудников»: статус, сколько задач предложено и создано.
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

  // Учёт правок для root: что из предложенного потом удаляют и переименовывают.
  app.get("/api/admin/job-descriptions/feedback", requireRoot, async (_req, res) => {
    try {
      res.json(await jobDescriptionFeedback());
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] статистика не собралась");
      res.status(500).json({ message: "Не удалось собрать статистику" });
    }
  });

  // Окно «Задачи из инструкции»: предложения, задачи прошлой инструкции, что стало с созданными.
  app.get("/api/users/:id/job-description", requireUserManager, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const row = await getJobDescription(target.id);
      if (!row) return res.status(404).json({ message: "Инструкции нет" });
      res.json({ gatewayReady: isGatewayConfigured(), ...(await getJobDescriptionDetails(row)) });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] детали не загрузились");
      res.status(500).json({ message: "Не удалось загрузить инструкцию" });
    }
  });

  // Новая инструкция: файл, текст, «по должности» (mode=position) или «как у коллеги» (copyFromUserId).
  app.post("/api/users/:id/job-description", requireUserManager, acceptFile, async (req, res) => {
    try {
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target || !target.companyId) return res.status(404).json({ message: "Пользователь не найден" });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const body = (req.body ?? {}) as { text?: unknown; mode?: unknown; position?: unknown; copyFromUserId?: unknown; autoApply?: unknown };
      const autoApply = flag(body.autoApply);
      const createdBy = req.session.userId ?? null;

      // «Как у Олега (повар)»: готовые предложения коллеги, без нового разбора.
      if (body.copyFromUserId !== undefined && body.copyFromUserId !== "") {
        const template = await findPositionTemplate(target, Number(body.copyFromUserId));
        if (!template) return res.status(404).json({ message: "У этого коллеги нет задач из инструкции", field: "copyFromUserId" });
        const source = await storage.getUserById(template.row.userId);
        const row = await saveJobDescription({
          userId: target.id,
          companyId: target.companyId,
          createdBy,
          source: "copy",
          fileName: `Как у коллеги: ${source?.name || source?.phone || `#${template.row.userId}`}`.slice(0, 255),
          content: template.row.content,
          autoApply,
          proposals: template.proposals,
        });
        return res.status(201).json({ gatewayReady: isGatewayConfigured(), state: toState(row) });
      }

      let parsed: ExtractedJobDescription;
      if (body.mode === "position") {
        const position = (typeof body.position === "string" && body.position.trim() ? body.position : target.position ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (position.length < JOB_POSITION_MIN_CHARS) {
          return res.status(400).json({ message: "Укажите должность — по ней подберём задачи.", field: "position" });
        }
        parsed = { ok: true, source: "position", fileName: null, content: position };
      } else {
        parsed = extractJobDescription(req.file, body.text);
      }
      if (!parsed.ok) return res.status(400).json({ message: parsed.message, field: req.file ? "file" : "text" });
      if (!allowSubmission(target.companyId)) {
        return res.status(429).json({ message: "Слишком много инструкций за час. Попробуйте позже." });
      }

      const row = await saveJobDescription({
        userId: target.id,
        companyId: target.companyId,
        createdBy,
        source: parsed.source,
        fileName: parsed.fileName,
        content: parsed.content,
        autoApply,
      });
      // Не ждём: разбор идёт минуту-две, статус кабинет спрашивает сам.
      void runJobDescription(target.id);
      res.status(202).json({ gatewayReady: isGatewayConfigured(), state: toState(row), chars: parsed.content.length });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] не сохранили");
      res.status(500).json({ message: "Не удалось сохранить инструкцию" });
    }
  });

  // «Создать выбранные»: отмеченные предложения → задачи, отмеченные задачи прошлой инструкции — убрать.
  app.post("/api/users/:id/job-description/apply", requireUserManager, async (req, res) => {
    try {
      const input = applySchema.parse(req.body ?? {});
      const target = await findCompanyUser(req, Number(req.params.id));
      if (!target) return res.status(404).json({ message: "Пользователь не найден" });
      if (!(await canTouchUser(req, target))) return res.status(403).json({ message: NOT_YOUR_PEOPLE });
      const row = await getJobDescription(target.id);
      if (!row || row.status !== "review") return res.status(409).json({ message: "Задачи уже созданы или инструкция ещё разбирается" });
      const actor = req.apiKey && !req.session?.userId
        ? { kind: "apiKey" as const, companyId: row.companyId }
        : { kind: "session" as const, userId: req.session.userId! };
      const result = await applyJobDescription(row, input, actor);
      const fresh = await getJobDescription(target.id);
      res.json({ ...result, state: fresh ? toState(fresh) : null });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Неверный список задач" });
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[job-description] не применили");
      res.status(500).json({ message: "Не удалось создать задачи" });
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
