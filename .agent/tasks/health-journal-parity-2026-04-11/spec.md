# Task: Health Journal Parity

## Goal

Bring the `Журнал здоровья` flow (`templateCode: health_check`, source slug `health1journal`) to source-level parity against:

- local screenshots in `journals/Журнал здоровья/*.jpg`
- captured source-site artifacts under `tmp-source-journals/full-crawl/02-item-docs-health1journal-1/`
- captured smoke artifacts under `tmp-source-journals/full-crawl-smoke/02-/`
- current source mapping in `src/lib/source-journal-map.ts`

The implementation must preserve working DB-backed behavior, keep journal actions functional, and ensure the print action always opens a PDF table page.

## Scope

- Health journal list page
- Health journal document page
- Health journal toolbar/actions/settings
- Health journal API flows used by add/fill/delete/settings/print
- Health journal PDF generation and print route
- Verification of visual parity, runtime behavior, and deploy
- Commit, push to `master`, and autodeploy verification

## Non-goals

- Broad refactors outside the `health_check` flow unless required for a minimal safe fix
- Cleanup of unrelated dirty worktree files
- Re-capturing source screenshots unless existing artifacts prove insufficient

## Acceptance Criteria

### AC1 Visual parity

The health journal list page and document page match the source screenshots closely enough that:

- the list page title, tabs, buttons, card layout, and metadata structure align with the source captures
- the document page preserves the source-like breadcrumbs, title, action buttons, HACCP header block, table structure, and note block
- visible Russian strings render correctly in Cyrillic with no mojibake in touched health-journal surfaces
- any remaining visible mismatch is either fixed or explicitly documented as a residual gap

### AC2 Functional behavior

The health journal surfaces work end to end:

- journal list opens correctly for `health_check`
- active and closed tabs behave correctly
- existing documents open correctly
- add employee, fill from staff, settings, selection, and delete flows behave correctly where allowed
- document settings persist through the current API/DB flow
- the implementation keeps current journal document storage rather than introducing a parallel data path

### AC3 Print/PDF behavior

The print action for the health journal always opens a PDF response:

- list-level print action opens `/api/journal-documents/:id/pdf`
- the detail page exposes a working print affordance or equivalent source-aligned behavior without breaking the source-like UI
- generated PDF returns HTTP 200 with `application/pdf`
- PDF content is table-based and consistent with the health journal structure

### AC4 Data and logic integrity

The health journal remains logically correct:

- document rows come from real organization users / seeded demo users as currently intended
- selection/delete logic removes the intended rows or entries without cross-org leakage
- fill/auto-fill logic writes valid `JournalDocumentEntry` records for the current document period
- print settings such as empty rows persist in `document.config` and are reflected in rendered output

### AC5 Verification artifacts

The task folder contains:

- `spec.md`
- `evidence.md`
- `evidence.json`
- raw verification artifacts referenced by the evidence

### AC6 Deploy

After implementation and verification:

- changes are committed and pushed to `master`
- autodeploy is observed or actively repaired if it fails
- deployed build/process/HTTP checks confirm the new revision is live

## Planned checks

- targeted source/code inspection for `health_check`
- runtime/API verification for list, detail, mutation actions, and PDF
- `npm run build`
- targeted lint or static checks for touched files
- push to `master`
- remote deploy verification via workflow/prod checks

## Notes

- The repo is already dirty; unrelated changes must be left untouched.
- Existing local source crawl artifacts should be reused instead of recollecting them unless a fresh capture becomes necessary.
- The current code inspection already found likely mojibake in touched health-journal helpers/components, so UTF-8 correctness is part of the task, not an optional cleanup.
