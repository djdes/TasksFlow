/**
 * Клиент очереди AI-разбора ProjectsFlow.
 *
 * Схема: TasksFlow кладёт job → ralph его забирает, зовёт Claude с
 * промптом tasksflow-task.md → пишет результат обратно → мы забираем
 * long-poll'ом.
 *
 * Почему mode='improve', а не свой режим: enum режимов зашит в схему
 * ProjectsFlow, а ProjectsFlow мы не трогаем. Роутинг к нужному промпту
 * делает воркер — по имени проекта плюс маркеру `app` внутри конверта.
 *
 * Побочный эффект improve с непустым projectId: ProjectsFlow соберёт
 * kbContext проекта и положит в job. Воркер его игнорирует. Лишний
 * трафик, но безвредно и не требует правок ProjectsFlow.
 */

import { logger } from "../logger";

/** Лимит текста для mode=improve на стороне ProjectsFlow. */
const MAX_INPUT_CHARS = 50_000;
/** Окно одного long-poll: ProjectsFlow клампит wait к 1..60 сек. */
const POLL_WAIT_SEC = 25;
/**
 * Сколько раз ждём. 6 × 25с ≈ 150с — заведомо меньше 5-минутного
 * AiPromptJobCleanup в ProjectsFlow, который отменяет зависшие job'ы.
 */
const MAX_POLLS = 6;

export type PfAiConfig = {
  apiUrl: string;
  agentToken: string;
  projectId: string;
};

export function loadPfAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): PfAiConfig | null {
  const apiUrl = (env.PF_API_URL || "").trim().replace(/\/$/, "");
  const agentToken = (env.PF_AGENT_TOKEN || "").trim();
  const projectId = (env.PF_TASKSFLOW_PROJECT_ID || "").trim();
  if (!apiUrl || !agentToken || !projectId) return null;
  return { apiUrl, agentToken, projectId };
}

/** Конверт, по которому воркер опознаёт «свой» job. */
export type WorkerEnvelope = {
  app: "tasksflow";
  v: 1;
  today: string;
  dow: number;
  author: { name: string; role: "admin" | "manager" };
  members: Array<{ id: number; name: string; position: string | null }>;
  categories: string[];
  hasPhotos: number;
  message: string;
};

/**
 * Причина, по которой AI не дал результат. Все они ведут в одно место —
 * ручной черновик; различаются только текстом для пользователя.
 */
export type PfAiFailureReason =
  | "not_configured"
  | "rate_limited"
  | "ai_unavailable"
  | "timeout"
  | "job_failed"
  | "bad_json"
  | "network";

export type PfAiResult =
  | { ok: true; raw: string }
  | { ok: false; reason: PfAiFailureReason; detail?: string };

/** Текст для пользователя. Бот всегда продолжает работу, просто без AI. */
export function failureMessage(reason: PfAiFailureReason): string {
  switch (reason) {
    case "rate_limited":
      return "Лимит AI на этот час исчерпан. Черновик собрал вручную — проверь поля.";
    case "not_configured":
    case "ai_unavailable":
      return "AI сейчас недоступен. Черновик собрал вручную — проверь поля.";
    case "timeout":
      return "AI не ответил вовремя. Черновик собрал вручную — проверь поля.";
    default:
      return "Не смог разобрать текст автоматически. Черновик собрал вручную — проверь поля.";
  }
}

/**
 * Колбэк прогресса. Нужен, чтобы бот показывал живой статус, а не молчал
 * до полутора минут: человек в чате должен видеть, что происходит.
 */
export type StageReporter = (stage: string) => void;

export async function requestTaskParse(
  envelope: WorkerEnvelope,
  config: PfAiConfig | null = loadPfAiConfig(),
  onStage?: StageReporter,
): Promise<PfAiResult> {
  if (!config) return { ok: false, reason: "not_configured" };

  const text = JSON.stringify(envelope);
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, reason: "bad_json", detail: "envelope too large" };
  }

  let jobId: string;
  try {
    onStage?.("Отправляю на разбор");
    const res = await fetch(`${config.apiUrl}/agent/ai-prompt-jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        projectId: config.projectId,
        mode: "improve",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (res.status === 503) return { ok: false, reason: "ai_unavailable" };
    if (!res.ok) {
      return {
        ok: false,
        reason: "ai_unavailable",
        detail: `enqueue HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { jobId?: string };
    if (!body.jobId) {
      return { ok: false, reason: "ai_unavailable", detail: "no jobId" };
    }
    jobId = body.jobId;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[tg-ai] enqueue не прошёл",
    );
    return { ok: false, reason: "network" };
  }

  return waitForJob(jobId, config, onStage);
}

async function waitForJob(
  jobId: string,
  config: PfAiConfig,
  onStage?: StageReporter,
): Promise<PfAiResult> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    try {
      onStage?.(
        attempt === 0
          ? "Жду очередь диспетчера"
          : `Думаю над задачей (${attempt * POLL_WAIT_SEC}с)`,
      );
      const res = await fetch(
        `${config.apiUrl}/agent/ai-prompt-jobs/${jobId}?wait=${POLL_WAIT_SEC}`,
        {
          headers: { Authorization: `Bearer ${config.agentToken}` },
          // Запас над окном сервера, иначе рвём соединение раньше него.
          signal: AbortSignal.timeout((POLL_WAIT_SEC + 15) * 1000),
        },
      );

      // 504 — это НЕ ошибка, а «окно ожидания истекло, job ещё в очереди».
      // Единственно верная реакция — пойти на следующий круг.
      if (res.status === 504) continue;

      if (!res.ok) {
        return {
          ok: false,
          reason: "ai_unavailable",
          detail: `poll HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as {
        status?: string;
        improvedText?: string | null;
        error?: string | null;
      };

      if (body.status === "succeeded") {
        if (!body.improvedText) {
          return { ok: false, reason: "bad_json", detail: "empty improvedText" };
        }
        return { ok: true, raw: body.improvedText };
      }
      if (body.status === "failed" || body.status === "cancelled") {
        return {
          ok: false,
          reason: "job_failed",
          detail: body.error ?? body.status,
        };
      }
      // queued/running — продолжаем ждать.
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), jobId },
        "[tg-ai] long-poll упал",
      );
      return { ok: false, reason: "network" };
    }
  }

  return { ok: false, reason: "timeout" };
}
