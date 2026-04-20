# Evidence

- Task ID: `telegram-phase1-obligations-final-review`
- Branch: `feature/telegram-phase1-obligations`
- Scope: fix the two final-review findings around Mini App exact-target auth bootstrap and active-template drift in Mini home.

## Acceptance Criteria

- AC1: `PASS`
  Unauthenticated `/mini/o/[id]` now redirects through `/mini?next=...` using a validated internal Mini App path, and `/mini` consumes that sanitized `next` target after Telegram sign-in instead of dropping staff onto generic home.
- AC2: `PASS`
  `/api/mini/home` now queries only `journalTemplate.isActive = true`, aligning Mini home cards with the active-template set used by journal obligation sync/read helpers.

## Changed Files

- `src/lib/journal-obligation-links.ts`
- `src/lib/journal-obligation-links.test.ts`
- `src/app/mini/o/[id]/page.tsx`
- `src/app/mini/page.tsx`
- `src/app/api/mini/home/route.ts`

## Verification

- `PASS` `node --import tsx --test src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts`
  Raw: `.agent/tasks/telegram-phase1-obligations-final-review/raw/tests.txt`
- `PASS` `npm run lint -- src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/app/api/mini/home/route.ts src/app/mini/page.tsx src/app/mini/o/[id]/page.tsx`
  Raw: `.agent/tasks/telegram-phase1-obligations-final-review/raw/lint.txt`
- `PASS` `npx tsc --noEmit --pretty false`
  Raw: `.agent/tasks/telegram-phase1-obligations-final-review/raw/tsc.txt`
- `PASS` `npm run build`
  Raw: `.agent/tasks/telegram-phase1-obligations-final-review/raw/build.txt`

## Notes

- Added a regression test for the auth-bootstrap redirect helper before implementing the redirect-preservation fix.
- `npm run build` still emits the existing non-blocking Next.js warnings about multiple lockfiles and deprecated `middleware` naming; the build exits successfully.
