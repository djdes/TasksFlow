# Task Spec: journal-db-binding-hardening

## Metadata
- Task ID: journal-db-binding-hardening
- Created: 2026-04-12T08:39:27+00:00
- Repo root: C:\www\Wesetup.ru
- Working directory at init: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md

## Original task statement
Global journal DB binding hardening across all mapped journals: enforce DB-backed employee selection by user.id, derive titles from DB role, normalize legacy name-based data, keep print correct, create proof-loop artifacts, verify and fix until PASS.

## Acceptance criteria
- AC1: `.agent/tasks/journal-db-binding-hardening/` contains a frozen spec, evidence bundle, verifier verdict, and supporting raw artifacts for this task.
- AC2: Shared journal API entrypoints reject or reconcile DB-backed employee/title drift so `responsibleUserId` and equivalent staff-linked fields cannot silently diverge from DB role labels.
- AC3: Shared and high-impact journal UIs no longer persist employee selections by plain employee name where a DB-backed user exists; new writes use `user.id`, and rendered labels come from DB-backed user data.
- AC4: Legacy journal configs that stored employee names or stale titles remain readable and are normalized back to the correct DB user where an exact unique match is available.
- AC5: Audit plan, training plan, sanitation day, traceability, dynamic form employee fields, and product writeoff commission flows are reconciled to DB-backed staff references or derived titles without breaking current rendering.
- AC6: Print behavior remains on `/api/journal-documents/[id]/pdf`, returns a non-blank PDF, and uses reconciled employee/title data for the affected journals.
- AC7: Every discovered systemic defect class is re-checked across all mapped journals and documented in evidence, including any intentionally manual-title exceptions.
- AC8: Fresh verification is run against the current repository state, and completion is claimed only if every criterion is PASS or any blocker is explicitly isolated and documented.

## Constraints
- Keep all task artifacts inside `.agent/tasks/journal-db-binding-hardening/`.
- Freeze this spec before production code edits.
- Prefer minimal safe diffs and systemic fixes at shared choke points over one-off per-journal hacks.
- Do not introduce a Prisma schema migration unless implementation proves server-side reconciliation is insufficient.
- Preserve current print route shape and keep existing journals readable even when they contain legacy name-based staff data.
- Do not revert unrelated user changes already present in the worktree.

## Non-goals
- Do not redesign the journal UX beyond the staff-binding changes required to stop DB drift.
- Do not convert genuinely free-text external-person fields into DB-bound user fields when the journal does not model an organization employee.
- Do not rewrite unrelated journal visual parity work or unrelated task artifacts.
- Do not change permission/role semantics outside of deriving printable staff titles from the existing DB role.

## Verification plan
- Build: run `npm run build` or `npx tsc --noEmit` if the full build is too noisy for the current repo state; capture output under `raw/`.
- Unit tests: run focused automated checks for any new shared helper logic if a test harness exists; otherwise record absence and cover with direct command/manual evidence.
- Integration tests: hit affected journal API routes via repository-supported checks where feasible and capture outputs.
- Lint: run `npm run lint` or equivalent and capture output under `raw/`.
- Manual checks:
  - confirm `journals/` contains 35 folders
  - confirm `src/lib/source-journal-map.ts` maps 38 aliases including 3 scan-only mappings
  - verify shared entrypoints `src/app/(dashboard)/journals/[code]/page.tsx`, `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`, and `src/app/api/journal-documents/**`
  - verify affected UIs now store/select DB-backed user ids
  - verify reconciled configs still render and print
  - verify print route opens the correct PDF for affected journals

## Assumptions
- Current safest rule: printable/display position is derived from `User.role` via shared role-label helpers because the DB has no separate `User.position`.
- Where a config currently stores employee name, the hardening pass may store both the canonical `user.id` and a resolved display name for backward compatibility.
- If a legacy employee name maps to multiple active users, the data remains readable but is treated as unresolved rather than silently rebound to the wrong user.
