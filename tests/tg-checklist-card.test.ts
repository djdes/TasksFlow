/**
 * Карточка задачи в Telegram-боте с чек-листом, где фото нужно не везде:
 * пункт с фото — кнопка «📸» (ждём снимок), без фото — «✅» (отметить
 * касанием). На проверке пункты не меняются — кнопок нет.
 */
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/schema";
import { parseCallback } from "../server/telegram/callbacks";

vi.mock("../server/storage", () => ({ storage: {} }));

const { checklistLeftText, renderTaskCard } = await import("../server/telegram/my-tasks");

function task(extra: Partial<Task> = {}): Task {
  return {
    id: 501,
    title: "Обход витрин",
    description: null,
    workerId: 7,
    companyId: 42,
    requiresPhoto: false,
    photoUrls: [],
    price: 0,
    dueDate: null,
    isCompleted: false,
    verificationStatus: null,
    checklist: [
      { id: "look", title: "Внешний вид продавца", done: false, photoUrls: [], requiresPhoto: false },
      { id: "case", title: "Выкладка витрины", done: false, photoUrls: [] },
      { id: "tags", title: "Ценники", done: true, photoUrls: ["/uploads/t.jpg"] },
    ],
    ...extra,
  } as unknown as Task;
}

const buttons = (t: Task) =>
  renderTaskCard(t).reply_markup.inline_keyboard.flat().map((b: any) => ({ text: b.text, action: parseCallback(b.callback_data) }));

describe("renderTaskCard: смешанный чек-лист", () => {
  it("без фото — ✅ и taskItemDone, с фото — 📸 и taskItemPhoto, отмеченные — без кнопок", () => {
    const list = buttons(task());
    expect(list).toContainEqual({ text: "✅ Внешний вид продавца", action: { kind: "taskItemDone", taskId: 501, itemId: "look" } });
    expect(list).toContainEqual({ text: "📸 Выкладка витрины", action: { kind: "taskItemPhoto", taskId: 501, itemId: "case" } });
    expect(list.some((b) => b.action && "itemId" in b.action && b.action.itemId === "tags")).toBe(false);
  });

  it("в тексте камера только у пунктов, которые ждут фото", () => {
    const text = renderTaskCard(task()).text;
    expect(text).toContain("⬜ Внешний вид продавца\n");
    expect(text).toContain("⬜ Выкладка витрины 📸");
    expect(text).toContain("✅ Ценники");
  });

  it("на проверке пункты не меняются — кнопок пунктов нет", () => {
    const list = buttons(task({ verificationStatus: "submitted" } as Partial<Task>));
    expect(list.every((b) => b.action?.kind === "tasksRefresh")).toBe(true);
  });

  it("слишком длинный id пункта оставляет пункт без кнопки, а карточка рисуется", () => {
    const long = task({
      checklist: [{ id: "x".repeat(64), title: "Пункт", done: false, photoUrls: [], requiresPhoto: false }],
    } as Partial<Task>);
    expect(() => renderTaskCard(long)).not.toThrow();
    expect(buttons(long).every((b) => b.action?.kind === "tasksRefresh")).toBe(true);
  });
});

describe("checklistLeftText", () => {
  it("честно для любого состава", () => {
    expect(checklistLeftText(task().checklist)).toBe("Осталось: сфоткать 1, отметить 1");
    expect(checklistLeftText(task().checklist.filter((c) => c.id !== "look"))).toBe("Осталось сфоткать: 1");
    expect(checklistLeftText(task().checklist.filter((c) => c.id !== "case"))).toBe("Осталось отметить: 1");
    expect(checklistLeftText(task().checklist.filter((c) => c.done))).toBeNull();
  });
});
