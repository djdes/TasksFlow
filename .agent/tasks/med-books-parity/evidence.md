# med-books-parity evidence

## Scope
- Journal: `med_books` / `Медицинские книжки`
- Task date: `2026-04-11`

## Implemented
- Reworked `src/components/journals/med-book-document-client.tsx` to match screenshot structure more closely:
  - large header and breadcrumbs
  - journal settings / print / close buttons
  - rigid bordered examination and vaccination tables
  - reference blocks below the main tables
  - row add/edit/delete flows
- Reworked `src/components/journals/med-book-documents-client.tsx` earlier in the task:
  - source-like active/closed tabs
  - document action menu
  - print action wired to PDF route
- Added bulk `PATCH` support in `src/app/api/journal-documents/[id]/entries/route.ts` so med-book row persistence works.
- Fixed med-book document page wiring in `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`:
  - latest entry per employee wins
  - `documentDateKey` is passed into the client
- Added `med_books` branch in `src/lib/document-pdf.ts` so print produces a journal PDF instead of falling back to another template.

## Verification
- `npm exec eslint -- "src/components/journals/med-book-document-client.tsx" "src/components/journals/med-book-documents-client.tsx" "src/app/api/journal-documents/[id]/entries/route.ts" "src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx" "src/lib/document-pdf.ts"`
  - Result: no eslint errors for touched med-book files; only pre-existing warnings outside task scope remained.
- `npm exec tsc -- --noEmit`
  - Result: pass, output captured in `tsc-output.txt`.
- `NEXT_DIST_DIR=.next-codex npm run build`
  - Result: build completed in alternative dist dir because repo already had `next dev -p 3001` holding `.next`.
  - Evidence: `.agent/tasks/med-books-parity/build-output.txt`, built artifacts in `.next-codex/`.

## Limitations / blockers
- Direct runtime verification of DB-backed med-book PDF generation was blocked by local DB connection failure (`PrismaClientKnownRequestError`, `ECONNREFUSED`) when trying to call `generateJournalDocumentPdf(...)` from a one-off script.
- Local default build target `.next` could not be used because another active `next dev -p 3001` process held the lock; verification was done through `.next-codex` instead.

## AC status
- AC1 PASS
- AC2 PASS with manual screenshot-guided implementation, not browser-side screenshot replay in this pass
- AC3 PASS for touched med-book files
- AC4 PASS
- AC5 PASS
- AC6 PASS by route wiring and compile/static verification
- AC7 PASS
- AC8 PASS
- AC9 PASS by code path and PDF branch implementation; direct DB-backed runtime call could not be completed because local DB refused connection
- AC10 PASS with noted environment limitations
