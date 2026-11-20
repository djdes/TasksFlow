/**
 * Клиент Codex-шлюза ProjectsFlow: текстовые задания для диспетчера Ralph.
 *
 * Схема (docs/ralph-job-description.md):
 *   TasksFlow ──POST /ai/text-jobs──▶ projectsflow.ru (очередь)
 *   Ralph на машине владельца забирает задание, гоняет локальный `codex exec`
 *   (ветка Do-Text в ai-job-worker.ps1) и возвращает текст;
 *   TasksFlow ──GET /ai/text-jobs/:id?wait=N──▶ забирает результат.
 *
 * Код Ralph под нас не меняется: `instructions` — наш промпт, `input` —
 * инструкция сотрудника с контекстом. Задание, которое никто не взял,
 * ProjectsFlow сам отменяет через 15 минут (`dispatcher_timeout`).
 */

const DEFAULT_URL = "https://projectsflow.ru/api";

export type GatewayConfig = { url: string; token: string };

/**
 * CODEX_GATEWAY_URL / CODEX_GATEWAY_TOKEN — account-токен ProjectsFlow
 * (лучше служебного аккаунта). Без них берём PF_API_URL / PF_AGENT_TOKEN,
 * которыми уже настроен разбор сообщений Telegram, — если этот токен со
 * scope `account`, шлюз примет и его.
 */
export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig | null {
  const token = (env.CODEX_GATEWAY_TOKEN || env.PF_AGENT_TOKEN || "").trim();
  if (!token) return null;
  const url = (env.CODEX_GATEWAY_URL || env.PF_API_URL || DEFAULT_URL).trim().replace(/\/+$/, "");
  return { url, token };
}

export type GatewayJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type GatewayJob = { id: string; status: GatewayJobStatus; text: string | null; error: string | null };

/** Отказ шлюза. `retryable: false` — повтор тем же запросом не поможет. */
export class GatewayError extends Error {
  readonly retryable: boolean;
  readonly status: number;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.retryable = retryable;
  }
}

type FetchLike = typeof fetch;

export async function enqueueTextJob(
  config: GatewayConfig,
  body: { instructions: string; input: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${config.url}/ai/text-jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new GatewayError(`шлюз недоступен: ${err instanceof Error ? err.message : String(err)}`, 0, true);
  }
  if (res.status === 202 || res.ok) {
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    if (json?.id) return json.id;
    throw new GatewayError("шлюз не вернул id задания", res.status, true);
  }
  // 401/403 — токен не тот (нужен scope account), 400 — наш запрос кривой:
  // повтор не поможет. 429/5xx — подождать и повторить.
  const retryable = res.status === 429 || res.status >= 500;
  const detail = await res.text().catch(() => "");
  throw new GatewayError(`шлюз ответил ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`, res.status, retryable);
}

export async function getTextJob(
  config: GatewayConfig,
  id: string,
  waitSec: number,
  fetchImpl: FetchLike = fetch,
): Promise<GatewayJob> {
  const wait = Math.max(0, Math.min(55, Math.floor(waitSec)));
  let res: Response;
  try {
    res = await fetchImpl(`${config.url}/ai/text-jobs/${encodeURIComponent(id)}?wait=${wait}`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      // Запас над окном сервера, иначе рвём соединение раньше него.
      signal: AbortSignal.timeout((wait + 20) * 1000),
    });
  } catch (err) {
    throw new GatewayError(`шлюз недоступен: ${err instanceof Error ? err.message : String(err)}`, 0, true);
  }
  if (res.status === 404) throw new GatewayError("задание пропало из очереди ProjectsFlow", 404, false);
  if (!res.ok) throw new GatewayError(`шлюз ответил ${res.status}`, res.status, res.status === 429 || res.status >= 500);
  const json = (await res.json().catch(() => null)) as Partial<GatewayJob> | null;
  const status = json?.status;
  if (status !== "queued" && status !== "running" && status !== "succeeded" && status !== "failed" && status !== "cancelled") {
    throw new GatewayError("шлюз вернул непонятный статус", res.status, true);
  }
  return { id, status, text: json?.text ?? null, error: json?.error ?? null };
}
