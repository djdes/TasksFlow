import { describe, it, expect } from "vitest";
import type { User } from "@shared/schema";
import { canCreateTasks } from "../server/telegram/util";
import { buildEnvelope, checkParseRateLimit } from "../server/telegram/composer";

/**
 * Права в боте обязаны совпадать с правами на сайте: админ — вся
 * компания, руководитель — только managedWorkerIds, воркер — нельзя.
 */

function user(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    phone: "+79990000000",
    name: "Тест",
    isAdmin: false,
    isRoot: false,
    createdAt: 0,
    bonusBalance: 0,
    companyId: 7,
    managedWorkerIds: null,
    position: null,
    email: null,
    passwordHash: null,
    magicToken: null,
    magicTokenExpiresAt: null,
    telegramUserId: null,
    telegramUsername: null,
    telegramFirstName: null,
    telegramPhotoUrl: null,
    tgChatId: null,
    tgLinkedAt: null,
    tgStartedAt: null,
    ...overrides,
  } as User;
}

describe("canCreateTasks", () => {
  it("админ может", () => {
    expect(canCreateTasks(user({ isAdmin: true }))).toBe(true);
  });

  it("руководитель с подчинёнными может", () => {
    expect(canCreateTasks(user({ managedWorkerIds: "[2,3]" }))).toBe(true);
  });

  it("обычный воркер не может — ему /tasks", () => {
    expect(canCreateTasks(user())).toBe(false);
  });

  it("пустой список подчинённых — не может: некому ставить", () => {
    expect(canCreateTasks(user({ managedWorkerIds: "[]" }))).toBe(false);
  });

  it("битый JSON в managedWorkerIds не даёт прав", () => {
    expect(canCreateTasks(user({ managedWorkerIds: "{сломано" }))).toBe(false);
  });

  it("админ с пустым списком всё равно может — флаг важнее", () => {
    expect(canCreateTasks(user({ isAdmin: true, managedWorkerIds: "[]" }))).toBe(true);
  });
});

describe("buildEnvelope", () => {
  const workers = [
    { id: 12, name: "Олег Боев", position: "повар" },
    { id: 15, name: "Анна Смирнова", position: null },
  ];

  it("маркеры app/v — по ним воркер опознаёт свой job", () => {
    const e = buildEnvelope({
      author: user({ isAdmin: true, name: "Ярослав" }),
      workers,
      categories: [],
      hasPhotos: 0,
      message: "тест",
    });
    expect(e.app).toBe("tasksflow");
    expect(e.v).toBe(1);
  });

  it("today и dow берутся из одной даты — «в пятницу» должно резолвиться однозначно", () => {
    const now = new Date(2026, 6, 31, 15, 0, 0); // пятница, 31 июля 2026
    const e = buildEnvelope({
      author: user({ isAdmin: true }),
      workers,
      categories: [],
      hasPhotos: 0,
      message: "тест",
      now,
    });
    expect(e.today).toBe("2026-07-31");
    expect(e.dow).toBe(5);
  });

  it("однозначные месяц и день дополняются нулём", () => {
    const e = buildEnvelope({
      author: user({ isAdmin: true }),
      workers,
      categories: [],
      hasPhotos: 0,
      message: "т",
      now: new Date(2026, 0, 5),
    });
    expect(e.today).toBe("2026-01-05");
  });

  it("роль автора отражает его права", () => {
    const admin = buildEnvelope({
      author: user({ isAdmin: true }), workers, categories: [], hasPhotos: 0, message: "т",
    });
    const manager = buildEnvelope({
      author: user({ managedWorkerIds: "[2]" }), workers, categories: [], hasPhotos: 0, message: "т",
    });
    expect(admin.author.role).toBe("admin");
    expect(manager.author.role).toBe("manager");
  });

  it("members переносятся один в один — фильтрация по правам уже сделана выше", () => {
    const e = buildEnvelope({
      author: user({ isAdmin: true }), workers, categories: [], hasPhotos: 0, message: "т",
    });
    expect(e.members).toEqual([
      { id: 12, name: "Олег Боев", position: "повар" },
      { id: 15, name: "Анна Смирнова", position: null },
    ]);
  });

  it("hasPhotos и categories прокидываются как есть", () => {
    const e = buildEnvelope({
      author: user({ isAdmin: true }),
      workers,
      categories: ["уборка", "готовка"],
      hasPhotos: 3,
      message: "т",
    });
    expect(e.hasPhotos).toBe(3);
    expect(e.categories).toEqual(["уборка", "готовка"]);
  });

  it("безымянный автор не ломает конверт", () => {
    const e = buildEnvelope({
      author: user({ name: null, isAdmin: true }),
      workers, categories: [], hasPhotos: 0, message: "т",
    });
    expect(e.author.name).toBe("руководитель");
  });
});

describe("checkParseRateLimit", () => {
  it("20 разборов в час проходят, 21-й — нет", () => {
    const uid = 90001;
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      expect(checkParseRateLimit(uid, now)).toBe(true);
    }
    expect(checkParseRateLimit(uid, now)).toBe(false);
  });

  it("окно скользящее: через час счётчик освобождается", () => {
    const uid = 90002;
    const now = Date.now();
    for (let i = 0; i < 20; i++) checkParseRateLimit(uid, now);
    expect(checkParseRateLimit(uid, now)).toBe(false);
    expect(checkParseRateLimit(uid, now + 61 * 60 * 1000)).toBe(true);
  });

  it("лимит считается на пользователя, а не на всех сразу", () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) checkParseRateLimit(90003, now);
    expect(checkParseRateLimit(90003, now)).toBe(false);
    expect(checkParseRateLimit(90004, now)).toBe(true);
  });
});
