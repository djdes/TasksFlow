/**
 * Тесты extractCategories — pure helper для category-filter в Dashboard.
 *
 * Раньше эта логика была inline IIFE с (task as any).category. Извлечено
 * чтобы:
 *   • Защитить defensive-ветки (null/undefined/whitespace/non-string).
 *   • Pin'ить порядок сортировки (ru-RU localeCompare, не codepoint).
 *   • DRY если admin-фильтры начнут использовать тот же flow.
 */

import { describe, it, expect } from "vitest";
import { extractCategories } from "../client/src/lib/extract-categories";

describe("extractCategories — happy paths", () => {
  it("пустой массив → []", () => {
    expect(extractCategories([])).toEqual([]);
  });

  it("уникальные категории → сортированы", () => {
    expect(
      extractCategories([
        { category: "Кухня" },
        { category: "Зал" },
        { category: "Туалет" },
      ]),
    ).toEqual(["Зал", "Кухня", "Туалет"]);
  });

  it("дубликаты → схлопываются (Set)", () => {
    expect(
      extractCategories([
        { category: "Кухня" },
        { category: "Кухня" },
        { category: "Зал" },
        { category: "Кухня" },
      ]),
    ).toEqual(["Зал", "Кухня"]);
  });

  it("одна категория → [одна]", () => {
    expect(extractCategories([{ category: "Уборка" }])).toEqual(["Уборка"]);
  });
});

describe("extractCategories — defensive фильтры", () => {
  it("category=null → выкидывается", () => {
    expect(
      extractCategories([
        { category: "Кухня" },
        { category: null },
        { category: "Зал" },
      ]),
    ).toEqual(["Зал", "Кухня"]);
  });

  it("category=undefined → выкидывается", () => {
    expect(
      extractCategories([
        { category: "Кухня" },
        { category: undefined },
        { category: "Зал" },
      ]),
    ).toEqual(["Зал", "Кухня"]);
  });

  it("category=пустая строка → выкидывается", () => {
    expect(extractCategories([{ category: "" }, { category: "Кухня" }])).toEqual([
      "Кухня",
    ]);
  });

  it("category=только пробелы → выкидывается (trim().length===0)", () => {
    // Регрессия: без trim'а « » попадал бы в Set как валидная категория
    // и в фильтр-чипах появлялся пустой пункт.
    expect(
      extractCategories([
        { category: "Кухня" },
        { category: "   " },
        { category: "\t\n" },
      ]),
    ).toEqual(["Кухня"]);
  });

  it("category=число (typeof !== string) → выкидывается", () => {
    // Type-system runtime'ы не гарантируют — Task type из API мог
    // случайно прийти с category=123 (например после JSON-coercion
    // ошибки). Не падаем — просто игнорим.
    expect(
      extractCategories([
        { category: 123 as any },
        { category: "Кухня" },
      ]),
    ).toEqual(["Кухня"]);
  });

  it("category=объект → выкидывается", () => {
    expect(
      extractCategories([
        { category: { foo: "bar" } as any },
        { category: "Кухня" },
      ]),
    ).toEqual(["Кухня"]);
  });

  it("все категории невалидны → []", () => {
    expect(
      extractCategories([
        { category: null },
        { category: "" },
        { category: "  " },
        { category: undefined },
      ]),
    ).toEqual([]);
  });
});

describe("extractCategories — порядок сортировки (ru-RU)", () => {
  it("кириллица сортируется по алфавиту, не codepoint", () => {
    // Codepoint sort: Ё(U+0401) < А(U+0410). Если бы мы использовали
    // дефолтный Array.sort() без localeCompare, получили бы ['Ё','А','Я'].
    // Но в русском алфавите Ё идёт после Е, а Я в конце. localeCompare
    // делает это правильно.
    const out = extractCategories([
      { category: "Я" },
      { category: "А" },
      { category: "Ё" },
    ]);
    // Я последняя, А первая, Ё рядом с Е.
    expect(out[0]).toBe("А");
    expect(out[out.length - 1]).toBe("Я");
  });

  it("case-insensitive в localeCompare ru-RU не гарантирован", () => {
    // localeCompare с дефолтными опциями для ru-RU — case-sensitive.
    // Pin'им ТЕКУЩЕЕ поведение: «кухня» и «Кухня» — разные категории.
    // Если кто-то добавит {sensitivity:"base"} — тест упадёт и
    // потребует решения о валидной семантике.
    const out = extractCategories([
      { category: "кухня" },
      { category: "Кухня" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("латиница и кириллица — обе сортируются", () => {
    const out = extractCategories([
      { category: "Bar" },
      { category: "Кухня" },
      { category: "Apple" },
      { category: "Зал" },
    ]);
    expect(out).toHaveLength(4);
    // Все 4 категории присутствуют — точный порядок зависит от ru-RU
    // collation (латиница в ru-RU обычно идёт перед кириллицей).
    expect(new Set(out)).toEqual(
      new Set(["Bar", "Кухня", "Apple", "Зал"]),
    );
  });

  it("идентичные строки → один элемент", () => {
    expect(
      extractCategories([
        { category: "Полы" },
        { category: "Полы" },
      ]),
    ).toEqual(["Полы"]);
  });
});

describe("extractCategories — leading/trailing whitespace policy", () => {
  it("' Кухня ' и 'Кухня' → 2 разные категории (trim не делается)", () => {
    // Server отвечает за trim при сохранении. Если сюда пришли две
    // версии — это backend-bug, не маскируем его на клиенте. Тест
    // pin'ит решение: client trust'ит сервер.
    const out = extractCategories([
      { category: " Кухня " },
      { category: "Кухня" },
    ]);
    expect(out).toHaveLength(2);
  });

  it("' ' (только пробелы) выкидывается, но 'Кухня ' нет", () => {
    // trim().length===0 → выкидываем; trim().length>0 → оставляем
    // КАК ЕСТЬ (с пробелом). Different от предыдущего случая.
    const out = extractCategories([
      { category: " " },
      { category: "Кухня " },
    ]);
    expect(out).toEqual(["Кухня "]);
  });
});
