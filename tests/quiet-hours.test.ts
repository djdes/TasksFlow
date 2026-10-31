/**
 * Тихие часы и дни напоминаний: ночью уведомления не будят, а приходят
 * утром одной пачкой, без неактуального; напоминания — только в дни компании.
 */
import { describe, expect, it, vi } from "vitest";
import {
  daysLabel,
  DEFAULT_NOTIFY,
  isQuietTime,
  isReminderDay,
  notifySettingsSchema,
  parseNotifySettings,
  quietUntil,
  withDefaults,
} from "../shared/notify";
import type { PushDeferredRow } from "../shared/schema";

vi.mock("../server/storage", () => ({
  storage: {},
  DatabaseStorage: { parseManagedWorkerIds: (raw: string | null) => (raw ? JSON.parse(raw) : null) },
}));
vi.mock("../server/db", () => ({ db: {} }));

const { flushDeferred, morningMessages, nowOrMorning, quietAt, soonOrMorning, DEFERRED_MAX_AGE_SEC } = await import("../server/push/quiet");

const min = (h: number, m = 0) => h * 60 + m;
// 26.10.2026 по Москве (UTC+3).
const msk = (h: number, mi = 0) => Date.UTC(2026, 9, 26, h - 3, mi) / 1000;

describe("ночь по настройкам компании", () => {
  it("по умолчанию с 22:00 до утренней сводки (08:30)", () => {
    const s = DEFAULT_NOTIFY;
    expect(quietUntil(s)).toBe("08:30");
    expect(isQuietTime(s, min(21, 59))).toBe(false);
    expect(isQuietTime(s, min(22))).toBe(true);
    expect(isQuietTime(s, min(0, 5))).toBe(true);
    expect(isQuietTime(s, min(8, 29))).toBe(true);
    expect(isQuietTime(s, min(8, 30))).toBe(false);
    expect(isQuietTime(s, min(13))).toBe(false);
  });

  it("утренняя сводка выключена — ночь до 08:00; «не беспокоить» выключено — ночи нет", () => {
    expect(isQuietTime({ morning: null, quietFrom: "23:00" }, min(7, 59))).toBe(true);
    expect(isQuietTime({ morning: null, quietFrom: "23:00" }, min(8))).toBe(false);
    expect(isQuietTime({ morning: "08:30", quietFrom: null }, min(3))).toBe(false);
  });

  it("ночь после полуночи (с 01:00) — тоже работает", () => {
    const s = { morning: "07:00", quietFrom: "01:00" };
    expect(isQuietTime(s, min(0, 30))).toBe(false);
    expect(isQuietTime(s, min(1))).toBe(true);
    expect(isQuietTime(s, min(6, 59))).toBe(true);
  });

  it("по поясу компании", () => {
    const company = { timezone: "Asia/Yekaterinburg", notifySettings: null }; // UTC+5
    // 21:30 по Москве = 23:30 в Екатеринбурге.
    expect(quietAt(company, msk(21, 30))).toBe(true);
    expect(quietAt({ timezone: "Europe/Moscow", notifySettings: null }, msk(21, 30))).toBe(false);
  });
});

describe("настройки: дни и ночь", () => {
  it("старая запись — каждый день и ночь с 22:00; дни сортируются и без повторов", () => {
    expect(parseNotifySettings('{"morning":"08:30","evening":"18:00","digest":"20:30"}')).toMatchObject({
      days: [0, 1, 2, 3, 4, 5, 6],
      quietFrom: "22:00",
    });
    const parsed = notifySettingsSchema.parse({ morning: "08:30", evening: "16:30", digest: "16:30", days: [5, 1, 3, 1, 2, 4] });
    expect(parsed.days).toEqual([1, 2, 3, 4, 5]);
  });

  it("без дней или ночь длиннее 14 часов — понятная ошибка", () => {
    const empty = notifySettingsSchema.safeParse({ morning: "08:30", evening: null, digest: null, days: [] });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Выберите хотя бы один день напоминаний");
    const long = notifySettingsSchema.safeParse({ morning: "08:30", evening: null, digest: null, quietFrom: "12:00" });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0].path).toEqual(["quietFrom"]);
  });

  it("withDefaults дополняет только недостающее; null — выключено", () => {
    expect(withDefaults({ quietFrom: null, days: [1, 2] })).toEqual({ ...DEFAULT_NOTIFY, quietFrom: null, days: [1, 2] });
  });

  it("дни напоминаний и подпись", () => {
    expect(isReminderDay({ days: [1, 2, 3, 4, 5] }, 6)).toBe(false);
    expect(isReminderDay({ days: [1, 2, 3, 4, 5] }, 1)).toBe(true);
    expect(daysLabel([1, 2, 3, 4, 5])).toBe("по будням");
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("каждый день");
    expect(daysLabel([0, 6])).toBe("по выходным");
    expect(daysLabel([5, 1, 3])).toBe("Пн, Ср, Пт");
  });
});

