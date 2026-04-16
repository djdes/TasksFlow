# Task: Telegram notifications — harden + extend

**Status:** frozen
**Owner:** djdes
**Target branch:** master
**Depends on:** `.agent/tasks/auth-three-tier/` (InviteToken, UserJournalAccess)

## Goal

Build on the existing grammy-based Telegram stack by adding an audit log, retry semantics, a logs admin view, invite-driven onboarding, and ACL-grant notifications.

## Current state (do NOT rebuild)

- `src/lib/telegram.ts` — real `sendTelegramMessage` via grammy, `notifyOrganization`, link tokens (HMAC, 15-min TTL). ✅
- Webhook `src/app/api/notifications/telegram/route.ts` — handles `/start <token>` and `/stop`. ✅
- UI `src/app/(dashboard)/settings/notifications/page.tsx` — deep-link button, prefs. ✅
- Crons `src/app/api/cron/compliance/route.ts`, `.../expiry/route.ts`. ✅
- `User.telegramChatId` + `User.notificationPrefs` in schema. ✅

## Non-goals

- New messaging channels (SMS, push) — no
- Telegram login (NextAuth provider) — no; keep email/password login
- Forwarding to group chats — no; 1:1 only

## Acceptance criteria

**AC1 — TelegramLog table:**
- `TelegramLog { id, userId?, chatId, body, status ("queued"|"sent"|"failed"|"rate_limited"), error?, sentAt, createdAt }`
- `@@index([userId, createdAt])`
- Inserted by every call to `sendTelegramMessage`
- Retention: nightly cron deletes rows older than 30 days

**AC2 — Retry semantics:**
- On Telegram API `HTTP 429` with `retry_after`, wait `retry_after` seconds (capped at 30s) and retry up to 3 attempts
- On other errors, single attempt, write `status = "failed"` with error
- Never block the calling request longer than 60s total; overflow → status `"rate_limited"`, returned to caller as "queued for retry"

**AC3 — Invite → set-password → link Telegram flow (integration with Task 1 AC7):**
- Owner creates employee in `/settings/users` → email with `/invite/[token]`
- Employee sets password on `/invite/[token]` → auto-signed-in → lands on `/welcome` with banner "Подключите Telegram"
- Welcome page has deep-link button → `/settings/notifications` link flow → `chat_id` captured

**AC4 — Notification triggers:**
- **T1** (new): granting `UserJournalAccess` via `/settings/users/[id]/access` → send "Вам назначен журнал: <name>" to that user's Telegram (if linked) + write `TelegramLog`
- **T2** (existing): daily cron compliance digest — already works; verify via new logs view
- **T3** (new): when journal document is closed (`/api/journal-documents/[id] PATCH { status: "closed" }`) by manager, notify the owner (if linked) — "Журнал <name> закрыт <user>"
- Respect `User.notificationPrefs.assignments` / `.closes` — default `true`

**AC5 — Admin logs view:**
- `/settings/notifications/logs` — org-scoped log of last 200 outgoing messages, filter by status
- `/root/telegram-logs` — global view for root only (all orgs)
- Columns: time, user, chat id, body (truncated), status, error, resend action

**AC6 — `/settings/profile` TG connect UI:**
- New page `/settings/profile` with user info + explicit "Подключить Telegram" section
- Status badge: "Подключено к @username" (fetch display name via `getChat`) or "Не подключено"
- "Отключить" button — clears `telegramChatId`, writes AuditLog

**AC7 — Env hygiene:**
- `.env.example` documents: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_TOKEN_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LOG_RETENTION_DAYS=30`

## Test plan

- Unit: retry logic on mocked 429, log status transitions, notification pref filter
- Integration: invite → set-password → TG link → access grant → message arrives (manual on staging bot)
- Prod: dedicated test bot for staging; production bot behind same token

## Deliverables

- 7-9 commits (Phase 7 in master plan)
- `FINAL.md` with commit index + manual test log
- Staging test bot credentials saved to server `.env` only (not repo)
