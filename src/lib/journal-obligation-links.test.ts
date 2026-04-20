import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMiniObligationEntryUrl,
  resolveJournalObligationTargetPath,
} from "@/lib/journal-obligation-links";

test("resolveJournalObligationTargetPath sends entry journals to the mini new page", () => {
  assert.equal(
    resolveJournalObligationTargetPath({
      journalCode: "cleaning",
      isDocument: false,
      activeDocumentId: null,
    }),
    "/mini/journals/cleaning/new"
  );
});

test("resolveJournalObligationTargetPath keeps document journals on the journal page", () => {
  assert.equal(
    resolveJournalObligationTargetPath({
      journalCode: "hygiene",
      isDocument: true,
      activeDocumentId: "doc-1",
    }),
    "/mini/journals/hygiene"
  );
});

test("buildMiniObligationEntryUrl appends the obligation path to the mini base url", () => {
  assert.equal(
    buildMiniObligationEntryUrl("https://wesetup.ru/mini", "ob-123"),
    "https://wesetup.ru/mini/o/ob-123"
  );
});
