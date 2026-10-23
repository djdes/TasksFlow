/**
 * Ночной сброс повторяющихся задач: история вместо удаления фото,
 * местная полночь компании, сброс один раз за день.
 *
 * Раньше скрипт сброса удалял фото с диска и обнулял выполнение без
 * следа, а задачи с проверяющим после первого дня застревали в
 * verification_status='approved'.
 */
import { describe, expect, it, vi } from "vitest";
import type { ChecklistItem, InsertTaskHistory } from "../shared/schema";
import {
  planDailyReset,
  runDueResets,
  type ResetCompany,
  type ResetStore,
  type ResetTask,
} from "../server/services/daily-reset";

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
// 2026-10-24 00:05 по Москве; вчера — пятница 23.10.
const NOW = utc(2026, 10, 23, 21, 5);
const TODAY = "2026-10-24";
const TZ = "Europe/Moscow";

function task(extra: Partial<ResetTask> = {}): ResetTask {
  return {
    id: 1,
    title: "Протереть витрину",
    workerId: 10,
    companyId: 1,
    category: null,
    price: 0,
    isRecurring: true,
    isCompleted: false,
    completedAt: null,
    createdAt: 1,
    photoUrl: null,
    photoUrls: [],
    checklist: [],
    claimedByWorkerId: null,
    verificationStatus: null,
    verifiedByUserId: null,
    verifiedAt: null,
    weekDays: null,
    monthDay: null,
    dueDate: null,
    ...extra,
  };
}

const plan = (tasks: ResetTask[]) => planDailyReset(tasks, { tz: TZ, today: TODAY, now: NOW });

describe("план сброса", () => {
  it("выполненная задача уходит в историю с фото и сбрасывается", () => {
    const p = plan([task({ isCompleted: true, completedAt: utc(2026, 10, 23, 9), photoUrls: ["/uploads/a.jpg"], price: 150 })]);
    expect(p.resetIds).toEqual([1]);
    expect(p.history).toHaveLength(1);
    expect(p.history[0]).toMatchObject({
      taskId: 1,
      day: "2026-10-23",
      status: "done",
      price: 150,
      photoUrls: '["/uploads/a.jpg"]',
    });
  });

  it("старое одиночное фото тоже сохраняется", () => {
    const p = plan([task({ isCompleted: true, completedAt: utc(2026, 10, 23, 9), photoUrl: "/uploads/old.jpg" })]);
    expect(p.history[0].photoUrls).toBe('["/uploads/old.jpg"]');
  });

  it("день выполнения считается по поясу компании, а не сервера", () => {
    // 23.10 22:30 UTC = 24.10 08:30 во Владивостоке — уже «сегодня» там.
    const p = planDailyReset([task({ isCompleted: true, completedAt: utc(2026, 10, 22, 22, 30) })], {
      tz: "Asia/Vladivostok",
      today: "2026-10-24",
      now: utc(2026, 10, 23, 14, 5),
    });
    expect(p.history[0].day).toBe("2026-10-23");
  });

  it("сделанное коллегой — claimed, без премии", () => {
    const p = plan([task({ isCompleted: true, completedAt: utc(2026, 10, 23, 9), claimedByWorkerId: 11, price: 300 })]);
    expect(p.history[0]).toMatchObject({ status: "claimed", price: 0, claimedByWorkerId: 11 });
  });

  it("не выполненная по расписанию — missed за вчера", () => {
    const p = plan([task({ id: 3 })]);
    expect(p.resetIds).toEqual([]);
    expect(p.history).toEqual([expect.objectContaining({ taskId: 3, status: "missed", day: "2026-10-23" })]);
  });

  it("не было в расписании вчера, без исполнителя или создана сегодня — не пропуск", () => {
    const p = plan([
      task({ id: 1, weekDays: [1] }), // только по понедельникам
      task({ id: 2, monthDay: 1 }),
      task({ id: 3, workerId: null }),
      task({ id: 4, createdAt: utc(2026, 10, 23, 21, 1) }),
    ]);
    expect(p.history).toEqual([]);
  });

  it("отправленная на проверку не трогается", () => {
    const items: ChecklistItem[] = [{ id: "a", title: "Пол", done: true, photoUrls: ["/uploads/p.jpg"] }];
    const p = plan([task({ verificationStatus: "submitted", checklist: items })]);
    expect(p).toEqual({ history: [], resetIds: [], checklistResets: [] });
  });

  it("выполненная после полуночи — сегодняшняя работа, не сбрасывается", () => {
    const p = plan([task({ isCompleted: true, completedAt: utc(2026, 10, 23, 21, 2) })]);
    expect(p).toEqual({ history: [], resetIds: [], checklistResets: [] });
  });

  it("разовые задачи не трогаются", () => {
    const p = plan([task({ isRecurring: false, isCompleted: true, completedAt: utc(2026, 10, 23, 9) })]);
    expect(p).toEqual({ history: [], resetIds: [], checklistResets: [] });
  });

  it("чек-лист: снимок с фото в истории, прогресс обнуляется", () => {
    const items: ChecklistItem[] = [
      { id: "a", title: "Пол", done: true, photoUrls: ["/uploads/p.jpg"] },
      { id: "b", title: "Окна", done: false, photoUrls: [] },
    ];
    const p = plan([task({ checklist: items })]);
    expect(JSON.parse(p.history[0].checklist as string)).toEqual(items);
    expect(p.checklistResets).toEqual([
      { id: 1, checklist: [
        { id: "a", title: "Пол", done: false, photoUrls: [] },
        { id: "b", title: "Окна", done: false, photoUrls: [] },
      ] },
    ]);
  });
});

