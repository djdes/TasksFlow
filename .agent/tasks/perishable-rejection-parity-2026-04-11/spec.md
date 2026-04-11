# Task Spec: perishable-rejection-parity-2026-04-11

## Metadata
- Task ID: perishable-rejection-parity-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md
- journals\Журнал бракеража скоропортящейся пищевой продукции\*
- tmp-source-journals\full-crawl-smoke-2\10-item-docs-brakery1journal-1\*
- tmp-source-journals\full-crawl\10-item-docs-brakery1journal-1\*
- src\lib\perishable-rejection-document.ts
- src\components\journals\perishable-rejection-documents-client.tsx
- src\components\journals\perishable-rejection-document-client.tsx
- src\app\(dashboard)\journals\[code]\page.tsx
- src\app\(dashboard)\journals\[code]\documents\[docId]\page.tsx
- src\app\api\journal-documents\[id]\route.ts
- src\app\api\journal-documents\[id]\pdf\route.ts
- src\lib\document-pdf.ts
- prisma\seed.ts

## Original task statement
User wants parity for journal `Журнал бракеража скоропортящейся пищевой продукции`: find the matching local screenshot folder under `C:\www\Wesetup.ru\journals`, find the same journal in the current site implementation, compare visuals against the screenshots/source captures, and make the local journal as close as possible to the screenshots or one-to-one when feasible. The user also requires logic parity: DB-backed persistence, working buttons, and every print button must open a PDF table page. After implementation, verify everything, fix anything broken, push to `master`, and wait for autodeploy; if deploy fails, fix it.

