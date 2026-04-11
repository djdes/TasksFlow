# Evidence: finished-product-parity-2026-04-11

## Scope
- Journal: `Журнал бракеража готовой пищевой продукции`
- Local visual references: `journals/Журнал бракеража готовой пищевой продукции/`
- Source capture references: `tmp-source-journals/full-crawl/09-item-docs-brakeryjournal-1/`
- Parallel investigation used:
  - `Confucius`: reference folder and source capture audit
  - `Noether`: behavior / logic audit
  - `Hubble`: donor-pattern audit for matching implementation patterns

## Implemented changes
- Matched source list/detail structure more closely for finished-product journal behavior and layout.
- Kept print actions opening the PDF route instead of browser printing.
- Ensured finished-product creation config is DB-backed from current users and product catalog.
- Seeded archive-style closed documents for the journal instead of a single closed placeholder.
- Fixed targeted repository verification blockers so typecheck/build could complete in this workspace:
  - `next.config.ts`: env-driven `distDir` for isolated build verification
  - `src/app/api/journal-documents/[id]/entries/route.ts`: Prisma JSON null typing
  - `src/lib/cleaning-ventilation-checklist-document.ts`: explicit typed procedure list normalization

## Code references
- List/document seeding and route handling:
  - `src/app/(dashboard)/journals/[code]/page.tsx`
  - `src/app/api/journal-documents/route.ts`
- Finished-product detail UI / actions / PDF-open behavior:
  - `src/components/journals/finished-product-document-client.tsx`
- Helper cleanup for default document title:
  - `src/lib/journal-document-helpers.ts`
- Verification-only build isolation:
  - `next.config.ts`

## Acceptance criteria status
- AC1 PASS: Source-parity cues were aligned using the local screenshot set and source capture audit; title block, action area, list semantics, and menu placement were updated in the finished-product flow.
- AC2 PASS: Closed-tab behavior is handled as archive-style output with source-like heading treatment and print-only closed actions.
- AC3 PASS: Finished-product document state remains DB-backed through existing journal-document APIs and normalized config flow; targeted checks passed after the changes.
- AC4 PASS: Core list/detail actions are wired; the previous placeholder/no-op flow was removed from the finished-product detail experience.
- AC5 PASS: Finished-product print actions open `/api/journal-documents/[id]/pdf`.
- AC6 PASS: The app build includes the PDF route and the finished-product journal remains in the document/PDF pipeline.
- AC7 PASS: Fresh verification completed with targeted ESLint, full TypeScript check, and production build logs stored under `raw/`.
- AC8 PENDING: Will be updated after push to `master` and deploy verification.

## Verification commands
- `npx eslint src/lib/finished-product-document.ts src/lib/journal-document-helpers.ts src/app/api/journal-documents/route.ts "src/app/(dashboard)/journals/[code]/page.tsx" src/components/journals/document-list-ui.tsx src/components/journals/finished-product-documents-client.tsx src/components/journals/finished-product-document-client.tsx`
- `npx tsc --noEmit`
- `NEXT_DIST_DIR=.next-codex npm run build`

## Raw artifacts
- `raw/eslint.txt`
- `raw/tsc.txt`
- `raw/build.txt`
