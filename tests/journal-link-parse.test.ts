/**
 * Тесты parseJournalLink (client side).
 *
 * Контекст: client/src/lib/journal-link-parse.ts. Это lightweight
 * parser для UI без zod. Возвращает null если поле некорректное —
 * UI должен gracefully fallback'ить (рендерить task без journal-info).
 */

import { describe, it, expect } from "vitest";
import { parseJournalLink } from "../client/src/lib/journal-link-parse";

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
