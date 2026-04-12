# Visual Mobile Grid Batch

Date: 2026-04-12

## Defect class

Shared list-card layout defect on narrow screens:
- fixed desktop-only `grid-cols-[...]` document rows
- left-border metadata columns that assume a horizontal layout
- action menus aligned for the rightmost desktop column only

## Classification

Systemic, not local-only. The same card-row pattern was reused across multiple journal list pages.

## Code changes in this batch

- `src/components/journals/audit-plan-documents-client.tsx`
- `src/components/journals/audit-protocol-documents-client.tsx`
- `src/components/journals/training-plan-documents-client.tsx`
- `src/components/journals/product-writeoff-documents-client.tsx`
- `src/components/journals/cleaning-documents-client.tsx`
- `src/components/journals/staff-training-documents-client.tsx`

## Smallest safe remediation pattern

- row container: `grid-cols-1 gap-4 ... sm:grid-cols-[...] sm:gap-0`
- metadata columns: `border-t pt-4 ... sm:border-l sm:border-t-0 sm:pt-0`
- actions: `justify-start` on mobile, restore desktop alignment on `sm`
- oversized list titles/dates in narrow cards reduced with `sm:` typography

## Re-check scope

Rechecked globally against the shared desktop-grid list-card class. Remaining likely follow-up classes are:
- wide table min-width defaults in detail pages
- oversized top-level list headings in some journals

## Fresh checks

- `npx eslint ...` on the touched list-card files: PASS with one pre-existing warning in `audit-plan-documents-client.tsx`
- `npx tsc --noEmit`: PASS
