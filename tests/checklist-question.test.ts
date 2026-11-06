/**
 * Свой вопрос у задачи: «Кто заполняет?» → «Лариса», «Галина».
 *
 * Хранится пунктом чек-листа с вариантами (options) и ответом (answer):
 *   • без ответа задачу не закрыть, ответ — только один из вариантов;
 *   • POST /api/tasks/:id/checklist/:itemId/answer — выбрать/убрать ответ;
 *     касанием (/done) и фото вопрос не закрыть;
 *   • правка задачи (PUT) не теряет ответ, пока он среди вариантов;
 *   • новый день стирает ответ, вчерашний остаётся в истории и в CSV;
 *   • Telegram — кнопки с вариантами, callback «ta:».
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItem, Company, Task, User } from "../shared/schema";
import { checklistItemSchema, insertTaskSchema } from "../shared/schema";
import {
  checklistAnswers,
  isQuestionItem,
  itemNeedsPhoto,
  mergeChecklistProgress,
  normalizeNewChecklist,
  parseQuestionOptions,
  resetChecklistItem,
  validAnswer,
} from "../shared/checklist";
import { planDailyReset, type ResetTask } from "../server/services/daily-reset";
import { buildCallback, parseCallback } from "../server/telegram/callbacks";
import type { HistoryItem } from "../shared/history";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  updateTask: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  submitForVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
  getCompanyById: vi.fn(),
  listCompanyRoles: vi.fn(),
  getCompanyRole: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/audit-log", () => ({ recordAudit: vi.fn() }));

const { checklistLeftText, renderTaskCard } = await import("../server/telegram/my-tasks");
const { buildCsv } = await import("../shared/history-report");

async function buildApp(sessionUserId?: number) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUserId ? { userId: sessionUserId } : {};
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const base = { createdAt: 1, bonusBalance: 0, companyId: 42, managedWorkerIds: null, position: null, isRoot: false, roleId: null } as const;
const ADMIN = { ...base, id: 10, phone: "+79990000010", name: "Админ", isAdmin: true } as unknown as User;
const WORKER = { ...base, id: 7, phone: "+79990000007", name: "Лариса", isAdmin: false } as unknown as User;
const STRANGER = { ...base, id: 99, phone: "+79990000099", name: "Фара", isAdmin: false } as unknown as User;
const COMPANY = { id: 42, name: "БФС", email: null, createdAt: 1, wesetupBaseUrl: null, wesetupApiKey: null } as unknown as Company;

const WHO: ChecklistItem = { id: "who", title: "Кто заполняет?", options: ["Лариса", "Галина"], done: false, photoUrls: [], requiresPhoto: false };
const LOOK: ChecklistItem = { id: "look", title: "Внешний вид", done: false, photoUrls: [], requiresPhoto: false };

function task(extra: Partial<Task> = {}): Task {
  return {
    id: 100,
    title: "Журнал температуры",
    workerId: 7,
    requiresPhoto: false,
    photoUrl: null,
    photoUrls: [],
    examplePhotoUrl: null,
    examplePhotoUrls: [],
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
    checklist: [{ ...WHO }],
    dueDate: null,
    remindAt: null,
    ...extra,
  } as Task;
}

const people = [ADMIN, WORKER, STRANGER];

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset());
  storage.getUserById.mockImplementation(async (id: number) => people.find((u) => u.id === id));
  storage.getCompanyById.mockResolvedValue(COMPANY);
  storage.listCompanyRoles.mockResolvedValue([]);
  storage.getCompanyRole.mockResolvedValue(undefined);
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.updateTask.mockImplementation(async (_id: number, patch: Partial<Task>) => ({ ...task(), ...patch }));
});

describe("модель вопроса", () => {
  it("варианты из строки через запятую: без пустых, повторов и лишних пробелов", () => {
    expect(parseQuestionOptions("Лариса, Галина ,лариса;; \n  Анна  Петрова")).toEqual(["Лариса", "Галина", "Анна Петрова"]);
    expect(parseQuestionOptions(" , ")).toEqual([]);
  });

  it("вопрос — пункт с вариантами; фото ему не нужно", () => {
    expect(isQuestionItem(WHO)).toBe(true);
    expect(isQuestionItem(LOOK)).toBe(false);
    expect(isQuestionItem({ options: [] })).toBe(false);
    expect(itemNeedsPhoto({ options: ["Да", "Нет"] })).toBe(false);
    expect(itemNeedsPhoto({ options: ["Да", "Нет"], requiresPhoto: true })).toBe(false);
  });

  it("ответ засчитывается только из вариантов", () => {
    expect(validAnswer(WHO, " Лариса ")).toBe("Лариса");
    expect(validAnswer(WHO, "Фара")).toBeNull();
    expect(validAnswer(WHO, 5)).toBeNull();
    expect(validAnswer(LOOK, "Лариса")).toBeNull();
  });

  it("схема: минимум два варианта, без повторов", () => {
    expect(insertTaskSchema.parse({ title: "Т", checklist: [WHO] }).checklist?.[0].options).toEqual(["Лариса", "Галина"]);
    expect(checklistItemSchema.safeParse({ ...WHO, options: ["Лариса"] }).success).toBe(false);
    expect(checklistItemSchema.safeParse({ ...WHO, options: ["Лариса", "лариса"] }).success).toBe(false);
    expect(checklistItemSchema.safeParse({ ...WHO, options: ["Лариса", " "] }).success).toBe(false);
  });

  it("новая задача: ответ не из вариантов отбрасывается, «готово» — только с ответом", () => {
    expect(normalizeNewChecklist([{ ...WHO, done: true, answer: "Фара" }])).toEqual([{ ...WHO, done: false, photoUrls: [] }]);
    expect(normalizeNewChecklist([{ ...WHO, answer: "Галина" }])).toEqual([{ ...WHO, done: true, photoUrls: [], answer: "Галина" }]);
    // Обычный пункт — как раньше, без поля answer.
    expect(normalizeNewChecklist([{ ...LOOK, done: true, answer: "x" }])).toEqual([{ ...LOOK, done: true }]);
    expect(normalizeNewChecklist(null)).toBeNull();
  });

  it("отвеченные вопросы — для отчётов", () => {
    expect(checklistAnswers([{ ...WHO, answer: "Лариса", done: true }, LOOK, WHO])).toEqual([{ question: "Кто заполняет?", answer: "Лариса" }]);
    expect(checklistAnswers(null)).toEqual([]);
  });
});

describe("mergeChecklistProgress: правка не теряет ответ", () => {
  const answered: ChecklistItem[] = [{ ...WHO, answer: "Галина", done: true }];

  it("ответ из базы, пока он среди вариантов; присланный в запросе — не в счёт", () => {
    const merged = mergeChecklistProgress(answered, [{ ...WHO, title: "Кто заполнял?", options: ["Лариса", "Галина", "Анна"], answer: "Лариса" }]);
    expect(merged).toEqual([{ ...WHO, title: "Кто заполнял?", options: ["Лариса", "Галина", "Анна"], answer: "Галина", done: true, photoUrls: [] }]);
  });

  it("вариант убрали — вопрос снова ждёт ответа", () => {
    const merged = mergeChecklistProgress(answered, [{ ...WHO, options: ["Лариса", "Анна"] }]);
    expect(merged?.[0]).toMatchObject({ done: false, photoUrls: [] });
    expect(merged?.[0]).not.toHaveProperty("answer");
  });

  it("новый вопрос стартует без ответа, даже если «готово» прислали", () => {
    const merged = mergeChecklistProgress([], [{ ...WHO, id: "new", done: true, answer: "Лариса" }]);
    expect(merged).toEqual([{ ...WHO, id: "new", done: false, photoUrls: [] }]);
  });
});

describe("POST /api/tasks/:id/checklist/:itemId/answer", () => {
  const url = (itemId = "who") => `/api/tasks/100/checklist/${itemId}/answer`;

  it("исполнитель выбирает ответ — пункт выполнен; null — ответ убран", async () => {
    storage.getTask.mockResolvedValue(task());
    const app = await buildApp(WORKER.id);
    const r = await request(app).post(url()).send({ answer: "Галина" });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/json/);
    expect(storage.updateTask).toHaveBeenLastCalledWith(100, { checklist: [{ ...WHO, answer: "Галина", done: true }] });
    expect(r.body.task.checklist[0]).toMatchObject({ answer: "Галина", done: true });

    storage.getTask.mockResolvedValue(task({ checklist: [{ ...WHO, answer: "Галина", done: true }] }));
    const off = await request(app).post(url()).send({ answer: null });
    expect(off.status).toBe(200);
    expect(storage.updateTask).toHaveBeenLastCalledWith(100, { checklist: [{ ...WHO, done: false }] });
  });

  it("ответ не из вариантов — 400, у обычного пункта вариантов нет — 400", async () => {
    storage.getTask.mockResolvedValue(task({ checklist: [{ ...WHO }, { ...LOOK }] }));
    const app = await buildApp(WORKER.id);
    const wrong = await request(app).post(url()).send({ answer: "Фара" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/варианта ответа нет/);
    const plain = await request(app).post(url("look")).send({ answer: "Лариса" });
    expect(plain.status).toBe(400);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("на проверке и после выполнения ответ не меняется — 409", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(task({ verificationStatus: "submitted" }));
    expect((await request(app).post(url()).send({ answer: "Лариса" })).status).toBe(409);
    storage.getTask.mockResolvedValue(task({ isCompleted: true }));
    expect((await request(app).post(url()).send({ answer: "Лариса" })).status).toBe(409);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("чужой — 403, чужая компания — 404, без входа — 401, кривое тело — 400; всё JSON", async () => {
    storage.getTask.mockResolvedValue(task());
    expect((await request(await buildApp(STRANGER.id)).post(url()).send({ answer: "Лариса" })).status).toBe(403);
    storage.getTask.mockResolvedValue(task({ companyId: 77 }));
    expect((await request(await buildApp(WORKER.id)).post(url()).send({ answer: "Лариса" })).status).toBe(404);
    const anon = await request(await buildApp()).post(url()).send({ answer: "Лариса" });
    expect(anon.status).toBe(401);
    expect(anon.headers["content-type"]).toMatch(/json/);
    storage.getTask.mockResolvedValue(task());
    const bad = await request(await buildApp(WORKER.id)).post(url()).send({ answer: 5 });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("answer");
  });

  it("касанием (/done) вопрос не закрыть, снятие отметки убирает ответ", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(task());
    const on = await request(app).post("/api/tasks/100/checklist/who/done").send({ done: true });
    expect(on.status).toBe(400);
    expect(on.body.message).toMatch(/выберите ответ/);

    storage.getTask.mockResolvedValue(task({ checklist: [{ ...WHO, answer: "Лариса", done: true }] }));
    const off = await request(app).post("/api/tasks/100/checklist/who/done").send({ done: false });
    expect(off.status).toBe(200);
    expect(storage.updateTask).toHaveBeenLastCalledWith(100, { checklist: [{ ...WHO, done: false }] });
  });
});

describe("завершение задачи с вопросом", () => {
  it("без ответа — 400 с текстом вопроса", async () => {
    storage.getTask.mockResolvedValue(task({ checklist: [{ ...WHO }, { ...LOOK, done: true }] }));
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/complete").send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Ответьте на вопрос «Кто заполняет?»");
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });

  it("с ответом — задача закрывается", async () => {
    storage.getTask.mockResolvedValue(task({ checklist: [{ ...WHO, answer: "Лариса", done: true }] }));
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/complete").send({});
    expect(r.status).toBe(200);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(100);
  });
});

describe("новый день", () => {
  it("ответ стирается, варианты остаются; вчерашний — в снимке истории", () => {
    const resetTask = {
      id: 1,
      title: "Журнал температуры",
      workerId: 7,
      companyId: 42,
      category: null,
      price: 0,
      isRecurring: true,
      isCompleted: true,
      completedAt: Date.UTC(2026, 9, 23, 7, 0) / 1000,
      createdAt: 1,
      photoUrl: null,
      photoUrls: [],
      checklist: [{ ...WHO, answer: "Галина", done: true }],
      claimedByWorkerId: null,
      verificationStatus: null,
      verifiedByUserId: null,
      verifiedAt: null,
      weekDays: null,
      monthDay: null,
      dueDate: null,
    } as ResetTask;
    const now = Date.UTC(2026, 9, 23, 21, 5) / 1000;
    const plan = planDailyReset([resetTask], { tz: "Europe/Moscow", today: "2026-10-24", now });
    expect(JSON.parse(plan.history[0].checklist as string)[0]).toMatchObject({ answer: "Галина" });
    expect(plan.checklistResets).toEqual([{ id: 1, checklist: [{ ...WHO, done: false, photoUrls: [] }] }]);
    expect(resetChecklistItem({ ...WHO, answer: "Лариса", done: true })).not.toHaveProperty("answer");
  });

  it("CSV: ответы — в последней колонке", () => {
    const item = {
      key: "1:2026-10-23",
      taskId: 1,
      workerId: 7,
      day: "2026-10-23",
      title: "Журнал температуры",
      category: null,
      status: "done",
      completedAt: 1,
      time: "10:00",
      photoUrls: [],
      checklist: [{ ...WHO, answer: "Галина", done: true }],
      price: 0,
      claimedByWorkerId: null,
      verificationStatus: null,
    } as HistoryItem;
    const csv = buildCsv([item], [WORKER], (p) => `https://x${p}`);
    expect(csv.split("\r\n")[1]).toMatch(/;Кто заполняет\?: Галина$/);
  });
});

describe("Telegram", () => {
  it("callback «ta:»: номер варианта до id пункта, id с двоеточием не ломает разбор", () => {
    const action = { kind: "taskItemAnswer", taskId: 501, itemId: "a:b", option: 1 } as const;
    expect(buildCallback(action)).toBe("ta:501:1:a:b");
    expect(parseCallback("ta:501:1:a:b")).toEqual(action);
    expect(parseCallback("ta:501:x:who")).toBeNull();
    expect(parseCallback("ta:501:1:")).toBeNull();
  });

  it("карточка: вопрос с кнопками вариантов, ответ — в тексте", () => {
    const view = renderTaskCard(task({ checklist: [{ ...WHO }, { ...LOOK }] }));
    expect(view.text).toContain("❓ Кто заполняет?");
    const buttons = view.reply_markup.inline_keyboard.flat().map((b: any) => ({ text: b.text, action: parseCallback(b.callback_data) }));
    expect(buttons).toContainEqual({ text: "Лариса", action: { kind: "taskItemAnswer", taskId: 100, itemId: "who", option: 0 } });
    expect(buttons).toContainEqual({ text: "Галина", action: { kind: "taskItemAnswer", taskId: 100, itemId: "who", option: 1 } });

    const answered = renderTaskCard(task({ checklist: [{ ...WHO, answer: "Галина", done: true }] }));
    expect(answered.text).toContain("✅ Кто заполняет? — <b>Галина</b>");
    expect(answered.reply_markup.inline_keyboard.flat().some((b: any) => b.callback_data.startsWith("ta:"))).toBe(false);
  });

  it("«осталось» считает вопросы отдельно", () => {
    expect(checklistLeftText([{ ...WHO }])).toBe("Осталось ответить: 1");
    expect(checklistLeftText([{ ...WHO }, { ...LOOK }])).toBe("Осталось: отметить 1, ответить 1");
  });
});

describe("форма: вопросы", async () => {
  const { questionsError, questionsPayload, mergeChecklistAndQuestions, questionDraftsFrom, withoutQuestions } = await import(
    "../client/src/components/TaskQuestionsEditor"
  );

  it("пустой вопрос не мешает, без двух вариантов — подсказка", () => {
    expect(questionsError([{ id: "q", title: " ", options: [] }])).toBeNull();
    expect(questionsError([{ id: "q", title: "Кто?", options: ["Лариса"] }])).toMatch(/два варианта/);
    expect(questionsError([{ id: "q", title: "", options: ["Лариса", "Галина"] }])).toMatch(/Напишите вопрос/);
    expect(questionsError([{ id: "q", title: "Кто?", options: ["Лариса", "Галина"] }])).toBeNull();
  });

  it("черновик ↔ пункты: вопросы отдельно от обычного чек-листа, ответ не уходит", () => {
    const items = [{ ...LOOK }, { ...WHO, answer: "Лариса", done: true }];
    expect(withoutQuestions(items)).toEqual([LOOK]);
    const drafts = questionDraftsFrom(items);
    expect(drafts).toEqual([{ id: "who", title: "Кто заполняет?", options: ["Лариса", "Галина"] }]);
    expect(questionsPayload(drafts)).toEqual([WHO]);
    expect(mergeChecklistAndQuestions([LOOK], drafts)).toEqual([LOOK, WHO]);
    expect(mergeChecklistAndQuestions(null, [])).toBeNull();
  });
});