function fakeStore(companies: ResetCompany[], tasksByCompany: Record<string, ResetTask[]> = {}) {
  const state = { companies: companies.map((c) => ({ ...c })), history: [] as InsertTaskHistory[] };
  const store: ResetStore = {
    listCompanies: vi.fn(async () => state.companies.map((c) => ({ ...c }))),
    claimCompanyDay: vi.fn(async (id, from, to) => {
      const c = state.companies.find((x) => x.id === id)!;
      if (c.lastResetDay !== from) return false;
      c.lastResetDay = to;
      return true;
    }),
    releaseCompanyDay: vi.fn(async (id, claimed, previous) => {
      const c = state.companies.find((x) => x.id === id)!;
      if (c.lastResetDay === claimed) c.lastResetDay = previous;
    }),
    getRecurringTasks: vi.fn(async (companyId) => tasksByCompany[String(companyId)] ?? []),
    insertHistory: vi.fn(async (rows) => {
      state.history.push(...rows);
      return rows.length;
    }),
    resetCompleted: vi.fn(async (ids) => ids.length),
    resetChecklist: vi.fn(async () => {}),
  };
  return { store, state };
}

describe("запуск сброса по компаниям", () => {
  it("первый запуск запоминает «сегодня» и ничего не сбрасывает", async () => {
    const { store, state } = fakeStore([{ id: 1, timezone: TZ, lastResetDay: null }], {
      "1": [task({ isCompleted: true, completedAt: utc(2026, 10, 23, 9) })],
    });
    expect(await runDueResets(store, utc(2026, 10, 23, 12))).toEqual([]);
    expect(state.companies[0].lastResetDay).toBe("2026-10-23");
    expect(store.resetCompleted).not.toHaveBeenCalled();
  });

  it("новый местный день — один сброс, повторный тик ничего не делает", async () => {
    const { store, state } = fakeStore([{ id: 1, timezone: TZ, lastResetDay: "2026-10-23" }], {
      "1": [task({ isCompleted: true, completedAt: utc(2026, 10, 23, 9) })],
    });
    const first = await runDueResets(store, NOW);
    expect(first).toEqual([{ companyId: 1, day: "2026-10-23", archived: 1, reset: 1, missed: 0 }]);
    expect(store.resetCompleted).toHaveBeenCalledWith([1], utc(2026, 10, 23, 21));
    expect(state.companies[0].lastResetDay).toBe(TODAY);
    expect(await runDueResets(store, NOW + 60)).toEqual([]);
    expect(store.insertHistory).toHaveBeenCalledTimes(1);
  });

  it("у каждой компании своя полночь", async () => {
    const { store } = fakeStore([
      { id: 1, timezone: "Asia/Vladivostok", lastResetDay: "2026-10-23" },
      { id: 2, timezone: "Europe/Kaliningrad", lastResetDay: "2026-10-23" },
    ]);
    // 14:05 UTC: во Владивостоке уже 24-е, в Калининграде ещё 23-е.
    const done = await runDueResets(store, utc(2026, 10, 23, 14, 5));
    expect(done.map((d) => d.companyId)).toEqual([1]);
  });

  it("ошибка сброса откатывает заявку — следующий тик повторит", async () => {
    const { store, state } = fakeStore([{ id: 1, timezone: TZ, lastResetDay: "2026-10-23" }]);
    vi.mocked(store.insertHistory).mockRejectedValueOnce(new Error("db down"));
    const onError = vi.fn();
    expect(await runDueResets(store, NOW, { onError })).toEqual([]);
    expect(onError).toHaveBeenCalledWith(1, expect.any(Error));
    expect(state.companies[0].lastResetDay).toBe("2026-10-23");
    expect(await runDueResets(store, NOW + 60)).toHaveLength(1);
  });

  it("параллельный процесс уже заявил день — второй не сбрасывает", async () => {
    const { store } = fakeStore([{ id: 1, timezone: TZ, lastResetDay: "2026-10-23" }]);
    vi.mocked(store.claimCompanyDay).mockResolvedValueOnce(false);
    expect(await runDueResets(store, NOW)).toEqual([]);
    expect(store.getRecurringTasks).not.toHaveBeenCalled();
  });

  it("задачи без компании сбрасывает только cron-запуск", async () => {
    const { store } = fakeStore([], { null: [task({ companyId: null, isCompleted: true, completedAt: utc(2026, 10, 23, 9) })] });
    expect(await runDueResets(store, NOW)).toEqual([]);
    const done = await runDueResets(store, NOW, { includeLegacy: true });
    expect(done).toEqual([{ companyId: null, day: "2026-10-23", archived: 1, reset: 1, missed: 0 }]);
    expect(store.getRecurringTasks).toHaveBeenCalledWith(null);
  });
});
