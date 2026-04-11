# Task Spec: cold-equipment-journal-2026-04-11

## Original task statement
User requested work specifically for the journal named `Журнал контроля температурного режима холодильного и морозильного оборудования`.

User wants:
- find the matching local reference folder in `journals/`
- find the matching journal implementation on the site/in repo
- compare the current implementation against the local screenshots and site materials
- make the UI visually as close as possible to the screenshots, ideally one-to-one where justified
- verify logic, DB connectivity, and button behavior
- ensure the print button always opens a PDF table page
- fix any discovered issues
- push the result and wait for autodeploy, fixing deployment issues if needed
- use subagents because the user is running multiple parallel threads

## Task goal
Bring `cold_equipment_control` to an acceptable parity bar for:
1. visual layout and labels versus the local screenshot folder and captured source materials,
2. document creation/editing/persistence behavior,
3. print/PDF behavior from both list and document screens,
4. post-change verification and deployment.

## Relevant repo context
- Local visual references live in `journals/Журнал контроля температурного режима холодильного и морозильного оборудования/`.
- Captured source site materials live in `tmp-source-journals/full-crawl/04-item-docs-temprefrigerationjournal-1/`.
- Journal list page routing is handled in `src/app/(dashboard)/journals/[code]/page.tsx`.
- Journal document page routing is handled in `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`.
- The target implementation currently uses:
  - `src/components/journals/cold-equipment-documents-client.tsx`
  - `src/components/journals/cold-equipment-document-client.tsx`
  - `src/lib/cold-equipment-document.ts`
  - `src/app/api/journal-documents/[id]/cold-equipment/route.ts`
  - `src/app/api/journal-documents/[id]/pdf/route.ts`
  - `src/lib/document-pdf.ts`

## Assumptions
- The local screenshot folder is the primary visual reference for structure and visible controls.
- The captured source site data is sufficient to resolve gaps that screenshots alone do not answer.
- Existing repo journal patterns define the preferred persistence and PDF architecture.
- The dirty worktree contains unrelated user changes that must be preserved.

## Constraints
- Freeze this spec before implementation.
- Keep all proof-loop artifacts under `.agent/tasks/cold-equipment-journal-2026-04-11/`.
- Do not claim completion unless every acceptance criterion passes on a fresh verification pass.
- Do not revert unrelated user changes.
- If any required external deployment system cannot be observed from this environment, record the exact limitation in evidence.

## Non-goals
- Do not rewrite unrelated journal implementations.
- Do not broad-audit all journals in this task unless needed to support this journal.
- Do not introduce mock-only behavior where DB-backed behavior already exists in the current architecture.

## Acceptance criteria

### AC1. Visual parity is reconciled for the target journal
Pass conditions:
- The matching local reference folder and captured source assets are documented in evidence.
- Material visual mismatches in the target journal list/document/settings/equipment flows are fixed or explicitly documented if blocked.
- Russian UI text for the target journal is readable and no mojibake remains on the touched journal surfaces.

### AC2. Journal logic and DB-backed behavior work for the target journal
Pass conditions:
- The target journal can be opened from the dashboard route.
- The target document screen loads persisted document config and entry data correctly.
- The target journal supports the intended create/update/delete flows for equipment and temperature rows without breaking persistence.
- Buttons on the touched target screens perform their intended actions.

### AC3. Print opens a PDF table flow for the target journal
Pass conditions:
- Print from the journal list opens the PDF endpoint for the selected document.
- Print from the target document screen opens the PDF endpoint for the same document.
- The generated PDF corresponds to the target journal table rather than a generic or wrong document layout.

### AC4. Fresh verification and deployment evidence exist
Pass conditions:
- Fresh checks are run after the fixes against the current codebase.
- Evidence artifacts record what was checked and the current verdict for AC1-AC3.
- The changes are pushed.
- Autodeploy status is checked; if it fails and can be fixed from this environment, the fix is applied and rechecked, otherwise the exact blocker is documented.

## Verification plan
- Inspect the local reference folder and captured source files for the target journal.
- Run the app locally and exercise the target list/document/print flows.
- Run targeted checks for the touched implementation paths.
- Record evidence, raw artifacts, and final verifier verdict against the current repository state.
