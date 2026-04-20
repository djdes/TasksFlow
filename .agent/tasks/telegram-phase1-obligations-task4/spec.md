# Task Spec

- Task ID: `telegram-phase1-obligations-task4`
- Source plan: `docs/superpowers/plans/2026-04-20-telegram-bot-phase1-obligations.md`
- Scope: Task 4 only

## Goal

Switch Mini App home from heuristic "today entries" data to explicit journal obligations without changing auth bootstrap, ACL filtering, or bottom navigation behavior.

## Files In Scope

- `src/app/api/mini/home/route.ts`
- `src/app/mini/page.tsx`
- `src/lib/journal-obligations.ts`
- `src/lib/journal-obligations.test.ts`

## Acceptance Criteria

- AC1: `src/lib/journal-obligations.test.ts` contains a case proving `listOpenJournalObligationsForUser` returns pending obligations ordered by `template.name`.
- AC2: `listOpenJournalObligationsForUser` remains aligned with that behavior for the current UTC day.
- AC3: `GET /api/mini/home` uses the existing ACL/template filtering, branches with `hasFullWorkspaceAccess`, and returns:
  - staff payload with `mode: "staff"`, `user`, `now`, `all`
  - manager/root payload with `mode: "manager"`, `user`, `summary`, `all`
- AC4: `src/app/mini/page.tsx` accepts the staff/manager union payload, renders the staff top block from `home.now`, renders the manager summary card above the journal list, and preserves auth bootstrap plus bottom nav behavior.
- AC5: Required verification passes:
  - `node --import tsx --test src/lib/journal-obligations.test.ts`
  - `npx tsc --noEmit --pretty false`

## Constraints

- Keep the diff tightly scoped to the four owned files.
- Do not revert or rework unrelated branch changes.
- No unrelated UI redesign.
