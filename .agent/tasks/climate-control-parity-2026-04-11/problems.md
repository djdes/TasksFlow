# Problems: climate-control-parity-2026-04-11

## P1. Fresh full build verification is externally blocked
- Command: `npm run build`
- Observed result: `Unable to acquire lock at C:\\www\\Wesetup.ru\\.next\\lock`
- Impact: AC14 cannot be marked `PASS` from this working tree until the concurrent build releases the lock.
- Nature: environment/concurrency blocker, not a confirmed climate-journal code defect.

## P2. Shared files contain unrelated dirty hunks
- Files:
  - `src/lib/document-pdf.ts`
  - `src/app/(dashboard)/journals/[code]/page.tsx`
- Impact: commit/push must use hunk-scoped staging or it will capture unrelated work from parallel streams.
