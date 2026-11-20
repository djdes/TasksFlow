/**
 * Должностная инструкция → задачи сотрудника.
 *
 * 1. Руководитель сохраняет инструкцию (saveJobDescription) — строка
 *    job_descriptions в статусе queued.
 * 2. runJobDescription отправляет её в Codex-шлюз ProjectsFlow; задание
 *    исполняет диспетчер Ralph на машине владельца (docs/ralph-job-description.md).
 * 3. Ответ — JSON с сегментами, как у разбора Telegram. Он проходит
 *    ту же нормализацию (server/telegram/normalize.ts), исполнитель —
 *    всегда этот сотрудник, и задачи создаются через createTaskForActor:
 *    те же права, аудит, push и WeSetup, что у формы «Новая задача».
 *
 * Шлюз не настроен — инструкция ждёт в queued и уйдёт, как только появится
 * токен. Сервер перезапустился посреди ожидания — фоновый тик (server/index.ts)
 * подхватит задание по сохранённому gateway_job_id. Повтор не плодит дубли:
 * задачу с тем же названием у сотрудника второй раз не создаём.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { jobDescriptions, type JobDescriptionRow, type InsertTask } from "@shared/schema";
import {
  JOB_DESCRIPTION_MAX_TASKS,
  type JobDescriptionSource,
  type JobDescriptionState,
  type JobDescriptionStatus,
} from "@shared/job-description";
import { parseTaskBonus } from "@shared/task-bonus";
import { storage } from "../storage";
import { logger } from "../logger";
import { normalizeWorkerResponse } from "../telegram/normalize";
import { createTaskForActor } from "../services/task-create";
import type { TaskActor } from "../services/task-actor";
import { enqueueTextJob, GatewayError, getTextJob, loadGatewayConfig, type GatewayConfig } from "./gateway";
import { buildJobDescriptionInput, JOB_DESCRIPTION_INSTRUCTIONS } from "./prompt";

/** Сколько держим одно ожидание в процессе; дальше — фоновым тиком. */
const POLL_SESSION_MS = 5 * 60_000;
/** Дольше диспетчер не отвечает — значит, не запущен. ProjectsFlow сам снимет задание через 15 минут. */
const GIVE_UP_AFTER_SEC = 20 * 60;
/** Сколько раз пробуем отправить при временных отказах шлюза (429, 5xx, сеть). */
const MAX_SEND_ATTEMPTS = 10;
/** Не чаще одного опроса шлюза за столько миллисекунд. */
const MIN_POLL_GAP_MS = 2500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const now = () => Math.floor(Date.now() / 1000);
const clip = (s: string, n = 480) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function toState(row: JobDescriptionRow): JobDescriptionState {
  return {
    userId: row.userId,
    status: row.status as JobDescriptionStatus,
    source: row.source as JobDescriptionSource,
    fileName: row.fileName ?? null,
    tasksCreated: row.tasksCreated ?? 0,
    error: row.error ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function getJobDescription(userId: number): Promise<JobDescriptionRow | null> {
  const [row] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.userId, userId));
  return row ?? null;
}

/** Состояния по компании для «Сотрудников» — без текста инструкций. */
export async function listJobDescriptionStates(companyId: number): Promise<JobDescriptionState[]> {
  const rows = await db
    .select({
      userId: jobDescriptions.userId,
      status: jobDescriptions.status,
      source: jobDescriptions.source,
      fileName: jobDescriptions.fileName,
      tasksCreated: jobDescriptions.tasksCreated,
      error: jobDescriptions.error,
      updatedAt: jobDescriptions.updatedAt,
    })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.companyId, companyId));
  return rows.map((r) => toState(r as JobDescriptionRow));
}

/** Новая инструкция заменяет прежнюю и встаёт в очередь. */
export async function saveJobDescription(params: {
  userId: number;
  companyId: number;
  createdBy: number | null;
  source: JobDescriptionSource;
  fileName: string | null;
  content: string;
}): Promise<JobDescriptionRow> {
  const t = now();
  const fresh = {
    companyId: params.companyId,
    source: params.source,
    fileName: params.fileName,
    content: params.content,
    status: "queued" as const,
    gatewayJobId: null,
    attempts: 0,
    tasksCreated: 0,
    taskIds: null,
    error: null,
    createdBy: params.createdBy,
    updatedAt: t,
    sentAt: null,
  };
  await db.insert(jobDescriptions).values({ userId: params.userId, createdAt: t, ...fresh })
    .onDuplicateKeyUpdate({ set: { ...fresh, createdAt: t } });
  const row = await getJobDescription(params.userId);
  if (!row) throw new Error("job_descriptions: строка не сохранилась");
  return row;
}

