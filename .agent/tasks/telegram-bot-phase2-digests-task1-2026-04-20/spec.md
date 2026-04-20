# Task Spec: Telegram Bot Phase 2 Digests Task 1

Task ID: `telegram-bot-phase2-digests-task1-2026-04-20`
Date: 2026-04-20
Status: Frozen for implementation

## Scope

Implement Task 1 from `docs/superpowers/plans/2026-04-20-telegram-bot-phase2-digests.md`:

- extend `TelegramLog` with structured delivery metadata for digest dedupe
- add indexes for recent-send lookups by user/kind/key
- add a reusable rerun-safe delivery policy helper backed by `TelegramLog`
- extend existing Telegram send helpers so callers can pass metadata and optionally apply the dedupe policy

## Constraints

- Stay scoped to the owned source files:
  - `prisma/schema.prisma`
  - `src/lib/telegram-delivery-policy.ts`
  - `src/lib/telegram-delivery-policy.test.ts`
  - `src/lib/telegram.ts`
- Do not introduce a new delivery table.
- Keep helper APIs backward-compatible for existing callers.
- Do not redesign unrelated Telegram sending behavior.

## Acceptance Criteria

### AC1
`TelegramLog` has optional structured metadata fields for delivery dedupe, including `kind` and `dedupeKey`, plus indexes that support recent lookup by user/kind/key.

### AC2
`src/lib/telegram-delivery-policy.ts` exposes a small helper that answers whether a send should be skipped on rerun by querying `TelegramLog` data.

### AC3
`src/lib/telegram.ts` accepts structured delivery metadata in existing send helpers without breaking current call sites.

### AC4
Existing send helpers can optionally invoke the delivery-policy helper to skip duplicate rerun sends while preserving current behavior by default.

### AC5
Fresh verification passes:

- `node --import tsx --test src/lib/telegram-delivery-policy.test.ts`
- `npx tsc --noEmit --pretty false`
