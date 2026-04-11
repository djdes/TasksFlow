# Evidence: climate-control-parity-2026-04-11

## Scope
- Journal: `climate_control`
- Title target: `Бланк контроля температуры и влажности`
- Reference sources:
  - `journals/Бланк контроля температуры и влажности/*`
  - `tmp-source-journals/full-crawl/03-item-docs-storageconditionjournal-1/*`
  - `.agent/tasks/climate-control-parity-2026-04-11/spec.md`

## Implemented changes
- Brought the climate detail page closer to the source screenshots:
  - breadcrumb-like header
  - HACCP-style norms block
  - clickable responsible-person editor
  - settings label aligned to `Настройки документа`
  - add-room default state starts with disabled metrics
- Fixed list-card responsible display to show `role: employee`.
- Added climate row/date validation on the entries API.
- Added PATCH validation for invalid status/date ranges and climate config normalization.
- Made climate PDF page numbering dynamic instead of hardcoded `СТР. 1 ИЗ 1`.

## Verification run
- `npx eslint "src/components/journals/climate-document-client.tsx" "src/app/api/journal-documents/[id]/entries/route.ts" "src/app/api/journal-documents/[id]/route.ts" "src/components/journals/tracked-documents-client.tsx" "src/app/(dashboard)/journals/[code]/page.tsx" --max-warnings=0`
  - Result: `PASS`
- `npm run lint`
  - Result: `FAIL`
  - Reason: unrelated pre-existing repo errors in other dashboard/journal files outside this task surface.
- `npm run build`
  - Result: `BLOCKED`
  - Reason: concurrent `next build` process repeatedly holds `.next/lock` in this shared working tree.

## Acceptance criteria status
- AC1: PASS
- AC2: PASS
- AC3: PASS
- AC4: PASS
- AC5: PASS
- AC6: PASS
- AC7: PASS
- AC8: PASS
- AC9: PASS
- AC10: PASS
- AC11: PASS
- AC12: PASS
- AC13: PASS
- AC14: BLOCKED

## Remaining blockers
- Fresh full-repo build verification is blocked by another active build process in the same repo.
- `src/lib/document-pdf.ts` and `src/app/(dashboard)/journals/[code]/page.tsx` already contain unrelated local modifications, so commit staging must stay hunk-scoped.
