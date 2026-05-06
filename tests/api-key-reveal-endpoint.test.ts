/**
 * Тесты POST /api/api-keys/:id/reveal — UX «Показать ключ».
 *
 * SECURITY-trade-off: при leak БД + env злоумышленник получает все
 * plaintext ключи. Поэтому endpoint admin-only, multi-tenant scoped,
 * и блокирует revoked / pre-encryption ключи. Без тестов любая
 * регрессия в guard'ах = катастрофа.
 *
 * Branches:
 *   • 401 (no session)
 *   • 403 (non-admin)
 *   • 400 (invalid id)
 *   • 404 (foreign company / not found)
 *   • 410 (revoked)
 *   • 410 (legacy ключ без keyEncrypted)
 *   • 503 (нет API_KEY_REVEAL_SECRET и нет SESSION_SECRET ≥16)
 *   • 200 (happy path → plaintext + keyPrefix совпадают)
 *   • 500 (prefix mismatch — БД покрашена)
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User, ApiKey } from "../shared/schema";
import { encryptApiKey } from "../server/api-key-crypto";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getApiKeyById: vi.fn(),
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

// Используем валидный prefix вида tfk_xxxxxxx (длина 12 как в проде)
const PLAINTEXT = "tfk_test1234ABCDEF";
const PREFIX_12 = PLAINTEXT.slice(0, 12); // "tfk_test1234"

// Сохраняем prev-state env'а чтобы каждый тест был изолирован
const ORIGINAL_REVEAL = process.env.API_KEY_REVEAL_SECRET;
const ORIGINAL_SESSION = process.env.SESSION_SECRET;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_REVEAL === undefined) delete process.env.API_KEY_REVEAL_SECRET;
  else process.env.API_KEY_REVEAL_SECRET = ORIGINAL_REVEAL;
  if (ORIGINAL_SESSION === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SESSION;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  // Реальный secret для шифрования (длина ≥16) — иначе reveal-feature off
  process.env.API_KEY_REVEAL_SECRET = "test-secret-1234567890-abcdef";
  delete process.env.SESSION_SECRET;
});

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 5,
    name: "WeSetup",
    keyHash: "hash",
    keyPrefix: PREFIX_12,
    keyEncrypted: encryptApiKey(PLAINTEXT),
    companyId: 42,
    createdByUserId: 10,
    createdAt: 1,
    lastUsedAt: 0,
    revokedAt: 0,
    ...overrides,
  } as ApiKey;
}

describe("POST /api/api-keys/:id/reveal — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(403);
  });
});

describe("POST /api/api-keys/:id/reveal — validation", () => {
  it("invalid id (NaN) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).post(`/api/api-keys/abc/reveal`);
    expect(r.status).toBe(400);
  });

  it("id ≤ 0 → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).post(`/api/api-keys/0/reveal`);
    expect(r.status).toBe(400);
  });
});

describe("POST /api/api-keys/:id/reveal — multi-tenant", () => {
  it("ключ другой компании → 404 (КРИТИЧНО)", async () => {
    // Защита: admin company A не может ВЫТАЩИТЬ plaintext ключа
    // company B. Это самый чувствительный leak — компрометация B.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(makeKey({ companyId: 999 }));

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(404);
    expect(r.body.secret).toBeUndefined();
  });

  it("несуществующий id → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(undefined);

    const r = await request(app).post(`/api/api-keys/999/reveal`);
    expect(r.status).toBe(404);
  });
});

describe("POST /api/api-keys/:id/reveal — guard состояний ключа", () => {
  it("revoked ключ → 410 (нельзя посмотреть)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(
      makeKey({ revokedAt: 1700000000 }),
    );

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(410);
    expect(r.body.message).toMatch(/отозван/i);
    expect(r.body.secret).toBeUndefined();
  });

  it("legacy ключ без keyEncrypted → 410 + rotateAvailable=true", async () => {
    // Pre-migration ключи нельзя восстановить; UI должен предложить
    // «Перевыпустить».
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(
      makeKey({ keyEncrypted: null as unknown as string }),
    );

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(410);
    expect(r.body.rotateAvailable).toBe(true);
  });
});

describe("POST /api/api-keys/:id/reveal — feature-flag", () => {
  it("нет API_KEY_REVEAL_SECRET и нет SESSION_SECRET → 503", async () => {
    delete process.env.API_KEY_REVEAL_SECRET;
    delete process.env.SESSION_SECRET;
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    // makeKey() при таких env упадёт (не сможет зашифровать). Передаём
    // готовый encrypted из других тестов через временный secret —
    // потом снова убираем.
    process.env.API_KEY_REVEAL_SECRET = "temp-secret-1234567890-abcdef";
    const key = makeKey();
    delete process.env.API_KEY_REVEAL_SECRET;
    storage.getApiKeyById.mockResolvedValue(key);

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/API_KEY_REVEAL_SECRET/);
  });
});

describe("POST /api/api-keys/:id/reveal — happy path", () => {
  it("active ключ + valid encrypted → 200, plaintext возвращён", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(makeKey());

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(200);
    expect(r.body.secret).toBe(PLAINTEXT);
    expect(r.body.keyPrefix).toBe(PREFIX_12);
    expect(r.body.id).toBe(5);
    expect(r.body.name).toBe("WeSetup");
  });

  it("prefix mismatch → 500 (БД покрашена)", async () => {
    // Целостность: если plaintext.slice(0,12) ≠ keyPrefix, значит
    // shifted/corrupted данные — не отдаём, чтобы не отравить клиента.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(
      makeKey({ keyPrefix: "tfk_DIFFER" }),
    );

    const r = await request(app).post(`/api/api-keys/5/reveal`);
    expect(r.status).toBe(500);
    expect(r.body.secret).toBeUndefined();
    expect(r.body.message).toMatch(/целостн/i);
  });
});
