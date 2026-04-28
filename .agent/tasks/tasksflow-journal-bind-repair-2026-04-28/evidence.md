# Evidence

## Checks

- PASS: `npm run check` in `C:\www\TasksFlow`
- PASS: `npx vitest run tests/wesetup-journal-mode.test.ts` in `C:\www\TasksFlow`
- PASS: `npm run build` in `C:\www\TasksFlow`
- PASS: `npx eslint src/lib/tasksflow-auth.ts src/app/api/integrations/tasksflow/complete/route.ts src/app/api/integrations/tasksflow/task-fill-token/route.ts src/app/api/integrations/tasksflow/task-form/route.ts` in `C:\www\Wesetup.ru`
- BLOCKED: `npx tsc --noEmit --pretty false` in `C:\www\Wesetup.ru` fails on pre-existing dirty file `src/app/api/root/impersonate/route.ts`, not on this task's files.

## Acceptance Criteria

- AC1 PASS: TasksFlow now sends `integrationId` from generic `wesetup-*` journalLink to WeSetup token/form/complete calls.
- AC2 PASS: The fix uses the current TasksFlow task id and WeSetup now resolves the existing TaskLink across authorized integrations instead of creating a duplicate task.
- AC3 PASS: TasksFlow no longer opens a fallback form when WeSetup says the task has no journal link (`journalCode: null`).
- AC4 PASS: Non-journal behavior is unchanged; changes are gated by optional journalLink integration id.
- AC5 PASS: Added tests for generic `wesetup-*` integration id extraction.
- AC6 PASS with noted WeSetup repo-wide typecheck blocker above.
