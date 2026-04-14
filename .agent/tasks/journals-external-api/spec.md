# Task Spec: journals-external-api

- Task ID: `journals-external-api`
- Start time: `2026-04-14T17:07:25.2337017+03:00`
- Repo: `C:\www\Wesetup.ru`
- Production: `https://wesetup.ru`

## Goal

Make every non-reference journal writable for a specific day through HTTP without runtime errors, with deployable production verification, rollback safety, audit logging, and evidence per journal.

## Constraints

- Do not touch `src/components/journals/hygiene-document-client.tsx`.
- Do not touch `src/components/journals/hygiene-documents-client.tsx`.
- Do not commit `.env`, `.env.local`, tokens, or server-only secrets.
- Do not use destructive DB reset operations without a prior backup.
- Journal/user deletion is out of scope except own test `JournalDocument` artifacts where explicitly needed.
- Pushes go to `master`; production deploy is expected through GitHub Actions.

## Known Context

- Prior 2026-04-12 journal audit already landed broad UI/document/PDF work on prod.
- `User.positionTitle` already exists in Prisma schema and is used in parts of the codebase.
- `JournalExternalLog` already exists in the schema and scripts for external fill testing already exist in the repo, so this task must audit current implementation rather than assume a blank slate.
- Requested skill `ralph-loop` is not installed in this session; execution continues with the same phase order and 7-hour hard cap tracked by `START_TIME.txt`.

## Acceptance Criteria

- AC1: A safety snapshot of the production DB is created and a rollback git tag is pushed before risky DB-affecting changes.
- AC2: A realistic HACCP demo seed exists with 20+ staff, realistic positions, areas, and equipment, and can be applied locally and on the server.
- AC3: Journal staff labels are sourced from employee data (`positionTitle` or direct employee position field) rather than journal-specific heuristics, and at least 3 journals are verified for the sticky-position bug.
- AC4: `POST /api/external/entries` is implemented or repaired with bearer auth, zod validation, per-journal dispatch, create/update semantics for the target day, and audit logging.
- AC5: Production-only secrets for external API auth are generated and stored on the server without entering git history.
- AC6: A smoke script covers all target journal codes and records evidence per journal for create/update, persistence, and PDF availability.
- AC7: Every failing journal discovered by the smoke run gets root-cause analysis, the smallest safe fix, and focused re-verification; unresolved journals are documented in `problems.md`.
- AC8: Sensor-style ingestion for climate and cold equipment is implemented or verified, with evidence showing repeated writes over time.
- AC9: Autofill behavior for `climate_control`, `cold_equipment_control`, and `cleaning` is verified and hardened if needed.
- AC10: Final proof artifacts (`evidence.md`, `evidence.json`, raw outputs, `FINAL.md`) reflect current code and current verification results; no criterion is reported `PASS` without fresh evidence.

## Verification Targets

- Local: targeted unit/type/build/script verification for touched files.
- Server DB: backup, seed, and direct verification queries as needed.
- Production app: deploy SHA, PM2 status, HTTP probes, and authenticated API smoke checks.

## Notes

- The repo already contains partial external API/testing artifacts. First work item is audit and gap analysis, not blind reimplementation.
- The 7-hour hard cap applies to this task lineage; stop when elapsed time reaches cap and write `FINAL.md` with current status.
