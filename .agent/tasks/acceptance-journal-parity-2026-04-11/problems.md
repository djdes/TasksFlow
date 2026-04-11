# Problems: acceptance-journal-parity-2026-04-11

## Current blockers
- Local authenticated verification is blocked because `POST /api/auth/login` fails with `PrismaClientKnownRequestError` (`ETIMEDOUT`) while reading `db.user.findUnique(...)`.
- Because login fails locally, AC3 and AC5 could not be proven end to end on this machine before push.

## Smallest safe next step
- Push the journal fix to `master`.
- Observe live autodeploy where the real database is reachable.
- Re-run authenticated verification there; if deploy or runtime fails, apply the smallest scoped fix and redeploy.