/** «Повторить»: та же инструкция снова в очередь. */
export async function retryJobDescription(userId: number): Promise<JobDescriptionRow | null> {
  await db.update(jobDescriptions)
    .set({ status: "queued", gatewayJobId: null, attempts: 0, error: null, sentAt: null, updatedAt: now() })
    .where(and(eq(jobDescriptions.userId, userId), eq(jobDescriptions.status, "failed")));
  return getJobDescription(userId);
}

export async function deleteJobDescription(userId: number): Promise<void> {
  await db.delete(jobDescriptions).where(eq(jobDescriptions.userId, userId));
}

async function patch(userId: number, set: Partial<JobDescriptionRow>): Promise<void> {
  await db.update(jobDescriptions).set({ ...set, updatedAt: now() }).where(eq(jobDescriptions.userId, userId));
}

async function fail(userId: number, message: string): Promise<void> {
  await patch(userId, { status: "failed", error: clip(message) });
  logger.warn({ userId, reason: message }, "[job-description] не разобрали");
}

/** Причина отказа шлюза — словами для руководителя. */
export function describeGatewayFailure(error: string | null | undefined): string {
  const e = String(error ?? "");
  if (/dispatcher_timeout/i.test(e)) return "Диспетчер Ralph не взял инструкцию за 15 минут — он запущен?";
  if (/codex_failed|model/i.test(e)) return "Диспетчер не смог разобрать инструкцию. Попробуйте ещё раз.";
  return e ? `Диспетчер вернул ошибку: ${e}` : "Диспетчер вернул ошибку.";
}

/** JSON из ответа модели: без markdown-забора и болтовни вокруг. */
export function extractSegmentsJson(text: string | null | undefined): { segments: unknown[] } | null {
  if (!text) return null;
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1)) as { segments?: unknown };
    return obj && Array.isArray(obj.segments) ? { segments: obj.segments } : null;
  } catch {
    return null;
  }
}

/** Сравнение названий без регистра, «ё» и лишних пробелов — чтобы не задвоить задачу при повторе. */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

async function actorFor(row: JobDescriptionRow): Promise<TaskActor> {
  if (row.createdBy) {
    const author = await storage.getUserById(row.createdBy);
    if (author && author.companyId === row.companyId) return { kind: "session", userId: author.id };
  }
  // Инструкцию прислала интеграция по API-ключу или автора уже нет — права компании.
  return { kind: "apiKey", companyId: row.companyId };
}

