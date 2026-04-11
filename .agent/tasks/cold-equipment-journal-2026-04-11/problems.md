# Problems

## P1. Local DB unavailable
- `npx tsx prisma/seed-admin.ts` fails with `ECONNREFUSED` to `localhost:5432`.
- Impact: cannot perform local end-to-end verification of journal create/edit/print flows against real DB data.

## P2. Repository-wide TypeScript failures outside this task
- `npx tsc --noEmit --pretty false` reports unrelated failures in other journal files and supporting modules.
- Impact: no full-repo `PASS` gate can be claimed from current repository state.

## P3. Remote deploy verification not yet captured
- Push/deploy status still needs to be checked after publishing the task changes.
- Impact: AC4 remains partial until remote evidence exists.
