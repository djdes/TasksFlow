/**
 * Должностная инструкция → задачи сотрудника.
 *
 * 1. Руководитель сохраняет инструкцию (saveJobDescription) — строка
 *    job_descriptions в статусе queued. Инструкции может не быть: тогда
 *    задачи подбираются по должности (source = position) или берутся у
 *    коллеги на той же должности без нового разбора (copyJobDescription).
 * 2. runJobDescription отправляет текст в Codex-шлюз ProjectsFlow; задание
 *    исполняет диспетчер Ralph на машине владельца (docs/ralph-job-description.md).
 * 3. Ответ — JSON с сегментами; server/job-description/proposals.ts превращает
 *    его в предложения и строка уходит в review: руководитель отмечает нужные
 *    (applyJobDescription). С «Создать сразу» (autoApply) — создаём всё новое
 *    без вопроса, но задачи прошлой инструкции не трогаем.
 * 4. Задачи создаёт createTaskForActor: те же права, аудит, push и WeSetup,
 *    что у формы «Новая задача». Список созданных [{ id, title }] хранится в
 *    строке: по нему видно, что было в прошлой инструкции (разница), и что
 *    руководитель потом удалил или переименовал (учёт правок).
 *
 * Шлюз не настроен — инструкция ждёт в queued и уйдёт, как только появится
 * токен. Сервер перезапустился посреди ожидания — фоновый тик (server/index.ts)
 * подхватит задание по сохранённому gateway_job_id.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { jobDescriptions, tasks, type InsertTask, type JobDescriptionRow, type Task } from "@shared/schema";
import {
  positionKey,
  titleKey,
  type CreatedTaskView,
  type JobDescriptionApply,
  type JobDescriptionDetails,
  type JobDescriptionSource,
  type JobDescriptionState,
  type JobDescriptionStatus,
  type JobProposal,
} from "@shared/job-description";
import { parseTaskBonus } from "@shared/task-bonus";
import { parseDueDateInput } from "@shared/task-visibility";
import { storage } from "../storage";
import { logger } from "../logger";
import { createTaskForActor } from "../services/task-create";
import { removeTask } from "../services/task-delete";
import type { TaskActor } from "../services/task-actor";
import { enqueueTextJob, GatewayError, getTextJob, loadGatewayConfig, type GatewayConfig } from "./gateway";
import { buildJobDescriptionInput, JOB_DESCRIPTION_INSTRUCTIONS } from "./prompt";
import { extractSegmentsJson, normalizeProposals, parseCreatedTasks, parseStoredProposals, type CreatedTaskRef } from "./proposals";

export { extractSegmentsJson } from "./proposals";
export { titleKey } from "@shared/job-description";

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
    proposalsCount: parseStoredProposals(row.proposals).length,
    autoApply: Boolean(row.autoApply),
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
      proposals: jobDescriptions.proposals,
      autoApply: jobDescriptions.autoApply,
      error: jobDescriptions.error,
      updatedAt: jobDescriptions.updatedAt,
    })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.companyId, companyId));
  return rows.map((r) => toState(r as JobDescriptionRow));
}

/**
 * Новая инструкция заменяет прежнюю и встаёт в очередь. Список задач прошлой
 * инструкции остаётся — по нему окно проверки покажет, что убрать.
 * `proposals` — готовые предложения (копия у коллеги): тогда сразу review.
 */
