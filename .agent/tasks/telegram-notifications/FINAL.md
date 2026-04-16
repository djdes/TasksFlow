# telegram-notifications — FINAL

## Summary

Built on top of the existing grammy-based Telegram stack. The webhook, deep-link, link tokens, and UI connect button were already live; this phase added the audit log, retry semantics, logs admin view, and a first notification trigger (journal ACL grant).

## Commit index

| # | SHA | Scope | What |
|---|-----|-------|------|
| 1 | (see auth FINAL) | prisma | TelegramLog model, indexed by userId, createdAt |
| 2 | `69e32a2` | telegram | sendTelegramMessage logs every attempt + retries 429 (3 attempts, cap 30s) |
| 3 | `f35648a` | telegram | ACL grant trigger — Telegram ping on newly granted journals |
| 4 | `efeeb54` | root | /root/telegram-logs admin view (200 latest, all orgs) |

## Acceptance criteria (spec.md)

| AC | Status |
|----|--------|
| AC1 TelegramLog table | PASS (shared Prisma commit with auth task) |
| AC2 Retry on 429 | PASS — `extractRetryAfterSeconds`, 30s cap, 3 attempts, terminal status `rate_limited` |
| AC3 Invite → TG link flow | **PARTIAL** — invite+set-password works (auth task); post-setup redirect to `/settings/notifications` with a TG connect banner is **not yet added**. Users still have to navigate there manually |
| AC4 Notification triggers | PARTIAL — T1 (ACL grant) done. T2 (daily compliance digest) already existed and keeps working. T3 (journal-close notify owner) **not implemented** |
| AC5 Admin logs view | PARTIAL — `/root/telegram-logs` done. Org-scoped `/settings/notifications/logs` **not implemented** |
| AC6 /settings/profile TG connect | **DEFERRED** — existing `/settings/notifications` page already exposes the deep-link button; did not duplicate. Consider renaming rather than building a parallel page |
| AC7 Env hygiene | PASS — `.env.example` updated with all TG-related vars + retention knob |

## Out-of-scope this session

- `/settings/notifications/logs` (org-scoped) — mirror of /root/telegram-logs filtered by organizationId
- Journal close → notify owner (T3)
- Nightly cron to delete TelegramLog rows older than `TELEGRAM_LOG_RETENTION_DAYS`
- /welcome page with TG-connect CTA after invite acceptance
- /root/telegram-logs filters and resend button

## Manual verification

- [ ] Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_TOKEN_SECRET` on prod
- [ ] Existing `/settings/notifications` deep-link still works → `/start <token>` webhook sets `telegramChatId`
- [ ] Manager grants a new journal in `/settings/users/<id>/access` → target employee's chat receives a message listing the newly granted names
- [ ] Force a 429 (mass-send test bot with burst) → row ends as `rate_limited` with attempts=3
- [ ] Root logs in → `/root/telegram-logs` shows the above send with status + timestamp
