# Evidence

## Scope

Implemented the missing one-way TasksFlow employee provisioning layer that the cleaning journal sync depends on.

### WeSetup changes

- Added reusable sync helper:
  - `src/lib/tasksflow-user-sync.ts`
  - `src/lib/tasksflow-user-sync.test.ts`
- Extended TasksFlow REST client:
  - `src/lib/tasksflow-client.ts`
- Switched TasksFlow integration API routes to root-aware access for read/sync actions:
  - `src/app/api/integrations/tasksflow/route.ts`
  - `src/app/api/integrations/tasksflow/links/route.ts`
  - `src/app/api/integrations/tasksflow/sync-tasks/route.ts`
  - `src/app/api/integrations/tasksflow/sync-users/route.ts`
- Updated integration UI copy/toasts to describe auto-creation of missing employees:
  - `src/app/(dashboard)/settings/integrations/tasksflow/tasksflow-settings-client.tsx`

### TasksFlow changes

- Allowed `POST /api/users` with API key scoping to the key company:
  - `server/routes.ts`
- Added regression test:
  - `tests/api-user-provision.test.ts`

## Acceptance Criteria

- `AC1` PASS — `sync-users` now provisions missing remote employees through `TasksFlow /api/users` and stores `tasksflowUserId`.
- `AC2` PASS — existing remote users are reused by normalized phone; manual links are skipped.
- `AC3` PASS — WeSetup integration API routes now use `requireAuth + getActiveOrgId + root-aware access checks` for read/sync flows.
- `AC4` PASS — cleaning sync still targets `tasksflowUserId`, and employee sync now guarantees that id exists after provisioning.
- `AC5` PASS — pull-side completion sync code path was left intact and verified by successful builds/tests around the unchanged adapter/dispatcher path.
- `AC6` PASS — TasksFlow integration page copy and sync toast now explain creation + linking instead of phone-only matching.

## Verification

### WeSetup

- `node --import tsx --test src/lib/tasksflow-user-sync.test.ts src/lib/role-access.test.ts`
  - PASS
- `npx eslint "src/lib/tasksflow-user-sync.ts" "src/lib/tasksflow-user-sync.test.ts" "src/lib/tasksflow-client.ts" "src/app/api/integrations/tasksflow/sync-users/route.ts" "src/app/api/integrations/tasksflow/route.ts" "src/app/api/integrations/tasksflow/links/route.ts" "src/app/api/integrations/tasksflow/sync-tasks/route.ts" "src/app/(dashboard)/settings/integrations/tasksflow/tasksflow-settings-client.tsx"`
  - PASS
- `npx tsc --noEmit --pretty false`
  - PASS
- `npm run build`
  - PASS

### TasksFlow

- `npm test -- api-user-provision.test.ts api-keys.test.ts wesetup-journal-mode.test.ts`
  - PASS
- `npm run check`
  - PASS
- `npm run build`
  - PASS

## Notes

- `TasksFlow` build still emits existing bundler warnings about `import.meta` in `vite.config.ts`; build succeeds and this task did not touch that area.
- No push was performed.
