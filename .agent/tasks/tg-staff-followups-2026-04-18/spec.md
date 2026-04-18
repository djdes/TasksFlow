# Telegram Staff Follow-Ups

## Summary

Fix the follow-up issues in Telegram staff management and the Mini App mobile
experience:

- `Перепривязать TG` must never spam multiple Telegram messages for one manager
  action
- invite generation for unlinked employees must stay stable in the modal
  instead of flickering/disappearing after refreshes
- linked employees need a manager-side `Отвязать TG` action in
  `/settings/users`
- Mini App journal screens must be more usable on a phone

This task extends the existing Telegram invite flow implemented for
`/settings/users` and keeps the current Telegram `/start inv_<token>` binding
model.

## Root Causes Observed

- The current `StaffTelegramInviteDialog` issues the invite inside `useEffect`
  and then calls `onIssued()`, which triggers a `router.refresh()` from the
  parent. That creates unstable re-render behavior around the same open dialog
  and can re-fire the same issue flow.
- Rebind DM delivery has no server-side dedupe guard, so repeated requests can
  produce repeated Telegram messages.
- Telegram unlink exists only for the employee-facing Mini App profile, not for
  managers on `/settings/users`.
- Mini App journal detail/new-entry screens reuse desktop-ish spacing and
  component layout, which feels cramped and inconsistent on narrow mobile
  screens.

## Constraints

- Keep the existing Telegram onboarding architecture.
- Do not add new database tables unless absolutely required.
- Keep manager TG actions on `/settings/users`.
- Manager-side unlink must only clear `User.telegramChatId`; it must not remove
  historical site data.
- Mini App fixes should stay focused on journal mobile usability, not a full
  redesign of the whole Mini App.

## Acceptance Criteria

### AC1. Rebind sends at most one Telegram message

For one manager action on `Перепривязать TG`:

- the backend may issue/reissue one fresh invite token
- the employee receives at most one direct Telegram message for that action
- duplicate UI rerenders or modal reopen side-effects do not produce multiple
  Telegram DMs
- closing or not closing the success modal does not create extra Telegram DMs

### AC2. Invite modal for unlinked employees is stable

For `Пригласить в TG` on an unlinked employee:

- the invite is issued once per explicit user action
- the success state remains visible in the modal
- QR code and link do not disappear because of parent refresh/re-render
- the employee still gets the in-app site notification with the deep link

### AC3. Manager can unlink employee Telegram from staff settings

For a linked employee on `/settings/users`:

- the UI shows `Отвязать TG`
- invoking it clears `User.telegramChatId`
- the staff UI immediately switches to the unlinked state:
  `Пригласить в TG` instead of `Открыть TG` / `Перепривязать`
- existing site data remains intact

### AC4. Existing Telegram invite/bind flow is preserved

- the helper still issues `BotInviteToken`
- `/start inv_<token>` remains the binding path
- unlink + re-invite continues to work for the same employee without data loss

### AC5. Mini App journal screens are adaptive on phones

For `/mini/journals/[code]` and `/mini/journals/[code]/new`:

- header, cards, and actions fit well on narrow screens
- long titles/descriptions wrap more gracefully
- document-based and entry-based journal lists feel consistent
- the create-entry form layout is easier to use on a phone

## Chosen Defaults

- Client-side invite dialogs should issue requests from explicit click handlers
  or guarded one-shot state, not from unstable effect loops tied to parent
  refreshes.
- Server-side rebind DM delivery should be idempotent within a short safety
  window using existing `TelegramLog` evidence instead of introducing a new
  table.
- Manager-side unlink uses a dedicated staff API route rather than reusing the
  Mini App self-service unlink endpoint.

## Out of Scope

- Rebuilding the Telegram bot flow
- Reworking all Mini App screens
- Adding a background jobs system for Telegram delivery
