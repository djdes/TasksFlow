import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Авто-создание черновика по дедлайну.
 *
 * Руководитель пишет задачу и уходит, не нажав «Создать» — обычное дело.
 * Без дедлайна работа терялась вместе с черновиком. Но цена ошибки в
 * другую сторону выше: задвоенные задачи попадут реальным людям, поэтому
 * забор черновика обязан быть атомарным.
 */

const rows: any[] = [];
let affectedRows = 1;

// Тонкий мок drizzle: нас интересуют только условия и affectedRows.
const chain = () => {
  const self: any = {
    from: () => self,
    where: () => self,
    limit: () => Promise.resolve(rows),
    set: (v: any) => {
      self._set = v;
      return self;
    },
    then: (res: any) => res([{ affectedRows }]),
  };
  return self;
};

vi.mock("../server/db", () => ({
  db: {
    select: () => chain(),
    update: () => chain(),
    insert: () => ({ values: () => Promise.resolve([{ insertId: 1 }]) }),
    delete: () => chain(),
  },
}));

beforeEach(() => {
  rows.length = 0;
  affectedRows = 1;
});
afterEach(() => vi.clearAllMocks());

describe("claimDraftForCreation", () => {
  it("выигравший получает true", async () => {
    const { claimDraftForCreation } = await import("../server/telegram/drafts");
    affectedRows = 1;
    expect(await claimDraftForCreation("d1")).toBe(true);
  });

  it("проигравший гонку получает false — задачи не задвоятся", async () => {
    const { claimDraftForCreation } = await import("../server/telegram/drafts");
    // Черновик уже не в статусе confirming: UPDATE не задел ни строки.
    affectedRows = 0;
    expect(await claimDraftForCreation("d1")).toBe(false);
  });

  it("только один из двух одновременных заборов выигрывает", async () => {
    const { claimDraftForCreation } = await import("../server/telegram/drafts");
    affectedRows = 1;
    const first = await claimDraftForCreation("d1");
    affectedRows = 0; // строка уже переведена в confirmed
    const second = await claimDraftForCreation("d1");

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});

describe("константы дедлайна", () => {
  it("10 минут на ответ и минута на повтор после сбоя", async () => {
    const { AUTO_CREATE_SEC, AUTO_RETRY_SEC } = await import("../server/telegram/drafts");
    expect(AUTO_CREATE_SEC).toBe(600);
    expect(AUTO_RETRY_SEC).toBe(60);
  });

  it("дедлайн авто-создания короче времени жизни черновика", async () => {
    const { AUTO_CREATE_SEC, DRAFT_TTL_SEC } = await import("../server/telegram/drafts");
    // Иначе черновик протухнет раньше, чем сработает авто-создание,
    // и задача всё равно потеряется.
    expect(AUTO_CREATE_SEC).toBeLessThan(DRAFT_TTL_SEC);
  });
});

describe("listDueForAutoCreate", () => {
  it("возвращает разобранные черновики", async () => {
    rows.push({
      id: "d1",
      userId: 183,
      companyId: 18,
      chatId: 100,
      messageId: 5,
      status: "confirming",
      rawText: "помыть пол",
      segments: JSON.stringify({
        segments: [{ id: "s1", title: "Помыть пол", included: true }],
        truncated: 0,
      }),
      attachments: null,
      createdAt: 1,
      expiresAt: 999999999,
      autoCreateAt: 1,
    });
    const { listDueForAutoCreate } = await import("../server/telegram/drafts");
    const due = await listDueForAutoCreate();

    expect(due).toHaveLength(1);
    expect(due[0].segments[0].title).toBe("Помыть пол");
    expect(due[0].autoCreateAt).toBe(1);
  });

  it("пустая очередь не ломает разбор", async () => {
    const { listDueForAutoCreate } = await import("../server/telegram/drafts");
    expect(await listDueForAutoCreate()).toEqual([]);
  });

  it("битый JSON сегментов не роняет тик", async () => {
    rows.push({
      id: "d2", userId: 1, companyId: 1, chatId: 1, messageId: null,
      status: "confirming", rawText: "т", segments: "{сломано", attachments: null,
      createdAt: 1, expiresAt: 999999999, autoCreateAt: 1,
    });
    const { listDueForAutoCreate } = await import("../server/telegram/drafts");
    const due = await listDueForAutoCreate();
    expect(due[0].segments).toEqual([]);
  });
});
