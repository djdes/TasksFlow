# Telegram Invite From Staff Settings Plan

## Summary

Implement Telegram invite actions in `/settings/users` by extending the current
staff UI and reusing the existing Telegram invite infrastructure. The server
will issue/reissue `BotInviteToken`, create an in-app notification for the
target employee, and optionally DM an already-linked Telegram account with the
fresh deep link.

## Steps

1. Add focused server-side tests for the invite issuance helper and route
   behavior.
2. Extract invite issuance into a reusable helper that:
   - validates employee/org state
   - reissues `BotInviteToken`
   - creates or refreshes the employee notification
   - optionally sends a Telegram DM for rebind
3. Extend `/api/staff/[id]/invite-tg` to use the helper and support a rebind
   mode flag.
4. Extend staff page data to expose Telegram link status to the client.
5. Add staff-page UI actions:
   - `Пригласить в TG` for unlinked employees
   - `Открыть TG` + `Перепривязать` for linked employees
   - success modal with URL / QR / copy actions
6. Verify the bell notification payload renders correctly with Telegram deep
   links.
7. Run targeted tests, lint, and a production build.

## Verification Targets

- `node --import tsx --test <new-test-files>`
- `npm run lint`
- `npm run build`
