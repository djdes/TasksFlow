/**
 * Маршруты должностной инструкции: кто может загрузить, что принимаем,
 * и что состояние сотрудника видно в «Сотрудниках».
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  getCompanyRole: vi.fn(),
};
vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));

const service = {
  isGatewayConfigured: vi.fn(() => true),
  listJobDescriptionStates: vi.fn(),
  retryJobDescription: vi.fn(),
  runJobDescription: vi.fn(async () => {}),
  saveJobDescription: vi.fn(),
  toState: (row: { userId: number; status: string }) => ({ userId: row.userId, status: row.status, source: "text", fileName: null, tasksCreated: 0, error: null, updatedAt: 1 }),
};
vi.mock("../server/job-description/service", () => service);

const ADMIN = { id: 10, phone: "+79990000010", name: "Анна", isAdmin: true, companyId: 42, roleId: null, managedWorkerIds: null };
const WORKER = { id: 7, phone: "+79990000007", name: "Олег", isAdmin: false, companyId: 42, roleId: null, managedWorkerIds: null, position: "повар" };
const STRANGER = { ...WORKER, id: 8, companyId: 99 };
const users = new Map<number, unknown>([[10, ADMIN], [7, WORKER], [8, STRANGER]]);

async function buildApp(sessionUserId?: number) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUserId ? { userId: sessionUserId } : {};
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return app;
}

/** Минимальный .docx: один абзац с обязанностями. */
function docx(text: string): Buffer {
  const xml = `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const raw = Buffer.from(xml, "utf8");
  const data = deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28);
  const cdOffset = 30 + name.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getUserById.mockImplementation(async (id: number) => users.get(id));
  storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: null });
  storage.getCompanyRole.mockResolvedValue(null);
  service.saveJobDescription.mockImplementation(async (p: { userId: number }) => ({ userId: p.userId, status: "queued" }));
});

describe("POST /api/users/:id/job-description", () => {
  it("админ загружает Word: текст вынут, инструкция в очереди, разбор запущен", async () => {
    const app = await buildApp(10);
    const res = await request(app)
      .post("/api/users/7/job-description")
      .attach("file", docx("Ежедневно проверять сроки годности на витрине"), "Инструкция повара.docx");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ gatewayReady: true, state: { userId: 7, status: "queued" } });
    expect(service.saveJobDescription).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7, companyId: 42, createdBy: 10, source: "docx", fileName: "Инструкция повара.docx",
      content: "Ежедневно проверять сроки годности на витрине",
    }));
    expect(service.runJobDescription).toHaveBeenCalledWith(7);
  });

  it("текстом — тоже; слишком короткий текст — 400 с подсказкой", async () => {
    const app = await buildApp(10);
    const ok = await request(app).post("/api/users/7/job-description").send({ text: "Принимать поставку, сверять накладные, мыть полки" });
    expect(ok.status).toBe(202);
    expect(service.saveJobDescription).toHaveBeenLastCalledWith(expect.objectContaining({ source: "text" }));
    const short = await request(app).post("/api/users/7/job-description").send({ text: "мыть" });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/обязанност/);
  });

  it("старый .doc — 400 «сохраните как .docx», PDF — 400", async () => {
    const app = await buildApp(10);
    const doc = await request(app).post("/api/users/7/job-description").attach("file", Buffer.from("old"), "old.doc");
    expect(doc.status).toBe(400);
    expect(doc.body.message).toMatch(/\.docx/);
    const pdf = await request(app).post("/api/users/7/job-description").attach("file", Buffer.from("%PDF"), "a.pdf");
    expect(pdf.status).toBe(400);
    expect(service.saveJobDescription).not.toHaveBeenCalled();
  });

  it("сотрудник без права на людей — 403; чужая компания — 404; без входа — 401", async () => {
    const asWorker = await buildApp(7);
    expect((await request(asWorker).post("/api/users/7/job-description").send({ text: "x".repeat(50) })).status).toBe(403);
    const asAdmin = await buildApp(10);
    expect((await request(asAdmin).post("/api/users/8/job-description").send({ text: "x".repeat(50) })).status).toBe(404);
    const anon = await buildApp();
    expect((await request(anon).post("/api/users/7/job-description").send({ text: "x".repeat(50) })).status).toBe(401);
    expect(service.saveJobDescription).not.toHaveBeenCalled();
  });
});

describe("GET /api/job-descriptions и повтор", () => {
  it("состояния своей компании и признак настроенного шлюза", async () => {
    service.listJobDescriptionStates.mockResolvedValue([{ userId: 7, status: "done", tasksCreated: 5 }]);
    const app = await buildApp(10);
    const res = await request(app).get("/api/job-descriptions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gatewayReady: true, items: [{ userId: 7, status: "done", tasksCreated: 5 }] });
    expect(service.listJobDescriptionStates).toHaveBeenCalledWith(42);
  });

  it("«Повторить» ставит инструкцию снова в очередь", async () => {
    service.retryJobDescription.mockResolvedValue({ userId: 7, status: "queued" });
    const app = await buildApp(10);
    const res = await request(app).post("/api/users/7/job-description/retry");
    expect(res.status).toBe(200);
    expect(res.body.state.status).toBe("queued");
    expect(service.runJobDescription).toHaveBeenCalledWith(7);
  });
});
