/**
 * PUT /api/companies/me/task-bonus: премия за задачу по умолчанию.
 * Сливается с access_settings (проверка сотрудника не теряется), задачам
 * без премии ставится только по просьбе, сотруднику — 403.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  getUserById: vi.fn(),
  updateCompany: vi.fn(),
  getCompanyById: vi.fn(),
  applyTaskBonus: vi.fn(),
  getCompanyRole: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { userId: 1 };
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const admin = { id: 1, phone: "+79990000001", name: "Админ", isAdmin: true, createdAt: 1, bonusBalance: 0, companyId: 42 };
const company = { id: 42, name: "Кафе", createdAt: 1, accessSettings: '{"employeeApproval":true}' };

beforeEach(() => {
  for (const fn of Object.values(storage)) fn.mockReset();
  storage.getCompanyById.mockResolvedValue(company);
  storage.updateCompany.mockResolvedValue(company);
  storage.applyTaskBonus.mockResolvedValue({ open: 12, credited: 3 });
});

describe("PUT /api/companies/me/task-bonus", () => {
  it("сохраняет сумму, не теряя проверку сотрудника, и ставит задачам без премии", async () => {
    storage.getUserById.mockResolvedValue(admin);
    const app = await buildApp();
    const res = await request(app).put("/api/companies/me/task-bonus").send({ amount: 30, applyToExisting: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ taskBonus: 30, open: 12, credited: 3 });
    const saved = JSON.parse(storage.updateCompany.mock.calls[0][1].accessSettings);
    expect(saved).toEqual({ employeeApproval: true, taskBonus: 30 });
    expect(storage.applyTaskBonus).toHaveBeenCalledWith(42, 30);
  });

  it("без applyToExisting задачи не трогает", async () => {
    storage.getUserById.mockResolvedValue(admin);
    const app = await buildApp();
    const res = await request(app).put("/api/companies/me/task-bonus").send({ amount: 30 });
    expect(res.status).toBe(200);
    expect(storage.applyTaskBonus).not.toHaveBeenCalled();
  });

  it("дробь и минус — 400 JSON", async () => {
    storage.getUserById.mockResolvedValue(admin);
    const app = await buildApp();
    for (const amount of [1.5, -1, "30"]) {
      const res = await request(app).put("/api/companies/me/task-bonus").send({ amount });
      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
    }
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });

  it("сотруднику — 403", async () => {
    storage.getUserById.mockResolvedValue({ ...admin, isAdmin: false });
    const app = await buildApp();
    const res = await request(app).put("/api/companies/me/task-bonus").send({ amount: 30 });
    expect(res.status).toBe(403);
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });
});
