# Task Spec: finished-product-parity-2026-04-11

## Original task statement
Bring `Журнал бракеража готовой пищевой продукции` to source parity using the local reference folder in `journals/` and the captured source-site screenshots/assets in `tmp-source-journals/full-crawl/09-item-docs-brakeryjournal-1/`.

The user explicitly wants:
- subagents used for parallel investigation
- the journal folder in `C:\www\Wesetup.ru\journals` located and compared against the site/source screenshots
- the local implementation visually as close as possible to the screenshots, ideally 1:1
- logic and DB-backed persistence verified
- all buttons working
- print always opening a page with the PDF table
- full verification, fixes where needed, then push to `master` and wait for autodeploy; if deploy fails, fix it

## Task goal
Audit and fix the `finished_product` journal end-to-end so the list/detail/print flow matches the source journal closely enough in visual structure and behavior, with working persistence and deployment proof.

## Source references
- Local journal folder: `journals/Журнал бракеража готовой пищевой продукции`
- Captured source screenshots/assets:
  - `tmp-source-journals/full-crawl/09-item-docs-brakeryjournal-1/01-https-lk-haccp-online-ru-docs-brakeryjournal-1.png`
  - `tmp-source-journals/full-crawl/09-item-docs-brakeryjournal-1/02-https-lk-haccp-online-ru-docs-brakeryjournal-1-archive-1.png`
  - paired `.html` / `.json` files in the same folder

## Relevant implementation areas
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/components/journals/finished-product-documents-client.tsx`
- `src/components/journals/finished-product-document-client.tsx`
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/app/api/journal-documents/[id]/pdf/route.ts`
- `src/lib/finished-product-document.ts`
- `src/lib/document-pdf.ts`

## Constraints and assumptions
- Respect existing dirty worktree changes outside this task.
- Do not revert unrelated user changes.
- Use the repo task proof loop artifacts under `.agent/tasks/finished-product-parity-2026-04-11/`.
- Prefer the existing `finished_product` template code and document storage model unless a smaller safe adjustment is insufficient.
- "Print" acceptance means the user lands on/open a PDF-generating route or PDF page, not browser `window.print()` of the React editor.

## Acceptance criteria
- AC1: The `finished_product` list page visually matches the captured source screenshots for active and closed tabs in the key layout cues: title treatment, tab state, action area, document row/card structure, date block, and action menu placement.
- AC2: The closed-tab experience reflects source behavior, including the closed-state heading treatment and document listing semantics shown by the reference assets.
- AC3: The document detail page for `finished_product` is DB-backed and functionally coherent: loading existing config, editing rows/settings, saving through API, and reloading persisted data without regression.
- AC4: Every user-facing action on the `finished_product` list/detail screens is wired to a meaningful working behavior; no placeholder/no-op actions remain for the core journal flow.
- AC5: Every print action for `finished_product` opens the PDF route/page (`/api/journal-documents/[id]/pdf` or an equivalent PDF page) rather than browser printing the editable screen.
- AC6: The generated finished-product PDF renders the journal as a table-based printable artifact and stays aligned with the journal configuration and stored rows.
- AC7: Fresh verification covers at least targeted code inspection plus runnable checks relevant to this journal, and all acceptance criteria are marked `PASS` in evidence artifacts before completion.
- AC8: The final fix is pushed to `master`, autodeploy status is checked, and if autodeploy initially fails it is repaired and rechecked.

## Evidence plan
- Capture code references and behavior notes in `evidence.md`.
- Store machine-readable acceptance results in `evidence.json`.
- Store raw outputs/screenshots/check logs under `.agent/tasks/finished-product-parity-2026-04-11/raw/`.
- If verification finds issues, record them in `problems.md`, apply the smallest safe fix, and reverify.
