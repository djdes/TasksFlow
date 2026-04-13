# Task Spec: journals-system-fix-2026-04-13

## Goal
Restore the local journal environment to a trustworthy state and fix systemic journal defects so the source-vs-local parity loop can run against the current repo without local auth/DB blockers.

## Current facts
- The audit task `source-parity-audit-2026-04-13` proved that source discovery works, but local comparison is blocked.
- `npx prisma db push` passes.
- `npx tsx prisma/seed.ts` fails with `P1010 DatabaseAccessDenied` on `JournalTemplate.upsert`.
- `npx tsx prisma/seed-admin.ts` can create users, but the local `/api/auth/login` flow still failed during audit.
- The current journal audit matrix is polluted by local-environment blockers rather than journal-only defects.

## Scope
- Fix local DB/bootstrap/auth blockers that prevent trustworthy journal verification.
- Re-run the local/source audit after blockers are fixed.
- Fix systemic journal defects found by the fresh audit where feasible in this pass.
- Update proof-loop artifacts with fresh evidence from the current repository state.

## Non-goals
- Do not rewrite the journal architecture from scratch.
- Do not fake parity or mark journals fixed without fresh evidence.

## Acceptance criteria

### AC1. Local bootstrap is healthy
`prisma db push`, `prisma/seed.ts`, and `prisma/seed-admin.ts` succeed against the local dev DB.

### AC2. Local auth works
The seeded admin can authenticate through `/api/auth/login` on the running app.

### AC3. Journal templates are available
Active `JournalTemplate` rows exist locally for the audited journal set, so journal routes are backed by real DB data.

### AC4. Fresh audit is rerun
The source-vs-local audit is rerun after the local blockers are fixed, producing refreshed `evidence.md`, `evidence.json`, and `problems.md`.

### AC5. Systemic journal defects are fixed where proven
Shared defects uncovered by the fresh audit are fixed and reverified.

### AC6. Evidence is current
All completion claims are backed by fresh command outputs and current task artifacts under `.agent/tasks/journals-system-fix-2026-04-13/`.

## Verification plan
- `npx prisma db push`
- `npx tsx prisma/seed.ts`
- `npx tsx prisma/seed-admin.ts`
- local `/api/auth/login` probe
- fresh source/local audit run
- `npx tsc --noEmit`

## Assumptions
- Source credentials remain in local env files only.
- The current dev DB may be recreated if required to restore consistency.
