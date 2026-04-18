# Evidence

## Verdict

Acceptance criteria `AC1`-`AC5` are `PASS`.

Fresh verification:

- focused tests: `PASS`
- focused lint on touched files: `PASS`
- TypeScript compile: `PASS`
- production build: `PASS`

## Implemented Changes

- Rebind DM dedupe added in
  [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:51)
  and
  [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:213)
  using recent `TelegramLog` checks instead of a new table.
- Manager-side Telegram unlink helper added in
  [src/lib/staff-telegram-management.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-management.ts:68)
  and route added in
  [src/app/api/staff/[id]/unlink-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/unlink-tg/route.ts:14).
- Staff settings UI now issues invites from explicit click handlers instead of dialog `useEffect`,
  keeps invite payload in parent state, and exposes unlink actions in
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:343),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:383),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:516),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:781),
  [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:1027).
- New Telegram dialogs live in
  [src/components/staff/staff-telegram-dialogs.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-telegram-dialogs.tsx:43)
  and
  [src/components/staff/staff-telegram-dialogs.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-telegram-dialogs.tsx:159).
- Mini App phone layout was tightened in
  [src/app/mini/layout.tsx](/C:/www/Wesetup.ru/src/app/mini/layout.tsx:40),
  [src/app/mini/_components/mini-card.tsx](/C:/www/Wesetup.ru/src/app/mini/_components/mini-card.tsx:33),
  [src/app/mini/journals/[code]/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/page.tsx:87),
  [src/app/mini/journals/[code]/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/page.tsx:145),
  [src/app/mini/journals/[code]/new/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/new/page.tsx:128),
  and
  [src/components/journals/dynamic-form.tsx](/C:/www/Wesetup.ru/src/components/journals/dynamic-form.tsx:398).

## Acceptance Criteria

### AC1. Rebind sends at most one Telegram message

`PASS`

- The helper checks recent `TelegramLog` rows before sending a rebind DM.
- Duplicate UI rerenders no longer trigger extra backend requests because the invite request moved out of dialog effects.

Evidence:

- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:131)
- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:213)
- [src/lib/staff-telegram-invite.test.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.test.ts:116)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:343)

### AC2. Invite modal for unlinked employees is stable

`PASS`

- Invite creation now happens once per explicit click in the page client.
- The success modal reads stable parent-held `pending/error/invite` state, so QR/link do not disappear on refresh loops.

Evidence:

- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:343)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:516)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:769)
- [src/components/staff/staff-telegram-dialogs.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-telegram-dialogs.tsx:43)

### AC3. Manager can unlink employee Telegram from staff settings

`PASS`

- Linked employees now have `Отвязать TG` in staff settings.
- Unlink clears `telegramChatId`, removes stale invite artifacts, and returns the UI to the unlinked state.

Evidence:

- [src/lib/staff-telegram-management.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-management.ts:68)
- [src/lib/staff-telegram-management.test.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-management.test.ts:6)
- [src/app/api/staff/[id]/unlink-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/unlink-tg/route.ts:14)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:383)
- [src/components/staff/staff-page-client.tsx](/C:/www/Wesetup.ru/src/components/staff/staff-page-client.tsx:536)

### AC4. Existing Telegram invite/bind flow is preserved

`PASS`

- The flow still issues `BotInviteToken` and still uses `/start inv_<token>`.
- Unlink only clears the live Telegram binding and invite artifacts; historical site data is untouched.

Evidence:

- [src/lib/staff-telegram-invite.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-invite.ts:161)
- [src/lib/staff-telegram-management.ts](/C:/www/Wesetup.ru/src/lib/staff-telegram-management.ts:85)
- [src/app/api/staff/[id]/invite-tg/route.ts](/C:/www/Wesetup.ru/src/app/api/staff/[id]/invite-tg/route.ts:14)

### AC5. Mini App journal screens are adaptive on phones

`PASS`

- The Mini App shell is wider and less cramped.
- Journal cards and document rows wrap instead of truncating aggressively.
- The floating CTA and form actions fit narrow screens better.

Evidence:

- [src/app/mini/layout.tsx](/C:/www/Wesetup.ru/src/app/mini/layout.tsx:40)
- [src/app/mini/_components/mini-card.tsx](/C:/www/Wesetup.ru/src/app/mini/_components/mini-card.tsx:33)
- [src/app/mini/journals/[code]/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/page.tsx:145)
- [src/app/mini/journals/[code]/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/page.tsx:184)
- [src/app/mini/journals/[code]/new/page.tsx](/C:/www/Wesetup.ru/src/app/mini/journals/[code]/new/page.tsx:133)
- [src/components/journals/dynamic-form.tsx](/C:/www/Wesetup.ru/src/components/journals/dynamic-form.tsx:540)

## Verification Commands

- `node --import tsx --test src/lib/staff-telegram-invite.test.ts src/lib/staff-telegram-management.test.ts`
  Raw: [tests.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-followups-2026-04-18/raw/tests.txt)
- `npm run lint -- src/components/staff/staff-page-client.tsx src/components/staff/staff-telegram-dialogs.tsx src/components/staff/staff-types.ts src/lib/staff-telegram-invite.ts src/lib/staff-telegram-management.ts src/app/api/staff/[id]/unlink-tg/route.ts src/app/mini/journals/[code]/page.tsx src/app/mini/journals/[code]/new/page.tsx src/app/mini/_components/mini-card.tsx src/app/mini/layout.tsx src/components/journals/dynamic-form.tsx`
  Raw: [lint-targeted.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-followups-2026-04-18/raw/lint-targeted.txt)
- `npx tsc --noEmit --pretty false`
  Raw: [tsc.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-followups-2026-04-18/raw/tsc.txt)
- `npm run build`
  Raw: [build.txt](/C:/www/Wesetup.ru/.agent/tasks/tg-staff-followups-2026-04-18/raw/build.txt)

## Notes

- Live authenticated browser verification was not run in this session because the staff settings flow requires a real signed-in account context.
- `npm run build` still prints the existing Next.js warning about deprecated `middleware` naming; it is pre-existing and not caused by this task.
