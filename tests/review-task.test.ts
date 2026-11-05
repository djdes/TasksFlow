import { describe, it, expect } from "vitest";
import { isReviewTask } from "../client/src/lib/task-classification";

describe("isReviewTask — задача «проверить чужую работу»", () => {
  it("находит задачи про приёмку работы", () => {
    expect(isReviewTask({ title: "Принять работу Ларисы и Фары" })).toBe(true);
    expect(isReviewTask({ title: "Вечер", description: "Раздел «На проверке»: открой каждую задачу" })).toBe(true);
    expect(isReviewTask({ title: "Проверить выполнение уборки зала" })).toBe(true);
    expect(isReviewTask({ title: "Примите задачи поваров" })).toBe(true);
    expect(isReviewTask({ title: "Журнал", journalLink: JSON.stringify({ taskScope: "verifier" }) })).toBe(true);
  });
  it("обычные «проверить» не трогает", () => {
    expect(isReviewTask({ title: "Проверить срок годности молока" })).toBe(false);
    expect(isReviewTask({ title: "Стеллаж самообслуживания и урны" })).toBe(false);
    expect(isReviewTask({ title: "Принять поставку овощей" })).toBe(false);
  });
});
