# Task Spec: Telegram Bot Phase 2 Digests

Task ID: `telegram-bot-phase2-digests-2026-04-20`
Date: 2026-04-20
Status: Frozen for implementation

## Scope

Implement the next Telegram bot slice after phase 1:

- obligation-based morning digests for staff
- obligation-based morning digests for managers
- structured dedupe metadata in `TelegramLog`
- rerun-safe delivery policy for digest sends

This phase intentionally does **not** include:

- document-row-level obligations
- employee completion confirmation messages
- pre-deadline or repeated reminder schedules

## Problem Statement

Phase 1 gave Telegram exact task entrypoints and obligation-aware `/start`, but scheduled delivery is still weak:

- `mini-digest` still guesses from missing entries instead of using `JournalObligation`
- managers do not get an obligation-backed daily digest
- `TelegramLog` lacks structured metadata for clean rerun dedupe

If cron reruns, the system cannot reliably tell whether a digest for the same user/day already went out without parsing message text like a proper кожаный ritual.

## Constraints

- Reuse the phase-1 obligation model and access logic.
- Keep all Telegram DM copy plain text or existing safe HTML paths.
- Avoid introducing a new delivery ledger table; enrich `TelegramLog` instead.
- Keep rollout backward-compatible with existing Telegram sending helpers.
- Stay inside the current worktree and do not push.

## Acceptance Criteria

### AC1
`TelegramLog` stores structured delivery metadata sufficient to dedupe daily digest sends by user, organization, kind, and logical key.

### AC2
There is a reusable Telegram delivery-policy helper that can skip duplicate sends for the same digest key on reruns.

### AC3
`POST /api/cron/mini-digest` syncs obligations first and sends employee morning digests from `JournalObligation`, including a direct CTA to the next exact action when one exists.

### AC4
`POST /api/cron/mini-digest` also sends a manager/root morning digest per organization using obligation summary data and does not spam duplicates on reruns.

### AC5
Fresh tests, targeted lint, `tsc`, and build pass against the phase-2 implementation.

## Technical Direction

- Extend `TelegramLog` with structured digest metadata instead of adding another table.
- Add a small delivery-policy layer near Telegram sending helpers.
- Add a digest builder/service that reuses `syncDailyJournalObligationsForUser`, `syncDailyJournalObligationsForOrganization`, `listOpenJournalObligationsForUser`, and `getManagerObligationSummary`.
- Replace the heuristic `mini-digest` worker loop with obligation-backed staff and manager loops.

## Verification Target

Implementation is complete only when every AC above is backed by fresh evidence in this task directory.
