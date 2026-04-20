# Task Spec

- Task ID: `telegram-phase1-obligations-task5`
- Source plan: `docs/superpowers/plans/2026-04-20-telegram-bot-phase1-obligations.md`
- Scope: Task 5 only

## Goal

Add a role-aware Telegram `/start` home loader that keeps linked staff focused on the next open obligation, keeps managers/root on summary mode, and uses one request-scoped timestamp across sync/read calls.

## Files In Scope

- `src/lib/bot/start-home.ts`
- `src/lib/bot/start-home.test.ts`

## Acceptance Criteria

- AC1: `loadTelegramStartHome(...)` returns `{ kind: "unlinked" }` for chats without an active linked user.
- AC2: Staff users reuse existing obligation helpers, sync their obligations, load open obligations for the same request timestamp, expose `nextAction`, and build the deep link with `buildMiniObligationEntryUrl(...)`.
- AC3: Manager/root users reuse `hasFullWorkspaceAccess`, sync organization obligations, load manager summary for the same request timestamp, and expose the mini app button URL.
- AC4: Required verification passes:
  - `node --import tsx --test src/lib/bot/start-home.test.ts`
  - `npx tsc --noEmit --pretty false`

## Constraints

- Keep the diff tightly scoped to the two owned source files.
- Do not fork role logic; reuse existing access helpers.
- Do not modify `start-response.ts` or `handlers/start.ts`.
- Preserve the Task 4 UTC-midnight fix pattern by creating one request-scoped `Date` inside `loadTelegramStartHome(...)`.
