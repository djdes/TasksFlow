import { describe, it, expect } from "vitest";
import {
  parseCallback,
  buildCallback,
  shortDraftId,
  MAX_CALLBACK_BYTES,
  type CallbackAction,
} from "../server/telegram/callbacks";

/**
 * callback_data приходит от клиента и не доверенный. Плюс жёсткий лимит
 * Telegram в 64 байта — обрезанная кнопка делает не то, что написано.
 */

const D = "a1b2c3d4e5f6";

describe("shortDraftId", () => {
  it("12 hex-символов без дефисов", () => {
    const short = shortDraftId("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(short).toBe("3f2504e04f89");
    expect(short).toHaveLength(12);
  });
});

describe("buildCallback → parseCallback roundtrip", () => {
  const cases: CallbackAction[] = [
    { kind: "create", draft: D },
    { kind: "cancel", draft: D },
    { kind: "back", draft: D },
    { kind: "edit", draft: D, seg: 3 },
    { kind: "toggleIncluded", draft: D, seg: 0 },
    { kind: "togglePhoto", draft: D, seg: 9 },
    { kind: "workerPicker", draft: D, seg: 1, page: 2 },
    { kind: "workerSet", draft: D, seg: 1, workerId: 12345 },
    { kind: "recurPreset", draft: D, seg: 2, preset: "workdays" },
    { kind: "duePreset", draft: D, seg: 2, preset: "tomorrow" },
    { kind: "filePicker", draft: D, file: 1, page: 0 },
    { kind: "fileToggle", draft: D, file: 2, seg: 3 },
    { kind: "fileAll", draft: D, file: 1 },
    { kind: "fileNone", draft: D, file: 1 },
    { kind: "taskOpen", taskId: 987654 },
    { kind: "taskPhoto", taskId: 987654 },
    { kind: "taskItemPhoto", taskId: 42, itemId: "item-7" },
    { kind: "tasksRefresh" },
  ];

  for (const action of cases) {
    it(`${action.kind} переживает roundtrip`, () => {
      const data = buildCallback(action);
      expect(parseCallback(data)).toEqual(action);
    });

    it(`${action.kind} укладывается в ${MAX_CALLBACK_BYTES} байт`, () => {
      expect(Buffer.byteLength(buildCallback(action), "utf8")).toBeLessThanOrEqual(
        MAX_CALLBACK_BYTES,
      );
    });
  }
});

describe("buildCallback: защита от переполнения", () => {
  it("слишком длинный id — исключение, а не молчаливое обрезание", () => {
    expect(() =>
      buildCallback({ kind: "taskItemPhoto", taskId: 1, itemId: "x".repeat(80) }),
    ).toThrow(/слишком длинный/);
  });
});

describe("parseCallback: мусорный ввод", () => {
  const garbage = [
    undefined,
    "",
    "неизвестное",
    "c",
    "c:",
    "c:не-hex!",
    "e:a1b2:абв",
    "e:a1b2",
    "W:a1b2:1",
    "r:a1b2:1:никогда",
    "l:a1b2:1:вчера",
    "t:abc",
    "t:-5",
    "tp:99999999999999",
    "::::",
    "F:a1b2:x:1",
  ];

  for (const data of garbage) {
    it(`${JSON.stringify(data)} → null`, () => {
      expect(parseCallback(data as string | undefined)).toBeNull();
    });
  }

  it("SQL-подобная строка не проходит валидацию id", () => {
    expect(parseCallback("c:1' OR '1'='1")).toBeNull();
  });

  it("лишние сегменты не ломают разбор простого действия", () => {
    expect(parseCallback(`c:${D}:мусор`)).toEqual({ kind: "create", draft: D });
  });
});

describe("parseCallback: границы чисел", () => {
  it("нулевые индексы валидны", () => {
    expect(parseCallback(`e:${D}:0`)).toEqual({ kind: "edit", draft: D, seg: 0 });
  });

  it("itemId с двоеточиями собирается обратно целиком", () => {
    expect(parseCallback("ti:42:a:b:c")).toEqual({
      kind: "taskItemPhoto",
      taskId: 42,
      itemId: "a:b:c",
    });
  });
});
