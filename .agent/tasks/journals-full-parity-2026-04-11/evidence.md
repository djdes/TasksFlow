# Evidence

## Snapshot

Task: `journals-full-parity-2026-04-11`

This refresh keeps the local runtime proof closed and adds a new systemic visual-fix batch for mobile dialog sizing, oversized controls, and empty-state scaling.

## Code changes in this loop

- [document-pdf.ts](/c:/www/Wesetup.ru/src/lib/document-pdf.ts) now has an explicit `disinfectant_usage` PDF branch and file prefix.
- [capture-local-runtime-proof.ts](/c:/www/Wesetup.ru/scripts/capture-local-runtime-proof.ts) now:
  - accepts non-empty rendered detail pages instead of only editable ones
  - auto-creates default documents through `/api/journal-documents` when a list page is empty
  - probes `/api/journal-documents/[id]/pdf` for runtime print proof
- [page.tsx](/c:/www/Wesetup.ru/src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx) had temporary debug `console.log` calls removed.
- Visual containment and mobile sizing fixes:
  - [dialog.tsx](/c:/www/Wesetup.ru/src/components/ui/dialog.tsx) now uses viewport-safe width/height with scroll containment for all dialogs.
  - [audit-report-document-client.tsx](/c:/www/Wesetup.ru/src/components/journals/audit-report-document-client.tsx), [cold-equipment-document-client.tsx](/c:/www/Wesetup.ru/src/components/journals/cold-equipment-document-client.tsx), [register-document-client.tsx](/c:/www/Wesetup.ru/src/components/journals/register-document-client.tsx), and [tracked-document-client.tsx](/c:/www/Wesetup.ru/src/components/journals/tracked-document-client.tsx) now have local viewport-safe dialog guards for oversized edit/settings modals.
  - [sanitation-day-documents-client.tsx](/c:/www/Wesetup.ru/src/components/journals/sanitation-day-documents-client.tsx), [breakdown-history-documents-client.tsx](/c:/www/Wesetup.ru/src/components/journals/breakdown-history-documents-client.tsx), [cleaning-ventilation-checklist-documents-client.tsx](/c:/www/Wesetup.ru/src/components/journals/cleaning-ventilation-checklist-documents-client.tsx), [hygiene-documents-client.tsx](/c:/www/Wesetup.ru/src/components/journals/hygiene-documents-client.tsx), and [sanitary-day-checklist-documents-client.tsx](/c:/www/Wesetup.ru/src/components/journals/sanitary-day-checklist-documents-client.tsx) now scale form controls and empty states down on mobile instead of forcing desktop sizes.

## Fresh checks

Fresh command outputs are stored under `.agent/tasks/journals-full-parity-2026-04-11/raw/`.

- `npx tsc --noEmit`
  - Result: `PASS`
- `npx eslint "scripts/capture-local-runtime-proof.ts" "src/lib/document-pdf.ts" "src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx"`
  - Result: `PASS` with warnings only
  - Warnings are pre-existing unused symbols outside this task's defect scope.
- `npx tsx scripts/capture-local-runtime-proof.ts`
  - Result: `PASS`
  - Artifacts:
    - `raw/local-runtime-sweep.json`
    - `raw/local-runtime-sweep.md`
  - Summary:
    - list routes: `35/35 PASS`
    - detail routes: `35/35 PASS`
    - print-expected journals: `35/35 PASS`
    - `med_books` remains correctly `no-print-expected`
    - `disinfectant_usage` PDF runtime failure is fixed
- `npx eslint` on the touched visual files
  - Result: `PASS`
  - Artifact:
    - `raw/eslint-visual-2026-04-12.txt`
- `npx tsc --noEmit`
  - Result: `PASS`
  - Artifact:
    - `raw/tsc-visual-2026-04-12.txt`
- `npx eslint` on the touched list-card grid files
  - Result: `PASS` with one pre-existing warning
  - Artifact:
    - `raw/eslint-visual-grid-2026-04-12.txt`
  - Note:
    - `audit-plan-documents-client.tsx` still has a pre-existing unused symbol warning outside this visual batch's behavior risk.
- `npx tsc --noEmit`
  - Result: `PASS`
  - Artifact:
    - `raw/tsc-visual-grid-2026-04-12.txt`
- `npx eslint` on the touched wide-table detail files
  - Result: `PASS` with pre-existing warnings only
  - Artifact:
    - `raw/eslint-visual-wide-table-2026-04-12.txt`
- `npx tsc --noEmit`
  - Result: `PASS`
  - Artifact:
    - `raw/tsc-visual-wide-table-2026-04-12.txt`

## Visual defect propagation

- New artifact set:
  - `raw/visual-mobile-sizing-batch.md`
  - `raw/visual-mobile-sizing-batch.json`
- Defect class:
  - mobile dialog/content sizing across list/settings surfaces
  - oversized dialog titles, `h-20` inputs/selects, large mobile button text, and large empty-state blocks
- Classification:
  - systemic, not local-only
- Rechecked globally:
  - modal overflow containment
  - mobile form control sizing
  - mobile empty-state scaling
- Remaining likely visual classes after this batch:
  - rigid fixed-column list grids
  - wide table min-width defaults
  - oversized top-level list headings in some journals

## Visual defect propagation: mobile list-card grids

- New artifact set:
  - `raw/visual-mobile-grid-batch.md`
  - `raw/visual-mobile-grid-batch.json`
- Defect class:
  - fixed desktop-only document row grids in list pages
  - metadata columns that assumed `border-l` desktop layout only
  - action menus aligned only for the last desktop column
