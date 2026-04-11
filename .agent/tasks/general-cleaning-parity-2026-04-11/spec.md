# Task Spec: general-cleaning-parity-2026-04-11

- Task ID: `general-cleaning-parity-2026-04-11`
- Journal: `График и учет генеральных уборок`
- Local screenshots: `journals/График и учет генеральных уборок/`
- Source journal slug: `sanitationdayjournal`

## Goal

Audit and bring the `general_cleaning` journal to source parity against the local screenshot set and the live/source journal artifacts, while preserving working DB-backed logic, working actions, and a reliable print flow that always opens the PDF page for the current document.

## Scope

- `src/lib/sanitation-day-document.ts`
- `src/components/journals/sanitation-day-documents-client.tsx`
- `src/components/journals/sanitation-day-document-client.tsx`
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/lib/document-pdf.ts`
- directly related helpers only if required

## Source Inputs

- Local screenshots under `journals/График и учет генеральных уборок/`
- Source crawl artifacts under `tmp-source-journals/full-crawl/07-item-docs-sanitationdayjournal-1/`
- Source button snapshot: `tmp-source-journals/sanitary-buttons.json`

## Acceptance Criteria

- AC1: The list page for `general_cleaning` matches the source/screenshots closely in visible Russian text, hierarchy, tabs, create/help actions, card layout, metadata, and action menu states for active vs closed documents.
- AC2: The detail page for `general_cleaning` matches the source/screenshots closely in header, breadcrumbs, settings button, add-row flow, matrix/table structure, labels, month columns, responsible row, and overall printable layout.
- AC3: Visible Russian strings in the touched `general_cleaning` flow render correctly in UTF-8 Cyrillic with no mojibake in UI or generated PDF.
- AC4: Document creation, update, row add/edit/delete, archive/unarchive, copy, and delete flows work end-to-end against the existing DB-backed journal document APIs for the current organization.
- AC5: The print action from the list page and the document page always opens the PDF route/page for the current document and the generated PDF content matches the journal structure.
- AC6: The implementation continues to normalize/persist `general_cleaning` config safely for existing and newly created documents.
- AC7: Fresh verification is recorded on the current codebase, all touched acceptance criteria are marked `PASS`, and the final result is pushed to `master`; post-push deploy status is checked and repaired if needed.

## Constraints

- Keep the change scoped to this journal and directly related helpers.
- Do not revert unrelated user changes in the dirty worktree.
- Prefer the smallest safe diff that restores parity and correctness.

## Risks

- Existing `general_cleaning` files may contain mixed encoding damage that affects UI text and PDF labels.
- The source journal has active/archive-specific action differences that must remain logically correct locally.
- The worktree already contains unrelated changes, so staging must stay surgical.
