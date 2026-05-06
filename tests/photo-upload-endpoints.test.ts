/**
 * Тесты POST /api/tasks/:id/photo + /example-photo (multer multipart).
 *
 * Базовое покрытие: auth/scope checks (срабатывают ДО multer'а),
 * multer mime-allowlist, и happy path с маленьким буфером + cleanup.
 *
 * Critical:
 *   • Mime allowlist — раньше принимали любой image/*, что в теории
 *     включает image/svg+xml (XSS через embedded <script>). Теперь
 *     allowlist строгий: jpg/png/webp/gif/heic.
 *   • Photo limit ≥10 → 400 (anti-storage-flood)
 *   • Worker scope: только сам task.workerId или admin может upload
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
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
const STRANGER: User = { ...ADMIN, id: 99, isAdmin: false };

const TASK: Task = {
  id: 100,
  title: "Уборка",
  workerId: 7,
  requiresPhoto: true,
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

// Мини-валидный JPEG header (Buffer) — multer примет mime image/jpeg.
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const uploadedFiles: string[] = []; // для cleanup

afterEach(async () => {
  vi.restoreAllMocks();
  // Cleanup всех загруженных файлов
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  for (const filename of uploadedFiles) {
    await fs.unlink(path.join(uploadsDir, filename)).catch(() => null);
  }
  uploadedFiles.length = 0;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  // Запоминаем filename из updateTask чтобы потом удалить
  storage.updateTask.mockImplementation(async (id: number, patch: any) => {
    if (patch.photoUrl) {
      const filename = patch.photoUrl.replace(/^\/uploads\//, "");
      uploadedFiles.push(filename);
    }
    return { ...TASK, id, ...patch };
  });
});

// ─── POST /api/tasks/:id/photo ───────────────────────────────────────

describe("POST /api/tasks/:id/photo — auth (до multer'а)", () => {
  it("без session → 401 (middleware short-circuit, multer не вызван)", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/tasks/100/photo`);
    expect(r.status).toBe(401);
  });
});

describe("POST /api/tasks/:id/photo — multer fileFilter", () => {
  it("application/pdf отклоняется (не в allowlist)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", Buffer.from("%PDF-1.4 fake"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/JPG|PNG/i);
  });

  it("image/svg+xml отклоняется (XSS-вектор)", async () => {
    // КРИТИЧНО: SVG может содержать <script>. Раньше принимали любой
    // image/*. Теперь строгий allowlist.
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", Buffer.from("<svg></svg>"), {
        filename: "x.svg",
        contentType: "image/svg+xml",
      });
    expect(r.status).toBe(400);
  });
});

describe("POST /api/tasks/:id/photo — task scope", () => {
  it("несуществующая task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app)
      .post(`/api/tasks/9999/photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(404);
    // multer успел сохранить файл — он будет orphan'ом, finally cleanup'нет
  });

  it("чужая компания → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(404);
  });

  it("посторонний (не workerId, не admin) → 403", async () => {
    const { app } = await buildApp({ sessionUserId: STRANGER.id });
    storage.getUserById.mockResolvedValue(STRANGER);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(403);
  });
});

describe("POST /api/tasks/:id/photo — limits", () => {
  it("уже 10 фотографий → 400 (anti-storage-flood)", async () => {
    const TASK_FULL = {
      ...TASK,
      photoUrls: Array.from({ length: 10 }, (_, i) => `/uploads/p${i}.jpg`),
    } as unknown as Task;
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_FULL);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/10/);
  });
});

describe("POST /api/tasks/:id/photo — happy path", () => {
  it("worker upload своей task'и → 200, photoUrl в /uploads/", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/tasks/100/photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(200);
    expect(r.body.photoUrl).toMatch(/^\/uploads\//);
    expect(r.body.photoUrls).toHaveLength(1);
    expect(storage.updateTask).toHaveBeenCalled();
  });
});

// ─── POST /api/tasks/:id/example-photo ───────────────────────────────

describe("POST /api/tasks/:id/example-photo — admin only", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app)
      .post(`/api/tasks/100/example-photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(403);
  });

  it("admin happy path → 200, examplePhotoUrl", async () => {
    // updateTask вызывается с {examplePhotoUrl: "/uploads/task-100-..."}
    storage.updateTask.mockImplementation(async (id: number, patch: any) => {
      if (patch.examplePhotoUrl) {
        const filename = patch.examplePhotoUrl.replace(/^\/uploads\//, "");
        uploadedFiles.push(filename);
      }
      return { ...TASK, id, ...patch };
    });
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/tasks/100/example-photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(200);
    expect(r.body.examplePhotoUrl).toMatch(/^\/uploads\/task-100-/);
    expect(storage.updateTask).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ examplePhotoUrl: expect.any(String) }),
    );
  });

  it("admin + чужая компания → 404 (multi-tenant)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app)
      .post(`/api/tasks/100/example-photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("несуществующий task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app)
      .post(`/api/tasks/9999/example-photo`)
      .attach("photo", MINIMAL_JPEG, {
        filename: "x.jpg",
        contentType: "image/jpeg",
      });
    expect(r.status).toBe(404);
  });
});