function quietDeps(quiet: boolean, opts: { failAdd?: boolean } = {}) {
  const added: any[] = [];
  return {
    added,
    deps: {
      isQuiet: vi.fn(async () => quiet),
      store: {
        add: vi.fn(async (entry: any) => {
          if (opts.failAdd) throw new Error("Table 'push_deferred' doesn't exist");
          added.push(entry);
        }),
        list: vi.fn(async () => []),
        claim: vi.fn(async () => true),
      },
      soon: vi.fn(),
      send: vi.fn(),
      now: () => 1000,
    },
  };
}

describe("отправить сейчас или утром", () => {
  it("днём новая задача идёт как раньше, со склейкой", async () => {
    const { deps, added } = quietDeps(false);
    expect(await soonOrMorning("new-task", { id: 5, companyId: 1 }, 10, "Витрина", deps)).toBe("sent");
    expect(deps.soon).toHaveBeenCalledWith("new-task", 10, "Витрина", expect.any(Function));
    expect(added).toEqual([]);
  });

  it("ночью — в очередь до утра, ничего не звенит", async () => {
    const { deps, added } = quietDeps(true);
    expect(await soonOrMorning("review", { id: 5, companyId: 1 }, 20, "Витрина — Лариса", deps)).toBe("deferred");
    expect(deps.soon).not.toHaveBeenCalled();
    expect(added).toEqual([{ companyId: 1, userId: 20, kind: "review", taskId: 5, item: "Витрина — Лариса" }]);
  });

  it("очередь недоступна (нет таблицы) — шлём сразу, уведомление не теряется", async () => {
    const { deps } = quietDeps(true, { failAdd: true });
    expect(await soonOrMorning("new-task", { id: 5, companyId: 1 }, 10, "Витрина", deps)).toBe("sent");
    expect(deps.soon).toHaveBeenCalled();
    const message = { title: "Задачу вернули на доработку", body: "Пол", url: "/dashboard?task=5", tag: "task-5" };
    expect(await nowOrMorning(1, [10], message, 5, deps)).toBe("sent");
    expect(deps.send).toHaveBeenCalledWith([10], message);
  });

  it("готовое сообщение ночью — каждому в очередь целиком", async () => {
    const { deps, added } = quietDeps(true);
    const message = { title: "Оплата прошла", body: "Тариф продлён", url: "/admin/billing", tag: "billing" };
    expect(await nowOrMorning(1, [1, 2], message, null, deps)).toBe("deferred");
    expect(added.map((e) => [e.userId, e.kind, e.message])).toEqual([
      [1, "message", message],
      [2, "message", message],
    ]);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("задача без компании — сразу", async () => {
    const { deps } = quietDeps(true);
    expect(await soonOrMorning("new-task", { id: 5, companyId: null }, 10, "Витрина", deps)).toBe("sent");
  });
});

const row = (extra: Partial<PushDeferredRow>): PushDeferredRow => ({
  id: 1, companyId: 1, userId: 10, kind: "new-task", taskId: 1, item: "Витрина", message: null, createdAt: msk(23), ...extra,
});
const task = (extra: Record<string, unknown>) =>
  ({ id: 1, workerId: 10, isCompleted: false, verificationStatus: null, companyId: 1, ...extra }) as any;

describe("утренняя пачка", () => {
  it("однотипное склеено, сделанное, удалённое и переназначенное выброшено", () => {
    const rows = [
      row({ id: 1, taskId: 1, item: "Витрина" }),
      row({ id: 2, taskId: 2, item: "Касса" }),
      row({ id: 3, taskId: 3, item: "Удалённая" }),
      row({ id: 4, taskId: 4, item: "Сделанная" }),
      row({ id: 5, taskId: 5, item: "Переназначенная" }),
      row({ id: 6, userId: 20, kind: "review", taskId: 6, item: "Пол — Фара" }),
      row({ id: 7, userId: 20, kind: "review", taskId: 7, item: "Уже приняли — Фара" }),
    ];
    const tasks = [
      task({ id: 1 }),
      task({ id: 2 }),
      task({ id: 4, isCompleted: true }),
      task({ id: 5, workerId: 11 }),
      task({ id: 6, verificationStatus: "submitted" }),
      task({ id: 7, verificationStatus: "approved" }),
    ];
    expect(morningMessages(rows, tasks)).toEqual([
      { userId: 10, message: { title: "Новых задач: 2", body: "Витрина · Касса", url: "/dashboard", tag: "new-tasks" } },
      { userId: 20, message: { title: "Ждёт проверки", body: "Пол — Фара", url: "/admin/verification", tag: "verification" } },
    ]);
  });

  it("готовые сообщения с одним tag — только последнее; задачи не загрузились — шлём как есть", () => {
    const first = { title: "Задачу вернули на доработку", body: "Пол: грязно", url: "/dashboard?task=1", tag: "task-1" };
    const second = { title: "Задачу вернули на доработку", body: "Пол: всё ещё грязно", url: "/dashboard?task=1", tag: "task-1" };
    const rows = [
      row({ id: 1, kind: "message", message: JSON.stringify(first) }),
      row({ id: 2, kind: "message", message: JSON.stringify(second) }),
      row({ id: 3, kind: "new-task", taskId: 9, item: "Новая" }),
      row({ id: 4, kind: "message", message: "{битый json" }),
    ];
    expect(morningMessages(rows, null)).toEqual([
      { userId: 10, message: { title: "Новая задача", body: "Новая", url: "/dashboard", tag: "new-tasks" } },
      { userId: 10, message: second },
    ]);
  });
});

function flushSetup(rows: PushDeferredRow[], opts: { taken?: number[] } = {}) {
  const claimed: number[] = [];
  const push = vi.fn(async () => {});
  const deps = {
    store: {
      add: vi.fn(),
      list: vi.fn(async () => rows),
      claim: vi.fn(async (id: number) => {
        if (opts.taken?.includes(id)) return false; // забрал другой процесс
        claimed.push(id);
        return true;
      }),
    },
    listCompanies: vi.fn(async () => [{ id: 1, timezone: "Europe/Moscow", notifySettings: null }]),
    getTasks: vi.fn(async () => [task({ id: 1 }), task({ id: 2 })]),
    push,
  };
  return { deps, claimed, push };
}

describe("рассылка накопленного", () => {
  it("пока ночь — ничего не трогаем", async () => {
    const { deps, claimed, push } = flushSetup([row({ id: 1 })]);
    expect(await flushDeferred(deps, msk(3))).toEqual([]);
    expect(claimed).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("в 08:30 — одно уведомление вместо пачки, строки забраны", async () => {
    const { deps, claimed, push } = flushSetup([row({ id: 1, taskId: 1, item: "Витрина" }), row({ id: 2, taskId: 2, item: "Касса" })]);
    expect(await flushDeferred(deps, msk(8, 30))).toEqual([{ companyId: 1, sent: 1, dropped: 0 }]);
    expect(claimed).toEqual([1, 2]);
    expect(push).toHaveBeenCalledWith(10, expect.objectContaining({ title: "Новых задач: 2" }));
  });

  it("строку забрал другой процесс — не дублируем", async () => {
    const { deps, push } = flushSetup([row({ id: 1, taskId: 1, item: "Витрина" }), row({ id: 2, taskId: 2, item: "Касса" })], { taken: [2] });
    await flushDeferred(deps, msk(9));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(10, expect.objectContaining({ title: "Новая задача", body: "Витрина" }));
  });

  it("старше суток — выбрасываем даже ночью", async () => {
    const { deps, claimed, push } = flushSetup([row({ id: 1, createdAt: msk(3) - DEFERRED_MAX_AGE_SEC - 60 })]);
    expect(await flushDeferred(deps, msk(3))).toEqual([{ companyId: 1, sent: 0, dropped: 1 }]);
    expect(claimed).toEqual([1]);
    expect(push).not.toHaveBeenCalled();
  });

  it("компания выключила «не беспокоить» — отправляем сразу, и ночью тоже", async () => {
    const { deps, push } = flushSetup([row({ id: 1, taskId: 1 })]);
    deps.listCompanies = vi.fn(async () => [
      { id: 1, timezone: "Europe/Moscow", notifySettings: JSON.stringify({ ...DEFAULT_NOTIFY, quietFrom: null }) },
    ]);
    await flushDeferred(deps, msk(3));
    expect(push).toHaveBeenCalledTimes(1);
  });
});