export async function saveJobDescription(params: {
  userId: number;
  companyId: number;
  createdBy: number | null;
  source: JobDescriptionSource;
  fileName: string | null;
  content: string;
  autoApply?: boolean;
  proposals?: JobProposal[];
}): Promise<JobDescriptionRow> {
  const t = now();
  const ready = params.proposals && params.proposals.length > 0;
  const fresh = {
    companyId: params.companyId,
    source: params.source,
    fileName: params.fileName,
    content: params.content,
    status: ready ? "review" : "queued",
    gatewayJobId: null,
    attempts: 0,
    tasksCreated: 0,
    proposals: ready ? JSON.stringify(params.proposals) : null,
    autoApply: Boolean(params.autoApply),
    error: null,
    createdBy: params.createdBy,
    updatedAt: t,
    sentAt: null,
  };
  await db.insert(jobDescriptions).values({ userId: params.userId, createdAt: t, taskIds: null, ...fresh })
    .onDuplicateKeyUpdate({ set: { ...fresh, createdAt: t } });
  let row = await getJobDescription(params.userId);
  if (!row) throw new Error("job_descriptions: строка не сохранилась");
  if (ready && row.autoApply) {
    await applyJobDescription(row, { include: (params.proposals ?? []).map((p) => p.id) }, await actorFor(row));
    row = (await getJobDescription(params.userId)) ?? row;
  }
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

async function actorFor(row: Pick<JobDescriptionRow, "createdBy" | "companyId">): Promise<TaskActor> {
  if (row.createdBy) {
    const author = await storage.getUserById(row.createdBy);
    if (author && author.companyId === row.companyId) return { kind: "session", userId: author.id };
  }
  // Инструкцию прислала интеграция по API-ключу или автора уже нет — права компании.
  return { kind: "apiKey", companyId: row.companyId };
}

const workerTasks = async (companyId: number, userId: number): Promise<Task[]> =>
  (await storage.getTasks(companyId)).filter((t) => t.workerId === userId);

/** Ответ диспетчера → предложения (review) или, с autoApply, сразу задачи. */
export async function storeAnswer(row: JobDescriptionRow, answer: string | null): Promise<void> {
  const parsed = extractSegmentsJson(answer);
  if (!parsed) return fail(row.userId, "Диспетчер вернул ответ не в том формате. Попробуйте ещё раз.");
  const proposals = normalizeProposals(parsed.segments);
  if (proposals.length === 0) {
    await patch(row.userId, { status: "done", tasksCreated: 0, proposals: "[]", error: null });
    return;
  }
  await patch(row.userId, { status: "review", proposals: JSON.stringify(proposals), error: null });
  if (row.autoApply) {
    const fresh = await getJobDescription(row.userId);
    if (fresh) await applyJobDescription(fresh, { include: proposals.map((p) => p.id) }, await actorFor(fresh));
    return;
  }
  // Разбор идёт минуту-две: автору — ссылка на проверку в Telegram, если он его привязал.
  void import("../telegram/job-description")
    .then(({ notifyJobDescriptionReady }) => notifyJobDescriptionReady(row, proposals.length))
    .catch(() => {});
}

/** Задача из предложения: расписание, срок первой недели, чек-лист с вопросами, премия по умолчанию. */
export function proposalToTask(p: JobProposal, opts: { userId: number; title: string; bonus: number; today?: Date }): InsertTask {
  let dueDate: number | null = null;
  if (!p.isRecurring && p.dueInDays) {
    const d = new Date(opts.today ?? new Date());
    d.setDate(d.getDate() + p.dueInDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    dueDate = parseDueDateInput(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const stamp = Date.now().toString(36);
  return {
    title: opts.title,
    description: p.description,
    workerId: opts.userId,
    requiresPhoto: p.requiresPhoto,
    category: p.category,
    // Премию в инструкции не ищем: сумма компании по умолчанию, как у формы «Новая задача».
    price: opts.bonus,
    isRecurring: p.isRecurring,
    weekDays: p.isRecurring ? p.weekDays : null,
    monthDay: p.isRecurring ? p.monthDay : null,
    dueDate,
    isCompleted: false,
    checklist: p.checklist.length
      ? p.checklist.map((item, i) => ({
          id: `jd${i}-${stamp}`,
          title: item.title,
          done: false,
          photoUrls: [],
          // Вопрос закрывается ответом, пункт задачи без фото — касанием.
          ...(item.options ? { options: item.options, requiresPhoto: false } : p.requiresPhoto ? {} : { requiresPhoto: false }),
        }))
      : null,
  } as InsertTask;
}

export type ApplyResult = { created: number; removed: number; skipped: number; errors: string[] };

/**
 * «Создать выбранные»: отмеченные предложения (с поправленными названиями)
 * становятся задачами; отмеченные задачи прошлой инструкции удаляются.
 * Задачу с тем же названием у сотрудника второй раз не создаём.
 */
export async function applyJobDescription(row: JobDescriptionRow, input: JobDescriptionApply, actor: TaskActor): Promise<ApplyResult> {
  const proposals = parseStoredProposals(row.proposals);
  const chosen = new Set(input.include);
  const current = await workerTasks(row.companyId, row.userId);
  const previous = parseCreatedTasks(row.taskIds);
  const existing = takenKeys(current, previous);
  const company = await storage.getCompanyById(row.companyId);
  const bonus = parseTaskBonus(company?.accessSettings ?? null);
  const result: ApplyResult = { created: 0, removed: 0, skipped: 0, errors: [] };

  // Удаляем только задачи прошлой инструкции, которых нет в новой, — чужие задачи
  // сотрудника этим путём не трогаются, даже если их id прислали.
  const stale = new Set(staleTasks(proposals, previous, current).map((s) => s.taskId));
  const removedIds = new Set<number>();
  const actorUserId = actor.kind === "apiKey" ? null : actor.userId;
  for (const id of input.remove ?? []) {
    if (!stale.has(id)) continue;
    const task = current.find((t) => t.id === id);
    if (!task) continue;
    try {
      await removeTask(task, actorUserId);
      removedIds.add(id);
      result.removed++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  const created: CreatedTaskRef[] = [];
  for (const p of proposals) {
    if (!chosen.has(p.id)) continue;
    const edited = input.titles?.[p.id];
    const title = typeof edited === "string" && edited.trim() ? edited.replace(/\s+/g, " ").trim().slice(0, 255) : p.title;
    const key = titleKey(title);
    if (!key || existing.has(key)) {
      result.skipped++;
      continue;
    }
    existing.add(key);
    try {
      const task = await createTaskForActor({
        input: proposalToTask(p, { userId: row.userId, title, bonus }),
        actor,
        companyId: row.companyId,
      });
      // Исходное название предложения — чтобы следующая инструкция узнала задачу,
      // даже если руководитель поправил название при создании.
      created.push(title === p.title ? { id: task.id, title: task.title } : { id: task.id, title: task.title, proposal: p.title });
      result.created++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Список «из инструкции»: прежние (кроме удалённых) и новые.
  const keep = previous.filter((p) => !removedIds.has(p.id) && current.some((t) => t.id === p.id));
  await patch(row.userId, {
    status: "done",
    tasksCreated: result.created,
    taskIds: JSON.stringify([...keep, ...created]),
    error: result.errors.length ? clip(`Не получилось: ${result.errors.length}. ${result.errors[0]}`) : null,
  });
  logger.info({ userId: row.userId, ...result, errors: result.errors.length }, "[job-description] применено");
  return result;
}

/** Задачи прошлой инструкции, которых нет среди новых предложений. */
export function staleTasks(
  proposals: JobProposal[],
  previous: CreatedTaskRef[],
  current: Pick<Task, "id" | "title">[],
): Array<{ taskId: number; title: string }> {
  const keys = new Set(proposals.map((p) => titleKey(p.title)));
  const out: Array<{ taskId: number; title: string }> = [];
  for (const p of previous) {
    const t = current.find((x) => x.id === p.id);
    if (!t) continue;
    // Переименованная руководителем задача всё ещё «та самая», если новая
    // инструкция предлагает её под исходным названием.
    if ([t.title, p.title, p.proposal].some((x) => x && keys.has(titleKey(x)))) continue;
    out.push({ taskId: t.id, title: t.title });
  }
  return out;
}

/** Названия, которые уже есть у сотрудника: текущие и исходные у переименованных задач из инструкции. */
function takenKeys(current: Pick<Task, "id" | "title">[], previous: CreatedTaskRef[]): Set<string> {
  const keys = new Set(current.map((t) => titleKey(t.title)));
  for (const p of previous) {
    if (!current.some((t) => t.id === p.id)) continue;
    if (p.title) keys.add(titleKey(p.title));
    if (p.proposal) keys.add(titleKey(p.proposal));
  }
  return keys;
}

/** Что стало с задачами из инструкции: на месте, переименована, удалена. */
export function createdViews(previous: CreatedTaskRef[], current: Pick<Task, "id" | "title">[]): CreatedTaskView[] {
  return previous.map((p) => {
    const t = current.find((x) => x.id === p.id);
    if (!t) return { taskId: p.id, title: p.title ?? `#${p.id}`, state: "deleted" as const, currentTitle: null };
    const edited = p.title !== null && titleKey(p.title) !== titleKey(t.title);
    return { taskId: p.id, title: p.title ?? t.title, state: edited ? ("edited" as const) : ("active" as const), currentTitle: t.title };
  });
}

/** Всё для окна «Задачи из инструкции». */
export async function getJobDescriptionDetails(row: JobDescriptionRow): Promise<Omit<JobDescriptionDetails, "gatewayReady">> {
  const proposals = parseStoredProposals(row.proposals);
  const current = await workerTasks(row.companyId, row.userId);
  const previous = parseCreatedTasks(row.taskIds);
  const keys = takenKeys(current, previous);
  return {
    state: toState(row),
    proposals: proposals.map((p) => ({ ...p, exists: keys.has(titleKey(p.title)) })),
    stale: row.status === "review" ? staleTasks(proposals, previous, current) : [],
    created: createdViews(previous, current),
  };
}

/** Коллеги на той же должности с готовыми предложениями — для «Как у Олега (повар)». */
export async function findPositionTemplate(target: { id: number; companyId: number | null; position: string | null }, fromUserId: number): Promise<{ row: JobDescriptionRow; proposals: JobProposal[] } | null> {
  if (!target.companyId) return null;
  const source = await storage.getUserById(fromUserId);
  if (!source || source.id === target.id || source.companyId !== target.companyId) return null;
  if (positionKey(source.position) && target.position && positionKey(source.position) !== positionKey(target.position)) return null;
  const row = await getJobDescription(source.id);
  const proposals = parseStoredProposals(row?.proposals);
  return row && proposals.length > 0 ? { row, proposals } : null;
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
        byPosition: row.source === "position",
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
      if (job.status === "succeeded") return storeAnswer(row, job.text);
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

export type JobDescriptionFeedback = {
  instructions: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  created: number;
  deleted: number;
  edited: number;
  topDeleted: Array<{ title: string; count: number }>;
  topEdited: Array<{ from: string; to: string }>;
};

/**
 * Учёт правок для root: сколько задач из инструкций руководители потом
 * удалили или переименовали — по этому подкручивается промпт. Только
 * названия задач, без текстов инструкций.
 */
export async function jobDescriptionFeedback(): Promise<JobDescriptionFeedback> {
  const rows = await db
    .select({ source: jobDescriptions.source, status: jobDescriptions.status, taskIds: jobDescriptions.taskIds })
    .from(jobDescriptions);
  const out: JobDescriptionFeedback = { instructions: rows.length, bySource: {}, byStatus: {}, created: 0, deleted: 0, edited: 0, topDeleted: [], topEdited: [] };
  const all: CreatedTaskRef[] = [];
  for (const r of rows) {
    out.bySource[r.source] = (out.bySource[r.source] ?? 0) + 1;
    out.byStatus[r.status] = (out.byStatus[r.status] ?? 0) + 1;
    all.push(...parseCreatedTasks(r.taskIds));
  }
  out.created = all.length;
  const found = new Map<number, string>();
  for (let i = 0; i < all.length; i += 500) {
    const ids = all.slice(i, i + 500).map((x) => x.id);
    if (ids.length === 0) continue;
    for (const t of await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, ids))) found.set(t.id, t.title);
  }
  const deletedCount = new Map<string, number>();
  for (const x of all) {
    const now = found.get(x.id);
    if (now === undefined) {
      out.deleted++;
      if (x.title) deletedCount.set(x.title, (deletedCount.get(x.title) ?? 0) + 1);
    } else if (x.title && titleKey(x.title) !== titleKey(now)) {
      out.edited++;
      if (out.topEdited.length < 10) out.topEdited.push({ from: x.title, to: now });
    }
  }
  out.topDeleted = Array.from(deletedCount, ([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  return out;
}
