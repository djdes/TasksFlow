## Task

Fix production deploy so newly added journal templates are reliably seeded into the database during autodeploy.

## Context

The two missing journals are already present in application code and in `prisma/seed.ts`, but after deploy they did not appear on the site. The deploy workflow currently runs the seed step after `npm ci --omit=dev` and explicitly ignores seed failures with `|| echo "Seed failed, continue deploy"`.

## Acceptance Criteria

- AC1: The deploy workflow installs the dependencies required to run the TypeScript seed script on the production server.
- AC2: The deploy workflow no longer silently ignores seed failures; a failed seed must fail the deploy job.
- AC3: The fix is minimal and does not change unrelated deploy behavior outside dependency install / seed execution.
- AC4: Evidence records the root cause and the exact workflow change.
