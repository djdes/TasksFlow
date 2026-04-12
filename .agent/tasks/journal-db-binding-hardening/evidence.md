# Evidence Bundle: journal-db-binding-hardening

## Summary
- Overall status: FAIL
- Last updated: 2026-04-12
- Current pass focus:
  - `metal-impurity` migrated from name-keyed employee selection to DB-backed `user.id`
  - shared staff reconciler now also normalizes `metal-impurity`
  - fresh `tsc`, targeted `eslint`, residual selector scan, and proof-loop `validate` were rerun
- Honest gap:
  - full per-journal print/PDF verification is still not freshly proven in this pass

## Acceptance criteria evidence

### AC1
- Status: PASS
- Proof:
  - Required task artifacts exist under `.agent/tasks/journal-db-binding-hardening/`.
  - `python C:\Users\Yaroslav\.codex\skills\repo-task-proof-loop\scripts\task_loop.py validate --task-id journal-db-binding-hardening` returned `valid: true`.

### AC2
- Status: PASS
- Proof:
  - Shared API reconciliation is present in [route.ts](/C:/www/Wesetup.ru/src/app/api/journal-documents/route.ts), [[id]/route.ts](/C:/www/Wesetup.ru/src/app/api/journal-documents/[id]/route.ts), and [[id]/entries/route.ts](/C:/www/Wesetup.ru/src/app/api/journal-documents/[id]/entries/route.ts).
  - Shared normalization layer is implemented in [journal-staff-binding.ts](/C:/www/Wesetup.ru/src/lib/journal-staff-binding.ts).

### AC3
- Status: PASS
- Proof:
  - `metal-impurity` list/settings and document row/settings flows now bind employee selects by `user.id` in [metal-impurity-documents-client.tsx](/C:/www/Wesetup.ru/src/components/journals/metal-impurity-documents-client.tsx) and [metal-impurity-document-client.tsx](/C:/www/Wesetup.ru/src/components/journals/metal-impurity-document-client.tsx).
  - Fresh residual selector scan found no remaining matches for the old name-based patterns in `src/components/journals`: [staff-binding-scan.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/staff-binding-scan.txt).

### AC4
- Status: PASS
- Proof:
  - `metal-impurity` config/rows now carry `responsibleEmployeeId` with backward-compatible display name retention in [metal-impurity-document.ts](/C:/www/Wesetup.ru/src/lib/metal-impurity-document.ts).
  - Shared normalizer reconciles legacy name-based `metal-impurity` config and row data in [journal-staff-binding.ts](/C:/www/Wesetup.ru/src/lib/journal-staff-binding.ts).

### AC5
- Status: PASS
- Proof:
  - Previously hardened journals remain covered by shared reconciliation and UI id-binding.
  - `metal-impurity` was added to the same systemic rule set rather than patched as a one-off.

### AC6
- Status: UNKNOWN
- Proof:
  - Shared print path still routes through `/api/journal-documents/[id]/pdf`.
  - PDF data preparation still uses reconciled config in [document-pdf.ts](/C:/www/Wesetup.ru/src/lib/document-pdf.ts).
- Gaps:
  - This pass did not freshly execute per-journal print/PDF checks across all journals, so full print proof is not complete.

### AC7
- Status: PASS
- Proof:
  - Defect class propagation was rerun after the `metal-impurity` fix via the fresh residual scan in [staff-binding-scan.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/staff-binding-scan.txt).
  - The fix was applied at shared normalization plus both list/document clients, not only one local component.

### AC8
- Status: FAIL
- Proof:
  - Fresh verification commands were rerun and captured in raw artifacts.
- Gaps:
  - Not every criterion is `PASS`; AC6 remains `UNKNOWN`, so completion cannot be claimed.

## Commands run
- `npx tsc --noEmit`
- `npx eslint src/lib/metal-impurity-document.ts src/lib/journal-staff-binding.ts src/components/journals/metal-impurity-documents-client.tsx src/components/journals/metal-impurity-document-client.tsx`
- `rg -n "SelectItem key=\{u.id\} value=\{u.name\}|SelectItem key=\{user.id\} value=\{user.name\}|value=\{state\.responsibleEmployee\}|value=\{draftConfig\.responsibleEmployee\}|value=\{draftEmployee\}|value=\{activeState\.responsibleEmployee\}|value=\{state\.approveEmployee\}|value=\{draftRow\.employeeName\}" src/components/journals`
- `python C:\Users\Yaroslav\.codex\skills\repo-task-proof-loop\scripts\task_loop.py validate --task-id journal-db-binding-hardening`

## Raw artifacts
- [build.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/build.txt)
- [lint.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/lint.txt)
- [staff-binding-scan.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/staff-binding-scan.txt)
- [diff.txt](/C:/www/Wesetup.ru/.agent/tasks/journal-db-binding-hardening/raw/diff.txt)

## Current non-pass items
- AC6: full fresh all-journal print verification is not proven in this pass
- AC8: overall completion remains blocked until all criteria are `PASS`
