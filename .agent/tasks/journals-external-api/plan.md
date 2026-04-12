# Journals External API — 7h Autonomous Plan

**START_TIME:** 2026-04-12T19:31:44Z
**HARD CAP:** START_TIME + 7h = 2026-04-13T02:31:44Z

**Goal:** Every HACCP journal fillable for a given day via authenticated HTTP POST, without errors; employee-app integration ready tomorrow.

**Architecture:** Add `POST /api/external/entries` dispatcher keyed by journal template code; per-code normalizers write to `JournalDocument` + `JournalDocumentEntry` (reusing existing document layer). Bearer token auth via `EXTERNAL_API_TOKEN`. Audit log in new `JournalExternalLog`. Fix User.position source-of-truth bug. Seed realistic fixtures. Smoke-test all 33 codes.

**Tech stack:** Next.js 16 App Router, Prisma 7 / PostgreSQL, Zod, NextAuth, PM2, GitHub Actions autodeploy on push to master.

---

## Phases (each phase ends with commit+push; after big batches, wait for .build-sha on prod then re-verify)

### Phase 0 — Safety snapshot (≤ 20 min)
- [ ] Read CLAUDE.md + prior `session-2026-04-12-*.md` in `.agent/tasks/journals-full-audit/`.
- [ ] `pg_dump` prod DB → `.agent/backups/db-<sha>.sql.gz` via ssh.
- [ ] `git tag snap-start-<ts>` + push tag.

### Phase 1 — Realistic seed (≤ 45 min)
- [ ] `prisma/seed-haccp-demo.ts`: 1 org, 20+ employees with realistic Russian positions, 5+ locations, 10+ equipment units.
- [ ] Run locally; ensure idempotent.

### Phase 2 — Position source-of-truth fix (≤ 60 min)
- [ ] Inspect `src/lib/journal-staff-binding.ts`, `user-roles.ts`, `hygiene-document.ts` (`getHygienePositionLabel`).
- [ ] Ensure `User.position` exists (add column + migration if missing; pg_dump first).
- [ ] Refactor all journal renderers to read from `user.position` directly; no heuristic fallback that can flip role per-journal.
- [ ] Verify visually across 3+ journals.

### Phase 3 — External API (≤ 90 min)
- [ ] New Prisma model `JournalExternalLog { id, organizationId, journalCode, date, payload Json, status, httpCode, createdAt }`.
- [ ] `src/app/api/external/entries/route.ts` — Bearer auth via `EXTERNAL_API_TOKEN`.
- [ ] Zod schema (organizationId, journalCode, date YYYY-MM-DD, employeeId?, rows[], source?).
- [ ] Dispatcher `src/lib/external/dispatch.ts` with per-code normalizers (reuse existing document logic where possible).
- [ ] Response `{ok, documentId, entriesWritten}` on 200, structured error otherwise.
- [ ] Put `EXTERNAL_API_TOKEN` in prod `.env` via ssh (NOT committed).
- [ ] `API.md` with curl examples per journal.

### Phase 4 — Smoke all 33 journals (≤ 90 min)
- [ ] `scripts/test-external-fill.ts` — loops list, POSTs per journal with realistic payload for today, GETs doc, hits `/api/journal-documents/<id>/pdf`.
- [ ] Per-code evidence → `.agent/tasks/journals-external-api/<code>/evidence.{md,json}`.
- [ ] Do NOT stop on first FAIL — collect all results.

### Phase 5 — Fix loop (≤ 90 min)
- [ ] For each FAIL: systematic-debugging → minimal fix → re-run smoke for that code.
- [ ] ≥3 attempts failing → write `problems.md` entry, SKIP, continue.
- [ ] Commit+push every 3–5 green fixes, wait for deploy, verify on prod.

### Phase 6 — Mock sensor feed (≤ 30 min)
- [ ] `SENSOR_API_TOKEN` in prod `.env`.
- [ ] `scripts/mock-sensor-feed.ts` every 15 min for climate_control, cold_equipment_control.
- [ ] Run ≥1 h, evidence in `_sensor/`.

### Phase 7 — Autofill hardening (≤ 30 min)
- [ ] Verify climate, cold_equipment, cleaning autofill toggles deterministic and safe under post-edit.

### Phase 8 — Final report
- [ ] `FINAL.md` with journal × {created, populated, pdf, persistence, autofill, external-api} matrix.
- [ ] `git tag release-external-api-<ts>` + push.

---

## Loop budget check (every ralph cycle)
```
now=$(date -u +%s); start=$(date -u -d "$(cat .agent/tasks/journals-external-api/START_TIME.txt)" +%s); elapsed=$((now-start))
# if elapsed >= 25200 → write FINAL.md, tag, exit
```

## Red lines (repeat)
- No touching `hygiene-document-client.tsx` / `hygiene-documents-client.tsx`.
- No DROP/TRUNCATE/migrate reset without pg_dump+tag.
- No secret commits. No workflow edits.
