/**
 * Тесты GET /api/wesetup/task-form.
 *
 * Worker открывает journal-bound task → UI запрашивает у backend
 * form-схему (поля, типы, обязательность) для рендера inline-формы.
 * Backend дёргает /api/integrations/tasksflow/task-form у WeSetup.
 *
 * Edge cases:
 *   • upstream вернул normalized form → forward
 *   • upstream OK но без формы и без journalCode → 404 «не связана»
 *   • upstream OK но не нормализуется → 502
 *   • upstream 4xx-5xx → forward или попытка fallback из catalog
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

function mockUpstream(opts: { status: number; body?: unknown; bodyText?: string }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () =>
      opts.bodyText !== undefined
        ? opts.bodyText
        : opts.body !== undefined
          ? JSON.stringify(opts.body)
          : "",
    headers: { get: () => "application/json" },
  } as unknown as Response);
}

describe("GET /api/wesetup/task-form — auth + scope", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
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

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(503);
  });

  it("без taskId → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);

    const r = await request(app).get(`/api/wesetup/task-form`);
    expect(r.status).toBe(400);
  });

  it("несуществующая задача → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).get(`/api/wesetup/task-form?taskId=9999`);
    expect(r.status).toBe(404);
  });

  it("чужая компания → 404 (multi-tenant)", async () => {
    // КРИТИЧНО: иначе worker A может узнать структуру форм компании B.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(404);
    expect(globalThis.fetch).toBe(ORIGINAL_FETCH);
  });
});

describe("GET /api/wesetup/task-form — upstream contract", () => {
  it("upstream OK с form → 200 forward (normalized)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({
      status: 200,
      body: {
        form: {
          fields: [{ key: "comment", type: "text", label: "Комментарий" }],
        },
        journalCode: "cleaning",
      },
    });

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(200);
    expect(r.body.form).toBeDefined();
  });

  it("upstream OK + пустой body → forward {form:null} (graceful)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 200, bodyText: "" });

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(200);
    expect(r.body.form).toBeNull();
  });

  it("upstream OK + текстовый ответ который не парсится → 502", async () => {
    // upstream OK по статусу, но body не JSON и не пустой → нет
    // нормализованного результата, fallback не помогает → 502 с
    // информативным сообщением, а не silent corruption.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 200, bodyText: "garbage{{{" });

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/неизвестном формате|формат/i);
  });

  it("upstream 4xx (401/403) → forward тот же status", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 401, body: { message: "Auth" } });

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(401);
  });

  it("network error → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app).get(`/api/wesetup/task-form?taskId=100`);
    expect(r.status).toBe(502);
  });
});

describe("GET /api/wesetup/task-form — URL", () => {
  it("upstream URL содержит taskId в query", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 200, body: { form: { fields: [] }, journalCode: "x" } });

    await request(app).get(`/api/wesetup/task-form?taskId=100`);

    const callUrl = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(callUrl).toContain("taskId=100");
  });
});
