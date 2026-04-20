# Evidence

- Command: `node --import tsx --test src/lib/bot/start-home.test.ts`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-phase1-obligations-task5/raw/start-home.test.txt`
- Command: `npx tsc --noEmit --pretty false`
  - Result: PASS
  - Raw: `.agent/tasks/telegram-phase1-obligations-task5/raw/tsc.txt`

## Acceptance Criteria

- AC1: PASS - `loadTelegramStartHome(...)` returns `{ kind: "unlinked" }` for chats without a linked user.
- AC2: PASS - staff flow syncs obligations, reads open obligations with the same request-scoped timestamp, exposes `nextAction`, and builds the Telegram deep link via `buildMiniObligationEntryUrl(...)`.
- AC3: PASS - manager flow reuses `hasFullWorkspaceAccess`, syncs org obligations, reads summary with the same request-scoped timestamp, and returns the mini app button URL.
- AC4: PASS - required `start-home` test and full `tsc` verification both passed.
