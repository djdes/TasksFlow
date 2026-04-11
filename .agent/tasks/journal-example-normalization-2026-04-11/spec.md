# Task Spec: journal-example-normalization-2026-04-11

## Metadata
- Task ID: journal-example-normalization-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Original task statement
1. Удали все примеры из журналов во всех журналах
2. Создай по 1 примеру активного и 1 примеру закрытого журнала во всех журналах

## Normalized task interpretation
- Normalize journal demo/sample documents so the demo organization ends up with exactly two example documents per journal template: one `active` and one `closed`.
- Remove legacy multi-document sample packs and any hidden client-side auto-seeding that recreates extra examples.
- Keep the existing journal-specific structure, config shape, entry shape, PDF behavior, and route logic intact.

## Acceptance criteria
- AC1: Journal sample seeding no longer creates more than one `active` and one `closed` example document for any journal template.
- AC2: Legacy sample packs and duplicate seeded examples are normalized away in the demo environment instead of remaining visible in journal lists.
- AC3: Hidden client-side sample creation paths do not recreate extra sample documents after server-side normalization.
- AC4: The updated journal pages still compile and preserve journal-specific config/entry generation for the two retained example documents.
- AC5: Proof artifacts include the normalization approach, changed seeding points, and verification results.

## Constraints
- Keep scope limited to journal sample/demo document generation and cleanup.
- Do not change journal schema.
- Prefer shared helpers and small targeted edits over broad refactors.
- Do not remove non-sample document functionality such as editing, printing to PDF, or routing.

## Verification plan
- `npx tsc --noEmit`
- targeted `eslint` on changed journal files
- static audit of all journal sample creation branches to confirm each now converges on one `active` and one `closed` example

## Assumptions
- The user wants the demo/site example corpus normalized and accepts replacement of existing seeded sample packs in the demo environment.
- The demo organization is the environment that contains the fixed demo users such as `admin@haccp.local`.
