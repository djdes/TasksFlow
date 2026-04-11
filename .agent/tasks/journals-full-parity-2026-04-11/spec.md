# Task Spec: journals-full-parity-2026-04-11

## Original task statement
User has 35 local journal reference folders in `journals/` and 33 journals currently available on the site. The two remaining journals to complete are:
- `Чек-лист уборки и проветривания помещений`
- `Журнал входного контроля сырья, ингредиентов, упаковочных материалов`

User wants:
- both missing journals implemented and available separately from the already existing `Журнал приемки и входного контроля продукции`
- all journals visually copied from the local screenshots/reference folders
- functional behavior, logic, DB-backed persistence, structure, and print/PDF flows aligned with the site, prior journals, and current architecture
- a repo-task-proof-loop audit of all journal deficiencies followed by fixes

## Task goal
Bring the journal system to full parity across all 35 local reference journals by:
1. implementing the 2 missing journals,
2. auditing all existing journals against local reference folders plus current site/repo behavior,
3. fixing discovered parity, UX, routing, persistence, and print/PDF gaps,
4. recording durable proof-loop artifacts and fresh verification evidence.

## Relevant repo context
- Root proof-loop instructions live in `AGENTS.md` and `CLAUDE.md`.
- Journal screenshots/reference folders live under `journals/`.
- Source crawl/site comparison data also exists under `tmp-source-journals/`.
- Active journal templates are seeded from `prisma/seed.ts` via `ACTIVE_JOURNAL_TEMPLATES`.
- The current active set has 33 journals; user confirmed the 2 remaining targets above.
- Existing journal implementations span:
  - template-based journals
  - document-based journals using `JournalDocument` / `JournalDocumentEntry`
  - custom document clients for more complex journals

## Assumptions
- Local folder contents in `journals/` are the visual source of truth for layout and visible controls.
- Site/repo behavior is the source of truth for persistence, workflow logic, data relationships, and PDF/print integration when screenshots alone are insufficient.
- “Check all deficiencies” means a practical engineering audit focused on real parity and functional gaps, not pixel-perfect design recreation where the source material does not justify it.
- Existing completed proof-loop artifacts for individual journals may be reused as context, but verification must judge current code only.

## Constraints
- Freeze this spec before implementation.
- Keep all proof-loop artifacts under `.agent/tasks/journals-full-parity-2026-04-11/`.
- Do not claim completion unless every acceptance criterion passes on a fresh verification pass.
- Preserve unrelated user changes already present in the dirty working tree.
- Keep the new `Журнал входного контроля сырья, ингредиентов, упаковочных материалов` separate from `Журнал приемки и входного контроля продукции`.

## Non-goals
- Do not rewrite the entire journal framework if targeted fixes achieve parity.
- Do not remove existing journals unless required by explicit user instruction.
- Do not rely on static mock data for parity surfaces that already have DB-backed patterns in the repo.

## Acceptance criteria

### AC1. Master audit inventory exists
Pass conditions:
- A durable inventory artifact is created listing all 35 local journals.
- The inventory identifies the current implementation status for each journal.
- The inventory explicitly marks the 2 missing journals and any major parity gaps found during the audit.

### AC2. The 2 missing journals are implemented and routable
Pass conditions:
- `Чек-лист уборки и проветривания помещений` is added to the active journal system and opens through the dashboard routes.
- `Журнал входного контроля сырья, ингредиентов, упаковочных материалов` is added to the active journal system and opens through the dashboard routes.
- `Журнал приемки и входного контроля продукции` remains available as a separate journal.

### AC3. Visual parity work is applied across the journal set
Pass conditions:
- For each implemented journal, visible structure and controls are reconciled against the local reference folders as applicable.
- Material mismatches in list pages, document pages, dialogs, tables, print affordances, or labels are fixed or explicitly recorded if blocked.
- Russian UI text is readable and matches the intended journal names and controls.

### AC4. Functional parity work is applied across the journal set
Pass conditions:
- Journal routing, create/edit/delete flows, document or entry persistence, and print/PDF affordances are checked and fixed where broken.
- DB-backed behavior is used where the current architecture supports it.
- Existing implemented journals continue to work after the fixes.

### AC5. Audit findings and fixes are tracked per journal
Pass conditions:
- Evidence artifacts record the journal-by-journal findings and resolutions.
- If any issue remains blocked, it is documented with a concrete reason and current status.

### AC6. Fresh verification gate
Pass conditions:
- Fresh verification is run against the current codebase after the fixes.
- Verification checks the current state of the implemented/updated journals, not prior chat claims.
- Completion is not claimed unless the verifier records `PASS`.

## Verification plan
- Build a 35-journal inventory from `journals/` and current active repo templates.
- Identify missing or mismatched journals by name, route code, and implementation path.
- Verify the 2 missing journals are added to active templates and routed in the dashboard.
- Verify representative list/detail/print flows for updated document journals.
- Run targeted lint/build or other relevant checks on touched journal files.
- Record per-journal status in evidence artifacts and mark the final verdict only after a fresh pass.
