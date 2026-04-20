# Task Spec

- Task ID: `telegram-bot-phase2-digests-task2-2026-04-20`
- Source plan: `docs/superpowers/plans/2026-04-20-telegram-bot-phase2-digests.md`
- Scope: Task 2 only

## Goal

Add pure obligation-digest builders for Telegram morning digests so the cron route can compose staff and manager/root messages from plain obligation inputs without reading the database inside the builders or the tests.

## Files In Scope

- `src/lib/telegram-obligation-digests.ts`
- `src/lib/telegram-obligation-digests.test.ts`

## Acceptance Criteria

- AC1: Staff digest builder accepts plain open-obligation inputs plus URLs and returns `null` when there is nothing to send.
- AC2: Non-empty staff digests include:
  - message body text
  - deterministic daily dedupe key scoped to user/day
  - primary CTA with label/url and semantic kind for the next exact action when available
- AC3: Manager/root digest builder accepts plain summary inputs plus cabinet URL and returns:
  - summary body text
  - deterministic daily dedupe key scoped to organization/day
  - primary CTA pointing at the cabinet / mini app landing
- AC4: Builders stay deterministic for a provided `now` value and avoid direct DB access.
- AC5: Required verification passes:
  - `node --import tsx --test src/lib/telegram-obligation-digests.test.ts`
  - `npx tsc --noEmit --pretty false`

## Constraints

- Keep the diff tightly scoped to the two owned files.
- Reuse existing obligation/deep-link helpers instead of inventing route math twice.
- Keep returned payloads simple for the cron route to consume later.
