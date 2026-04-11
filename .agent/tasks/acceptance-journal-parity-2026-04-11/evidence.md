# Evidence: acceptance-journal-parity-2026-04-11

## Scope
- Target journal: `incoming_control`
- Reference assets:
  - `journals/Журнал приемки и входного контроля продукции/`
  - `tmp-source-journals/full-crawl/21-item-docs-acceptance2journal-1/`
  - `tmp-source-journals/full-crawl/11-item-docs-acceptance1journal-1/`

## Implemented changes
- Fixed the acceptance document page so product-acceptance copy stays product-specific and raw-material copy stays scoped by route/template.
- Fixed list-page print to open `/api/journal-documents/[id]/pdf` instead of an HTML `?print=1` page.
- Added document-page print action that opens the PDF route directly.
- Fixed edit-row behavior so editing uses the full row form instead of only `productName`.
- Fixed edit-lists dialog state initialization so opening the dialog does not wipe configured lists.
- Fixed acceptance PDF fallback title to use `getAcceptanceDocumentTitle(templateCode)`.
- Fixed visible dash fallback in the list page formatter.

## Verification summary
- Static diff review against target screenshots/source captures: PASS by code audit and reference comparison.
- Targeted ESLint on touched files: PASS with warnings only.
- Production build: PASS.
- Local runtime login flow: BLOCKED by database timeout (`Prisma ETIMEDOUT`) before authenticated journal checks.

## Raw artifacts
- Build log: `raw/build.log`
- Dev runtime stdout: `raw/next-dev.out.log`
- Dev runtime stderr: `raw/next-dev.err.log`
- ESLint JSON: `raw/eslint.json`
- Local screenshot inventory: `raw/local-screenshots.txt`
- Source crawl inventory: `raw/source-crawl-acceptance2.txt`

## Acceptance criteria status
- AC1: PASS
  - List page title/closed-tab label/print action align with product-acceptance references.
- AC2: PASS
  - Document page keeps the product-acceptance title/header, has the PDF print control, and preserves route-specific table copy.
- AC3: BLOCKED
  - End-to-end authenticated mutation checks could not be completed locally because `/api/auth/login` fails with `Prisma ETIMEDOUT`.
- AC4: PASS
  - Both exposed print actions for the touched flow now target the PDF route; build includes `/api/journal-documents/[id]/pdf`.
- AC5: BLOCKED
  - Code paths are organization-scoped through existing journal APIs, but authenticated runtime verification is blocked by local DB timeout.
- AC6: PASS
  - Touched acceptance strings in the affected flow render as proper Cyrillic in source.
- AC7: PASS
  - Spec, evidence, and raw artifacts were created under `.agent/tasks/acceptance-journal-parity-2026-04-11/`.
- AC8: PENDING
  - Awaiting push and deploy observation.
