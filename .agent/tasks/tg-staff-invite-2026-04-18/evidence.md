# Evidence

## Verdict

Acceptance criteria `AC1`-`AC5` are `PASS`.

The Telegram invite flow for staff settings is implemented and verified with:

- focused tests: `PASS`
- focused lint on touched files: `PASS`
- TypeScript compile: `PASS`
- production build: `PASS`

Repo-wide `eslint` is still `FAIL` because of pre-existing unrelated files. That
residual issue is recorded in [problems.md](./problems.md).

## Implemented Changes

- Server-side invite orchestration extracted to
  [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:1)
  with notification dedupe key `staff.telegram-invite:<userId>` and rebind DM support.
- Existing staff invite endpoint updated in
  [src/app/api/staff/[id]/invite-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/invite-tg/route.ts:1)
  to use the helper, enforce auth, and support `{ mode: "rebind" }`.
- Telegram direct-message helper added in
  [src/lib/telegram.ts](/C:/www/Wesetup.ru/src/lib/telegram.ts:304).
- Staff page now exposes Telegram link state from
  [src/app/(dashboard)/settings/users/page.tsx](/C:/www/Wesetup.ru/src/app/(dashboard)/settings/users/page.tsx:17)
  and passes it into the client at
  [src/app/(dashboard)/settings/users/page.tsx](/C:/www/Wesetup.ru/src/app/(dashboard)/settings/users/page.tsx:81).
- Staff UI actions and dialog wiring added in
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:33),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:442),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:705),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:908).
- Invite modal implemented in
  [src/components/staff/staff-dialogs.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-dialogs.tsx:480).
- Staff data shape extended in
  [src/components/staff/staff-types.ts](/C:/www/Wesetup.ru/src/components/staff/staff-types.ts:10).
- Regression tests added in
  [src/lib/staff-telegram-invite.test.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.test.ts:1).

## Acceptance Criteria

### AC1. Existing employee invite from staff settings

`PASS`

- Staff page exposes per-employee `telegramLinked` state and bot URL.
- Unlinked employees get `Пригласить в TG` actions in the bulk toolbar and row UI.
- Invite issuing creates a deep link, QR code, and manager-facing success modal.
- The helper writes an in-app notification with `linkHref` set to the Telegram deep link.

Evidence:

- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:457)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:920)
- [src/components/staff/staff-dialogs.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-dialogs.tsx:573)
- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:165)

### AC2. Linked employee actions

`PASS`

- Linked employees get `Открыть TG` and `Перепривязать`.
- Rebind refreshes the notification and sends a direct Telegram message with the fresh deep link.

Evidence:

- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:442)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:468)
- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:195)
- [src/lib/telegram.ts](/C:/www/Wesetup.ru/src/lib/telegram.ts:304)

### AC3. Notification UX

`PASS`

- Notification kind is `staff.telegram-invite`.
- Deduplication uses `staff.telegram-invite:<userId>`.
- Bell-compatible fields `title`, `linkHref`, `linkLabel`, and `items` are populated.

Evidence:

- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:165)
- [src/lib/staff-telegram-invite.test.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.test.ts:62)

### AC4. Existing bot binding flow still works

`PASS`

- The new flow reuses the existing `BotInviteToken` issuance model and does not alter `/start inv_<token>` handling.
- No changes were made to the Telegram `/start` binder or Mini App sign-in logic.

Evidence:

- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:84)
- [src/app/api/staff/[id]/invite-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/invite-tg/route.ts:13)

### AC5. Access control and error handling

`PASS`

- Route rejects unauthenticated users.
- Route rejects non-managers.
- Helper rejects missing employee and archived employee cases.
- Missing bot configuration returns a clear `500`.

Evidence:

- [src/app/api/staff/[id]/invite-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/invite-tg/route.ts:24)
- [src/app/api/staff/[id]/invite-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/invite-tg/route.ts:31)
- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:131)
- [src/lib/staff-telegram-invite.test.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.test.ts:129)

## Verification Commands

- `node --import tsx --test src/lib/staff-telegram-invite.test.ts`
  Raw: [tests.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/tests.txt)
- `npm run lint -- src/components/staff/staff-page-client.tsx src/components/staff/staff-dialogs.tsx src/lib/staff-telegram-invite.ts src/app/api/staff/[id]/invite-tg/route.ts src/lib/telegram.ts`
  Raw: [lint-targeted.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/lint-targeted.txt)
- `npx tsc --noEmit --pretty false`
  Raw: [tsc.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/tsc.txt)
- `npm run build`
  Raw: [build.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/build.txt)
- `npm run lint`
  Raw: [lint-full.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-invite-2026-04-18/raw/lint-full.txt)

## Notes

- `npm run build` succeeds, but Next.js prints the existing warning about the
  deprecated `middleware` file convention.
- `npm run build` also reports `Skipping validation of types`, so standalone
  `tsc --noEmit` was run to verify TypeScript separately.
