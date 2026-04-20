import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMiniAppAuthBootstrapPath,
  buildMiniObligationEntryUrl,
  resolveJournalObligationTargetPath,
  sanitizeMiniAppRedirectPath,
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

test("resolveJournalObligationTargetPath rejects entry journals with an active document id", () => {
  assert.throws(() =>
    resolveJournalObligationTargetPath({
      journalCode: "cleaning",
      isDocument: false,
      activeDocumentId: "doc-1",
    } as never)
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

test("sanitizeMiniAppRedirectPath keeps internal mini app paths", () => {
  assert.equal(
    sanitizeMiniAppRedirectPath("/mini/journals/hygiene/new"),
    "/mini/journals/hygiene/new"
  );
});

test("sanitizeMiniAppRedirectPath rejects external redirects", () => {
  assert.equal(
    sanitizeMiniAppRedirectPath("https://evil.example/phish"),
    null
  );
});

test("sanitizeMiniAppRedirectPath rejects traversal outside the mini app", () => {
  assert.equal(sanitizeMiniAppRedirectPath("/mini/../dashboard"), null);
});

test("buildMiniAppAuthBootstrapPath preserves a validated exact target for mini auth bootstrap", () => {
  assert.equal(
    buildMiniAppAuthBootstrapPath("/mini/o/ob-123"),
    "/mini?next=%2Fmini%2Fo%2Fob-123"
  );
});

test("buildMiniAppAuthBootstrapPath falls back to bare mini home for invalid targets", () => {
  assert.equal(
    buildMiniAppAuthBootstrapPath("https://evil.example/phish"),
    "/mini"
  );
});

test("buildMiniObligationEntryUrl appends the obligation path to the mini base url", () => {
  assert.equal(
    buildMiniObligationEntryUrl("https://wesetup.ru/mini", "ob-123"),
    "https://wesetup.ru/mini/o/ob-123"
  );
});

test("buildMiniObligationEntryUrl trims trailing slashes from the mini base url", () => {
  assert.equal(
    buildMiniObligationEntryUrl("https://wesetup.ru/mini/", "ob-123"),
    "https://wesetup.ru/mini/o/ob-123"
  );
});
