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

import type { Invitation, User } from "../shared/schema";

const storage = {
  // users
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  setUserAdmin: vi.fn(),
  setUserPosition: vi.fn(),
  // companies
  getCompanyById: vi.fn(),
  // api keys (на всякий, чтобы middleware не падал, если кто-то импортирует)
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  // invitations
  createInvitation: vi.fn(),
  getInvitationById: vi.fn(),
  getInvitationByToken: vi.fn(),
  getInvitationsByCompany: vi.fn(),
  markInvitationUsed: vi.fn(),
  revokeInvitation: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

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

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});

describe("POST /api/invitations", () => {
  it("создаёт приглашение для админа компании", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.createInvitation.mockResolvedValue({
      id: 1,
      token: "abc123",
      companyId: 42,
      createdByUserId: 10,
      position: "Кассир",
      isAdmin: false,
      usedAt: null,
      usedByUserId: null,
      revokedAt: null,
      createdAt: 1700000000,
    } satisfies Invitation);

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app)
      .post("/api/invitations")
      .send({ position: "Кассир" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.token).toBe("abc123");
    expect(res.body.url).toMatch(/\/join\/abc123$/);
    expect(res.body.isAdmin).toBe(false);
    expect(storage.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 42,
        createdByUserId: 10,
        position: "Кассир",
        isAdmin: false,
      }),
    );
  });

  it("role=manager делает isAdmin=true", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.createInvitation.mockResolvedValue({
      id: 2,
      token: "tok2",
      companyId: 42,
      createdByUserId: 10,
      position: null,
      isAdmin: true,
      usedAt: null,
      usedByUserId: null,
      revokedAt: null,
      createdAt: 1,
    } satisfies Invitation);

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations").send({ role: "manager" });

    expect(res.status).toBe(201);
    expect(storage.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true }),
    );
  });

  it("без сессии → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app).post("/api/invitations").send({});
    expect(res.status).toBe(401);
  });

  it("не-админ → 403", async () => {
    storage.getUserById.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations").send({});
    expect(res.status).toBe(403);
  });
});
