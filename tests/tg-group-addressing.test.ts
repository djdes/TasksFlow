import { describe, it, expect } from "vitest";
import { resolveAddressing } from "../server/telegram/handle-update";
import type { TgMessage } from "../server/telegram/client";

/**
 * В группе бот обязан молчать, пока к нему не обратились: иначе он
 * разберёт всю болтовню коллег и выжрет лимит AI за пять минут.
 * И наоборот — если позвали, он обязан ответить.
 */

const ME = { id: 8810015596, username: "thetasksflowbot" };

function msg(overrides: Partial<TgMessage> & { chatType?: string } = {}): TgMessage {
  const { chatType, ...rest } = overrides;
  return {
    message_id: 1,
    chat: { id: chatType === "private" ? 100 : -1004448078534, type: chatType ?? "supergroup" },
    date: 0,
    from: { id: 2133993638, first_name: "Ярослав" },
    ...rest,
  } as TgMessage;
}

describe("личка", () => {
  it("любое сообщение — обращение к боту", () => {
    const r = resolveAddressing(msg({ chatType: "private", text: "помыть пол" }), ME);
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("помыть пол");
  });

  it("пустой текст не ломает разбор", () => {
    expect(resolveAddressing(msg({ chatType: "private" }), ME).text).toBe("");
  });
});

describe("группа: когда бот молчит", () => {
  it("обычная болтовня игнорируется", () => {
    expect(resolveAddressing(msg({ text: "мужики, кто за пивом" }), ME).addressed).toBe(false);
  });

  it("упоминание ДРУГОГО бота не считается обращением", () => {
    expect(resolveAddressing(msg({ text: "@someotherbot сделай" }), ME).addressed).toBe(false);
  });

  it("username как часть другого слова не срабатывает", () => {
    expect(
      resolveAddressing(msg({ text: "@thetasksflowbot2 привет" }), ME).addressed,
    ).toBe(false);
  });

  it("reply на чужое сообщение — не обращение", () => {
    const r = resolveAddressing(
      msg({
        text: "ага",
        reply_to_message: msg({ from: { id: 999, first_name: "Коллега" } }),
      }),
      ME,
    );
    expect(r.addressed).toBe(false);
  });
});

describe("группа: когда бот отвечает", () => {
  it("упоминание в начале — обращение, упоминание вырезано из текста", () => {
    const r = resolveAddressing(
      msg({ text: "@thetasksflowbot поставь задачу убрать туалет после 10:30" }),
      ME,
    );
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("поставь задачу убрать туалет после 10:30");
  });

  it("упоминание в середине тоже работает", () => {
    const r = resolveAddressing(msg({ text: "слушай @thetasksflowbot помой пол" }), ME);
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("слушай помой пол");
  });

  it("регистр упоминания не важен", () => {
    expect(resolveAddressing(msg({ text: "@TheTasksFlowBot помой" }), ME).addressed).toBe(true);
  });

  it("reply на сообщение бота — обращение без упоминания", () => {
    const r = resolveAddressing(
      msg({ text: "нет, Олегу", reply_to_message: msg({ from: { id: ME.id, first_name: "bot", is_bot: true } }) }),
      ME,
    );
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("нет, Олегу");
  });

  it("команда с суффиксом бота распознаётся и чистится", () => {
    const r = resolveAddressing(msg({ text: "/tasks@thetasksflowbot" }), ME);
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("/tasks");
  });

  it("подпись к фото с упоминанием тоже считается", () => {
    const r = resolveAddressing(
      msg({ caption: "@thetasksflowbot вот так надо мыть" }),
      ME,
    );
    expect(r.addressed).toBe(true);
    expect(r.text).toBe("вот так надо мыть");
  });

  it("двойные пробелы после вырезания схлопываются", () => {
    const r = resolveAddressing(msg({ text: "эй  @thetasksflowbot  помой пол" }), ME);
    expect(r.text).toBe("эй помой пол");
  });
});

describe("группа без известного username", () => {
  it("без username работает только reply — упоминание опознать нечем", () => {
    const anon = { id: ME.id, username: null };
    expect(resolveAddressing(msg({ text: "@thetasksflowbot помой" }), anon).addressed).toBe(false);
    expect(
      resolveAddressing(
        msg({ text: "помой", reply_to_message: msg({ from: { id: ME.id, first_name: "b", is_bot: true } }) }),
        anon,
      ).addressed,
    ).toBe(true);
  });
});

describe("username со спецсимволами regex", () => {
  it("точки в username не превращаются в «любой символ»", () => {
    const dotted = { id: 1, username: "a.b" };
    expect(resolveAddressing(msg({ text: "@axb привет" }), dotted).addressed).toBe(false);
    expect(resolveAddressing(msg({ text: "@a.b привет" }), dotted).addressed).toBe(true);
  });
});
