# Evidence

## Acceptance Criteria

- AC1: PASS
  - `src/lib/bot/handlers/start.ts` now resolves plain `/start` through `User.telegramChatId` and replies with the shared CTA for linked users instead of the legacy invite-only text.
- AC2: PASS
  - `src/lib/bot/handlers/start.ts` routes successful `inv_<token>` binding into the same `replyWithLinkedStart(...)` helper used by plain `/start`.
- AC3: PASS
  - `src/lib/bot/start-response.ts` defines the short unlinked guidance text, and `src/lib/bot/handlers/start.ts` uses it for unlinked chats.
- AC4: PASS
  - `src/lib/bot/start-response.ts` exports `TELEGRAM_COMMANDS`, and `src/lib/bot/bot-app.ts` registers them once via `bot.api.setMyCommands(...)` after init.

## Verification

- `node --import tsx --test src/lib/bot/start-response.test.ts`
  - PASS
  - Raw log: `.agent/tasks/tg-start-unify-2026-04-18/raw/test-start-response.txt`
- `npm run lint -- src/lib/bot/handlers/start.ts src/lib/bot/bot-app.ts src/lib/bot/start-response.ts src/lib/bot/start-response.test.ts`
  - PASS
  - Raw log: `.agent/tasks/tg-start-unify-2026-04-18/raw/lint-start.txt`
- `npx tsc --noEmit --pretty false`
  - PASS
  - Raw log: `.agent/tasks/tg-start-unify-2026-04-18/raw/tsc.txt`
- `npm run build`
  - PASS
  - Raw log: `.agent/tasks/tg-start-unify-2026-04-18/raw/build.txt`
  - Note: build still prints the pre-existing Next.js warning about `middleware` -> `proxy`; build succeeds.
