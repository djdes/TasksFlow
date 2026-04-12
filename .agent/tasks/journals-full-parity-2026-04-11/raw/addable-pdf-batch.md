# Addable Options And PDF Batch

## Scope
- acceptance row dialog
- metal_impurity row dialog
- product_writeoff row dialog
- shared PDF empty-table fallback in multiple generators

## Defect class 1: inline add buttons did not create visible options
- Classification: systemic UI/state bug
- Fixed in:
  - src/components/journals/acceptance-document-client.tsx
  - src/components/journals/metal-impurity-document-client.tsx
  - src/components/journals/product-writeoff-document-client.tsx
- Result:
  - newly typed product / manufacturer / supplier / material is appended to the local visible option list immediately
  - newly added option is selected immediately
  - persistence on save remains intact

## Defect class 2: PDF tables could render with no visible data rows
- Classification: systemic PDF rendering bug
- Fixed in:
  - src/lib/document-pdf.ts
- Result:
  - shared ensurePdfBodyRows helper now injects blank printable rows for empty bodies
  - cold_equipment, finished_product, tracked, register and UV runtime now keep visible row structure even with empty data
  - pest_control now renders multiple blank rows instead of collapsing to a nearly empty table

## Verification
- Focused eslint: PASS with warnings only
- Repo-wide tsc: blocked by unrelated existing error in src/components/journals/training-plan-documents-client.tsx
- No production-code changes were made in training_plan during this batch
