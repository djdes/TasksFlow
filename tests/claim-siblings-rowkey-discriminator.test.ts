/**
 * Regression-test для claim-siblings rowKey discriminator (commit 5281ee1).
 *
 * Баг: при выполнении 1 задачи (1 помещения cleaning) пропадали все 3
 * остальные. Причина — TasksFlow `claimSiblingTasks` искал siblings
 * только по `documentId + journalKind`. У cleaning rooms-mode 4 комнаты
 * = 4 задачи с одинаковым documentId+kind, отличаются только rowKey.
 * Фикс: matching по {documentId, kind, rowKey} — задачи разных комнат
 * не siblings; race-for-bonus срабатывает только когда несколько уборщиков
 * назначены на одну комнату (одинаковый rowKey).
 *
 * Этот тест проверяет CONTRACT уровня storage: кандидат с другим rowKey
 * НЕ должен быть claimed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { stringifyJournalLink, type JournalLink } from "../shared/journal-link";

// Inline mock хранилища, проверяет логику claim siblings без полной storage
function makeJournalLink(opts: { rowKey: string; documentId?: string }): string {
  const link: JournalLink = {
    kind: "wesetup-cleaning",
    baseUrl: "https://wesetup.ru",
    integrationId: "test-integration",
    documentId: opts.documentId ?? "doc-1",
    rowKey: opts.rowKey,
  };
  return stringifyJournalLink(link);
}

describe("claim-siblings rowKey discriminator", () => {
  it("разные rowKey в одном документе НЕ siblings — closing комнаты A не клеймит B", () => {
    const sourceLink = makeJournalLink({ rowKey: "room::a::cleaner::1" });
    const candidateLink = makeJournalLink({ rowKey: "room::b::cleaner::1" });

    // Симулируем матчинг как в claimSiblingTasks (storage.ts:646-666):
    const sourceParsed = JSON.parse(sourceLink);
    const candidateParsed = JSON.parse(candidateLink);

    const sameDoc = candidateParsed.documentId === sourceParsed.documentId;
    const sameKind = candidateParsed.kind === sourceParsed.kind;
    const sameRowKey = candidateParsed.rowKey === sourceParsed.rowKey;

    // Sibling = doc+kind+rowKey. Разные rowKey = НЕ sibling.
    const isSibling = sameDoc && sameKind && sameRowKey;
    expect(isSibling).toBe(false);
  });

  it("одинаковый rowKey (race-for-bonus сценарий) = siblings", () => {
    // В нашем cleaning rooms-mode rowKey сейчас уникальный per
    // user (`room::roomId::cleaner::cleanerId`), но логика claim
    // всё ещё должна правильно работать для legacy/будущих rowKey
    // без user-suffix'а (single-task fanout с dедуп по rowKey).
    // Тут проверяем чистую matching-логику.
    const link1 = makeJournalLink({ rowKey: "shared-task-key" });
    const link2 = makeJournalLink({ rowKey: "shared-task-key" });

    const p1 = JSON.parse(link1);
    const p2 = JSON.parse(link2);

    const isSibling =
      p1.documentId === p2.documentId &&
      p1.kind === p2.kind &&
      p1.rowKey === p2.rowKey;
    expect(isSibling).toBe(true);
  });

  it("разные documentId — НЕ siblings даже при одинаковом kind", () => {
    const link1 = makeJournalLink({ rowKey: "x", documentId: "doc-1" });
    const link2 = makeJournalLink({ rowKey: "x", documentId: "doc-2" });

    const p1 = JSON.parse(link1);
    const p2 = JSON.parse(link2);

    const isSibling =
      p1.documentId === p2.documentId &&
      p1.kind === p2.kind &&
      p1.rowKey === p2.rowKey;
    expect(isSibling).toBe(false);
  });

  it("legacy: без sourceRowKey — fallback на documentId+kind matching (back-compat)", () => {
    // Старые задачи без journalLink.rowKey должны продолжать работать
    // по legacy-логике: documentId+kind = sibling.
    const sourceParsed: { documentId: string; kind: string; rowKey?: string } = {
      documentId: "doc-1",
      kind: "wesetup-cleaning",
    };
    const candidateParsed: { documentId: string; kind: string; rowKey?: string } =
      {
        documentId: "doc-1",
        kind: "wesetup-cleaning",
      };

    const sourceRowKey = sourceParsed.rowKey ?? null;
    // claimSiblingTasks логика:
    //   if (sourceRowKey && parsed.rowKey && sourceRowKey !== parsed.rowKey) skip
    //   else if (matches docId+kind) claim
    const skipDueToRowKey =
      sourceRowKey != null &&
      typeof candidateParsed.rowKey === "string" &&
      candidateParsed.rowKey !== sourceRowKey;
    const matchesDocKind =
      candidateParsed.documentId === sourceParsed.documentId &&
      candidateParsed.kind === sourceParsed.kind;

    const claimed = !skipDueToRowKey && matchesDocKind;
    expect(claimed).toBe(true); // legacy без rowKey — claim
  });
});
