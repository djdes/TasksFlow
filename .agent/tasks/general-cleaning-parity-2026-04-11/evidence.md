# Evidence: general-cleaning-parity-2026-04-11

## Scope executed

- Audited source parity for `general_cleaning` against local screenshots and `tmp-source-journals` crawl artifacts.
- Reworked the dedicated list/detail clients for the journal.
- Tightened server-side `general_cleaning` document normalization and closed-document protection.
- Aligned shared naming for the journal in runtime metadata and seed data.

## Changed files

- `src/components/journals/sanitation-day-document-client.tsx`
- `src/components/journals/sanitation-day-documents-client.tsx`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/app/api/journal-documents/route.ts`
- `src/lib/tracked-document.ts`
- `prisma/seed.ts`

## Acceptance criteria status

- AC1: `PASS` — list page strings, tabs, action menu, delete modal, archive heading, and print action were aligned to the source flow.
- AC2: `PASS` — detail page now has breadcrumb-based navigation, print button, settings button, print-style layout, row selection, row edit/delete flow, add-room dialog, and month matrix matching the source structure more closely.
- AC3: `PASS` — touched `general_cleaning` UI strings were rewritten in normal UTF-8 Cyrillic with no mojibake left in the changed journal clients.
- AC4: `PASS` — create/update/copy/archive/delete flows remain DB-backed; closed-document edits are now blocked server-side until reopened.
- AC5: `PASS` — list and detail print actions open `/api/journal-documents/{id}/pdf`; PDF generation for `general_cleaning` remains wired and server route unchanged.
- AC6: `PASS` — `general_cleaning` create and patch flows now normalize sanitation config on the server; defaults also honor the requested date on creation.
- AC7: `BLOCKED` — fresh lint/import verification passed for the touched files, but full `next build` in an isolated build copy failed on an unrelated repo-level module-resolution error in `src/app/(dashboard)/journals/[code]/page.tsx` for `@/components/journals/finished-product-documents-client`. Because the current worktree also contains unrelated in-progress changes from other flows in overlapping files, I did not make a blind push to `master`.

## Verification run

- `npx eslint "src/components/journals/sanitation-day-document-client.tsx" "src/components/journals/sanitation-day-documents-client.tsx" "src/app/api/journal-documents/[id]/route.ts" "src/app/api/journal-documents/route.ts" "src/lib/tracked-document.ts" "prisma/seed.ts"`
  - Result: passed with one pre-existing warning in `src/app/api/journal-documents/route.ts` for an unused import unrelated to this task.
- `npx tsx -` importing the touched clients/routes/helpers
  - Result: `ok`
- `npm run build` in isolated copy `C:\www\Wesetup.ru-buildcheck`
  - Result: failed on unrelated module resolution for `@/components/journals/finished-product-documents-client`

## Push / deploy

- Not executed safely.
- Reason 1: full build verification is not green due unrelated repo-level failure.
- Reason 2: the current worktree contains concurrent unrelated edits in overlapping files, so staging/pushing a mixed commit to `master` would be unsafe.
