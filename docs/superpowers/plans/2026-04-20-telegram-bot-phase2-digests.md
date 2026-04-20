# Telegram Bot Phase 2 Digests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship obligation-based staff and manager morning digests with rerun-safe dedupe backed by structured Telegram delivery metadata.

**Architecture:** This phase builds on the phase-1 obligation model. It enriches `TelegramLog` with structured keys, adds a small delivery-policy layer on top of existing Telegram send helpers, and rewrites the existing `mini-digest` cron route to use obligation sync/query helpers instead of missing-entry heuristics. No new delivery table is introduced.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, grammy, node:test with `tsx`

---

## File Structure

**Create:**

- `src/lib/telegram-delivery-policy.ts`
- `src/lib/telegram-delivery-policy.test.ts`
- `src/lib/telegram-obligation-digests.ts`
- `src/lib/telegram-obligation-digests.test.ts`

**Modify:**

- `prisma/schema.prisma`
- `src/lib/telegram.ts`
- `src/app/api/cron/mini-digest/route.ts`

**Verification commands:**

- `node --import tsx --test src/lib/telegram-delivery-policy.test.ts src/lib/telegram-obligation-digests.test.ts src/lib/journal-obligations.test.ts src/lib/bot/start-home.test.ts src/lib/bot/start-response.test.ts`
- `npm run lint -- src/lib/telegram-delivery-policy.ts src/lib/telegram-delivery-policy.test.ts src/lib/telegram-obligation-digests.ts src/lib/telegram-obligation-digests.test.ts src/lib/telegram.ts src/app/api/cron/mini-digest/route.ts`
- `npx tsc --noEmit --pretty false`
- `npm run build`

## Task Split

### Task 1: Add structured Telegram delivery metadata and policy helper

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/telegram-delivery-policy.ts`
- Test: `src/lib/telegram-delivery-policy.test.ts`
- Modify: `src/lib/telegram.ts`

Deliver:
- structured optional fields on `TelegramLog` for `kind` and `dedupeKey`
- helper to detect whether a delivery should be skipped on rerun
- backward-compatible extension of Telegram send helpers so callers can pass delivery metadata

Commit:
- `feat(telegram-bot): add telegram delivery policy`

### Task 2: Add obligation-based digest builders

**Files:**
- Create: `src/lib/telegram-obligation-digests.ts`
- Test: `src/lib/telegram-obligation-digests.test.ts`

Deliver:
- employee digest payload from open obligations
- manager digest payload from obligation summary
- deterministic dedupe keys for daily digests

Commit:
- `feat(telegram-bot): add obligation digest builders`

### Task 3: Rewrite `mini-digest` cron to use obligations and dedupe

**Files:**
- Modify: `src/app/api/cron/mini-digest/route.ts`
- Modify: `src/lib/telegram.ts`

Deliver:
- sync obligations before sending
- send staff digests from `JournalObligation`
- send manager/root digests per organization
- skip duplicates on reruns via structured `TelegramLog` metadata

Commit:
- `feat(telegram-bot): back mini digests with obligations`

### Task 4: Verify and record evidence

**Files:**
- Create/modify: `.agent/tasks/telegram-bot-phase2-digests-2026-04-20/evidence.md`
- Create/modify: `.agent/tasks/telegram-bot-phase2-digests-2026-04-20/evidence.json`
- Create if needed: `.agent/tasks/telegram-bot-phase2-digests-2026-04-20/problems.md`

Deliver:
- fresh command output
- AC verdicts

Commit:
- `docs(telegram-bot): record phase2 digest evidence`
