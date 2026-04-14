# Journals External API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every target journal fillable for a specific day through HTTP and verify the flow end-to-end on production-backed data.

**Architecture:** Reuse the existing document-based journal layer (`JournalDocument` + `JournalDocumentEntry`) and audit existing external-entry plumbing before adding missing normalization, logging, and verification. Treat the task as a proof-loop program with explicit backup, deploy, and evidence gates.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL, NextAuth, Zod, Node scripts, SSH/PM2 deploy checks.

---

## Session Control

- [ ] Record and reuse `START_TIME.txt` for the 7-hour hard cap.
- [ ] If elapsed time reaches 7 hours, stop implementation, write `.agent/tasks/journals-external-api/FINAL.md`, and exit.
- [ ] Note: requested `ralph-loop` skill is unavailable in this session, so execution uses the same phase order inline in this task folder.

## Phase 0: Safety + Audit

- [ ] Read current code/artifacts for:
  `CLAUDE.md`,
  `.agent/tasks/journals-full-audit/session-2026-04-12-*.md`,
  `prisma/schema.prisma`,
  `src/lib/journal-staff-binding.ts`,
  `src/lib/user-roles.ts`,
  `scripts/test-external-fill.ts`,
  `scripts/mock-sensor-feed.ts`,
  `src/app/api/external/entries/route.ts` if present.
- [ ] Create production DB backup under `.agent/backups/`.
- [ ] Create and push rollback tag `snap-start-ts`.
- [ ] Write initial audit notes into `.agent/tasks/journals-external-api/evidence.md`.

## Phase 1: Seed + Position Source

- [ ] Audit current seed scripts and decide whether to extend existing seed or add `prisma/seed-haccp-demo.ts`.
- [ ] Add or repair realistic demo organization/staff/areas/equipment seed.
- [ ] Verify `positionTitle` sourcing path and remove journal-specific title heuristics where they override employee data incorrectly.
- [ ] Verify at least 3 journals for the sticky-position bug with evidence.

## Phase 2: External API + Audit Log

- [ ] Audit current external API implementation if it already exists.
- [ ] Implement or repair auth, payload validation, journal dispatch, document create/update-by-day logic, and `JournalExternalLog` writes.
- [ ] Generate production token(s) and place them only on server `.env`.
- [ ] Document request/response shapes and curl examples in `API.md`.

## Phase 3: Smoke Matrix + Fix Loop

- [ ] Expand or repair `scripts/test-external-fill.ts` to cover all target journal codes.
- [ ] Emit per-journal evidence under `.agent/tasks/journals-external-api/<code>/`.
- [ ] Run full smoke locally or against prod-backed target, collect all failures, then fix journals one by one.
- [ ] After each green batch, commit, push, wait for deploy, and reverify production.

## Phase 4: Sensor + Autofill

- [ ] Verify or repair repeated sensor ingestion for climate/cold equipment.
- [ ] Run `mock-sensor-feed` long enough to capture evidence.
- [ ] Verify autofill determinism for `climate_control`, `cold_equipment_control`, and `cleaning`.

## Phase 5: Finalization

- [ ] Run fresh verification commands for all touched code and scripts.
- [ ] Verify deployed build SHA, PM2 status, and production HTTP/API behavior.
- [ ] Write `evidence.json`, `FINAL.md`, and any `problems.md` for unresolved gaps.
- [ ] Push final tag `release-external-api-ts` only if acceptance criteria are actually satisfied.
