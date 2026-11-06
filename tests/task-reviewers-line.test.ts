import { describe, it, expect } from "vitest";
import { reviewersLine } from "../shared/reviewers";

describe("строка «Проверяет» в окне задачи", () => {
  it("без проверки строки нет", () => {
    expect(reviewersLine({ required: false, names: ["Михаил"] })).toBeNull();
    expect(reviewersLine(null)).toBeNull();
  });
  it("один, двое и трое — через «или»", () => {
    expect(reviewersLine({ required: true, names: ["Михаил"] })).toBe("Проверяет: Михаил");
    expect(reviewersLine({ required: true, names: ["Михаил", "Любовь"] })).toBe("Проверяет: Михаил или Любовь");
    expect(reviewersLine({ required: true, names: ["А", "Б", "В"] })).toBe("Проверяет: А, Б или В");
  });
  it("больше трёх — «и ещё N»", () => {
    expect(reviewersLine({ required: true, names: ["А", "Б", "В", "Г", "Д"] })).toBe("Проверяет: А, Б, В и ещё 2");
  });
  it("проверка нужна, но принять некому по именам — руководитель", () => {
    expect(reviewersLine({ required: true, names: [] })).toBe("Проверяет: руководитель");
  });
});
