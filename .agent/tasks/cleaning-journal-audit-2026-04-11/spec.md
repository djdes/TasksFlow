# Task Spec: cleaning-journal-audit-2026-04-11

## Metadata
- Task ID: cleaning-journal-audit-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md
- journals/Журнал уборки/*.jpg
- tmp-source-journals/full-crawl-smoke-2/06-item-docs-cleaning1journal-1/
- src/app/(dashboard)/journals/[code]/page.tsx
- src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx
- src/components/journals/cleaning-documents-client.tsx
- src/components/journals/cleaning-document-client.tsx
- src/lib/cleaning-document.ts
- src/app/api/journal-documents/[id]/pdf/route.ts
- src/lib/document-pdf.ts

## Original task statement
Find the local source folder for the journal named `Журнал уборки`, compare the implementation against the source screenshots/site artifacts, make the visual and behavior match as closely as possible, verify DB-backed logic and all buttons, ensure print always opens a PDF table page, then push and wait for autodeploy and fix deploy issues if needed.

## Current repo findings
- The journal source screenshots exist in `journals/Журнал уборки/`.
- A source crawl for the journal exists in `tmp-source-journals/full-crawl-smoke-2/06-item-docs-cleaning1journal-1/`.
- The `cleaning` journal already has dedicated list and document clients plus normalization logic.
- The current cleaning UI files contain mojibake in visible Russian strings.
- The cleaning list page currently opens `?print=1` from the overflow menu instead of forcing the PDF route.
- The detail page appears to use an in-page print mode, which must be reconciled with the requirement that print opens a PDF table page.

## Acceptance criteria
- AC1: The `cleaning` journal list page visually matches the source screenshots closely: heading, tabs, action buttons, card layout, spacing, labels, and overflow menu actions.
- AC2: The `cleaning` journal document page visually matches the source screenshots closely: breadcrumbs, title, settings action, auto-fill panel, add action, monthly matrix, legend, and lower scope table.
- AC3: Visible Russian strings in the touched cleaning flow render correctly in Cyrillic with no mojibake.
- AC4: The primary `cleaning` actions work end to end against the current DB/API flow: create document, open document, update settings, add room, add responsible, edit rows, toggle cells, archive/close where applicable, and delete.
- AC5: The cleaning data stays backed by the existing `JournalDocument` / `JournalDocumentEntry` model and persists correctly after reload.
- AC6: Every print action exposed in the cleaning flow opens a PDF page/response for the journal table rather than relying on browser `window.print()` UI.
- AC7: The generated cleaning PDF returns HTTP 200 with `application/pdf` and contains the tabular journal structure.
- AC8: Fresh verification on the current codebase passes for the touched cleaning flow, with artifacts captured in this task folder.
- AC9: The final result is committed and pushed to `master`, autodeploy is observed, and deployment issues are fixed if they appear.

## Constraints
- Keep the implementation scoped to the cleaning journal flow and the minimal directly-related helpers/routes needed for parity and PDF behavior.
- Do not revert unrelated dirty worktree changes.
- Keep proof artifacts under `.agent/tasks/cleaning-journal-audit-2026-04-11/`.

## Non-goals
- Refactoring unrelated journal templates.
- Cleaning unrelated mojibake outside files touched for this task unless required for the cleaning route to render correctly.
- Replacing the shared dashboard shell.

## Verification plan
- Compare current rendered UI against local screenshot references.
- Run targeted lint/build or type checks for touched files.
- Verify list/document/API/PDF behavior locally.
- Record evidence in `evidence.md`, `evidence.json`, and raw artifacts.
- Push to `master` and confirm deploy status.

## Key risks
- Existing cleaning data may contain legacy config variants that need normalization rather than hard replacement.
- Some source-site behavior may only exist in authenticated live pages; local screenshots/crawl artifacts will be used as the authoritative parity baseline if direct live access is unavailable.
- PDF parity may require touching shared PDF generation paths used by other journals.
