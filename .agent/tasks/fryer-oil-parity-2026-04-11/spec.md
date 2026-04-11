# Task Spec: fryer-oil-parity-2026-04-11

- Task ID: `fryer-oil-parity-2026-04-11`
- Journal: `Журнал учета использования фритюрных жиров`
- Template code: `fryer_oil`
- Source journal slug: `deepfatjournal`
- Local screenshots: `journals/Журнал учета использования фритюрных жиров/`
- Source crawl: `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/`

## Goal

Audit and bring the `fryer_oil` journal to source parity against the local screenshot set and crawl artifacts, while preserving correct DB-backed behavior, working create/edit/settings/actions, and a print flow that always opens a PDF page for the current document.

## Scope

- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/components/journals/create-document-dialog.tsx`
- `src/lib/fryer-oil-document.ts`
- `src/lib/tracked-document.ts`
- `src/lib/document-pdf.ts`
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/app/api/journal-documents/[id]/pdf/route.ts`
- directly related `fryer_oil` helpers/components only if required

## Source Inputs

- Screenshot references under `journals/Журнал учета использования фритюрных жиров/` (`011`-`018`)
- Crawl summary: `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/summary.json`
- Active list capture:
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/01-https-lk-haccp-online-ru-docs-deepfatjournal-1.png`
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/01-https-lk-haccp-online-ru-docs-deepfatjournal-1.json`
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/01-https-lk-haccp-online-ru-docs-deepfatjournal-1.html`
- Archive list capture:
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/02-https-lk-haccp-online-ru-docs-deepfatjournal-1-archive-1.png`
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/02-https-lk-haccp-online-ru-docs-deepfatjournal-1-archive-1.json`
  - `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/02-https-lk-haccp-online-ru-docs-deepfatjournal-1-archive-1.html`

## Acceptance Criteria

- AC1: The `fryer_oil` list page matches the source/screenshots closely in visible Russian title text, help/create controls, active-vs-closed tabs, document card layout, metadata placement, and per-document action affordances.
- AC2: The `fryer_oil` document page matches the screenshots closely in header, breadcrumb/title area, settings access, primary action placement, table/grid structure, column labels, row presentation, and overall spacing/visual hierarchy.
- AC3: The create-document affordance for `fryer_oil` matches the intended screenshot/source behavior closely enough in entry point, modal/page content, visible labels, defaults, and successful document creation flow.
- AC4: The settings affordance for `fryer_oil` is present and functional, and settings changes for select lists/reference values persist through the existing DB-backed APIs and reload correctly for the same document.
- AC5: CRUD flows for `fryer_oil` work end to end against the current DB-backed journal document APIs: create document, open document, add row, edit row, delete row, update document-level settings/data, archive/unarchive where supported, and delete/copy actions if surfaced in UI.
- AC6: The print action from every surfaced `fryer_oil` affordance always opens the PDF page/route for the current document rather than a non-PDF view, and the response renders a table-based PDF consistent with the journal structure.
- AC7: Visible Russian strings in the touched `fryer_oil` flow render as valid UTF-8 Cyrillic in UI and PDF, with no mojibake in titles, labels, select options, or printed table headers.
- AC8: Fresh verification is performed on the current codebase after implementation, every acceptance criterion is marked `PASS` in the task evidence, and any failure triggers the proof-loop fix/reverify cycle before completion is claimed.

## Constraints

- Keep changes scoped to `fryer_oil` and directly related helpers.
- Do not implement code changes as part of this spec-freeze step.
- Reuse existing screenshot and crawl artifacts instead of recollecting source data unless later verification proves them insufficient.
- Do not revert unrelated user changes in the worktree.

## Risks

- Current `fryer_oil` constants already show mojibake in local source, so Cyrillic integrity may be a real regression vector for both UI and PDF.
- The source crawl provided here covers list/archive surfaces, while create/settings/document parity depends on the local screenshot pack and must be interpreted carefully.
- Print affordances exist on active and archive states; parity work must keep action availability logically correct while still forcing PDF output.
