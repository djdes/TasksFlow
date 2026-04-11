# Task Spec: med-books-parity

## Metadata
- Task ID: med-books-parity
- Created: 2026-04-11
- Repo root: `C:\www\Wesetup.ru`

## Guidance sources
- `AGENTS.md`
- `CLAUDE.md`
- `journals\Медицинские книжки\*`
- `tmp-source-journals\full-crawl\13-item-docs-medbook-1\*`
- `tmp-source-journals\full-crawl-smoke\13-\*`
- `src\lib\med-book-document.ts`
- `src\components\journals\med-book-documents-client.tsx`
- `src\components\journals\med-book-document-client.tsx`
- `src\app\(dashboard)\journals\[code]\page.tsx`
- `src\app\(dashboard)\journals\[code]\documents\[docId]\page.tsx`
- `src\app\api\journal-documents\*`
- `src\lib\document-pdf.ts`
- `prisma\seed.ts`

## Original task statement
Prepare a frozen repo-task-proof-loop spec for the journal `Медицинские книжки` in repository `C:\www\Wesetup.ru`. The broader task is to find the matching local screenshot folder under `journals\`, compare the current implementation to the source-site journal and screenshots, achieve maximal visual parity, preserve working DB-backed logic, make all buttons work, ensure every print action opens a PDF table page, fully verify the result, and later push plus confirm autodeploy. In this step, write only `.agent/tasks/med-books-parity/spec.md`.

## Current repo findings
- The requested journal already exists in seeds as template code `med_books` with visible name `Медицинские книжки`.
- Source-site mapping already links source slug `medbook` to local journal code `med_books`.
- The repo already contains dedicated med-book list and document clients plus shared journal document routing for this journal.
- The repo already contains source-site crawl artifacts for the med-book journal in `tmp-source-journals\full-crawl\13-item-docs-medbook-1\`.
- The repo contains a med-book document domain module in `src\lib\med-book-document.ts`.
- The current med-book domain file contains mojibake in user-facing Russian strings; this is a parity defect.

## Scope
- Bring the existing `med_books` journal to source and screenshot parity using the local screenshot folder `journals\Медицинские книжки\*` as the visual authority and the stored source crawl as the behavior authority where screenshots are incomplete.
- Keep the implementation inside the existing journal/document architecture, with real persistence through the current DB-backed APIs and Prisma models.
- Verify the full list flow, document flow, settings/config flow, CRUD behavior, status/archive behavior, and print-to-PDF behavior for the journal.
- Produce repo-task-proof-loop artifacts under `.agent/tasks/med-books-parity/`, including evidence from a fresh verification pass.
- Bounded fan-out subagents are allowed later for exploration, implementation, and verification because the user explicitly requested multi-stream execution, but spec ownership, evidence ownership, and final verdict stay in this task directory.

## Assumptions
- The screenshot folder is expected at `journals\Медицинские книжки\`; if multiple nearby folders exist, the one whose visuals match source slug `medbook` is the authority.
- The task upgrades the existing `med_books` journal rather than creating a duplicate journal/template.
- “Максимально похоже” means visually close enough for direct side-by-side comparison with the stored screenshots and source captures, with one-to-one matching preferred when practical.
- “Все кнопки работали” means every visible action in the touched med-book flow is wired to a real route, dialog, mutation, or document action and does not dead-end.
- “Кнопка печать всегда открывала страницу с pdf таблицей” means every print entry point for this journal opens a printable PDF page/tab through the existing journal-document PDF route or a narrowly scoped journal-specific PDF path if the shared route cannot render the required table shape.

## Constraints
- Freeze spec only in this step. Do not edit production code, tests, configs, or task files other than this `spec.md`.
- Reuse the current `JournalDocument` / `JournalDocumentEntry` model unless a minimal compatible extension is strictly required.
- Do not replace the shared dashboard or unrelated journal flows.
- Do not accept mock-only client state for required flows when a persisted path already exists in the repo.
- All visible Russian strings in the touched med-book flow must render as valid UTF-8 Cyrillic.

## Non-goals
- Redesigning unrelated journals.
- Replacing the shared PDF system across the whole app.
- Broad schema redesign outside what is strictly needed for the med-book journal.
- Pixel-perfect parity for invisible implementation details that do not affect behavior or user-visible layout.

## Acceptance criteria

### AC1. Journal identity and routing
The requested journal remains the existing `med_books` journal and is reachable through the current dashboard/document routes.

Pass conditions:
- The journal is reachable at the existing journal route for code `med_books`.
- The visible journal name is `Медицинские книжки` where the source/screenshots require it.
- The implementation does not introduce a duplicate journal card or parallel template for the same journal.
- The list page and document page resolve through the current journal/document routing model.

### AC2. Screenshot and source parity baseline
The med-book list and detail flows visually match the local screenshot folder and stored source crawl closely enough for side-by-side review.

Pass conditions:
- The main page structure, title area, action row, cards/tables, dialogs, and information order match the screenshots/source captures.
- Key spacing, typography hierarchy, table structure, labels, and action placement are aligned with the screenshots/source captures.
- Any visible deviation from screenshots is minor, deliberate, and does not break recognizability of the original layout.

### AC3. UTF-8 Russian text
All user-facing med-book strings render correctly in Russian.

Pass conditions:
- No mojibake remains in the list page, detail page, settings dialogs, buttons, section headers, table headers, reference blocks, tooltips, or PDF output.
- `src\lib\med-book-document.ts` and any touched med-book UI/API files expose readable Cyrillic for visible labels.

### AC4. List page behavior
The med-book list page matches the source flow and works end to end.

Pass conditions:
- The page shows the expected title, action area, and active/closed document separation from the source/screenshots.
- Document cards expose source-matching summary data and working affordances such as open, print, archive/close, restore if applicable, delete, and settings where shown.
- Active and closed documents are both reachable from the UI without manual URL hacks.
- List actions use the current DB-backed journal document APIs and survive reload.

### AC5. Document detail structure and behavior
The med-book document page matches the screenshot/source layout and keeps real journal logic.

Pass conditions:
- The page shows the expected header/breadcrumb structure and the main med-book table/reference sections in source order.
- The document view supports the required employee rows / med-book rows and exposes working edit flows for fields shown in the UI.
- Closed documents are visibly read-only where the source implies archive state.
- The page reloads from persisted data without losing state.

### AC6. Data model and persistence
Med-book data entry and document configuration are persisted through the existing backend.

Pass conditions:
- Create, edit, archive/close, reopen if supported, and delete flows update real persisted data.
- Row-level changes and document-level settings survive full page reload and fresh fetch.
- The implementation uses the existing Prisma/journal-document persistence model or the smallest compatible extension needed for this journal.
- No required user flow depends solely on ephemeral client memory.

### AC7. Settings/config parity
The journal exposes the configuration controls required by the screenshots/source and persists them.

Pass conditions:
- The settings UI includes the med-book-specific controls shown or implied by the source/screenshots, including examinations list, vaccination list, and vaccination visibility where applicable.
- Saving settings updates persisted document config and the detail view reflects those settings after reload.
- Any config affecting visible columns/sections also affects the printable output.

### AC8. Buttons and action wiring
Every visible action in the med-book flow is wired and works.

Pass conditions:
- No visible button/menu item in the touched med-book list/detail/settings flows is a dead click.
- Destructive actions include the expected confirmation behavior if the current app pattern/source requires it.
- Error handling is user-safe: failed actions surface a visible error state or toast instead of silently doing nothing.

### AC9. Print-to-PDF behavior
Every print entry point for this journal opens a PDF table page.

Pass conditions:
- Every visible `Печать` action in the med-book list/detail flow opens a new page/tab or route dedicated to PDF output.
- The opened output is an actual PDF response or PDF-rendered document page for the med-book table, not a broken link and not plain raw JSON/HTML fallback.
- The PDF reflects the current persisted med-book document data and relevant settings.

### AC10. Verification and deployment readiness
Fresh verification passes on the current codebase and proof-loop artifacts are complete.

Pass conditions:
- All acceptance criteria are explicitly judged during verification and marked `PASS` before completion is claimed.
- Evidence is captured in `.agent/tasks/med-books-parity/evidence.md` and `.agent/tasks/med-books-parity/evidence.json` with raw artifacts referenced or stored alongside them.
- If any verification step initially fails, `.agent/tasks/med-books-parity/problems.md` is created, the smallest safe fix is applied, and verification is rerun.
- Final branch state is ready to push to `master`, and deployment confirmation is part of the later execution phase.

## Verification plan
- Identify the authoritative local screenshot set under `journals\Медицинские книжки\*` and compare it against the current local UI plus source crawl `tmp-source-journals\full-crawl\13-item-docs-medbook-1\*`.
- Run targeted static checks on touched files:
  - `eslint` for touched med-book files
  - targeted type/build verification if touched code affects compile boundaries
- Run functional verification for:
  - list page rendering and active/closed states
  - document open/create/edit/archive/delete flows
  - med-book row persistence after reload
  - settings persistence after reload
  - print action opening PDF output
- Capture screenshots and/or HTML/PDF evidence for side-by-side parity review.
- Perform a fresh verification pass after implementation against the current branch state, not against prior chat claims.
- In the later execution phase, push to `master`, watch autodeploy, and fix deploy issues if deployment does not succeed.

## Required artifacts
- `.agent/tasks/med-books-parity/spec.md`
- `.agent/tasks/med-books-parity/evidence.md`
- `.agent/tasks/med-books-parity/evidence.json`
- `.agent/tasks/med-books-parity/problems.md` if any verification step fails before the final pass
- Raw verification artifacts inside `.agent/tasks/med-books-parity/`, such as:
  - screenshot comparisons
  - exported PDF samples
  - command outputs
  - route/API check logs
  - deployment confirmation notes for the later execution phase

## Key risks
- The current med-book implementation already shows mojibake, so parity work may touch both domain constants and rendered UI.
- Print behavior may currently rely on shared PDF plumbing that does not exactly match the med-book table structure.
- Source screenshots and stored crawl may differ slightly between active and archive states, so the verifier must use both.
- Existing seeded or persisted med-book documents may contain legacy config/entry shapes that require safe normalization rather than brute-force replacement like an angry кожаный with a hammer.
