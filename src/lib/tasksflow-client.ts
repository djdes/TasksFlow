/**
 * Thin REST client for tasksflow.ru API.
 *
 * Auth: `Authorization: Bearer tfk_…`. Keys are per-company in TasksFlow,
 * created at /api/api-keys. We store the plaintext encrypted in our
 * `TasksFlowIntegration.apiKeyEncrypted` and pass it on every call.
 *
 * The client is **stateless** — instantiate per request via
 * `tasksflowClientFor(integration)`. Don't share instances across orgs.
 *
 * Response shapes here are typed against TasksFlow API.md (commit at the
 * time of writing). If TasksFlow changes its contract, only this file
 * needs an update.
 */
import { decryptSecret } from "@/lib/integration-crypto";

export type TasksFlowUser = {
  id: number;
  phone: string;
  name: string | null;
  isAdmin: boolean;
  bonusBalance: number;
  createdAt: number;
  companyId?: number | null;
};

export type TasksFlowTask = {
  id: number;
  title: string;
  workerId: number | null;
  requiresPhoto: boolean;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  examplePhotoUrl?: string | null;
  isCompleted: boolean;
  isRecurring: boolean;
  weekDays?: number[] | null;
  monthDay?: number | null;
  price: number;
  category?: string | null;
  description?: string | null;
  companyId?: number | null;
};

export type CreateTaskInput = {
  title: string;
  workerId: number;
  requiresPhoto?: boolean;
  isRecurring?: boolean;
  weekDays?: number[];
  monthDay?: number | null;
  price?: number;
  category?: string;
  description?: string;
};

export type CreateUserInput = {
  phone: string;
  name?: string;
};

export class TasksFlowError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
    message?: string
  ) {
    super(
      message ||
        `TasksFlow ${status} on ${url}${
          typeof body === "object" && body && "message" in body
            ? `: ${(body as { message: unknown }).message}`
            : ""
        }`
    );
    this.name = "TasksFlowError";
  }
}

type ClientConfig = {
  baseUrl: string;
  apiKey: string;
  /** Per-call timeout. Defaults to 15s. */
  timeoutMs?: number;
};

class TasksFlowClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(cfg: ClientConfig) {
    // Strip trailing slash so we can safely append `/api/...`.
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey;
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const parsed = isJson
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");
      if (!res.ok) {
        throw new TasksFlowError(res.status, url, parsed);
      }
      return parsed as T;
    } catch (err) {
      if (err instanceof TasksFlowError) throw err;
      const reason =
        err instanceof Error ? err.message : "unknown network error";
      throw new TasksFlowError(0, url, null, `Network: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Cheap connectivity probe. We hit `/api/users` because there's no
   * dedicated whoami; a 200 with at least one user means the key is
   * valid and scoped to a company. Returns the raw users so the caller
   * can also infer `companyId`.
   */
  ping(): Promise<TasksFlowUser[]> {
    return this.request<TasksFlowUser[]>("GET", "/api/users");
  }

  listUsers(): Promise<TasksFlowUser[]> {
    return this.request<TasksFlowUser[]>("GET", "/api/users");
  }

  createUser(input: CreateUserInput): Promise<TasksFlowUser> {
    return this.request<TasksFlowUser>("POST", "/api/users", input);
  }

  listTasks(): Promise<TasksFlowTask[]> {
    return this.request<TasksFlowTask[]>("GET", "/api/tasks");
  }

  getTask(id: number): Promise<TasksFlowTask> {
    return this.request<TasksFlowTask>("GET", `/api/tasks/${id}`);
  }

  createTask(input: CreateTaskInput): Promise<TasksFlowTask> {
    return this.request<TasksFlowTask>("POST", "/api/tasks", input);
  }

  updateTask(
    id: number,
    patch: Partial<CreateTaskInput>
  ): Promise<TasksFlowTask> {
    return this.request<TasksFlowTask>("PUT", `/api/tasks/${id}`, patch);
  }

  deleteTask(id: number): Promise<void> {
    return this.request<void>("DELETE", `/api/tasks/${id}`);
  }

  completeTask(id: number): Promise<TasksFlowTask> {
    return this.request<TasksFlowTask>(
      "POST",
      `/api/tasks/${id}/complete`,
      {}
    );
  }

  uncompleteTask(id: number): Promise<TasksFlowTask> {
    return this.request<TasksFlowTask>(
      "POST",
      `/api/tasks/${id}/uncomplete`,
      {}
    );
  }
}

/** Build a client from a stored integration row (decrypts the API key). */
export function tasksflowClientFor(integration: {
  baseUrl: string;
  apiKeyEncrypted: string;
}): TasksFlowClient {
  return new TasksFlowClient({
    baseUrl: integration.baseUrl,
    apiKey: decryptSecret(integration.apiKeyEncrypted),
  });
}

/** Build a client directly from a plaintext key — used during connect. */
export function tasksflowClient(baseUrl: string, apiKey: string): TasksFlowClient {
  return new TasksFlowClient({ baseUrl, apiKey });
}

export type TasksFlowClientType = TasksFlowClient;

/**
 * Normalize a raw phone string to the format TasksFlow stores
 * (`+7XXXXXXXXXX`). Returns null if the number can't be coerced — caller
 * should treat null as "no link possible".
 */
export function normalizeRussianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  // Already-normalized "+7XXXXXXXXXX" passes through (we stripped to digits
  // then re-prefixed).
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7${digits.slice(1)}`;
  }
  return null;
}
