# Problems

## Current blockers

1. `npm run build` is currently blocked by an active Next lock at `.next/lock`.
2. `npx tsc --noEmit --pretty false` still fails in `src/components/journals/med-book-document-client.tsx` because several local helper/dialog components are referenced but not defined in that file.
3. Local runtime validation against the real DB is blocked because `DATABASE_URL` points to host `base`, which is unreachable from this environment.

## Why push/deploy was not executed

- A push would be irresponsible while the repository is not in a verifiable green build state.
- The requested auto-deploy check depends on a successful push, which depends on the repo-level build blocker being resolved first.

## Small safe fixes already applied while investigating

- fixed hygiene-specific route wiring for toolbar/print actions
- aligned hygiene PDF roster generation with the screen roster
- fixed one stray scope bug in `equipment-cleaning-document-client.tsx`
- fixed hygiene-adjacent compile issues in page wiring / PDF typing so the remaining TypeScript failures are narrowed to the med-book file
