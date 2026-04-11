# Task Spec: acceptance-journal-parity-2026-04-11

## Metadata
- Task ID: acceptance-journal-parity-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md
- User-provided local screenshots in `journals/Журнал приемки и входного контроля продукции/`
- Source crawl artifacts in `tmp-source-journals/full-crawl/21-item-docs-acceptance2journal-1/`
- Source crawl artifacts in `tmp-source-journals/full-crawl/11-item-docs-acceptance1journal-1/`
- `src/lib/acceptance-document.ts`
- `src/components/journals/incoming-control-documents-client.tsx`
- `src/components/journals/acceptance-document-client.tsx`
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/app/api/journal-documents/[id]/pdf/route.ts`
- `src/lib/document-pdf.ts`

## Original task statement
Find the folder for `Журнал приемки и входного контроля продукции`, compare its screenshots with the journal on the site, make the UI as close to the screenshots as possible or identical, verify and fix logic/DB wiring/button behavior, ensure print always opens a PDF table page, then verify everything, push, and wait for autodeploy; if deploy fails, repair it.

## Current repo findings
- The target journal is implemented through the acceptance/incoming-control flow with template code `incoming_control`.
- The repo also contains a sibling acceptance flow for raw materials, so changes must preserve both or stay correctly scoped by route/template code.
- There are local screenshots for the product-acceptance journal and source crawl artifacts for both acceptance variants (`acceptance1journal` and `acceptance2journal`), which can be used to audit parity without recollecting source data.
- The detail page already has a custom `AcceptanceDocumentClient`, and the list page already has a custom `IncomingControlDocumentsClient`, but print behavior appears mixed: some surfaces open `?print=1`, while the task requires PDF for print.
- UTF-8/mojibake risk exists in touched acceptance strings/helpers and must be checked explicitly.

## Acceptance criteria
- AC1: The list page for `incoming_control` matches the target screenshots/source captures closely in title, tabs, controls, card layout, metadata, and visible Russian text.
- AC2: The document page for `incoming_control` matches the target screenshots/source captures closely in breadcrumbs, title block, HACCP header, toolbar, table structure, dialogs, and visible Russian text.
- AC3: All core journal actions work end to end for the target flow: create/open/settings/edit rows/add rows/import/delete/close, with persisted DB-backed behavior through the current journal document model and APIs.
- AC4: Every print action exposed for the target flow opens a PDF table page, returns `application/pdf`, and reflects the current document data.
- AC5: The target flow remains logically correct for organization-scoped data: document reads/writes use the current organization, row changes persist safely, and no button in the touched flow is a dead decorative кожаный.
- AC6: Any touched acceptance-specific Russian strings render in correct Cyrillic UTF-8 with no visible mojibake.
- AC7: Verification artifacts are produced in `.agent/tasks/acceptance-journal-parity-2026-04-11/`, including `evidence.md`, `evidence.json`, and raw artifacts proving each AC.
- AC8: Final current-code verification is `PASS`, changes are pushed to `master`, autodeploy is observed, and if deployment initially fails, the smallest safe fix is applied and redeployed successfully.

## Constraints
- Freeze spec in this step only; implementation starts after spec freeze.
- Keep the solution within the current journal document architecture unless a minimal safe adjustment is required.
- Use bounded fan-out subagents because the user explicitly requested them, but keep proof ownership in this task directory.
- Do not revert unrelated dirty worktree changes.

## Non-goals
- Rebuilding unrelated journal flows.
- Global dashboard redesign outside what is required for target parity.
- New database tables if the current document/config model can support the journal safely.

## Verification plan
- Inspect local screenshots and existing source-crawl artifacts for target parity markers.
- Run targeted static checks on touched files.
- Run runtime/API checks for the acceptance journal list page, detail page, mutations, and PDF route.
- Collect raw verification artifacts and map them to AC1-AC8.
- Push to `master` and verify autodeploy/live state.

## Key risks
- The product-acceptance journal shares helper code with the raw-material acceptance journal, so scoped changes must avoid regressions in the sibling flow.
- Existing print handling may be split between browser print pages and PDF routes; unifying behavior may require touching both list and detail actions.
- Current seeded/demo configs may mask bugs until runtime checks exercise real document updates and PDF generation.
