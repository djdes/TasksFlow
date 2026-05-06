/**
 * Тесты parseJournalLink (client side).
 *
 * Контекст: client/src/lib/journal-link-parse.ts. Это lightweight
 * parser для UI без zod. Возвращает null если поле некорректное —
 * UI должен gracefully fallback'ить (рендерить task без journal-info).
 */

import { describe, it, expect } from "vitest";
// Renamed (тик 160): client/lib/journal-link-parse теперь экспортирует
// parseJournalLinkUI чтобы не путать с shared/journal-link и Dashboard
// local. Импортим через alias чтобы не править ВСЕ assert'ы в тестах.
import {
  parseJournalLinkUI as parseJournalLink,
  parseJournalLinkRaw,
} from "../client/src/lib/journal-link-parse";

describe("parseJournalLink — невалидные входы", () => {
  it("null → null", () => {
    expect(parseJournalLink(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseJournalLink(undefined)).toBeNull();
  });

  it("пустая строка → null", () => {
    expect(parseJournalLink("")).toBeNull();
  });

  it("малформированный JSON → null", () => {
    expect(parseJournalLink("not json {")).toBeNull();
  });

  it("JSON-массив (не объект) → null", () => {
    expect(parseJournalLink("[1,2,3]")).toBeNull();
  });

  it("JSON-объект без kind → null", () => {
    expect(
      parseJournalLink(JSON.stringify({ documentId: "d", rowKey: "r" })),
    ).toBeNull();
  });

  it("JSON-объект без documentId → null", () => {
    expect(
      parseJournalLink(JSON.stringify({ kind: "wesetup-cleaning", rowKey: "r" })),
    ).toBeNull();
  });

  it("JSON-объект без rowKey → null", () => {
    expect(
      parseJournalLink(
        JSON.stringify({ kind: "wesetup-cleaning", documentId: "d" }),
      ),
    ).toBeNull();
  });

  it("kind не строка → null", () => {
    expect(
      parseJournalLink(
        JSON.stringify({ kind: 123, documentId: "d", rowKey: "r" }),
      ),
    ).toBeNull();
  });
});

describe("parseJournalLink — валидные входы", () => {
  it("минимальный валидный объект", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
      }),
    );
    expect(result).toEqual({
      kind: "wesetup-cleaning",
      documentId: "doc1",
      rowKey: "row1",
      label: undefined,
      siblingVisibility: false,
    });
  });

  it("с label", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
        label: "Уборка зала",
      }),
    );
    expect(result?.label).toBe("Уборка зала");
  });

  it("siblingVisibility: true", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
        siblingVisibility: true,
      }),
    );
    expect(result?.siblingVisibility).toBe(true);
  });

  it("siblingVisibility default false когда отсутствует", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
      }),
    );
    expect(result?.siblingVisibility).toBe(false);
  });

  it("siblingVisibility=string игнорится → false (только boolean принимается)", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
        siblingVisibility: "true",
      }),
    );
    expect(result?.siblingVisibility).toBe(false);
  });

  it("label не строка → undefined", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
        label: 42,
      }),
    );
    expect(result?.label).toBeUndefined();
  });

  it("игнорирует unknown поля", () => {
    const result = parseJournalLink(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "doc1",
        rowKey: "row1",
        randomGarbage: { nested: true },
      }),
    );
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).randomGarbage).toBeUndefined();
  });
});

describe("parseJournalLinkRaw — lenient parser", () => {
  it("null/undefined/'' → null", () => {
    expect(parseJournalLinkRaw(null)).toBeNull();
    expect(parseJournalLinkRaw(undefined)).toBeNull();
    expect(parseJournalLinkRaw("")).toBeNull();
  });

  it("malformed JSON → null", () => {
    expect(parseJournalLinkRaw("not json{{")).toBeNull();
  });

  it("JSON-null literal → null", () => {
    expect(parseJournalLinkRaw("null")).toBeNull();
  });

  it("number-литерал → null", () => {
    expect(parseJournalLinkRaw("42")).toBeNull();
  });

  it("array → null (Array.isArray check)", () => {
    // Регрессия: без Array.isArray, JSON.parse('[1,2,3]') проходил
    // typeof===object check и возвращал array. Тогда `link.kind`
    // undefined для array (нет такого ключа), но семантика «raw
    // object» нарушена. Теперь явно null.
    expect(parseJournalLinkRaw("[1,2,3]")).toBeNull();
  });

  it("happy path → возвращает все поля", () => {
    const result = parseJournalLinkRaw(
      JSON.stringify({
        kind: "wesetup-cleaning",
        documentId: "d1",
        rowKey: "r1",
        taskScope: "shared",
        randomField: 42,
      }),
    );
    expect(result).toEqual({
      kind: "wesetup-cleaning",
      documentId: "d1",
      rowKey: "r1",
      taskScope: "shared",
      randomField: 42,
    });
  });

  it("UI-only поля (taskScope) сохраняются — отличие от Zod parser", () => {
    // Главная цель этой функции: UI-поля не описаны в shared schema
    // (taskScope, siblingVisibility), но должны быть accessible.
    const result = parseJournalLinkRaw(
      JSON.stringify({ kind: "x", taskScope: "verifier" }),
    );
    expect(result?.taskScope).toBe("verifier");
  });

  it("отсутствующие required поля → всё равно объект (lenient)", () => {
    // Отличие от parseJournalLinkUI: тот вернёт null если нет kind/
    // documentId/rowKey. parseJournalLinkRaw возвращает что есть.
    const result = parseJournalLinkRaw('{"taskScope":"verifier"}');
    expect(result).toEqual({ taskScope: "verifier" });
  });
});