- Classification:
  - systemic, not local-only
- Rechecked globally:
  - `audit_plan`
  - `audit_protocol`
  - `training_plan`
  - `product_writeoff`
  - `cleaning`
  - `staff_training`
- Remaining likely visual classes after this batch:
  - wide table min-width defaults in detail pages
  - oversized top-level list headings in some journals

## Visual defect propagation: wide detail tables

- New artifact set:
  - `raw/visual-wide-table-batch.md`
  - `raw/visual-wide-table-batch.json`
- Defect class:
  - print-oriented detail tables with oversized base `min-w` defaults on mobile
  - scroll wrappers that allowed overflow but did not constrain width tightly enough
- Classification:
  - systemic, not local-only
- Rechecked globally:
  - `acceptance`
  - `cleaning`
  - `pest_control`
  - `traceability_test`
  - `uv_lamp_runtime`
- Remaining likely visual class after this batch:
  - oversized top-level list headings in some journals

## Visual-proof state

- Canonical reviewed matrix:
  - `raw/reviewed-visual-matrix.md`
  - `raw/reviewed-visual-matrix.json`
- Totals:
  - `CLOSE`: `18`
  - `FIXED`: `2`
  - `BLOCKED`: `15`
- Supporting reviewed batches:
  - `raw/visual-batch-1-review.md`
  - `raw/visual-batch-2-review.md`

Current blocked visual set is isolated and explicit:

- `disinfectant_usage`
- `glass_control`
- `glass_items_list`
- `incoming_control`
- `incoming_raw_materials_control`
- `intensive_cooling`
- `perishable_rejection`
- `pest_control`
- `ppe_issuance`
- `product_writeoff`
- `sanitary_day_control`
- `staff_training`
- `traceability_test`
- `training_plan`
- `uv_lamp_runtime`

These are not runtime failures anymore. They are proof gaps: live/detail/docprint and local runtime evidence exist, but the bundle still lacks a row-by-row visual comparison note for each of them.

## Current acceptance-criterion snapshot

- `AC1`: `PASS`
  - `inventory.md` still tracks the 35-journal target set.
- `AC2`: `PASS`
  - `inventory.md` and `raw/implementation-matrix.json` still map all 35 journals to route/list/detail implementations.
- `AC3`: `PASS`
  - `raw/visual-matrix.json` and [source-journal-map.ts](/c:/www/Wesetup.ru/src/lib/source-journal-map.ts) still cover the live/source mapping set.
- `AC4`: `PARTIAL`
  - A canonical 35-row visual verdict matrix now exists.
  - `15` journals remain explicitly `BLOCKED` because row-by-row visual comparison notes are still missing.
- `AC5`: `PARTIAL`
  - Visual outcomes are now explicit as `CLOSE`, `FIXED`, or `BLOCKED`.
  - The blocked set is isolated, and shared mobile-sizing, mobile-grid, and wide-table defect classes are now fixed across multiple journals, but it is not yet reduced to zero.
- `AC6`: `PASS`
  - Local runtime proof now covers list/detail routing for all `35/35` journals.
  - The shared disappearing-document fix remains in place and local DB-backed proof now exists through the real app path.
- `AC7`: `PARTIAL`
  - Open/list/create/print runtime behavior is now proven through the local app path.
  - Full end-to-end runtime proof for every edit/save/delete/archive action is still not packaged journal by journal.
- `AC8`: `PASS`
  - `raw/local-runtime-sweep.*` now proves correct runtime PDF behavior for every print-expected journal.
  - `med_books` remains correctly `no-print-expected`.
- `AC9`: `PASS`
  - The discovered print/runtime defect class was rechecked across the full 35-journal set.
- `AC10`: `PASS`
  - Required proof-loop artifacts remain present.
- `AC11`: `PASS`
  - Fresh TypeScript, focused ESLint, and runtime sweep artifacts were rerun on current repo state.
- `AC12`: `FAIL`
  - Completion is still blocked by the remaining visual-proof blockers and by incomplete packaged runtime proof for the full edit/save/delete/archive surface.

## Residual blockers

- `15` journals still lack row-by-row visual comparison notes in the canonical matrix.
- Full packaged runtime proof for every edit/save/delete/archive interaction is still incomplete, even though list/detail/create/print is now covered across all 35.
- The next likely systemic visual classes are already narrowed to fixed-column mobile grids, wide table defaults, and oversized list headings.
- The fixed-column mobile grid class is now addressed for six journals, and the wide-table class is now addressed across five detail journals, leaving oversized list headings as the next likely systemic visual pass.

## Addable/PDF batch

- New systemic UX class fixed:
  - inline add buttons now append the new option to the visible list immediately and select it immediately
  - covered in:
    - `src/components/journals/acceptance-document-client.tsx`
    - `src/components/journals/metal-impurity-document-client.tsx`
    - `src/components/journals/product-writeoff-document-client.tsx`
- New systemic PDF class fixed:
  - empty printable tables now keep visible blank rows instead of collapsing
  - covered in:
    - `src/lib/document-pdf.ts`
- Batch artifacts:
  - `raw/addable-pdf-batch.md`
  - `raw/addable-pdf-batch.json`
  - `raw/addable-pdf-eslint-latest.txt`
  - `raw/addable-pdf-tsc-latest.txt`
- Fresh checks for this batch:
  - focused `eslint` on touched files: `PASS` with warnings only
  - repo-wide `tsc`: blocked by existing unrelated `SettingsState` mismatch in `src/components/journals/training-plan-documents-client.tsx`
