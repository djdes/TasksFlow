/**
 * Тесты proxyToWesetup через POST /api/wesetup/sync-users + GET /api/wesetup/links.
 *
 * Все 4 sync-endpoint'а (sync-users, sync-tasks, sync-hierarchy,
 * bulk-assign-today, links) — тонкие proxy'и через одну функцию
 * proxyToWesetup. Покрытие sync-users + links даёт coverage всех
 * остальных через ту же функцию.
 *
 * Critical:
 *   • Auth: requireAuth + requireAdmin
 *   • resolveWesetupTarget: 503 если интеграция не настроена
 *     (company.wesetupBaseUrl/wesetupApiKey + env fallback)
 *   • Forward: метод, headers (Authorization Bearer), body, query
 *   • Forward response: status + content-type + body
 *   • Network error → 502
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Company, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

async function buildApp(opts: { sessionUserId?: number } = {}) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = opts.sessionUserId ? { userId: opts.sessionUserId } : {};
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

const ADMIN: User = {
  id: 10,
  phone: "+79990000010",
  name: "Admin",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const WORKER: User = { ...ADMIN, id: 7, isAdmin: false };

const COMPANY_OK: Company = {
  id: 42,
  name: "Test",
  email: null,
  createdAt: 1,
  wesetupBaseUrl: "https://wesetup.example.com",
  wesetupApiKey: "wesetup-key-abc",
};

const COMPANY_NO_INTEGRATION: Company = {
  ...COMPANY_OK,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const COMPANY_PARTIAL: Company = {
  ...COMPANY_OK,
  wesetupBaseUrl: "https://wesetup.example.com",
  wesetupApiKey: null, // только URL без ключа
};

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_WESETUP_BASE = process.env.WESETUP_BASE_URL;
const ORIGINAL_WESETUP_KEY = process.env.WESETUP_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_WESETUP_BASE === undefined) delete process.env.WESETUP_BASE_URL;
  else process.env.WESETUP_BASE_URL = ORIGINAL_WESETUP_BASE;
  if (ORIGINAL_WESETUP_KEY === undefined) delete process.env.WESETUP_API_KEY;
  else process.env.WESETUP_API_KEY = ORIGINAL_WESETUP_KEY;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  delete process.env.WESETUP_BASE_URL;
  delete process.env.WESETUP_API_KEY;
});

function mockUpstream(opts: {
  status: number;
  body: string;
  contentType?: string;
}) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () => opts.body,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-type"
          ? opts.contentType ?? "application/json"
          : null,
    },
  } as unknown as Response);
}

describe("POST /api/wesetup/sync-users — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(403);
  });
});

describe("POST /api/wesetup/sync-users — resolveWesetupTarget", () => {
  it("company без настроек + env пусто → 503 'не настроена'", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_NO_INTEGRATION);

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/не настроена/i);
    expect(globalThis.fetch).toBe(ORIGINAL_FETCH); // не дёргали fetch
  });

  it("company настроена частично (только baseUrl) → 503 'настроена не полностью'", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_PARTIAL);

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/не полностью/i);
  });

  it("env-fallback: company пустая, но WESETUP_* есть → forward", async () => {
    process.env.WESETUP_BASE_URL = "https://env-wesetup.example.com";
    process.env.WESETUP_API_KEY = "env-key";
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_NO_INTEGRATION);
    mockUpstream({ status: 200, body: '{"ok":true}' });

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalled();
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl).toContain("env-wesetup.example.com");
  });
});

describe("POST /api/wesetup/sync-users — forward", () => {
  it("шлёт Authorization: Bearer <company.key> + Content-Type:application/json + body", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: "{}" });

    await request(app).post(`/api/wesetup/sync-users`).send({ batch: true });

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${COMPANY_OK.wesetupApiKey}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ batch: true });
  });

  it("URL: <company.baseUrl>/api/integrations/tasksflow/sync-users", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: "{}" });

    await request(app).post(`/api/wesetup/sync-users`).send({});

    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl).toBe(
      `${COMPANY_OK.wesetupBaseUrl}/api/integrations/tasksflow/sync-users`,
    );
  });

  it("upstream 200 → forward status + body + content-type", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: '{"synced":15}',
      contentType: "application/json; charset=utf-8",
    });

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(200);
    expect(r.body.synced).toBe(15);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
  });

  it("upstream 4xx → forward тот же status (не маскируем)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 400, body: '{"message":"Bad payload"}' });

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Bad payload");
  });

  it("network error → 502 с normalized message", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app).post(`/api/wesetup/sync-users`).send({});
    expect(r.status).toBe(502);
    expect(r.body.message).toBeDefined();
  });
});

describe("GET /api/wesetup/links — GET-method proxy", () => {
  it("admin → forward GET без body, без Content-Type", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: "[]" });

    const r = await request(app).get(`/api/wesetup/links`);
    expect(r.status).toBe(200);

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    // Для GET не должен ставиться Content-Type
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).get(`/api/wesetup/links`);
    expect(r.status).toBe(403);
  });
});
