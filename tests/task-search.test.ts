/**
 * Тесты matchTaskBySearch — поиск task'ов по haystack
 * (title + description + category + workerName).
 *
 * UX-критическое: воркер вводит «уборка» в поиск — должно найтись
 * во ВСЕХ колонках, не только в title. Случайно сломав, юзер не
 * найдёт задачу хотя она есть.
 */

import { describe, it, expect } from "vitest";
import { matchTaskBySearch } from "../client/src/lib/task-search";

describe("matchTaskBySearch — пустой query", () => {
  it("query='' → true (фильтр выключен)", () => {
    expect(matchTaskBySearch({ title: "Анализ кода" }, "Иван", "")).toBe(true);
  });

  it("только пробелы → true", () => {
    expect(
      matchTaskBySearch({ title: "Анализ кода" }, "Иван", "   "),
    ).toBe(true);
  });

  it("даже на пустой task: пустой query всё равно true", () => {
    expect(matchTaskBySearch({}, null, "")).toBe(true);
  });
});

describe("matchTaskBySearch — match по полям", () => {
  it("матчит title", () => {
    expect(
      matchTaskBySearch({ title: "Помыть полы" }, null, "полы"),
    ).toBe(true);
  });

  it("матчит description", () => {
    expect(
      matchTaskBySearch(
        { title: "Дело", description: "уборка полов и пыль" },
        null,
        "пыль",
      ),
    ).toBe(true);
  });

  it("матчит category", () => {
    expect(
      matchTaskBySearch({ title: "Дело", category: "Уборка" }, null, "убор"),
    ).toBe(true);
  });

  it("матчит worker name", () => {
    expect(matchTaskBySearch({ title: "Дело" }, "Иван Петров", "иван")).toBe(
      true,
    );
  });
});

describe("matchTaskBySearch — case insensitive", () => {
  it("UPPERCASE query, lowercase title → match", () => {
    expect(matchTaskBySearch({ title: "помыть полы" }, null, "ПОЛЫ")).toBe(
      true,
    );
  });

  it("Mixed case", () => {
    expect(matchTaskBySearch({ title: "ПомыТЬ Полы" }, null, "ПОмыть")).toBe(
      true,
    );
  });

  it("кириллица + латиница смешанно", () => {
    expect(
      matchTaskBySearch({ title: "Audit Журнал кухни" }, null, "AUDIT"),
    ).toBe(true);
  });
});

describe("matchTaskBySearch — нет match", () => {
  it("query не встречается ни в одном поле → false", () => {
    expect(
      matchTaskBySearch(
        { title: "Помыть полы", description: "Внимательно", category: "Уборка" },
        "Иван",
        "электрика",
      ),
    ).toBe(false);
  });

  it("частичный match отсутствует — full word не нужен", () => {
    // «убор» матчится в «Уборка» (substring). Не AND-логика.
    expect(
      matchTaskBySearch({ title: "уборка дома" }, null, "ка дом"),
    ).toBe(true);
  });
});

describe("matchTaskBySearch — null/undefined fields", () => {
  it("title=null, query совпадает с workerName → true", () => {
    expect(matchTaskBySearch({ title: null }, "Иван", "иван")).toBe(true);
  });

  it("все поля null/undefined, workerName null → match только пустой query", () => {
    expect(matchTaskBySearch({}, null, "x")).toBe(false);
    expect(matchTaskBySearch({}, null, "")).toBe(true);
  });

  it("пустые строки не дают false-positive с пробелами", () => {
    // Если все поля = ""/null, haystack = "". query="space" не найдёт.
    expect(
      matchTaskBySearch(
        { title: "", description: "", category: "" },
        "",
        "x",
      ),
    ).toBe(false);
  });
});

describe("matchTaskBySearch — multi-field combined", () => {
  it("query из 2 слов в разных полях → true (всё в одном haystack)", () => {
    // title='Помыть полы' + workerName='Мария' → haystack='помыть полы мария'
    // query='полы мария' встречается как substring (после join space).
    expect(
      matchTaskBySearch({ title: "Помыть полы" }, "Мария", "полы мария"),
    ).toBe(true);
  });
});
