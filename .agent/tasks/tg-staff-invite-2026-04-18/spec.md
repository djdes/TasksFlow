# Telegram Invite From Staff Settings

## Summary

Add a Telegram invite flow to `/settings/users` for existing staff members.
Managers should be able to issue a Telegram invite from the staff page, the
employee should receive the invite link inside in-app site notifications, and
opening the Telegram link should bind the employee's Telegram account through
the existing `/start inv_<token>` bot flow.

This task intentionally reuses the existing Telegram stack already present in
the repository:

- `BotInviteToken`
- `POST /api/staff/[id]/invite-tg`
- `src/lib/bot/handlers/start.ts`
- `User.telegramChatId`
- Telegram Mini App sign-in via `CredentialsProvider({ id: "telegram" })`

## Constraints

- Do not replace the existing Telegram onboarding model.
- Do not add new database tables unless absolutely required.
- Keep `/settings/users` as the main manager UX surface.
- Preserve the current "manager sees invite URL / QR immediately" flow as the
  second delivery option.
- For already-linked employees, use the existing binding until a newly issued
  invite is consumed. Reissue must not null out `telegramChatId`.

## Acceptance Criteria

### AC1. Existing employee invite from staff settings

For an existing employee row on `/settings/users`:

- if `telegramChatId` is absent, the UI shows `Пригласить в TG`
- clicking it issues or reissues a `BotInviteToken`
- the server creates an in-app notification for that employee with a direct
  Telegram deep link (`https://t.me/<bot>?start=inv_...`)
- the manager sees a success UI with the same deep link and QR code for manual
  handoff

### AC2. Linked employee actions

For an employee with `telegramChatId` present:

- the UI shows primary `Открыть TG`
- the UI shows secondary `Перепривязать`
- `Перепривязать` reissues the invite token, creates/refreshes the in-app
  notification for the employee, and also sends a direct Telegram message to
  the already linked chat with the fresh deep link

### AC3. Notification UX

The employee's in-app notification:

- appears in the standard bell panel
- is deduplicated per employee invite flow rather than piling up duplicates
- contains a clickable link that opens Telegram directly
- remains compatible with the existing notification list rendering

### AC4. Existing bot binding flow still works

Consuming the invite through Telegram:

- continues to use the existing `/start inv_<token>` handler
- binds `User.telegramChatId`
- activates the employee account if required by the existing handler
- does not regress current Mini App sign-in behavior

### AC5. Access control and error handling

- non-managers cannot issue staff Telegram invites
- managers cannot issue invites across organizations
- archived staff cannot be invited
- missing Telegram configuration returns a clear API/UI error

## Chosen Defaults

- Notification delivery to the employee is always attempted.
- Manager handoff via URL/QR stays available for every successful issue/reissue.
- `Открыть TG` for already linked employees opens the bot chat URL derived from
  `TELEGRAM_BOT_USERNAME`, while `Перепривязать` is the action that creates a
  fresh employee-specific deep link.
- Reissue notifications are deduped by employee id so the employee sees the
  latest active invite instead of a pile of stale ones.

## Out of Scope

- Reworking the whole `/settings/users` page architecture
- Adding Telegram login to the full web dashboard sign-in page
- New Telegram bot commands beyond the existing `/start inv_<token>` flow
