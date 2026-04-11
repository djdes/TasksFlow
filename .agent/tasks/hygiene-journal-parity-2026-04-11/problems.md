# Problems

## Current blockers

1. `npm run build` now reaches `Running TypeScript ...`, but in this environment it does not complete within extended waits even after raising Node heap size.
2. Local runtime validation against the real DB is blocked because `DATABASE_URL` points to host `base`, which is unreachable from this environment.

## Why push/deploy was not executed

- A push would be irresponsible while the repository is not in a verifiable green build state.
- The requested auto-deploy check depends on a successful push, which depends on the repo-level build blocker being resolved first.

## Small safe fixes already applied while investigating

- fixed hygiene-specific route wiring for toolbar/print actions
- aligned hygiene PDF roster generation with the screen roster
- fixed one stray scope bug in `equipment-cleaning-document-client.tsx`
- replaced invalid JSX in `med-book-document-client.tsx` with a valid working client version
- fixed remaining TypeScript blockers in `entries/route.ts` and `cleaning-ventilation-checklist-document.ts`
