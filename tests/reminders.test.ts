/**
 * Напоминания в Telegram: утром — список задач, вечером — что осталось,
 * руководителю — итоги дня. Раз за местный день, только привязавшим бота.
 */
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFY, parseNotifySettings } from "../shared/notify";
import {
  digestText,
  dueSlots,
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
  it("по умолчанию 09:00, 18:00 и 20:30; мусор в БД — тоже по умолчанию", () => {
    expect(parseNotifySettings(null)).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifySettings('{"morning":"25:00"}')).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifySettings('{"morning":"07:30","evening":null,"digest":"21:00"}')).toEqual({ morning: "07:30", evening: null, digest: "21:00" });
  });

  it("пора, если время наступило, сегодня ещё не отправляли и опоздание меньше 3 часов", () => {
    const s = DEFAULT_NOTIFY;
    expect(dueSlots(s, {}, "2026-10-24", 8 * 60 + 59)).toEqual([]);
    expect(dueSlots(s, {}, "2026-10-24", 9 * 60)).toEqual(["morning"]);
    expect(dueSlots(s, { morning: "2026-10-24" }, "2026-10-24", 9 * 60 + 5)).toEqual([]);
    expect(dueSlots(s, { morning: "2026-10-23" }, "2026-10-24", 11 * 60 + 59)).toEqual(["morning"]);
    expect(dueSlots(s, {}, "2026-10-24", 12 * 60)).toEqual([]);
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
  it("утром — список тем, у кого есть задачи и привязан бот", async () => {
    const { store, sender } = setup([company()]);
    const runs = await runReminders(store, sender, msk(9, 1), { reportUrl: "https://tasksflow.ru/reports" });
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 2 }]);
    const calls = vi.mocked(sender.sendTaskList).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([1010, 1011]);
    expect(calls[0][1].map((t: any) => t.id)).toEqual([1, 2]);
    expect(calls[0][2]).toContain("Доброе утро, Анна!");
    expect(calls[0][2]).toContain("Задач на сегодня: 2");
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
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 1 }]);
  });

  it("время считается по поясу компании", async () => {
    // 09:01 по Москве = 16:01 во Владивостоке: там утро давно прошло (окно 3 часа).
    const { store, sender } = setup([company({ timezone: "Asia/Vladivostok" })]);
    expect(await runReminders(store, sender, msk(9, 1), { reportUrl: "x" })).toEqual([]);
  });
});
