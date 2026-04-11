# Problems: journals-audit-loop

## AC2: For every folder with screenshots, the corresponding journal UI is compared against the screenshots and all user-visible mismatches in layout, labels, controls, navigation, and state handling are fixed.
- Status: `UNKNOWN`
- Why it is not proven:
  The current wave confirms only a narrow slice of screenshot-parity fixes. The repo still lacks a fresh screenshot-by-screenshot verification pass for every screenshot-backed journal, and the metal-impurity closed-tab heading still keeps a `"(Закрытые)"` suffix whose parity against the source screenshot is not yet proven.
- Minimal reproduction steps:
  1. Open the screenshot-backed journals covered by this wave, especially the raw-material acceptance journal, the cleaning/ventilation checklist, and the metal-impurity closed tab.
  2. Compare the live list/detail pages against the source images in `journals/`.
  3. Record any remaining label, breadcrumb, heading, or layout mismatch.
- Expected vs actual:
  Expected: every screenshot-backed journal in scope has fresh proof of parity and no unresolved visible mismatch.
  Actual: only selected fixes are confirmed; full parity evidence is incomplete.
- Affected files:
  `src/components/journals/sanitary-day-checklist-documents-client.tsx`
  `src/components/journals/acceptance-document-client.tsx`
  `src/components/journals/metal-impurity-documents-client.tsx`
- Smallest safe fix:
  Finish the screenshot comparison for the remaining screenshot-backed journals in scope and patch only the concrete visual mismatches found. If the metal-impurity closed heading does not match the screenshot, remove or adjust the suffix rather than broadening the component.
- Corrective hint:
  Use the screenshot folders as the source of truth and close AC2 journal-by-journal. Do not mark AC2 `PASS` until each screenshot-backed route in the current wave has fresh visual proof.

## AC3: For every journal template that does not have a screenshot folder, the journal list and document flow are smoke-tested for button behavior, layout alignment, database persistence, and linkage to the existing site logic, and any breakage is fixed.
- Status: `UNKNOWN`
- Why it is not proven:
  The UV runtime route/detail fix is verified, but the wider no-screenshot set still lacks fresh end-to-end smoke proof for create/open/save/close/delete and persistence behavior across all targeted journals.
- Minimal reproduction steps:
  1. For each no-screenshot journal in the active wave (`uv_lamp_runtime`, `general_cleaning`, `cold_equipment_control`, `climate_control`, `finished_product`), create or open a document from the list page.
  2. Modify at least one setting and one row/config field, save, reload, and confirm persistence.
  3. Where supported, close the document, verify the closed tab behavior, and confirm read-only state.
- Expected vs actual:
  Expected: each no-screenshot journal in the wave has fresh smoke evidence for the core list/document flow and persistence.
  Actual: current proof is partial and limited mostly to the UV route/detail fix plus compile/lint checks.
- Affected files:
  `src/components/journals/uv-lamp-runtime-document-client.tsx`
  `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- Smallest safe fix:
  Run the bounded smoke wave and only patch the concrete behavior that fails. Keep the scope within the journal client, helper, or matching API route for each failing flow.
- Corrective hint:
  Close AC3 with one no-screenshot wave at a time and attach fresh proof per journal. Compile/lint success is necessary but not enough for this criterion.
