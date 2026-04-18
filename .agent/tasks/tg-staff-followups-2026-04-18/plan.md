# Telegram Staff Follow-Ups Plan

## Summary

Fix duplicate Telegram rebind delivery, stabilize manager invite dialogs,
add manager-side unlink from `/settings/users`, and tighten Mini App journal
mobile UX.

## Steps

1. Add focused failing tests for:
   - duplicate rebind DM suppression
   - stable invite issue semantics for manager actions
   - manager-side unlink behavior
2. Refactor the staff Telegram dialog flow so issuing happens exactly once per
   explicit manager action instead of effect-driven repeat firing.
3. Add server-side duplicate-DM protection for rebind using recent
   `TelegramLog` entries.
4. Add a staff API route for manager-side Telegram unlink and wire the action
   into `/settings/users`.
5. Extend staff page UI with `Отвязать TG` for linked employees.
6. Improve Mini App journal detail and new-entry layout for phone screens.
7. Run targeted tests, targeted lint, `tsc`, and production build.

## Verification Targets

- `node --import tsx --test <new-or-updated-tests>`
- `npm run lint -- <touched-files>`
- `npx tsc --noEmit --pretty false`
- `npm run build`
