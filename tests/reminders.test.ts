/**
 * Напоминания в Telegram: утром — список задач, вечером — что осталось,
 * руководителю — итоги дня. Раз за местный день, только привязавшим бота.
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFY, parseNotifySettings } from "../shared/notify";
import {
  digestText,
  dueSlots,
  isTaskReminderDue,
  teamMorningText,
  runReminders,
  type ReminderCompany,
  type ReminderSender,
  type ReminderStore,
} from "../server/services/reminders";

vi.mock("../server/storage", () => ({
  storage: {},
  DatabaseStorage: { parseManagedWorkerIds: (raw: string | null) => (raw ? JSON.parse(raw) : null) },
}));

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
const msk = (h: number, mi = 0) => utc(2026, 10, 24, h - 3, mi); // 24.10.2026 по Москве

function user(extra: Record<string, unknown>) {
  return {
    id: 10, name: "Анна Петрова", phone: "+79990000010", isAdmin: false, isRoot: false, companyId: 1, createdAt: 1,
    bonusBalance: 0, managedWorkerIds: null, position: null, tgChatId: 1010, tgStartedAt: 1, ...extra,
  } as any;
}
function task(extra: Record<string, unknown>) {
  return {
    id: 1, title: "Витрина", workerId: 10, isCompleted: false, isRecurring: true, completedAt: null, createdAt: 1,
    photoUrl: null, photoUrls: [], checklist: [], weekDays: null, monthDay: null, price: 0, category: null,
    claimedByWorkerId: null, verificationStatus: null, companyId: 1, ...extra,
  } as any;
}

const admin = user({ id: 1, name: "Ирина", isAdmin: true, tgChatId: 1001 });
const anna = user({});
const boris = user({ id: 11, name: "Борис", tgChatId: 1011 });
const chef = user({ id: 12, name: "Шеф", managedWorkerIds: "[10]", tgChatId: 1012 });
const ghost = user({ id: 13, name: "Без бота", tgChatId: null, tgStartedAt: null });

function setup(companies: ReminderCompany[], users = [admin, anna, boris, chef, ghost], tasks = [
  task({ id: 1, workerId: 10, title: "Витрина", isCompleted: true, completedAt: msk(9, 30), price: 100 }),
  task({ id: 2, workerId: 10, title: "Пол <в зале>" }),
  task({ id: 3, workerId: 11, title: "Склад" }),
  task({ id: 4, workerId: 13, title: "Касса" }),
]) {
  const state = new Map(companies.map((c) => [c.id, c.notifyState]));
  const store: ReminderStore = {
    listCompanies: vi.fn(async () => companies.map((c) => ({ ...c, notifyState: state.get(c.id) ?? null }))),
    claimNotify: vi.fn(async (id, prev, next) => {
      if ((state.get(id) ?? null) !== prev) return false;
      state.set(id, next);
      return true;
    }),
    getUsers: vi.fn(async () => users),
    getTasks: vi.fn(async () => tasks),
  };
  const sender: ReminderSender = { sendTaskList: vi.fn(async () => {}), sendText: vi.fn(async () => {}) };
  return { store, sender, state };
}

const company = (extra: Partial<ReminderCompany> = {}): ReminderCompany => ({
  id: 1, timezone: "Europe/Moscow", notifySettings: null, notifyState: null, ...extra,
});

describe("расписание напоминаний", () => {
  it("по умолчанию 08:30, 18:00 и 20:30; мусор в БД — тоже по умолчанию", () => {
    expect(parseNotifySettings(null)).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifySettings('{"morning":"25:00"}')).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifySettings('{"morning":"07:30","evening":null,"digest":"21:00"}')).toEqual({ morning: "07:30", evening: null, digest: "21:00" });
  });

  it("пора, если время наступило, сегодня ещё не отправляли и опоздание меньше 3 часов", () => {
    const s = DEFAULT_NOTIFY;
    expect(s.morning).toBe("08:30");
    expect(dueSlots(s, {}, "2026-10-24", 8 * 60 + 29)).toEqual([]);
    expect(dueSlots(s, {}, "2026-10-24", 8 * 60 + 30)).toEqual(["morning"]);
    expect(dueSlots(s, { morning: "2026-10-24" }, "2026-10-24", 8 * 60 + 35)).toEqual([]);
    expect(dueSlots(s, { morning: "2026-10-23" }, "2026-10-24", 11 * 60 + 29)).toEqual(["morning"]);
    expect(dueSlots(s, {}, "2026-10-24", 11 * 60 + 30)).toEqual([]);
    expect(dueSlots({ ...s, evening: null }, {}, "2026-10-24", 18 * 60 + 10)).toEqual([]);
  });
});

describe("итоги дня", () => {
  it("сделано из скольких, премии, кто что не сделал — с экранированием", () => {
    const items = [
      { workerId: 10, title: "Витрина", status: "done", price: 100 },
      { workerId: 10, title: "Пол <в зале>", status: "pending", price: 0 },
      { workerId: 11, title: "Склад", status: "claimed", price: 0 },
    ] as any;
    const text = digestText(items, [anna, boris], "2026-10-24", { scoped: false })!;
    expect(text).toContain("Итоги дня · 24 октября");
    expect(text).toContain("Сделано: <b>1 из 2</b> · 50%");
    expect(text).toContain("Премии: 100 ₽");
    expect(text).toContain("• Анна Петрова — Пол &lt;в зале&gt;");
  });

  it("нечего подводить — null", () => {
    expect(digestText([], [], "2026-10-24", { scoped: false })).toBeNull();
  });
});

describe("рассылка", () => {
  it("утром — список тем, у кого есть задачи и привязан бот; админу и руководителю — сводка по команде", async () => {
    const { store, sender } = setup([company()]);
    const runs = await runReminders(store, sender, msk(9, 1), { reportUrl: "https://tasksflow.ru/reports" });
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 4 }]);
    const calls = vi.mocked(sender.sendTaskList).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([1010, 1011]);
    expect(calls[0][1].map((t: any) => t.id)).toEqual([1, 2]);
    expect(calls[0][2]).toContain("Доброе утро, Анна!");
    expect(calls[0][2]).toContain("Задач на сегодня: 2");
    // Своих задач нет — сводка по команде одним сообщением со ссылкой.
    const texts = vi.mocked(sender.sendText).mock.calls;
    expect(texts.map((c) => c[0])).toEqual([1001, 1012]);
    expect(texts[0][1]).toContain("Доброе утро, Ирина!");
    expect(texts[0][1]).toContain("У команды на сегодня задач: 4");
    expect(texts[1][1]).toContain("У команды на сегодня задач: 2");
    expect(texts[0][2]).toEqual({ text: "📋 Открыть задачи", url: "https://tasksflow.ru/dashboard" });
  });

  it("повторный тик в тот же день ничего не шлёт", async () => {
    const { store, sender } = setup([company()]);
    await runReminders(store, sender, msk(9, 1), { reportUrl: "x" });
    await runReminders(store, sender, msk(9, 2), { reportUrl: "x" });
    expect(sender.sendTaskList).toHaveBeenCalledTimes(2);
  });

  it("вечером — только тем, у кого что-то осталось", async () => {
    const tasks = [
      task({ id: 1, workerId: 10, isCompleted: true, completedAt: msk(9, 30) }),
      task({ id: 3, workerId: 11, title: "Склад" }),
    ];
    const { store, sender } = setup([company({ notifyState: '{"morning":"2026-10-24"}' })], undefined, tasks);
    const runs = await runReminders(store, sender, msk(18, 0), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "evening", sent: 1 }]);
    expect(vi.mocked(sender.sendTaskList).mock.calls[0][0]).toBe(1011);
    expect(vi.mocked(sender.sendTaskList).mock.calls[0][2]).toContain("Осталось сделать: 1");
  });

  it("итоги — админу по всем, руководителю по своим, сотруднику — нет", async () => {
    const { store, sender } = setup([company({ notifyState: '{"morning":"2026-10-24","evening":"2026-10-24"}' })]);
    const runs = await runReminders(store, sender, msk(20, 31), { reportUrl: "https://tasksflow.ru/reports" });
    expect(runs).toEqual([{ companyId: 1, slot: "digest", sent: 2 }]);
    const calls = vi.mocked(sender.sendText).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([1001, 1012]);
    expect(calls[0][1]).toContain("Сделано: <b>1 из 4</b>");
    expect(calls[1][1]).toContain("ваши сотрудники");
    expect(calls[1][1]).toContain("Сделано: <b>1 из 2</b>");
    expect(calls[0][2]).toEqual({ text: "📈 Открыть отчёт", url: "https://tasksflow.ru/reports" });
  });

  it("другой процесс уже забрал напоминание — не шлём", async () => {
    const { store, sender } = setup([company()]);
    vi.mocked(store.claimNotify).mockResolvedValueOnce(false);
    expect(await runReminders(store, sender, msk(9, 1), { reportUrl: "x" })).toEqual([]);
    expect(sender.sendTaskList).not.toHaveBeenCalled();
  });

  it("ошибка отправки одному не мешает остальным", async () => {
    const { store, sender } = setup([company()]);
    vi.mocked(sender.sendTaskList).mockRejectedValueOnce(new Error("403 bot was blocked"));
    const runs = await runReminders(store, sender, msk(9, 1), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 3 }]);
  });

  it("время считается по поясу компании", async () => {
    // 09:01 по Москве = 16:01 во Владивостоке: там утро давно прошло (окно 3 часа).
    const { store, sender } = setup([company({ timezone: "Asia/Vladivostok" })]);
    expect(await runReminders(store, sender, msk(9, 1), { reportUrl: "x" })).toEqual([]);
  });
});

describe("своё время напоминания у задачи", () => {
  const due = (extra: Record<string, unknown> = {}) =>
    task({ id: 7, workerId: 10, title: "Позвонить поставщику", remindAt: "14:00", remindSentDay: null, ...extra });

  function withReminders(tasks: any[], users = [admin, anna, boris, chef, ghost]) {
    const { store, sender } = setup([company({ notifyState: '{"morning":"2026-10-24","evening":"2026-10-24","digest":"2026-10-24"}' })], users, []);
    const sentDays = new Map<number, string>();
    store.listTaskReminders = vi.fn(async () => tasks);
    store.claimTaskReminder = vi.fn(async (id: number, day: string) => {
      if (sentDays.get(id) === day) return false;
      sentDays.set(id, day);
      return true;
    });
    return { store, sender };
  }

  it("в своё время исполнителю приходит карточка задачи, один раз за день", async () => {
    const { store, sender } = withReminders([due()]);
    expect(await runReminders(store, sender, msk(13, 59), { reportUrl: "x" })).toEqual([]);
    const runs = await runReminders(store, sender, msk(14, 0), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "task", sent: 1 }]);
    const calls = vi.mocked(sender.sendTaskList).mock.calls;
    expect(calls[0][0]).toBe(1010);
    expect(calls[0][1].map((t: any) => t.id)).toEqual([7]);
    expect(calls[0][2]).toContain("Напоминание");
    await runReminders(store, sender, msk(14, 5), { reportUrl: "x" });
    expect(sender.sendTaskList).toHaveBeenCalledTimes(1);
  });

  it("сделанная, отправленная на проверку и не сегодняшняя задача — без напоминания", async () => {
    const { store, sender } = withReminders([
      due({ id: 8, verificationStatus: "submitted" }),
      due({ id: 9, weekDays: [1] }), // 24.10.2026 — суббота
      due({ id: 10, remindSentDay: "2026-10-24" }),
    ]);
    expect(await runReminders(store, sender, msk(14, 1), { reportUrl: "x" })).toEqual([]);
  });

  it("опоздание больше 3 часов — не шлём", () => {
    expect(isTaskReminderDue({ remindAt: "14:00", remindSentDay: null }, "2026-10-24", 17 * 60)).toBe(false);
    expect(isTaskReminderDue({ remindAt: "14:00", remindSentDay: null }, "2026-10-24", 16 * 60 + 59)).toBe(true);
    expect(isTaskReminderDue({ remindAt: "25:00", remindSentDay: null }, "2026-10-24", 16 * 60)).toBe(false);
  });

  it("push по времени задачи — с тегом задачи", async () => {
    const { store } = withReminders([due()]);
    const push = vi.fn(async () => true);
    const runs = await runReminders(store, { pushRecipients: async () => new Set([10]), push }, msk(14, 2), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "task", sent: 1 }]);
    expect(push).toHaveBeenCalledWith(10, { title: "Напоминание · 14:00", body: "Позвонить поставщику", url: "/dashboard", tag: "remind-7" });
  });
});

describe("личные настройки и роли", () => {
  it("выключил напоминания — утром ничего не приходит; итоги дня — по своей настройке", async () => {
    const quiet = user({ notifyPrefs: '{"reminders":false}' });
    const { store, sender } = setup([company()], [quiet, boris]);
    const runs = await runReminders(store, sender, msk(9, 1), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 1 }]);
    expect(vi.mocked(sender.sendTaskList).mock.calls.map((c) => c[0])).toEqual([1011]);

    const noDigest = user({ id: 1, name: "Ирина", isAdmin: true, tgChatId: 1001, notifyPrefs: '{"digest":false}' });
    const evening = setup([company({ notifyState: '{"morning":"2026-10-24","evening":"2026-10-24"}' })], [noDigest, anna]);
    expect(await runReminders(evening.store, evening.sender, msk(20, 31), { reportUrl: "x" })).toEqual([
      { companyId: 1, slot: "digest", sent: 0 },
    ]);
  });

  it("своя роль «Руководитель» получает итоги по всей компании", async () => {
    const lead = user({ id: 14, name: "Олег", roleId: 3, tgChatId: 1014 });
    const { store, sender } = setup([company({ notifyState: '{"morning":"2026-10-24","evening":"2026-10-24"}' })], [lead, anna, boris]);
    store.getRoles = vi.fn(async () => [
      { id: 3, companyId: 1, name: "Руководитель", permissions: { manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false } },
    ]);
    const runs = await runReminders(store, sender, msk(20, 31), { reportUrl: "x" });
    expect(runs).toEqual([{ companyId: 1, slot: "digest", sent: 1 }]);
    const [chatId, text] = vi.mocked(sender.sendText).mock.calls[0];
    expect(chatId).toBe(1014);
    expect(text).toContain("Сделано: <b>1 из 4</b>");
    expect(text).not.toContain("ваши сотрудники");
  });

  it("сводка по команде считает задачи, ждущие проверки", () => {
    expect(teamMorningText({ tasks: 5, review: 0 })).toBe("у команды на сегодня задач: 5");
    expect(teamMorningText({ tasks: 5, review: 2 })).toBe("у команды на сегодня задач: 5 · ждут проверки: 2");
  });
});
