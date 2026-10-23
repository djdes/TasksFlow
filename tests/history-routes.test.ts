/**
 * Журнал дня, сводка по людям и CSV: видимость по ролям, сегодняшний день
 * из живых задач, прошлые — из task_history. Плюс companies/me: часовой
 * пояс и ключ WeSetup только для админа.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  updateCompany: vi.fn(),
  getTasks: vi.fn(),
  getAllUsers: vi.fn(),
};
const listHistory = vi.fn();

vi.mock("../server/storage", () => ({
  storage,
  DatabaseStorage: {
    parseManagedWorkerIds: (raw: string | null) => (raw ? JSON.parse(raw) : null),
  },
}));
vi.mock("../server/task-history-store", () => ({ listHistory, resetStore: {} }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));

let sessionStore: Record<string, unknown>;

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionStore;
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
// «Сейчас» — 24.10.2026 12:00 по Москве.
const NOW_MS = Date.UTC(2026, 9, 24, 9, 0);

const company = { id: 1, name: "Кафе", email: null, createdAt: 1, wesetupBaseUrl: "https://wesetup.ru", wesetupApiKey: "ws_secret", timezone: "Europe/Moscow", lastResetDay: "2026-10-24" };
const admin = { id: 1, name: "Ирина", phone: "+79990000001", isAdmin: true, companyId: 1, managedWorkerIds: null };
const anna = { id: 10, name: "Анна", phone: "+79990000010", isAdmin: false, companyId: 1, managedWorkerIds: null };
const boris = { id: 11, name: "Борис", phone: "+79990000011", isAdmin: false, companyId: 1, managedWorkerIds: null };
const chef = { id: 12, name: "Шеф", phone: "+79990000012", isAdmin: false, companyId: 1, managedWorkerIds: "[10]" };
const people = [admin, anna, boris, chef];

function task(extra: Record<string, unknown>) {
  return {
    id: 1, title: "Задача", workerId: 10, isCompleted: false, isRecurring: true, completedAt: null, createdAt: 1,
    photoUrl: null, photoUrls: [], checklist: [], weekDays: null, monthDay: null, price: 0, category: null,
    claimedByWorkerId: null, verificationStatus: null, companyId: 1, ...extra,
  };
}

function historyRow(extra: Record<string, unknown>) {
  return {
    id: 1, taskId: 1, companyId: 1, workerId: 10, day: "2026-10-23", status: "done", title: "Витрина", category: null,
    price: 100, completedAt: utc(2026, 10, 23, 7, 30), photoUrls: '["/uploads/a.jpg"]', checklist: null,
    claimedByWorkerId: null, verificationStatus: null, verifiedByUserId: null, verifiedAt: null, createdAt: 1, ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  Object.values(storage).forEach((m) => m.mockReset());
  listHistory.mockReset();
  sessionStore = {};
  storage.getCompanyById.mockResolvedValue(company);
  storage.getAllUsers.mockResolvedValue(people);
  storage.getUserById.mockImplementation(async (id: number) => people.find((p) => p.id === id));
  storage.getTasks.mockResolvedValue([]);
  listHistory.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/history", () => {
  it("прошлый день — из истории, с фото и временем по поясу компании", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    listHistory.mockResolvedValue([historyRow({})]);
    const r = await request(app).get("/api/history?day=2026-10-23");
    expect(r.status).toBe(200);
    expect(listHistory).toHaveBeenCalledWith({ companyId: 1, from: "2026-10-23", to: "2026-10-23", workerIds: null });
    expect(r.body.items[0]).toMatchObject({ status: "done", time: "10:30", photoUrls: ["/uploads/a.jpg"], price: 100 });
    expect(r.body.today).toBe("2026-10-24");
  });

  it("сегодня — из живых задач: сделано, на проверке, ждёт; старое разовое не попадает", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.getTasks.mockResolvedValue([
      task({ id: 1, isCompleted: true, completedAt: utc(2026, 10, 24, 6), photoUrls: ["/uploads/t.jpg"], price: 50 }),
      task({ id: 2, verificationStatus: "submitted", photoUrls: ["/uploads/s.jpg"] }),
      task({ id: 3 }),
      task({ id: 4, isRecurring: false, isCompleted: true, completedAt: utc(2026, 10, 20, 6) }),
      task({ id: 5, weekDays: [1] }), // только по понедельникам, а сегодня суббота
    ]);
    const r = await request(app).get("/api/history");
    expect(r.status).toBe(200);
    expect(listHistory).not.toHaveBeenCalled();
    expect(r.body.items.map((i: any) => [i.taskId, i.status])).toEqual([[1, "done"], [2, "submitted"], [3, "pending"]]);
    expect(r.body.items[0].time).toBe("09:00");
  });

  it("сотрудник видит только себя, чужой workerId — 403", async () => {
    const app = await buildApp();
    sessionStore.userId = anna.id;
    await request(app).get("/api/history?day=2026-10-23");
    expect(listHistory).toHaveBeenCalledWith(expect.objectContaining({ workerIds: [10] }));
    const r = await request(app).get("/api/history?day=2026-10-23&workerId=11");
    expect(r.status).toBe(403);
  });

  it("руководитель видит своих и себя", async () => {
    const app = await buildApp();
    sessionStore.userId = chef.id;
    await request(app).get("/api/history?day=2026-10-23");
    expect(listHistory).toHaveBeenCalledWith(expect.objectContaining({ workerIds: [10, 12] }));
    expect((await request(app).get("/api/history?day=2026-10-23&workerId=10")).status).toBe(200);
    expect((await request(app).get("/api/history?day=2026-10-23&workerId=11")).status).toBe(403);
  });

  it("будущая или кривая дата — 400", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    expect((await request(app).get("/api/history?day=2026-10-25")).status).toBe(400);
    expect((await request(app).get("/api/history?day=2026-13-01")).status).toBe(400);
  });

  it("без входа — 401", async () => {
    const app = await buildApp();
    expect((await request(app).get("/api/history")).status).toBe(401);
  });
});

describe("GET /api/reports/summary", () => {
  it("считает сделанное, пропуски, премии и долю по людям", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    listHistory.mockResolvedValue([
      historyRow({ id: 1, taskId: 1, day: "2026-10-22" }),
      historyRow({ id: 2, taskId: 2, day: "2026-10-23", status: "missed", price: 0, photoUrls: null }),
      historyRow({ id: 3, taskId: 3, day: "2026-10-23", workerId: 11, status: "claimed", price: 0 }),
    ]);
    storage.getTasks.mockResolvedValue([task({ id: 9, isCompleted: true, completedAt: utc(2026, 10, 24, 6), price: 30 })]);
    const r = await request(app).get("/api/reports/summary?from=2026-10-22&to=2026-10-24");
    expect(r.status).toBe(200);
    expect(listHistory).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-10-22", to: "2026-10-23" }));
    const annaRow = r.body.people.find((p: any) => p.workerId === 10);
    expect(annaRow).toMatchObject({ name: "Анна", done: 2, missed: 1, bonus: 130, photos: 1 });
    expect(annaRow.rate).toBeCloseTo(2 / 3);
    expect(r.body.totals).toMatchObject({ done: 2, missed: 1, claimed: 1, bonus: 130 });
    expect(r.body.days).toEqual([
      { day: "2026-10-22", done: 1, missed: 0 },
      { day: "2026-10-23", done: 0, missed: 1 },
      { day: "2026-10-24", done: 1, missed: 0 },
    ]);
  });

  it("период больше 92 дней или в будущем — 400", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    expect((await request(app).get("/api/reports/summary?from=2026-01-01&to=2026-10-24")).status).toBe(400);
    expect((await request(app).get("/api/reports/summary?from=2026-10-20&to=2026-10-30")).status).toBe(400);
    expect((await request(app).get("/api/reports/summary?from=2026-10-24&to=2026-10-20")).status).toBe(400);
  });
});

describe("GET /api/reports/export.csv", () => {
  it("CSV для Excel: BOM, «;», полные ссылки на фото, формулы обезврежены", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    listHistory.mockResolvedValue([historyRow({ title: "=HYPERLINK(\"x\")" })]);
    const r = await request(app).get("/api/reports/export.csv?from=2026-10-23&to=2026-10-23").buffer(true).parse((res, cb) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (data += c));
      res.on("end", () => cb(null, data));
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.headers["content-disposition"]).toContain('filename="tasksflow-2026-10-23_2026-10-23.csv"');
    const body = r.body as string;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = body.slice(1).split("\r\n");
    expect(header).toBe("Дата;Сотрудник;Телефон;Задача;Категория;Статус;Время;Премия, ₽;Фото");
    expect(row).toContain("23.10.2026;Анна;8 (999) 000-00-10;");
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toMatch(/;Выполнено;10:30;100;https?:\/\/[^;]+\/uploads\/a\.jpg$/);
  });
});

describe("/api/companies/me", () => {
  it("сотрудник не получает ключ WeSetup, админ получает", async () => {
    const app = await buildApp();
    sessionStore.userId = anna.id;
    const worker = await request(app).get("/api/companies/me");
    expect(worker.body.wesetupApiKey).toBeNull();
    expect(worker.body.wesetupConfigured).toBe(true);
    expect(worker.body.timezone).toBe("Europe/Moscow");
    expect(worker.body.lastResetDay).toBeUndefined();
    sessionStore.userId = admin.id;
    const own = await request(app).get("/api/companies/me");
    expect(own.body.wesetupApiKey).toBe("ws_secret");
  });

  it("настройки фото: по умолчанию в ответе, админ сохраняет", async () => {
    const app = await buildApp();
    sessionStore.userId = anna.id;
    const r = await request(app).get("/api/companies/me");
    expect(r.body.photo).toEqual({ stamp: true, cameraOnly: false });
    expect(r.body.photoSettings).toBeUndefined();
    sessionStore.userId = admin.id;
    storage.updateCompany.mockResolvedValue({ ...company, photoSettings: '{"stamp":false,"cameraOnly":true}' });
    const saved = await request(app).put("/api/companies/me").send({ name: "Кафе", photo: { stamp: false, cameraOnly: true } });
    expect(saved.status).toBe(200);
    expect(storage.updateCompany).toHaveBeenCalledWith(1, { name: "Кафе", photoSettings: '{"stamp":false,"cameraOnly":true}' });
    expect(saved.body.photo).toEqual({ stamp: false, cameraOnly: true });
  });

  it("частичное сохранение без email не стирает email", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.updateCompany.mockResolvedValue(company);
    await request(app).put("/api/companies/me").send({ name: "Кафе", timezone: "Europe/Moscow" });
    expect(storage.updateCompany).toHaveBeenCalledWith(1, { name: "Кафе", timezone: "Europe/Moscow" });
  });

  it("админ меняет часовой пояс, неизвестный — 400", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.updateCompany.mockResolvedValue({ ...company, timezone: "Asia/Vladivostok" });
    const bad = await request(app).put("/api/companies/me").send({ name: "Кафе", timezone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("timezone");
    const ok = await request(app).put("/api/companies/me").send({ name: "Кафе", timezone: "Asia/Vladivostok" });
    expect(ok.status).toBe(200);
    expect(storage.updateCompany).toHaveBeenCalledWith(1, expect.objectContaining({ timezone: "Asia/Vladivostok" }));
  });
});