/** Ответ диспетчера → задачи сотрудника; итог — в строке job_descriptions. */
export async function createTasksFromAnswer(row: JobDescriptionRow, answer: string | null): Promise<void> {
  const parsed = extractSegmentsJson(answer);
  if (!parsed) return fail(row.userId, "Диспетчер вернул ответ не в том формате. Попробуйте ещё раз.");
  if (parsed.segments.length === 0) {
    await patch(row.userId, { status: "done", tasksCreated: 0, taskIds: "[]", error: null });
    return;
  }
  const firstLine = row.content.split("\n").find((l) => l.trim()) ?? "Задача";
  const normalized = normalizeWorkerResponse(JSON.stringify({ segments: parsed.segments.slice(0, JOB_DESCRIPTION_MAX_TASKS) }), [row.userId], firstLine);
  if (!normalized) return fail(row.userId, "Диспетчер вернул ответ не в том формате. Попробуйте ещё раз.");

  const employee = await storage.getUserById(row.userId);
  if (!employee || employee.companyId !== row.companyId) {
    await deleteJobDescription(row.userId);
    return;
  }
  const company = await storage.getCompanyById(row.companyId);
  const bonus = parseTaskBonus(company?.accessSettings ?? null);
  const existing = new Set(
    (await storage.getTasks(row.companyId)).filter((t) => t.workerId === row.userId).map((t) => titleKey(t.title)),
  );
  const actor = await actorFor(row);
  const createdIds: number[] = [];
  const errors: string[] = [];
  for (const seg of normalized.segments) {
    const key = titleKey(seg.title);
    if (!key || existing.has(key)) continue;
    existing.add(key);
    const input: InsertTask = {
      title: seg.title,
      description: seg.description,
      workerId: row.userId,
      requiresPhoto: seg.requiresPhoto,
      category: seg.category,
      // Премию в инструкции не ищем: ставим сумму компании по умолчанию,
      // как форма «Новая задача» (shared/task-bonus.ts).
      price: bonus,
      isRecurring: seg.isRecurring,
      weekDays: seg.weekDays,
      monthDay: seg.monthDay,
      dueDate: null,
      isCompleted: false,
      checklist: seg.checklist.length
        ? seg.checklist.map((title, i) => ({
            id: `jd${i}-${Date.now().toString(36)}`,
            title,
            done: false,
            photoUrls: [],
            // Задача без фото — и пункты закрываются касанием.
            ...(seg.requiresPhoto ? {} : { requiresPhoto: false }),
          }))
        : null,
    } as InsertTask;
    try {
      const task = await createTaskForActor({ input, actor, companyId: row.companyId });
      createdIds.push(task.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (createdIds.length === 0 && errors.length > 0) {
    return fail(row.userId, `Задачи не создались: ${errors[0]}`);
  }
  await patch(row.userId, {
    status: "done",
    tasksCreated: createdIds.length,
    taskIds: JSON.stringify(createdIds),
    error: errors.length ? clip(`Не создались ${errors.length}: ${errors[0]}`) : null,
  });
  logger.info({ userId: row.userId, created: createdIds.length, skipped: normalized.segments.length - createdIds.length }, "[job-description] задачи созданы");
}

const inFlight = new Set<number>();

/** Отправить и дождаться ответа; без шлюза — оставить в очереди. Безопасно звать повторно. */
export async function runJobDescription(userId: number, config: GatewayConfig | null = loadGatewayConfig()): Promise<void> {
  if (!config || inFlight.has(userId)) return;
  inFlight.add(userId);
  try {
    let row = await getJobDescription(userId);
    if (!row || (row.status !== "queued" && row.status !== "processing")) return;

    if (row.status === "queued" || !row.gatewayJobId) {
      const employee = await storage.getUserById(userId);
      if (!employee || employee.companyId !== row.companyId) {
        await deleteJobDescription(userId);
        return;
      }
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const categories = Array.from(new Set(
        (await storage.getTasks(row.companyId)).map((t) => t.category).filter((c): c is string => !!c),
      )).slice(0, 30);
      const input = buildJobDescriptionInput({
        employeeName: employee.name || employee.phone || `#${employee.id}`,
        position: employee.position ?? null,
        today: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        dow: d.getDay(),
        categories,
        text: row.content,
      });
      try {
        const id = await enqueueTextJob(config, { instructions: JOB_DESCRIPTION_INSTRUCTIONS, input });
        await patch(userId, { status: "processing", gatewayJobId: id, sentAt: now(), attempts: (row.attempts ?? 0) + 1, error: null });
      } catch (err) {
        const ge = err instanceof GatewayError ? err : new GatewayError(String(err), 0, true);
        const attempts = (row.attempts ?? 0) + 1;
        if (!ge.retryable || attempts >= MAX_SEND_ATTEMPTS) {
          const hint = ge.status === 401 || ge.status === 403
            ? "Токен ProjectsFlow не подходит: нужен токен агента со scope account."
            : `Не удалось отправить инструкцию диспетчеру: ${ge.message}`;
          return fail(userId, hint);
        }
        await patch(userId, { attempts, error: clip(ge.message) });
        return;
      }
      row = await getJobDescription(userId);
      if (!row?.gatewayJobId) return;
    }

    const jobId = row.gatewayJobId!;
    const deadline = Date.now() + POLL_SESSION_MS;
    while (Date.now() < deadline) {
      if (row.sentAt && now() - row.sentAt > GIVE_UP_AFTER_SEC) {
        return fail(userId, "Диспетчер Ralph не ответил за 20 минут — он запущен?");
      }
      let job;
      const askedAt = Date.now();
      try {
        job = await getTextJob(config, jobId, 25);
      } catch (err) {
        if (err instanceof GatewayError && !err.retryable) return fail(userId, err.message);
        // Сеть мигнула — следующий тик продолжит ждать.
        logger.warn({ userId, err: err instanceof Error ? err.message : String(err) }, "[job-description] опрос шлюза не прошёл");
        return;
      }
      if (job.status === "succeeded") return createTasksFromAnswer(row, job.text);
      if (job.status === "failed" || job.status === "cancelled") return fail(userId, describeGatewayFailure(job.error));
      // Шлюз ответил «ещё работаю» сразу, не подержав запрос (`wait` не сработал
      // или прокси его режет) — без паузы цикл засыпал бы его тысячами запросов.
      const spent = Date.now() - askedAt;
      if (spent < MIN_POLL_GAP_MS) await sleep(MIN_POLL_GAP_MS - spent);
    }
  } catch (err) {
    logger.error({ userId, err: err instanceof Error ? err.message : String(err) }, "[job-description] сбой обработки");
  } finally {
    inFlight.delete(userId);
  }
}

/** Фоновый тик (server/index.ts): очередь и прерванные ожидания. */
export async function processJobDescriptions(limit = 20): Promise<number> {
  const config = loadGatewayConfig();
  if (!config) return 0;
  const rows = await db
    .select({ userId: jobDescriptions.userId })
    .from(jobDescriptions)
    .where(inArray(jobDescriptions.status, ["queued", "processing"]))
    .limit(limit);
  let started = 0;
  for (const { userId } of rows) {
    if (inFlight.has(userId)) continue;
    started++;
    void runJobDescription(userId, config);
  }
  return started;
}

export function isGatewayConfigured(): boolean {
  return loadGatewayConfig() !== null;
}
