# Evidence: journals-external-api

## Fresh Verification Summary

- Phase 0 safety snapshot refreshed on pre-change `HEAD` `5c66634`.
- Production DB backup created at `.agent/backups/db-5c66634.sql.gz`.
- Rollback tag `snap-start-ts` pushed to `origin`.
- Changes deployed to production at build SHA `f7eec99e069be2b8bba9f9fcfead89ead23c67c7`.
- Fresh production smoke against `https://wesetup.ru` returned `PASS` for all `35` active journal codes` using the new `rows` contract.
- Fresh sensor-feed smoke returned `200/ok` for `climate_control` and `cold_equipment_control` over 3 ticks.
- `npx tsc --noEmit` passed on the current repository state after the new changes.
- `npm run seed:haccp-demo` passed locally and reported `30` active users, `11` areas, `22` equipment units in the demo org.
- `npm run seed:haccp-demo` also passed on the server and reported `30` active users, `11` areas, `24` equipment units in the production-backed demo org.

## Current Delta

- `POST /api/external/entries` now accepts preferred `rows` payloads in addition to legacy `data` / `entries`.
- `scripts/test-external-fill.ts` now exercises the `rows` contract.
- Added `prisma/seed-haccp-demo.ts` plus npm script `seed:haccp-demo` for realistic HACCP fixtures.
- Rewrote task-local `API.md` so docs match the current contract.

## Verification Commands

- `npx tsc --noEmit`
- `npm run seed:haccp-demo`
- `$env:EXTERNAL_API_BASE='https://wesetup.ru'; $env:EXTERNAL_API_TOKEN=(Get-Content '.agent\\tasks\\journals-external-api\\.external-token.secret' -Raw).Trim(); $env:EXTERNAL_API_ORG_ID='cmnm40ikt00002ktseet6fd5y'; npx tsx scripts/test-external-fill.ts`
- `$env:EXTERNAL_API_BASE='https://wesetup.ru'; $env:SENSOR_API_TOKEN=(Get-Content '.agent\\tasks\\journals-external-api\\.sensor-token.secret' -Raw).Trim(); $env:EXTERNAL_API_ORG_ID='cmnm40ikt00002ktseet6fd5y'; npx tsx scripts/mock-sensor-feed.ts --ticks=3 --interval=1`

## Open Items

- The mission's stricter "3 journals visual check for sticky position bug" should be refreshed with current screenshots rather than relying only on the older 2026-04-12 note.
