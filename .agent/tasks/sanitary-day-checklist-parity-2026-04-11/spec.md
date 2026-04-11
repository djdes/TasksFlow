# Task: Sanitary Day Checklist parity and verification

## Goal
Bring the journal `Чек-лист уборки и проветривания помещений` to visual and behavioral parity with the reference screenshots from `journals/Чек-лист уборки и проветривания помещений`, verify the site implementation end-to-end, and deploy the validated fix set.

## Scope
- Journal discovery and route verification in the current app.
- Visual comparison against local JPG references.
- Functional verification of list page, document page, persistence, and print behavior.
- Minimal safe code and/or data fixes required for parity and correctness.
- Evidence capture, fresh verification, push to `master`, and deploy confirmation.

## Out of scope
- Unrelated journals.
- Broad design refactors outside the target journal flow.
- Reverting unrelated local changes already present in the worktree.

## Acceptance Criteria
- AC1: The target journal is correctly identified in the app and opens through its intended route using the document-based journal flow.
- AC2: The document UI visually matches the reference screenshots closely enough that major structural differences are removed, including title/header/table/signature layout and obvious controls.
- AC3: Document interactions required for normal use work correctly: create/open/update relevant fields, save checklist marks/config, and reflect persisted data through the backed API/DB flow.
- AC4: The print action always opens a dedicated page that renders a PDF-style printable table for this journal rather than relying only on raw browser print of the edit page.
- AC5: Fresh verification artifacts show PASS for the implemented acceptance criteria, with explicit notes for any residual limitation.
- AC6: Changes are pushed to `master`, autodeploy is confirmed against production signals, or if deploy initially fails it is fixed and then confirmed.

## Planned checks
- Inspect current journal routing and template configuration.
- Compare reference JPGs to live local pages.
- Verify API calls for document update and entry persistence.
- Verify print flow and rendered printable page.
- Run relevant project checks after edits.
- Confirm GitHub-triggered deployment and production health.
