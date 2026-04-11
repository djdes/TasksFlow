## Root Cause

The two missing journals were already added to application code and `prisma/seed.ts`, but production deploy could finish without inserting them into the database.

The deploy workflow had two reliability problems:

1. It installed runtime deps with `npm ci --omit=dev`, while the seed command depends on `tsx`, which is declared in `devDependencies`.
2. It explicitly ignored seed failures with `|| echo "Seed failed, continue deploy"`.

Because the journals list page reads `journalTemplate` rows directly from the database, a skipped or failed seed leaves production stuck on the older 33 active templates.

## Fix

Updated `.github/workflows/deploy.yml` to:

- run `npm ci` on the server before seeding
- run `npx tsx prisma/seed.ts` without swallowing failures

## Acceptance Criteria Verdict

- AC1: PASS
- AC2: PASS
- AC3: PASS
- AC4: PASS
