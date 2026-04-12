# Visual Mobile Sizing Batch

Date: 2026-04-12

## Defect class

Shared visual defect across journal list/settings surfaces on narrow screens:
- oversized dialog titles and controls (`text-[40px]/text-[42px]`, `h-20`, `text-[24px]/text-[28px]`)
- oversized empty-state blocks (`px-8 py-8 text-[28px]`)
- modal contents that could still exceed viewport height without local scroll guards

## Classification

Systemic, not local-only. The same mobile-sizing pattern appeared across multiple journals after comparing local implementations to the screenshot/live bundles.

## Code changes in this batch

- Global dialog safety:
  - `src/components/ui/dialog.tsx`
  - added viewport-safe width/height and `overflow-y-auto overscroll-contain`
- Local oversized-dialog fixes:
  - `src/components/journals/audit-report-document-client.tsx`
  - `src/components/journals/cold-equipment-document-client.tsx`
  - `src/components/journals/register-document-client.tsx`
  - `src/components/journals/tracked-document-client.tsx`
- Mobile control sizing fixes:
  - `src/components/journals/sanitation-day-documents-client.tsx`
  - `src/components/journals/breakdown-history-documents-client.tsx`
  - `src/components/journals/cleaning-ventilation-checklist-documents-client.tsx`
  - `src/components/journals/hygiene-documents-client.tsx`
  - `src/components/journals/sanitary-day-checklist-documents-client.tsx`

## Smallest safe remediation pattern

- dialog titles: `text-3xl ... sm:text-[40px/42px]`
- form controls: `h-14 ... text-[16px] sm:h-20 sm:text-[24px/28px]`
- date icons: `right-4 size-6 sm:right-6 sm:size-8`
- primary actions: `h-12 px-8 text-[18px] sm:h-14 sm:px-10 sm:text-[24px]`
- empty states: `px-4 py-5 text-lg sm:px-8 sm:py-8 sm:text-[28px]`

## Re-check scope

Rechecked globally against shared journal clients for the same visual class. Remaining likely follow-up classes are:
- rigid fixed-column grids on mobile
- wide table min-width defaults on mobile
- oversized top-level headings in some list pages

## Fresh checks

- `npx eslint ...` on the touched visual files: PASS
- `npx tsc --noEmit`: PASS
