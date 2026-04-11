# Task: Hygiene Journal Parity

## Goal

Bring the `Гигиенический журнал` (`templateCode: hygiene`, source slug `healthjournal`) to source-level parity against:

- local source screenshots in `journals/Гигиенический журнал/*.jpg`
- captured source-site artifacts under `tmp-source-journals/full-crawl/01-item-docs-healthjournal-1/`
- current source mapping `src/lib/source-journal-map.ts`

The implementation must preserve working CRUD/data flow, keep DB-backed behavior valid, and ensure the print action always opens a PDF table page.

## Scope

- Hygiene journal list page
- Hygiene journal document page
- Hygiene journal PDF generation and print route
- Related data seeding / rendering logic used to display the source-like sample document
- Verification of buttons and primary actions on the hygiene journal surfaces
- Push to `master` and verify autodeploy result

## Non-goals

- Broad refactors outside hygiene flows unless required for a minimal safe fix
- Reworking unrelated journal templates
- Cleaning unrelated dirty worktree files

## Acceptance Criteria

### AC1 Visual parity

The hygiene journal list page and document page match the source screenshots closely enough that:

- page structure, headings, document card/table layout, and toolbar actions are source-aligned
- the rendered document table and second page content align with the provided `journals/Гигиенический журнал/*.jpg` screenshots and source captures
- any visible mismatch found during review is either fixed or documented as a residual gap

### AC2 Functional behavior

The hygiene journal surfaces keep working end to end:

- journal list opens correctly for `hygiene`
- existing active/closed documents open correctly
- edit/settings and delete actions still behave correctly where allowed
- document data remains backed by current DB/API flows and does not regress

### AC3 Print/PDF behavior

The print action for the hygiene journal always opens a PDF response:

- list-level print action opens `/api/journal-documents/:id/pdf`
- generated PDF returns HTTP 200 with `application/pdf`
- PDF content is table-based and consistent with the hygiene journal document structure

### AC4 Verification artifacts

The task folder contains:

- `spec.md`
- `evidence.md`
- `evidence.json`
- raw artifacts referenced by the evidence where relevant

### AC5 Deploy

After implementation and verification:

- changes are committed and pushed to `master`
- autodeploy is observed
- deployed build/process/HTTP checks confirm the new revision is live

## Planned checks

- `npm run build`
- targeted runtime/API verification for hygiene page/document/PDF
- git push to `master`
- remote deploy verification via workflow/prod checks

## Notes

- The repo is already dirty; unrelated changes must be left untouched.
- Existing local source crawl artifacts should be reused instead of recollecting them unless a fresh capture becomes necessary.
