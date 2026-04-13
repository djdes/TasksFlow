# Task Spec: source-parity-audit-2026-04-13

## Goal
Run a fresh authenticated source-vs-local audit for the journal system, capture a canonical per-journal parity matrix, and produce proof-loop artifacts that identify logic, UI, button, print/PDF, and DB-binding gaps without guessing.

## Current facts
- Source credentials are stored locally in `.env.local`; `SOURCE_SITE_LOGIN_URL`, `SOURCE_SITE_USERNAME`, and `SOURCE_SITE_PASSWORD` already exist.
- `SOURCE_SITE_START_URL` is required by the plan but is not yet present in `.env.local`.
- Local journal route/runtime coverage already exists in:
  - `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.json`
  - `.agent/tasks/journals-full-parity-2026-04-11/raw/print-matrix.json`
  - `scripts/capture-local-runtime-proof.ts`
- Source journal alias mapping exists in `src/lib/source-journal-map.ts`.
- Local DB-backed journal state lives in `JournalTemplate`, `JournalDocument`, `JournalDocumentEntry`, and `JournalEntry`.

## Scope
- Add one reusable audit script that:
  - logs into the source site
  - discovers journals from a configured start page
  - captures source list/detail states
  - checks local list/detail/print state against the current repo runtime
  - inspects DB/template coverage and staff-binding risk
  - emits `evidence.md`, `evidence.json`, and raw artifacts for this task
- Add the missing env documentation for source-site audit input.
- Run the audit against the current repo state if local prerequisites can be started successfully.

## Non-goals
- Do not claim pixel-perfect parity when only heuristic visual evidence is available.
- Do not silently mutate repo-tracked journal code as part of this audit task.
- Do not print secrets into artifacts or chat output.

## Acceptance criteria

### AC1. Proof-loop task artifacts exist
`.agent/tasks/source-parity-audit-2026-04-13/` contains a frozen spec, evidence bundle, raw artifacts, and a problems file if the audit finds non-pass items.

### AC2. Source discovery is fresh
A fresh authenticated pass discovers source journals from `SOURCE_SITE_START_URL`, captures journal metadata, and records missing/duplicate/unmapped source entries.

### AC3. Local routing/runtime is checked fresh
The current local app runtime is exercised for all known local journal codes, including list, detail, and print/PDF checks where expected.

### AC4. Canonical parity matrix is produced
The task outputs one canonical matrix with columns for source journal, local code, coverage, visual, logic, buttons, pdf, db, severity, and notes.

### AC5. DB and staff-binding risk is assessed
The audit flags local template/document coverage gaps and heuristic DB-binding risks such as name-only staff storage without id-backed fields.

### AC6. Evidence is honest
Any audit limitation, missing prerequisite, or non-pass area is explicitly documented in `evidence.md` and `problems.md` instead of being hand-waved.

## Implementation requirements
- Keep all generated task artifacts inside `.agent/tasks/source-parity-audit-2026-04-13/`.
- Use local env files for secrets; never commit real credentials.
- Prefer existing matrices and route knowledge where possible instead of duplicating journal metadata by hand.
- Treat source visual parity as heuristic unless the audit can capture both source and local screenshots for the same surface.

## Verification plan
- Typecheck the new script with `npx tsc --noEmit`.
- Run the new audit script after local prerequisites are available.
- Store raw screenshots, HTML/JSON dumps, and summary reports under the task directory.

## Assumptions
- Source login uses only username/password.
- `SOURCE_SITE_START_URL` can safely default to the source journal index page.
- Local runtime uses the existing seeded admin account unless the environment overrides it.
