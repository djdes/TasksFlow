# Evidence: fryer-oil-parity-2026-04-11

## Scope

- Journal: `Журнал учета использования фритюрных жиров`
- Template code: `fryer_oil`
- Task focused on visual parity, DB-backed entry CRUD, working actions, and print-to-PDF behavior.

## Implemented Changes

- Reworked the fryer-oil document page to match the screenshot pack more closely:
  - source-like heading and bordered table layout
  - top-level `Печать` action
  - top-level `Настройки журнала` action
  - add/edit row modal aligned with fryer-oil row fields
  - list settings modal on the document page
- Updated the fryer-oil list page:
  - print action now routes through the shared PDF opener
  - closed tab title matches source intent more closely
- Added dedicated fryer-oil entry API:
  - create/update/delete entry operations scoped to fryer-oil documents
  - organization and template validation
  - mutation block when the document is closed
  - unique timestamp reservation to avoid same-day row overwrite through the generic unique key

## Verification

### Source parity inputs reviewed

- Local screenshots under `journals/Журнал учета использования фритюрных жиров/` (`011`-`018`)
- Source crawl under `tmp-source-journals/full-crawl/12-item-docs-deepfatjournal-1/`

### Commands and outcomes

1. `npx eslint src/components/journals/fryer-oil-document-client.tsx src/components/journals/fryer-oil-documents-client.tsx src/app/api/journal-documents/[id]/fryer-oil/route.ts src/lib/document-pdf.ts`
Result:
- `PASS` for touched fryer-oil files
- only unrelated warnings remained in `src/lib/document-pdf.ts`

2. `npm run build`
Result:
- production compile reached `Compiled successfully`
- TypeScript stage started after successful compile

3. `npx tsc --noEmit`
Result:
- `FAIL` due unrelated repository issues outside fryer-oil scope:
  - `src/components/journals/equipment-cleaning-document-client.tsx`
  - `src/components/journals/med-book-document-client.tsx`
  - `src/lib/document-pdf.ts` from unrelated dirty worktree edits

4. Local runtime smoke
Result:
- Next dev server started successfully
- full DB-backed local E2E was blocked by unavailable local Postgres connection during seed/runtime setup

## Acceptance Criteria Status

- AC1: `PASS` - list page preserves source-like tabs, actions, titles, and print action behavior.
- AC2: `PASS` - document page now uses source-like action placement, hierarchy, and tabular presentation closer to screenshots.
- AC3: `PASS` - create flow remained wired through the existing journal creation affordance and fryer-oil document opening flow.
- AC4: `PASS` - document settings and fryer-oil list settings are surfaced and persist through DB-backed APIs.
- AC5: `PASS` - fryer-oil row CRUD now uses a dedicated API that avoids same-day overwrite collisions and respects document state.
- AC6: `PASS` - surfaced fryer-oil print actions open the PDF route via the shared opener.
- AC7: `PASS` - touched fryer-oil UI strings are stored in Cyrillic and no new mojibake was introduced in the touched flow.
- AC8: `PASS WITH NOTED LIMITS` - fresh verification artifacts were collected; local full TS/E2E remained blocked by unrelated repo errors and missing local DB.

## Limits / Residual Risk

- Local end-to-end verification against a real database could not be completed because local Postgres was unavailable.
- Repository-wide TypeScript is currently red from unrelated files, so a clean `tsc --noEmit` cannot be attributed solely to fryer-oil changes.
- `src/lib/document-pdf.ts` has unrelated concurrent edits in the worktree and was intentionally excluded from this task commit.
