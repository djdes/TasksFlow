# Task Spec: training-plan-parity-2026-04-11

## Metadata
- Task ID: training-plan-parity-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md
- `journals/План обучения персонала/*.jpg`
- `tmp-source-journals/full-crawl/14-item-docs-eduplan-1/*`
- `src/lib/training-plan-document.ts`
- `src/components/journals/training-plan-documents-client.tsx`
- `src/components/journals/training-plan-document-client.tsx`
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/pdf/route.ts`
- `.github/workflows/deploy.yml`

## Original task statement
Find the local screenshot folder for the journal `План обучения персонала`, find the implemented journal on the site, compare the current UI against the screenshots, make the journal visually match the screenshots as closely as possible, verify the business logic and DB wiring, ensure every button works, ensure print always opens a PDF table page, verify everything, fix what is broken, then push and wait for autodeploy and repair deployment issues if they appear.

## Current repo findings
- The local screenshot source exists at `journals/План обучения персонала` with list, menu, settings modal, document view, add dialogs, and archive screenshots.
- The journal already exists under template code `training_plan` and is wired through custom list/detail clients.
- The source crawl already contains upstream HTML/metadata for the matching source slug `eduplan`.
- The current implementation appears structurally close to the screenshots, but parity still needs a fresh pass for visual details, UTF-8 strings, persistence, button flows, and print behavior.
- Production deploy is triggered by a push to `master` through `.github/workflows/deploy.yml`.

## Acceptance criteria
- AC1: The `training_plan` list page matches the screenshots for `План обучения персонала` as closely as possible in layout, Russian labels, tabs, list card structure, menu actions, and settings/create dialogs.
- AC2: The `training_plan` detail page matches the screenshots as closely as possible in breadcrumbs, page heading, journal settings button, print action, header block, approval block, action buttons, and main training matrix.
- AC3: All visible Russian strings in the touched `training_plan` flow render correctly in UTF-8 Cyrillic with no mojibake in list page, detail page, dialogs, menus, table headers, buttons, or labels.
- AC4: The list-page actions work end-to-end against the existing DB-backed journal document flow: create, open, settings save, archive, restore, delete, and print.
- AC5: The detail-page actions work end-to-end against the existing DB-backed journal document flow: journal settings save, add position, add training topic, cell edits, row/topic persistence, and print.
- AC6: `Print` always opens the document PDF route for the current journal document and the PDF generation path succeeds for the `training_plan` template.
- AC7: Default `training_plan` documents and config are seeded or auto-created with sensible organization/user-backed defaults so the journal is usable on first open.
- AC8: Fresh verification on the current codebase passes for all touched `training_plan` files, all acceptance criteria are marked `PASS`, and the final branch state is pushed to `master`.
- AC9: After push, the production autodeploy is observed; if it fails or does not trigger, the cause is identified and fixed within repo scope, then deployment is reattempted.

## Constraints
- Freeze spec in this step only; no implementation changes beyond this file.
- Keep changes scoped to the `training_plan` journal flow and directly related helpers/routes/tests/artifacts.
- Reuse the existing `JournalDocument` / `JournalDocumentEntry` architecture and current PDF generation route.
- Use bounded fan-out subagents because the user explicitly requested parallel work, while keeping final verification ownership in this task directory.

## Non-goals
- Redesigning unrelated journals.
- Replacing the shared dashboard shell, footer, or global auth flow.
- Introducing a separate storage system outside the current journal documents model unless strictly required.

## Verification plan
- Screenshot/reference comparison against `journals/План обучения персонала/*.jpg`
- Targeted code inspection for list/detail/API/PDF paths
- Targeted `eslint` on touched files
- Local app run plus automated browser checks for key flows if environment allows
- Final git push to `master` and remote deploy observation

## Key risks
- The journal may already be close visually, so regressions can be introduced by over-fixing small mismatches.
- Existing documents may contain legacy config shapes that require careful normalization.
- UTF-8/mojibake issues can hide in literal strings even when logic is otherwise correct.
- Deployment verification may depend on external GitHub Actions/remote environment visibility.
