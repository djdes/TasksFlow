/**
 * «Умный» UX задач (07.11.2026):
 *   • подсказки названия из прошлых задач;
 *   • готовые вопросы «Кто заполняет?» и «Всё в порядке?»;
 *   • недавние исполнители сверху;
 *   • срочное — наверху списка сотрудника;
 *   • текст для «Слушать»;
 *   • «Отменить» после «Готово»: задача, ушедшая руководителю, возвращается
 *     сотруднику (POST /api/tasks/:id/uncomplete, submitted → pending).
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, Task, User } from "../shared/schema";
import {
  orderByRecent,
  pushRecent,
  questionPresets,
  shortNames,
  sortByUrgency,
  titleSuggestions,
  urgencyRank,
} from "../client/src/lib/task-suggestions";
import { taskSpeechText } from "../client/src/lib/speech";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  transitionTaskToUncompleted: vi.fn(),
  withdrawSubmission: vi.fn(),
  updateUserBalance: vi.fn(),
  getCompanyById: vi.fn(),
  listCompanyRoles: vi.fn(),
  getCompanyRole: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/audit-log", () => ({ recordAudit: vi.fn() }));

describe("подсказки названия", () => {
  it("без повторов (регистр, ё, пробелы), чаще ставят — выше, короче 3 символов — нет", () => {
    const list = titleSuggestions([
      { title: "Протереть витрину", createdAt: 1 },
      { title: "протереть  витрину", createdAt: 5 },
      { title: "Вынести мусор", createdAt: 9 },
      { title: "Ёлку убрать", createdAt: 2 },
      { title: "елку убрать", createdAt: 3 },
      { title: "Ok", createdAt: 10 },
      { title: null },
    ]);
    expect(list).toEqual(["протереть витрину", "елку убрать", "Вынести мусор"]);
  });

  it("не больше лимита", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `Задача номер ${i}`, createdAt: i }));
    expect(titleSuggestions(many, 30)).toHaveLength(30);
    expect(titleSuggestions(many, 30)[0]).toBe("Задача номер 49");
  });
});

describe("готовые вопросы", () => {
  it("имена: первое слово, тёзки — полностью, без повторов", () => {
    expect(shortNames([{ name: "Анна Петрова" }, { name: "Илья Кузнецов" }, { name: "Анна Смирнова" }, { name: "" }])).toEqual([
      "Анна Петрова",
      "Илья",
      "Анна Смирнова",
    ]);
    expect(shortNames([{ name: "Лариса" }, { name: "Галина Иванова" }])).toEqual(["Лариса", "Галина"]);
  });

  it("«Кто заполняет?» — только когда имён хотя бы два; «Всё в порядке?» — всегда", () => {
    expect(questionPresets(["Лариса", "Галина"])).toEqual([
      { key: "who", title: "Кто заполняет?", options: ["Лариса", "Галина"] },
      { key: "ok", title: "Всё в порядке?", options: ["Да", "Нет"] },
    ]);
    expect(questionPresets(["Лариса"]).map((p) => p.key)).toEqual(["ok"]);
  });
});

describe("недавние исполнители", () => {
  it("новые — в начало, без повторов, не больше лимита", () => {
    expect(pushRecent([3, 1, 2], [2, 5])).toEqual([2, 5, 3, 1]);
    expect(pushRecent([1, 2, 3, 4, 5, 6], [7])).toEqual([7, 1, 2, 3, 4, 5]);
  });

  it("недавние — сверху по давности, остальные в прежнем порядке", () => {
    const users = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    expect(orderByRecent(users, [3, 1]).map((u) => u.id)).toEqual([3, 1, 2, 4]);
    expect(orderByRecent(users, []).map((u) => u.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("срочное — наверху", () => {
  // 07.11.2026 12:00 по местному времени теста.
  const now = Math.floor(new Date(2026, 10, 7, 12, 0).getTime() / 1000);
  const day = (d: number) => Math.floor(new Date(2026, 10, d).getTime() / 1000);

  it("просрочено → сегодня → по времени → остальное → отправленные", () => {
    const tasks = [
      { id: "plain" },
      { id: "sent", verificationStatus: "submitted", dueDate: day(1) },
      { id: "late", remindAt: "18:00" },
      { id: "early", remindAt: "09:30" },
      { id: "today", dueDate: day(7) },
      { id: "overdue", dueDate: day(5) },
      { id: "later", dueDate: day(20) },
    ];
    expect(sortByUrgency(tasks, now).map((t) => t.id)).toEqual(["overdue", "today", "early", "late", "plain", "later", "sent"]);
  });

  it("внутри одной группы порядок прежний", () => {
    const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(sortByUrgency(tasks, now).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(urgencyRank({ remindAt: "kek" }, now)).toBe(5000);
  });
});

describe("«Слушать»", () => {
  it("название, описание, вопрос с вариантами и пункты — предложениями", () => {
    expect(
      taskSpeechText({
        title: "Открытие смены",
        description: "Перед кассой",
        checklist: [
          { title: "Кто заполняет?", options: ["Лариса", "Галина"] },
          { title: "Холодильники" },
        ],
      }),
    ).toBe("Открытие смены. Перед кассой. Вопрос: Кто заполняет? Варианты: Лариса, Галина. Холодильники.");
  });
});

describe("POST /api/tasks/:id/uncomplete — «Отменить» после отправки руководителю", () => {
  const base = { createdAt: 1, bonusBalance: 0, companyId: 42, managedWorkerIds: null, position: null, isRoot: false, roleId: null } as const;
  const WORKER = { ...base, id: 7, phone: "+79990000007", name: "Лариса", isAdmin: false } as unknown as User;
  const COMPANY = { id: 42, name: "БФС", email: null, createdAt: 1, wesetupBaseUrl: null, wesetupApiKey: null } as unknown as Company;
  const task = (extra: Partial<Task> = {}) =>
    ({ id: 100, title: "Ценники", workerId: 7, companyId: 42, isCompleted: false, price: 50, claimedByWorkerId: null, journalLink: null, verificationStatus: "submitted", checklist: [], ...extra }) as unknown as Task;

  async function buildApp(userId?: number) {
    const { registerRoutes } = await import("../server/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = userId ? { userId } : {};
      next();
    });
    await registerRoutes(createServer(app), app);
    return app;
  }

  beforeEach(() => {
    Object.values(storage).forEach((m) => m.mockReset());
    storage.getUserById.mockImplementation(async (id: number) => (id === WORKER.id ? WORKER : undefined));
    storage.getCompanyById.mockResolvedValue(COMPANY);
    storage.listCompanyRoles.mockResolvedValue([]);
  });

  it("отправленная руководителю — снова у сотрудника, премия и баланс не трогаются", async () => {
    storage.getTask.mockResolvedValueOnce(task()).mockResolvedValueOnce(task({ verificationStatus: "pending" }));
    storage.withdrawSubmission.mockResolvedValue(true);
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/uncomplete");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/json/);
    expect(storage.withdrawSubmission).toHaveBeenCalledWith(100);
    expect(r.body.verificationStatus).toBe("pending");
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("выполненная — как раньше: снимаем выполнение и премию", async () => {
    storage.getTask.mockResolvedValue(task({ isCompleted: true, verificationStatus: null }));
    storage.transitionTaskToUncompleted.mockResolvedValue(true);
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/uncomplete");
    expect(r.status).toBe(200);
    expect(storage.withdrawSubmission).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).toHaveBeenCalledWith(7, -50);
  });

  it("чужой сотрудник отменить не может", async () => {
    storage.getTask.mockResolvedValue(task({ workerId: 8 }));
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/uncomplete");
    expect(r.status).toBe(403);
    expect(storage.withdrawSubmission).not.toHaveBeenCalled();
  });
});
