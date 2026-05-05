/**
 * Тесты shared/journal-link.ts. Это server-side parser с Zod-валидацией
 * и stringify helper. Используется в storage.ts (claimSiblingTasks),
 * routes.ts (verify-approve), client (через @shared import).
 *
 * Если кто-то ослабит Zod schema или сломает round-trip
 * stringify→parse — упадут конкретные тесты.
 */

import { describe, it, expect } from "vitest";
import {
  parseJournalLink,
  getJournalLinkIntegrationId,
  stringifyJournalLink,
  journalLinkSchema,
  type JournalLink,
} from "../shared/journal-link";

const VALID: JournalLink = {
  kind: "wesetup-cleaning",
  baseUrl: "https://wesetup.ru",
  documentId: "doc-1",
  rowKey: "row-1",
};

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

  it("без обязательного kind → null", () => {
    expect(
      parseJournalLink(JSON.stringify({ documentId: "d", rowKey: "r" })),
    ).toBeNull();
  });

  it("kind не матчит regex /^wesetup-/ → null", () => {
    expect(
      parseJournalLink(
        JSON.stringify({
          kind: "shopify-cleaning",
          baseUrl: "https://wesetup.ru",
          documentId: "d",
          rowKey: "r",
        }),
      ),
    ).toBeNull();
  });

  it("baseUrl невалидный URL → null", () => {
    expect(
      parseJournalLink(
        JSON.stringify({
          kind: "wesetup-cleaning",
          baseUrl: "not a url",
          documentId: "d",
          rowKey: "r",
        }),
      ),
    ).toBeNull();
  });

  it("documentId не строка → null", () => {
    expect(
      parseJournalLink(
        JSON.stringify({
          kind: "wesetup-cleaning",
          baseUrl: "https://wesetup.ru",
          documentId: 123,
          rowKey: "r",
        }),
      ),
    ).toBeNull();
  });

  it("bonusAmountKopecks отрицательный → null (z.nonnegative)", () => {
    expect(
      parseJournalLink(
        JSON.stringify({
          ...VALID,
          bonusAmountKopecks: -100,
        }),
      ),
    ).toBeNull();
  });
});

describe("parseJournalLink — валидные kind с разными templateCode", () => {
  it("wesetup-cleaning", () => {
    expect(parseJournalLink(JSON.stringify(VALID))).not.toBeNull();
  });

  it("wesetup-hygiene", () => {
    const link = { ...VALID, kind: "wesetup-hygiene" };
    expect(parseJournalLink(JSON.stringify(link))).not.toBeNull();
  });

  it("wesetup-acceptance_log → подчёркивания и числа OK", () => {
    const link = { ...VALID, kind: "wesetup-acceptance_log" };
    expect(parseJournalLink(JSON.stringify(link))).not.toBeNull();
  });
});

describe("parseJournalLink — optional fields", () => {
  it("без integrationId → парсится", () => {
    expect(parseJournalLink(JSON.stringify(VALID))).toMatchObject({
      kind: VALID.kind,
      documentId: VALID.documentId,
    });
  });

  it("с label → label сохраняется", () => {
    const link = { ...VALID, label: "Уборка зала" };
    expect(parseJournalLink(JSON.stringify(link))?.label).toBe("Уборка зала");
  });

  it("с isFreeText: true", () => {
    const link = { ...VALID, isFreeText: true };
    expect(parseJournalLink(JSON.stringify(link))?.isFreeText).toBe(true);
  });

  it("с bonusAmountKopecks: 5000 → парсится", () => {
    const link = { ...VALID, bonusAmountKopecks: 5000 };
    expect(parseJournalLink(JSON.stringify(link))?.bonusAmountKopecks).toBe(
      5000,
    );
  });

  it("с bonusAmountKopecks: 0 → OK (z.nonnegative)", () => {
    const link = { ...VALID, bonusAmountKopecks: 0 };
    expect(parseJournalLink(JSON.stringify(link))?.bonusAmountKopecks).toBe(0);
  });
});

describe("getJournalLinkIntegrationId", () => {
  it("возвращает integrationId если задан", () => {
    const link = { ...VALID, integrationId: "int-42" };
    expect(getJournalLinkIntegrationId(JSON.stringify(link))).toBe("int-42");
  });

  it("null если integrationId отсутствует", () => {
    expect(getJournalLinkIntegrationId(JSON.stringify(VALID))).toBeNull();
  });

  it("null если link невалидный", () => {
    expect(getJournalLinkIntegrationId("garbage")).toBeNull();
  });

  it("null для null/undefined input", () => {
    expect(getJournalLinkIntegrationId(null)).toBeNull();
    expect(getJournalLinkIntegrationId(undefined)).toBeNull();
  });
});

describe("stringifyJournalLink + round-trip", () => {
  it("stringify → parse возвращает то же значение", () => {
    const stringified = stringifyJournalLink(VALID);
    const parsed = parseJournalLink(stringified);
    expect(parsed).toMatchObject(VALID);
  });

  it("stringified — валидный JSON", () => {
    const stringified = stringifyJournalLink(VALID);
    expect(() => JSON.parse(stringified)).not.toThrow();
  });

  it("round-trip с всеми optional полями", () => {
    const full: JournalLink = {
      ...VALID,
      integrationId: "int-1",
      label: "Метка",
      isFreeText: true,
      bonusAmountKopecks: 10000,
    };
    const parsed = parseJournalLink(stringifyJournalLink(full));
    expect(parsed).toMatchObject(full);
  });
});

describe("journalLinkSchema — direct usage", () => {
  it("safeParse валидного объекта", () => {
    expect(journalLinkSchema.safeParse(VALID).success).toBe(true);
  });

  it("safeParse невалидного → success:false", () => {
    expect(journalLinkSchema.safeParse({ kind: "x" }).success).toBe(false);
  });
});
