# Evidence

## Commands

- Command: `node --import tsx --test src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts`
  - Result: `PASS` (`29/29`)
  - Raw: `raw/tests.txt`
- Command: `npm run lint -- src/lib/journal-obligation-links.ts src/lib/journal-obligation-links.test.ts src/lib/journal-obligations.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts src/lib/bot/handlers/start.ts src/app/api/mini/home/route.ts src/app/mini/page.tsx src/app/mini/o/[id]/page.tsx`
  - Result: `PASS`
  - Raw: `raw/lint.txt`
- Command: `npx tsc --noEmit --pretty false`
  - Result: `PASS`
  - Raw: `raw/tsc.txt`
- Command: `npm run build`
  - Result: `PASS`
  - Note: rerun via `cmd /c` so PowerShell would not treat Next.js warning output as a hard failure
  - Raw: `raw/build.txt`

## Phase 1 Scope

This evidence covers the approved phase 1 plan in `docs/superpowers/plans/2026-04-20-telegram-bot-phase1-obligations.md`, not the full multi-phase Telegram roadmap.

## AC Status

- AC1: `PASS` — first-class `JournalObligation` model and sync/query helpers added
- AC2: `PASS` — linked employee `/start` now resolves to a next-action-aware home via `loadTelegramStartHome(...)`
- AC3: `PASS` — linked manager/root `/start` now resolves to a summary-aware home
- AC4: `PASS` — Telegram staff CTA deep-links through `/mini/o/[id]` to the nearest exact target
- AC5: `DEFERRED` — reminder dedupe/cooldown policy is intentionally out of phase 1 scope
- AC6: `PASS` — Mini App home now consumes obligations instead of only missing-entry heuristics
- AC7: `PASS` — Telegram and Mini App decisions reuse existing role-access helpers
- AC8: `PASS` — invite, bind, sign-in, and open-app flows remain backward-compatible

## Notes

- Task 4 required one post-review fix: `GET /api/mini/home` now uses a single request-scoped timestamp to avoid UTC-midnight mismatches between sync and follow-up reads.
- Task 6 reuses `loadTelegramStartHome(...)` in both empty `/start` and post-bind flows so the bot does not fork role logic.
- Final review found and cleared two phase-1 integration defects: exact-target Mini App bootstrap on fresh `/start` opens, and `isActive` drift between mini-home reads and obligation sync.
- Live E2E through a real Telegram WebView was not run in this workspace; locally proven scope is tests, lint, `tsc`, build, and final code review.
