/**
 * Тесты GET /api/wesetup/task-fill-url.
 *
 * Worker открывает journal-bound task → нажимает «Заполнить», UI
 * запрашивает у backend подписанный URL вида:
 *   https://wesetup.example.com/task-fill/<id>?token=<HMAC>&return=<back>
 *
 * Backend: получает token у WeSetup, конвертит upstream URL в public-
 * routable (важно для production: WeSetup сервер вызывается через
 * localhost, но браузер никогда не должен получить localhost), добавляет
 * return=<TasksFlow>/dashboard.
 *
 * Critical:
 *   • requireAuth + multi-tenant scope (404 на чужой task)
 *   • 400 на bad taskId
 *   • Если task имеет journal-link с integrationId — пробрасывается
 *     в WeSetup payload (чтобы token включал integrationId)
 *   • 502 если WeSetup не вернул url
 *   • Public URL transformation (localhost → public domain)
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

import type { Company, Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  getTask: vi.fn(),
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

const COMPANY_OK: Company = {
  id: 42,
  name: "Test",
  email: null,
  createdAt: 1,
  wesetupBaseUrl: "https://wesetup.example.com",
  wesetupApiKey: "key",
};

const TASK: Task = {
  id: 100,
  title: "Уборка",
  workerId: 7,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: false,
  weekDays: null,
  monthDay: null,
  isRecurring: true,
  price: 0,
  category: null,
  description: null,
  companyId: 42,
  journalLink: null,
  createdAt: 0,
  completedAt: null,
  claimedByWorkerId: null,
  verificationStatus: null,
  verifierWorkerId: null,
  verifiedByUserId: null,
  verifiedAt: null,
  rejectReason: null,
  submittedValues: null,
} as Task;

const TASK_FOREIGN: Task = { ...TASK, companyId: 999 };

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = ORIGINAL_FETCH;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});

function mockUpstream(opts: { status: number; body: unknown }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () => JSON.stringify(opts.body),
    headers: { get: () => "application/json" },
  } as unknown as Response);
}

describe("GET /api/wesetup/task-fill-url — auth + config", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(401);
  });

  it("integration не настроена → 503", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue({
      ...COMPANY_OK,
      wesetupBaseUrl: null,
      wesetupApiKey: null,
    });

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(503);
  });
});

describe("GET /api/wesetup/task-fill-url — taskId validation", () => {
  it("без taskId → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);

    const r = await request(app).get(`/api/wesetup/task-fill-url`);
    expect(r.status).toBe(400);
  });

  it("taskId=NaN → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=abc`);
    expect(r.status).toBe(400);
  });

  it("taskId=0 → 400 (≤0 не принимается)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=0`);
    expect(r.status).toBe(400);
  });
});

describe("GET /api/wesetup/task-fill-url — task scope", () => {
  it("несуществующая task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=9999`);
    expect(r.status).toBe(404);
  });

  it("чужая компания → 404 (multi-tenant защита)", async () => {
    // КРИТИЧНО: иначе worker компании A мог бы создать fill-token
    // для task'и компании B и попасть в чужой WeSetup журнал.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(404);
    expect(globalThis.fetch).toBe(ORIGINAL_FETCH); // не дёргали upstream
  });
});

describe("GET /api/wesetup/task-fill-url — upstream contract", () => {
  it("happy path → 200 с url + token", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({
      status: 200,
      body: {
        url: "https://wesetup.example.com/task-fill/100?token=abc",
        token: "abc",
      },
    });

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(200);
    expect(r.body.token).toBe("abc");
    expect(r.body.url).toContain("token=abc");
    // return=<dashboard> добавлен
    expect(r.body.url).toContain("return=");
    expect(decodeURIComponent(r.body.url)).toMatch(/\/dashboard/);
  });

  it("upstream payload содержит taskId в body", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({
      status: 200,
      body: { url: "https://wesetup.example.com/x", token: "t" },
    });

    await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.taskId).toBe(100);
    // integrationId не пробрасывается если нет journalLink
    expect(body.integrationId).toBeUndefined();
  });

  it("upstream non-JSON ответ → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "not json {{",
      headers: { get: () => "text/html" },
    } as unknown as Response);

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/не JSON/i);
  });

  it("upstream JSON без url → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 200, body: { token: "abc" } }); // no url

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/url/i);
  });

  it("upstream 4xx → forward тот же status", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 401, body: { message: "Auth" } });

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(401);
  });

  it("network error → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app).get(`/api/wesetup/task-fill-url?taskId=100`);
    expect(r.status).toBe(502);
  });
});
