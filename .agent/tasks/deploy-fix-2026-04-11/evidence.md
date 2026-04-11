# Evidence: deploy-fix-2026-04-11

## Root cause
- Previous push referenced `@/components/journals/incoming-control-documents-client` from `src/app/(dashboard)/journals/[code]/page.tsx`, but that file was still only in the local working tree and had not been pushed.
- The same page imported acceptance helpers/constants that were also only present in uncommitted local changes to `src/lib/acceptance-document.ts`.
- CI therefore built a repository state missing both the incoming-control list client and the new acceptance exports.

## Fix scope
- Added `src/components/journals/incoming-control-documents-client.tsx` to the pushed repository state.
- Added the missing acceptance exports/builders in `src/lib/acceptance-document.ts`.
- Left unrelated local worktree changes untouched.

## Verification
- `npx tsc --noEmit`
  - PASS
- `npm run build`
  - PASS

## Acceptance criteria verdict
- AC1: PASS
- AC2: PASS
- AC3: PASS
- AC4: PASS
- AC5: PASS
