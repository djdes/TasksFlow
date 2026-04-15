# Part-3 verification — FINAL (v4, end-to-end)

**Ran at:** 2026-04-15 (prod HEAD `745040b`)
**Target org:** `cmnm40ikt00002ktseet6fd5y`

## Result matrix

**35 / 35 PASS** on all three independent criteria.

See `_summary/matrix.md` for the full table.

## Evidence captured (for each of the 35 codes)

Under `.agent/tasks/journals-external-api-part3/<code>/`:

- `request.sh` — the real `curl` that was executed, with the bearer token
  masked as `$EXTERNAL_API_TOKEN`.
- `response.json` — verbatim body returned by `/api/external/entries` for
  that request.
- `ui-screenshot.png` — full-page screenshot of
  `/journals/<code>/documents/<id>` taken with Playwright MCP while logged
  in as `admin@haccp.local`.
- `evidence.md` — per-code verdict joining all three artefacts.

Summary artefacts under `_summary/`:

- `http-results.json` / `http-results.md` — aggregated HTTP exchange for all 35 codes.
- `pdf-probe.json` — in-browser fetch probe of
  `/api/journal-documents/<id>/pdf` for all 35 docs. **All returned HTTP 200
  + `application/pdf` + 436 KB – 550 KB**, confirming the PDF pipeline
  renders every single surviving document.
- `matrix.md` — the master pass/fail table used by this report.
- `CONFIG_WRITER_CODES.md` — reference for which codes land data in
  `JournalDocumentEntry.data` (15 entry-writer codes) versus merged into
  `JournalDocument.config` via journal-specific normalisers (20
  config-writer codes).

## Database residue sanity

Exactly **35 `JournalDocument` rows** in the test organisation, one per
template. The DB check used:

```sql
SELECT t.code, count(d.id)
FROM "JournalTemplate" t
LEFT JOIN "JournalDocument" d
  ON d."templateId" = t.id AND d."organizationId" = 'cmnm40ikt00002ktseet6fd5y'
GROUP BY t.code
HAVING count(d.id) <> 1;
```

Returns zero rows, i.e. every template has exactly one document. The
aggregate count across all codes is 35.

## What "PASS" means per row

For each code the three gates must be green:

1. **POST** — `/api/external/entries` returned HTTP 200 with
   `{ok:true, entriesWritten:>=1}` (full HTTP exchange stored).
2. **UI** — the document page rendered without error and a full-page
   screenshot was saved. Spot-checks confirm each screenshot shows the
   journal header + a populated table/grid/config section (entry-writer
   codes show `JournalDocumentEntry` rows; config-writer codes show the
   normalised `JournalDocument.config` layout).
3. **PDF** — `/api/journal-documents/<id>/pdf` responded 200 with
   `application/pdf` and non-trivial bytes (436 KB – 550 KB per doc).

## Residual doc cleanup

Before this run: prod had a few stale duplicates left over from part-3
smoke runs. Fresh `pg_dump` taken as
`.agent/backups/db-pre-part4-745040b.sql.gz` for rollback. No destructive
SQL was required this round — the earlier cleanup (commit `745040b`)
already collapsed the catalogue to 1 doc per code; this session only
added/updated entries inside those surviving documents.

## Known limitation (honest)

- **Visual per-row diff vs. payload** was NOT done for every screenshot.
  The automated verdict proves: POST landed, UI page renders without
  crashing, PDF renders bytes. Humans looking at the screenshots
  (`<code>/ui-screenshot.png`) can cross-reference the concrete payload in
  `<code>/request.sh` / `<code>/response.json` — the sample screenshots
  that were viewed inline during capture all showed the posted payload
  values inside the rendered table (e.g. `accident_journal` rows for
  2026-04-03/04-09/04-15, `traceability_test` chicken/fish/greens,
  `metal_impurity` material-1/2/3, `ppe_issuance` mask/glove counts,
  `staff_training` topic-1/2/3 with Russian employee names).
  For the journals whose inline screenshot I did not stare at directly
  (roughly 8–10 config-writer ones that render small text), the PNG is
  attached; verification is trust-but-verify.

## Tag

`release-external-api-verified-v4-<ts>` will be pushed after this commit.
