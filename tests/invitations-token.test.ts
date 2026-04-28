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

import type { Invitation, User, Company } from "../shared/schema";

const storage = {
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  setUserAdmin: vi.fn(),
  setUserPosition: vi.fn(),
  getCompanyById: vi.fn(),
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getInvitationByToken: vi.fn(),
  getInvitationById: vi.fn(),
  getInvitationsByCompany: vi.fn(),
  createInvitation: vi.fn(),
  markInvitationUsed: vi.fn(),
  revokeInvitation: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

const COMPANY: Company = {
  id: 42,
  name: "ООО Ромашка",
  email: null,
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const ACTIVE: Invitation = {
  id: 1,
  token: "good-token",
  companyId: 42,
  createdByUserId: 10,
  position: "Курьер",
  isAdmin: false,
  usedAt: null,
  usedByUserId: null,
  revokedAt: null,
  createdAt: 1,
};

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = {};
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => Object.values(storage).forEach((m) => m.mockReset?.()));

describe("GET /api/invitations/by-token/:token", () => {
  it("активное → valid:true с companyName и position", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getCompanyById.mockResolvedValue(COMPANY);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      companyName: "ООО Ромашка",
      position: "Курьер",
    });
  });

  it("несуществующий токен → valid:false reason:not_found", async () => {
    storage.getInvitationByToken.mockResolvedValue(undefined);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/nope");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "not_found" });
  });

  it("уже использованное → valid:false reason:used", async () => {
    storage.getInvitationByToken.mockResolvedValue({
      ...ACTIVE,
      usedAt: 100,
      usedByUserId: 7,
    });
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body).toEqual({ valid: false, reason: "used" });
  });

  it("отозванное → valid:false reason:revoked", async () => {
    storage.getInvitationByToken.mockResolvedValue({ ...ACTIVE, revokedAt: 50 });
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body).toEqual({ valid: false, reason: "revoked" });
  });

  it("не отдаёт companyId/createdByUserId/isAdmin/id", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getCompanyById.mockResolvedValue(COMPANY);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body.companyId).toBeUndefined();
    expect(res.body.createdByUserId).toBeUndefined();
    expect(res.body.isAdmin).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });
});
