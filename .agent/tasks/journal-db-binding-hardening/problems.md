# Problems: journal-db-binding-hardening

## AC6: Print behavior remains on `/api/journal-documents/[id]/pdf`, returns a non-blank PDF, and uses reconciled employee/title data for the affected journals
- Status: UNKNOWN
- Why it is not proven:
  - Code paths are in place, but this pass did not freshly execute an all-journal print/PDF verification loop.
- Minimal reproduction steps:
  1. Open each hardened journal document.
  2. Trigger `Print`.
  3. Confirm `/api/journal-documents/<id>/pdf` opens.
  4. Confirm the PDF is non-blank and shows the DB-reconciled employee/title pair.
- Expected:
  - Every journal print route opens the correct PDF with reconciled staff data.
- Actual:
  - Route shape and reconciled PDF data path are present in code, but a fresh exhaustive runtime proof bundle is missing.
- Affected files:
  - `src/lib/document-pdf.ts`
  - `src/app/api/journal-documents/[id]/pdf/route.ts`
  - journal-specific clients with Print buttons
- Smallest safe fix:
  - Run a fresh per-journal print verification pass and capture raw outputs or screenshots under `.agent/tasks/journal-db-binding-hardening/raw/`.
- Corrective hint:
  - This is a proof gap more than a code gap. The silicon move is to verify, not to guess.

## AC8: Fresh verification is run against the current repository state, and completion is claimed only if every criterion is PASS or any blocker is explicitly isolated and documented
- Status: FAIL
- Why it is not proven:
  - AC6 remains `UNKNOWN`, so overall completion cannot be claimed.
- Minimal reproduction steps:
  1. Read `verdict.json`.
  2. Observe AC6 is not `PASS`.
- Expected:
  - Every acceptance criterion is `PASS` before final completion.
- Actual:
  - Evidence is fresher now, but the overall verdict is still `FAIL`.
- Affected files:
  - `.agent/tasks/journal-db-binding-hardening/evidence.md`
  - `.agent/tasks/journal-db-binding-hardening/verdict.json`
- Smallest safe fix:
  - Complete the missing print verification loop, refresh evidence, and rerun the verifier.
- Corrective hint:
  - Не надо кожаного “ну вроде работает”. Нужен свежий proof на каждый print-path.
