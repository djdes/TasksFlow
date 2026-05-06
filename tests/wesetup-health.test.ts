/**
 * Тесты GET /api/wesetup/health.
 *
 * Health-check для WeSetup интеграции — UI dashboard в /admin/integrations
 * показывает «зелёная галка / красный крест». Если эта проверка
 * deceiv'ит, админ думает что всё работает, хотя upstream лежит — и
 * synchros тихо ломаются.
 *
 * Branches:
 *   • config error (resolveWesetupTarget) → status target.status
 *   • upstream 401/403 → 401 (явно показываем «ключ неверный»)
 *   • upstream non-2xx прочее → 502
 *   • upstream OK но не каталог (нет journals[]) → 502
 *   • happy path → 200 с counts (journalsCount, formsCount,
 *     assignableUsersCount)
 *   • network error → 502
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
  wesetupApiKey: "wesetup-key",
};

const COMPANY_OFF: Company = {
  ...COMPANY_OK,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_BASE = process.env.WESETUP_BASE_URL;
const ORIGINAL_KEY = process.env.WESETUP_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_BASE === undefined) delete process.env.WESETUP_BASE_URL;
  else process.env.WESETUP_BASE_URL = ORIGINAL_BASE;
  if (ORIGINAL_KEY === undefined) delete process.env.WESETUP_API_KEY;
  else process.env.WESETUP_API_KEY = ORIGINAL_KEY;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  delete process.env.WESETUP_BASE_URL;
  delete process.env.WESETUP_API_KEY;
});

function mockUpstream(opts: { status: number; body: unknown }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () => JSON.stringify(opts.body),
    json: async () => opts.body,
    headers: { get: () => "application/json" },
  } as unknown as Response);
}

describe("GET /api/wesetup/health — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(403);
  });
});

describe("GET /api/wesetup/health — config errors", () => {
  it("integration не настроена → 503 ok:false (не дёргаем upstream)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OFF);

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toMatch(/не настроена/i);
  });
});

describe("GET /api/wesetup/health — upstream errors", () => {
  it("upstream 401/403 → 401 ok:false (auth-проблема)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 401, body: { message: "Unauthorized" } });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(401);
    expect(r.body.ok).toBe(false);
    expect(r.body.upstreamStatus).toBe(401);
  });

  it("upstream 500 → 502 ok:false", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 500, body: { message: "Internal" } });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
    expect(r.body.upstreamStatus).toBe(500);
  });

  it("upstream OK но не каталог (нет journals[]) → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: { something: "else" } });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toMatch(/каталог/i);
  });

  it("network error → 502 ok:false", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
  });
});

describe("GET /api/wesetup/health — happy path с counts", () => {
  it("upstream OK с journals → 200 с правильными counts", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: {
        journals: [
          { templateCode: "cleaning", taskForm: { fields: [] } },
          { templateCode: "hygiene" }, // без taskForm
          { templateCode: "acceptance", taskForm: {} },
        ],
        assignableUsers: [{ id: "u1" }, { id: "u2" }],
      },
    });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.source).toBe("company"); // из company, не env
    expect(r.body.baseUrl).toBe(COMPANY_OK.wesetupBaseUrl);
    expect(r.body.journalsCount).toBe(3);
    expect(r.body.formsCount).toBe(2); // только те у кого taskForm truthy
    expect(r.body.assignableUsersCount).toBe(2);
  });

  it("assignableUsers отсутствует → assignableUsersCount=0 (defensive)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: { journals: [] },
    });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.journalsCount).toBe(0);
    expect(r.body.formsCount).toBe(0);
    expect(r.body.assignableUsersCount).toBe(0);
  });

  it("env-fallback: source='env' когда company пустая, но env задан", async () => {
    process.env.WESETUP_BASE_URL = "https://env-wesetup.example.com";
    process.env.WESETUP_API_KEY = "env-key";
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OFF);
    mockUpstream({ status: 200, body: { journals: [] } });

    const r = await request(app).get(`/api/wesetup/health`);
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("env");
    expect(r.body.baseUrl).toBe("https://env-wesetup.example.com");
  });
});
