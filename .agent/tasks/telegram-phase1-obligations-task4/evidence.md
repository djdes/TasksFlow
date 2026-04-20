# Evidence

- Command: `node --import tsx --test src/lib/journal-obligations.test.ts`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-phase1-obligations-task4/raw/journal-obligations.test.txt`
- Command: `npx tsc --noEmit --pretty false`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-phase1-obligations-task4/raw/tsc.txt`

## Acceptance Criteria

- AC1: PASS - `src/lib/journal-obligations.test.ts` covers ordering by journal name.
- AC2: PASS - `listOpenJournalObligationsForUser` sorts current-day open obligations by `template.name`.
- AC3: PASS - `/api/mini/home` reuses ACL filtering, branches through `hasFullWorkspaceAccess`, and returns staff or manager payloads.
- AC4: PASS - `src/app/mini/page.tsx` renders the staff/manager union without changing auth bootstrap or bottom navigation behavior.
- AC5: PASS - required test and typecheck both passed.
