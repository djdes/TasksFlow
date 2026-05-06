/**
 * Тесты GET /api/wesetup/journals-catalog + /cleaning-catalog (compat)
 * + POST /api/wesetup/bind-row.
 *
 * journals-catalog — passthrough proxy: forward upstream без transform.
 *
 * cleaning-catalog — compat-обёртка для старой CreateTask.tsx, которая
 * ждёт {journalCode:"cleaning", documents:[{pairs:[...]}]}.
 * Transformation: extract cleaning journal, mapping rows → pairs:
 *   { label, sublabel, responsibleUserId, existingTasksflowTaskId } →
 *   { cleaningTitle, controlTitle, cleaningUserId, existingTasksflowTaskId }
 *
 * Регрессия в transform = старый CreateTask UI ломается («не виден
 * список ответственных»).
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
    json: async () => opts.body,
    headers: { get: () => "application/json" },
  } as unknown as Response);
}

// ─── GET /api/wesetup/journals-catalog ───────────────────────────────

describe("GET /api/wesetup/journals-catalog — passthrough proxy", () => {
  it("auth: 401 без session", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(403);
  });

  it("integration не настроена → 503", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OFF);

    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(503);
  });

  it("upstream OK → forward status + body как есть", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: { journals: [{ templateCode: "cleaning" }] },
    });

    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(200);
    expect(r.body.journals).toHaveLength(1);
  });

  it("upstream 4xx → forward тот же status (не маскируем)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 401, body: { message: "Bad key" } });

    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(401);
  });

  it("network error → 502", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app).get(`/api/wesetup/journals-catalog`);
    expect(r.status).toBe(502);
  });
});

// ─── GET /api/wesetup/cleaning-catalog (compat shim) ─────────────────

describe("GET /api/wesetup/cleaning-catalog — compat transform", () => {
  // Старая CreateTask.tsx ждёт legacy формат
  // {journalCode:"cleaning", documents:[{pairs:[...]}]}.
  // Эта compat-обёртка вызывает journals-catalog и трансформирует
  // только journal templateCode="cleaning" в pairs.

  const upstreamCatalog = {
    journals: [
      {
        templateCode: "cleaning",
        documents: [
          {
            documentId: "doc-1",
            documentTitle: "Уборка апрель",
            period: { from: "2026-04-01", to: "2026-04-30" },
            rows: [
              {
                rowKey: "r1",
                label: "Зал 1 — Иван",
                sublabel: "Контроль: Анна",
                responsibleUserId: "user-7",
                existingTasksflowTaskId: 999,
              },
              {
                rowKey: "r2",
                label: "Зал 2 — Пётр",
                sublabel: "Контроль: Анна",
                responsibleUserId: null,
                existingTasksflowTaskId: null,
              },
            ],
          },
        ],
      },
      {
        templateCode: "hygiene", // другой журнал — игнорируется
        documents: [{ documentId: "h1", documentTitle: "Гигиена", period: {}, rows: [] }],
      },
    ],
  };

  it("transform: cleaning journal → {journalCode, documents:[{pairs}]}", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: upstreamCatalog });

    const r = await request(app).get(`/api/wesetup/cleaning-catalog`);
    expect(r.status).toBe(200);
    expect(r.body.journalCode).toBe("cleaning");
    expect(r.body.documents).toHaveLength(1);

    const doc = r.body.documents[0];
    expect(doc.documentId).toBe("doc-1");
    expect(doc.title).toBe("Уборка апрель");
    expect(doc.period).toEqual({ from: "2026-04-01", to: "2026-04-30" });

    expect(doc.pairs).toHaveLength(2);
    const p1 = doc.pairs[0];
    expect(p1.rowKey).toBe("r1");
    expect(p1.cleaningTitle).toBe("Зал 1 — Иван");
    expect(p1.controlTitle).toBe("Контроль: Анна");
    expect(p1.cleaningUserId).toBe("user-7");
    expect(p1.existingTasksflowTaskId).toBe(999);
    expect(p1.controlUserName).toBeNull();
  });

  it("нет cleaning journal в каталоге → documents=[] (не throw)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: { journals: [{ templateCode: "hygiene", documents: [] }] },
    });

    const r = await request(app).get(`/api/wesetup/cleaning-catalog`);
    expect(r.status).toBe(200);
    expect(r.body.journalCode).toBe("cleaning");
    expect(r.body.documents).toEqual([]);
  });

  it("sublabel отсутствует → controlTitle пустая строка (defensive)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({
      status: 200,
      body: {
        journals: [
          {
            templateCode: "cleaning",
            documents: [
              {
                documentId: "d",
                documentTitle: "T",
                period: { from: "", to: "" },
                rows: [
                  {
                    rowKey: "r",
                    label: "L",
                    responsibleUserId: null,
                    existingTasksflowTaskId: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const r = await request(app).get(`/api/wesetup/cleaning-catalog`);
    expect(r.status).toBe(200);
    expect(r.body.documents[0].pairs[0].controlTitle).toBe("");
  });

  it("upstream 4xx → forward status (не транформируем)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 401, body: { message: "no" } });

    const r = await request(app).get(`/api/wesetup/cleaning-catalog`);
    expect(r.status).toBe(401);
  });
});

// ─── POST /api/wesetup/bind-row ──────────────────────────────────────

describe("POST /api/wesetup/bind-row — proxy", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/wesetup/bind-row`).send({});
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).post(`/api/wesetup/bind-row`).send({});
    expect(r.status).toBe(403);
  });

  it("happy path → forward POST с body и Authorization", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    mockUpstream({ status: 200, body: { ok: true } });

    const r = await request(app)
      .post(`/api/wesetup/bind-row`)
      .send({ taskId: 100, rowKey: "r1" });
    expect(r.status).toBe(200);

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      taskId: 100,
      rowKey: "r1",
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${COMPANY_OK.wesetupApiKey}`);
  });

  it("network error → 502 с нормализованным сообщением", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));

    const r = await request(app).post(`/api/wesetup/bind-row`).send({});
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/журнал/i);
  });
});