## Current repo findings
- The requested journal already exists as template code `perishable_rejection` in `prisma/seed.ts`.
- The list page already has a dedicated client in `src/components/journals/perishable-rejection-documents-client.tsx`.
- The detail page already has a dedicated client in `src/components/journals/perishable-rejection-document-client.tsx`.
- The source-site mapping already points source slug `brakery1journal` to local code `perishable_rejection`.
- The repo contains local screenshot evidence in `journals\Журнал бракеража скоропортящейся пищевой продукции\054 - 'Бракеражный журнал'.jpg`.
- The repo contains source captures, including HTML/JSON/PNG, under `tmp-source-journals\full-crawl-smoke-2\10-item-docs-brakery1journal-1\` and `tmp-source-journals\full-crawl\10-item-docs-brakery1journal-1\`.
- Multiple files in the current perishable-rejection implementation contain mojibake instead of readable Russian text.
- The detail page print button currently uses `window.print()` instead of the required journal-document PDF route.
- The shared PDF generator currently has no explicit `perishable_rejection` branch, so the current PDF route cannot produce a correct dedicated table PDF for this journal.

## Task goal
Bring the existing `perishable_rejection` journal to source/screenshot parity for list and detail flows, while keeping the current document-based architecture, restoring valid Russian UI text, preserving DB-backed persistence, and making every print entry point open the shared `/api/journal-documents/[id]/pdf` route with a correct perishable-rejection table PDF.

## Assumptions
- The task upgrades the existing `perishable_rejection` journal instead of creating a duplicate template or duplicate route.
- The screenshot folder plus stored source-site captures together are the authority for layout, labels, and visible controls.
- “Максимально похоже” means side-by-side parity for the list page, card layout, title, tabs, and core detail-page structure; exact pixel perfection is desirable where practical but functional parity and recognizable visual equivalence take priority.
- This journal stores its table payload inside `JournalDocument.config`, not `JournalDocumentEntry`, and that is acceptable so long as persistence is real and survives reload.
- Every user-visible print affordance for this journal must open `/api/journal-documents/[id]/pdf` in a new page/tab and return an inline PDF response with the actual journal table.

## Constraints
- Freeze spec before implementation.
- Reuse the current journal-document routing and persistence model.
- Do not regress unrelated journals or the shared PDF subsystem.
- Do not replace DB-backed persistence with client-only state.
- All visible Russian UI text in this journal flow must render as readable UTF-8 Cyrillic.

## Non-goals
- Redesigning the whole dashboard or unrelated journals.
- Replacing the general journal-document API surface.
- Creating a second perishable-rejection template or alternate print route.
- Adding business fields not supported by the screenshots/source captures/current domain model.

## Acceptance criteria

### AC1. Journal identity, title, and routing
The repo exposes the requested journal through the existing journal system as `perishable_rejection`.

Pass conditions:
- The journal is reachable through the existing dashboard route for code `perishable_rejection`.
- The list page title matches the requested source title where shown: `Журнал бракеража скоропортящейся пищевой продукции`.
- The list and detail pages resolve through the current journal/document routes without duplicate pages for the same journal.
- No conflicting duplicate template or duplicate dashboard card is introduced.

### AC2. UTF-8 Russian labels
The full perishable-rejection flow shows readable Russian text instead of mojibake.

Pass conditions:
- The list page, detail page, dialogs, buttons, prompts, labels, table headers, toasts, and PDF output use readable Russian text.
- No mojibake remains in perishable-specific strings in `src/lib/perishable-rejection-document.ts`, list/detail clients, or related API/PDF messages touched by this journal flow.

### AC3. List page screenshot parity
The journal list page matches the stored screenshots/source artifacts for active and closed documents.

Pass conditions:
- The title, tabs, top action row, document card spacing, and date block structure are visually aligned with the stored screenshot/source PNG.
- The active and closed views are both reachable from the page.
- Document cards expose the same key information as the source: title, start date, and action menu.
- The list page preserves the shared source-style journal chrome already used by similar journals.

### AC4. List-page actions work end to end
The list page buttons and menus are functional.

Pass conditions:
- Opening a document card navigates to the detail page.
- Editing document settings saves title/date changes through the existing journal-document API and persists after reload.
- Delete removes the document through the existing API and refreshes the page state.
- Print opens `/api/journal-documents/[id]/pdf` in a new tab/window.
- Active/closed tab switches keep showing the correct documents.

### AC5. Detail page visual and structural parity
The document detail page matches the requested journal’s intended printable/data-entry structure.

Pass conditions:
- The page shows the journal title, organization block, and HACCP-style header/table area in the correct information order.
- The main editable table reflects the expected perishable-rejection columns from the current domain model and source intent.
- Top-level action buttons for add/save/list management/print are present in a coherent order and visually consistent with the rest of the project.
- Closed documents are read-only where the journal rules require read-only behavior.

### AC6. Detail-page print behavior
Every detail-page print action opens a PDF page, not browser print.

Pass conditions:
- The main print button on the detail page opens `/api/journal-documents/[id]/pdf` in a new tab/window.
- No visible detail-page print action for this journal relies on `window.print()`.
- The opened route returns an inline PDF response.

### AC7. Table row CRUD and persistence
The detail page supports working row creation, editing, selection, deletion, and persistence.

Pass conditions:
- A user can add rows through the provided UI.
- Existing row values can be edited.
- Selected rows can be deleted where deletion is allowed.
- Saving persists the current config to the DB through the existing journal-document API.
- Reloading the page restores the same saved rows from persisted document config.

### AC8. List management and supporting dictionaries
The journal’s supporting lists remain usable and persisted.

Pass conditions:
- Product lists can be created, renamed, populated, and deleted.
- Manufacturer and supplier lists can be added to and pruned.
- The list-management dialog saves through the existing document API.
- Reloading restores the saved supporting lists from DB-backed document config.

### AC9. Responsible person logic
Responsible person selection and display work coherently with real organization users.

Pass conditions:
- The add-row flow can select a responsible employee and role/title.
- The saved responsible value is reflected in the row after save and reload.
- The responsible value is included in the PDF output where the journal table expects it.
- The implementation resolves available employees from the current organization context.

### AC10. PDF table generation
The shared PDF route produces a correct perishable-rejection table PDF for this journal.

Pass conditions:
- `generateJournalDocumentPdf()` has explicit perishable-rejection handling instead of falling through to an unrelated journal renderer.
- The PDF file name prefix is journal-appropriate.
- The PDF contains the journal title and table columns relevant to the perishable-rejection config model.
- The PDF reflects current persisted config data, including rows and list-backed text fields that appear in the table.

### AC11. DB-backed persistence
The journal remains genuinely backed by the DB/document model.

Pass conditions:
- Document title, date, status, config rows, product lists, manufacturers, and suppliers persist through the existing `journal-documents/[id]` API.
- Nothing required for the acceptance criteria depends only on unsaved local React state.
- The implementation remains compatible with the current seed/demo document pattern in `src/app/(dashboard)/journals/[code]/page.tsx`.

### AC12. Fresh verification gate
Completion is blocked on a fresh verification pass after implementation.

Pass conditions:
- Evidence is recorded under `.agent/tasks/perishable-rejection-parity-2026-04-11/`.
- Each acceptance criterion is explicitly checked against the current code and current command results.
- The task is not considered complete unless every acceptance criterion is `PASS`.
- If verification fails, `problems.md` is written, the smallest safe fix is applied, and verification is rerun.

## Verification plan
- Compare list-page layout and labels against the local screenshot and stored source PNG/HTML.
- Verify readable Russian text across list/detail/PDF/UI actions.
- Verify document settings save/reload through `PATCH /api/journal-documents/[id]`.
- Verify row add/edit/delete/save/reload on the detail page.
- Verify supporting list edits save and reload.
- Verify detail-page and list-page print actions both open `/api/journal-documents/[id]/pdf`.
- Verify the PDF response is inline `application/pdf` and contains a perishable-rejection table.
- Run fresh project checks for the touched implementation surface and record outputs in evidence.

## Key risks
- Existing mojibake spans both UI and constants, so superficial fixes can leave hidden broken labels behind.
- The detail page currently stores everything in `config`, so careless edits can break persistence or silently drop row fields.
- The shared PDF generator currently lacks a dedicated branch for this journal, so print parity requires coordinated changes in rendering and file naming.
- Source parity spans list page, detail page, and PDF output; fixing only one surface will leave the journal visibly inconsistent.
