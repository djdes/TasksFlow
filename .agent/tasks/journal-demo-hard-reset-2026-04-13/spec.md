# Task Spec: journal-demo-hard-reset-2026-04-13

## Metadata
- Task ID: journal-demo-hard-reset-2026-04-13
- Created: 2026-04-13T16:50:52+00:00
- Repo root: C:\www\Wesetup.ru
- Working directory at init: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md

## Original task statement
Delete all existing journal documents and employees in the demo organization, recreate a new clean staff roster with one employee per position, and leave exactly one fully populated document for each of the 35 active journals.

## Acceptance criteria
- AC1: `scripts/reset-demo-journal-data.ts` fully resets the demo organization identified by `admin@haccp.local`: before reseeding it removes all existing `JournalDocumentEntry`, `JournalDocument`, `JournalEntry`, and all demo employees in that organization, then recreates the target demo roster.
- AC2: After a fresh run of `scripts/reset-demo-journal-data.ts`, the demo organization contains only the new intended staff roster, with exactly one active employee per target position, and no legacy demo employees from the old roster remain.
- AC3: After a fresh run, the demo organization contains exactly one document for each of the 35 active journal templates, with no template having zero documents or more than one document.
- AC4: Each of the 35 retained journal documents is meaningfully populated: document config is present when that journal type requires it, and there is at least one non-empty document entry or tracked payload for that journal.
- AC5: Fresh verification artifacts are captured under `.agent/tasks/journal-demo-hard-reset-2026-04-13/`, `python ... task_loop.py validate --task-id journal-demo-hard-reset-2026-04-13` remains valid, and `npx tsc --noEmit` passes.

## Constraints
- Keep all durable artifacts inside `.agent/tasks/journal-demo-hard-reset-2026-04-13/`.
- Use `scripts/reset-demo-journal-data.ts` as the implementation entrypoint for the reset/reseed behavior.
- Keep changes minimal and scoped to this reset workflow; do not refactor unrelated journal code.
- Preserve a working owner login for the demo organization via `admin@haccp.local`, but that account must be part of the new roster rather than leftover legacy staff.

## Non-goals
- Do not redesign journal templates or journal UI behavior.
- Do not modify unrelated production data outside the demo organization.
- Do not add multiple sample documents per journal.
- Do not clean up unrelated untracked artifacts already present in the repo.

## Verification plan
- Build: `npx tsc --noEmit`
- Unit tests: none targeted unless the code change requires them
- Integration tests: `npx tsx scripts/reset-demo-journal-data.ts`
- Lint: capture current status if needed, but TypeScript + DB verification are primary gates for this task
- Manual checks: query the database after reseed to confirm
  - active users list
  - absence of legacy users
  - exactly 35 active templates and exactly 35 documents
  - exactly one document per template
  - every document has config and/or at least one meaningful entry

## Assumptions
- "Delete all employees" means all demo-organization employees are reset and recreated, while the owner login may be recreated or updated in place as long as the final roster is new and no legacy demo staff remain.
- "One employee per position" refers to one active employee per intended seeded position title in the new demo roster.
