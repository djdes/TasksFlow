# Evidence: cold-equipment-journal-2026-04-11

## Scope checked
- Local visual references:
  - `journals/Журнал контроля температурного режима холодильного и морозильного оборудования/`
- Captured source materials:
  - `tmp-source-journals/full-crawl/04-item-docs-temprefrigerationjournal-1/`
- Touched implementation:
  - `src/components/journals/cold-equipment-documents-client.tsx`
  - `src/components/journals/cold-equipment-document-client.tsx`
  - `src/lib/cold-equipment-document.ts`
  - `src/lib/open-document-pdf.ts`
  - `src/app/(dashboard)/journals/[code]/page.tsx`
  - `src/app/api/journal-documents/[id]/route.ts`
  - `src/app/api/journal-documents/[id]/cold-equipment/route.ts`

## Changes made
- Added a dedicated list client for `cold_equipment_control` to match the source journal layout more closely than the generic tracked-documents list.
- Reworked the cold-equipment document client in clean UTF-8 text with:
  - breadcrumb/header structure
  - source-style settings summary block
  - PDF print button using a guarded fetch+blob flow
  - preserved equipment CRUD and cell persistence behavior
- Replaced broken mojibake defaults in `src/lib/cold-equipment-document.ts`.
- Added server-side config normalization for `cold_equipment_control` on `PATCH /api/journal-documents/[id]`.
- Blocked `POST /api/journal-documents/[id]/cold-equipment` for closed documents.
- When auto-creating starter documents for this journal, now seed `config`, `responsibleUserId`, and `responsibleTitle` from organization data instead of leaving them empty.

## Commands run
- `npx eslint "src/components/journals/cold-equipment-document-client.tsx" "src/components/journals/cold-equipment-documents-client.tsx" "src/lib/cold-equipment-document.ts" "src/lib/open-document-pdf.ts" "src/app/(dashboard)/journals/[code]/page.tsx" "src/app/api/journal-documents/[id]/route.ts" "src/app/api/journal-documents/[id]/cold-equipment/route.ts"`
  - Result: `PASS`
- `npx tsc --noEmit --pretty false`
  - Result: `FAIL`
  - Notes: failure is dominated by unrelated pre-existing repository issues in other files plus missing local DB-backed validation paths.
- `npx tsx prisma/seed-admin.ts`
  - Result: `FAIL`
  - Notes: local PostgreSQL connection refused on `localhost:5432`.

## Acceptance criteria status
- `AC1` Visual parity:
  - `PARTIAL`
  - Dedicated list/document surfaces were aligned toward the source screenshots and text was cleaned in the touched journal implementation.
  - Pixel-perfect runtime confirmation is blocked locally because the app cannot be exercised end-to-end without a working DB.
- `AC2` Logic and DB-backed behavior:
  - `PARTIAL`
  - Code paths for starter document creation, config normalization, closed-document protection, and guarded PDF opening were updated.
  - Full runtime CRUD verification is blocked locally by missing PostgreSQL.
- `AC3` Print opens PDF:
  - `PARTIAL`
  - UI now uses a guarded PDF-opening helper instead of blind `window.open`, reducing the “JSON in new tab” failure mode.
  - End-to-end runtime verification is still blocked locally.
- `AC4` Fresh verification and deployment evidence:
  - `PARTIAL`
  - Fresh targeted lint was run and recorded.
  - Full typecheck failed for unrelated repository issues.
  - Push/deploy verification not yet recorded in this artifact.

## Current verdict
- Current state is improved but not proven `PASS`.
- Main blockers:
  - local PostgreSQL unavailable
  - unrelated repository TypeScript failures outside this journal task
  - no completed remote deploy verification captured yet
