# Task Spec: deploy-fix-2026-04-11

## Metadata
- Task ID: deploy-fix-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Original task statement
Autodeploy failed after the previous push. Fix the deployment failure and push the repair.

## Current findings
- CI log shows build failure in `src/app/(dashboard)/journals/[code]/page.tsx`.
- The missing import is `@/components/journals/incoming-control-documents-client`.
- The same file also imports acceptance helpers/consts that exist locally in `src/lib/acceptance-document.ts`, but those local edits were not included in the previous pushed commit.
- The current working tree contains:
  - modified `src/lib/acceptance-document.ts`
  - modified `src/components/journals/acceptance-document-client.tsx`
  - untracked `src/components/journals/incoming-control-documents-client.tsx`
- These files are directly related to the failing imports from CI.

## Acceptance criteria
- AC1: The deploy-breaking imports in `src/app/(dashboard)/journals/[code]/page.tsx` resolve successfully in the repository state that is pushed.
- AC2: `npx tsc --noEmit` passes on the current repository state including the deploy fix.
- AC3: A production build command used by the app (`npm run build`) passes locally or, if it fails for an unrelated reason, the unrelated blocker is documented with evidence.
- AC4: Proof-loop evidence files are created for this deploy fix task.
- AC5: The fix is committed and pushed to `master`.

## Constraints
- Do not revert unrelated dirty files in the worktree.
- Only stage and commit the files required to fix the deploy failure plus proof-loop artifacts.

## Verification plan
- `npx tsc --noEmit`
- `npm run build`
- `git push origin master`
