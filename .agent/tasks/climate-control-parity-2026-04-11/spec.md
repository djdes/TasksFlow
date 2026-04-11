# Task Spec: climate-control-parity-2026-04-11

## Metadata
- Task ID: climate-control-parity-2026-04-11
- Created: 2026-04-11
- Repo root: C:\www\Wesetup.ru

## Guidance sources
- AGENTS.md
- CLAUDE.md
- journals\Бланк контроля температуры и влажности\*
- tmp-source-journals\full-crawl\03-item-docs-storageconditionjournal-1\*
- src\lib\climate-document.ts
- src\components\journals\climate-document-client.tsx
- src\app\(dashboard)\journals\[code]\page.tsx
- src\app\(dashboard)\journals\[code]\documents\[docId]\page.tsx
- src\app\api\journal-documents\[id]\climate\route.ts
- src\app\api\journal-documents\[id]\pdf\route.ts
- src\lib\document-pdf.ts
- prisma\seed.ts

## Original task statement
Freeze spec only for task ID `climate-control-parity-2026-04-11` in repo `C:\www\Wesetup.ru`. User wants parity for journal `Бланк контроля температуры и влажности` / code `climate_control`: find matching screenshots in `journals\Бланк контроля температуры и влажности`, compare against current implementation and source-site artifacts already in repo, and define acceptance criteria covering screenshot parity, UTF-8 Russian labels, list/detail flows, DB persistence, settings, row CRUD, room config, auto-fill behavior, and print button always opening a PDF table page via existing journal-document PDF route. Write only `.agent/tasks/climate-control-parity-2026-04-11/spec.md`.

## Current repo findings
- The journal already exists as template code `climate_control` in `prisma/seed.ts`.
- The local implementation already has dedicated document logic in `src/lib/climate-document.ts`, UI in `src/components/journals/climate-document-client.tsx`, API support in `src/app/api/journal-documents/[id]/climate/route.ts`, and PDF generation in `src/lib/document-pdf.ts`.
- The source-site mapping already points `storageconditionjournal` to local code `climate_control`.
- The repo contains both active and archive source captures for the same journal under `tmp-source-journals/full-crawl/03-item-docs-storageconditionjournal-1/`.
- The repo contains a local screenshot set for the requested journal under `journals\Бланк контроля температуры и влажности\`.
- The current climate implementation contains visible mojibake in Russian strings; this must be treated as a parity defect, not as acceptable existing behavior.

## Task goal
Bring the existing `climate_control` journal to screenshot and source-artifact parity for the journal `Бланк контроля температуры и влажности`, while preserving the current journal-document architecture, real DB-backed persistence, and the existing journal-document PDF route.

## Assumptions
- The task upgrades the existing `climate_control` journal instead of introducing a duplicate template.
- “Screenshot parity” means the local list page, detail page, dialogs, cards, labels, table structure, and key visual hierarchy should be close enough for direct side-by-side comparison with the stored screenshots and source captures; pixel-perfect CSS equivalence is not required unless the screenshots show a precise element that can be matched directly.
- Source-site artifacts already stored in the repo are the authority for flows that are not fully obvious from the screenshot filenames alone.
- The print requirement means every visible “Печать” entry point for this journal must open the existing `/api/journal-documents/[id]/pdf` route in a new page/tab and that route must render the climate table as a PDF document, not HTML and not a dead link.
- “Auto-fill behavior” refers to the existing climate-specific journal behavior that can generate or sync daily rows through the climate API, and it must remain DB-backed.

## Constraints
- Freeze spec only in this step; do not implement production changes beyond this file.
- Reuse the current journal-document storage and routing model.
- Do not rely on client-only mock state for any required user flow when the repo already has a persisted path.
- Preserve unrelated journals and shared document flows.
- All visible Russian labels in this journal flow must render in valid UTF-8 Cyrillic.

## Non-goals
- Redesigning the whole dashboard or all journal pages.
- Replacing the shared PDF generation subsystem.
- Changing unrelated journal seed titles, source mappings, or document APIs unless directly required for this journal.
- Adding brand-new business behavior that is not supported by screenshots, source artifacts, or the existing climate journal domain model.

## Acceptance criteria

### AC1. Journal identity, title, and routing
The repo exposes the requested journal through the existing journal system as the existing `climate_control` journal.

Pass conditions:
- The journal is reachable through the existing dashboard route for code `climate_control`.
- The journal title is shown as exactly `Бланк контроля температуры и влажности` anywhere the source/screenshots require the title.
- The list page and document page resolve through the current journal/document routes without introducing parallel pages for the same journal.
- No conflicting duplicate template or duplicate journal card is introduced for this same journal.

### AC2. UTF-8 Russian labels
The full user-facing climate journal flow renders readable Russian text instead of mojibake.

Pass conditions:
- The journal list page, document page, dialogs, buttons, empty states, room settings UI, auto-fill UI, table headers, print labels, and PDF output use readable UTF-8 Cyrillic where Russian text is expected.
- No mojibake remains in climate-specific labels such as title, room editor text, metric labels, save/delete confirmations, empty states, or settings text.

### AC3. List page parity
The journal list page matches the stored screenshots/source artifacts for active and closed documents.

Pass conditions:
- The page exposes the same high-level structure as the source/screenshots: page title, action area, active/closed separation, and document cards.
- Active and closed documents are both reachable from the list page via the appropriate tab/state rather than through hidden routes only.
- Document cards show source-matching summary fields for climate documents, including title and date/responsible metadata where present in the source.
- The create/open/edit/close/delete/print affordances shown in the source for list cards are present and behave through the existing document APIs.
- Closed documents remain visible in the closed/archive state.

### AC4. Document detail visual parity
The document detail page structure matches the stored screenshots and source captures.

Pass conditions:
- The page shows breadcrumbs/title hierarchy consistent with other document journals and aligned with the source captures.
- The page includes the HACCP-style printable title/header area expected for this journal.
- The top action row matches the screenshot/source intent, including settings and print access.
- The main content visually centers around the climate room summary blocks plus the measurement table, in the same overall information order as the screenshots.
- Closed documents are clearly read-only in the detail flow.

### AC5. Settings dialog parity and persistence
The climate journal settings flow supports the controls required by the source/screenshots and persists them.

Pass conditions:
- The document settings dialog supports editing document title, control times, weekend-handling setting, default responsible role/title, and default responsible employee where the current domain model supports them.
- Saving settings updates the persisted document/config state via the existing journal-document APIs.
- Reloading the page shows the same saved settings.
- Any setting that affects the visible table, room cards, periodicity text, auto-fill behavior, or printable output is reflected after save and reload.

### AC6. Room configuration parity and persistence
The journal supports screenshot/source-matching room configuration management.

Pass conditions:
- The user can add a room, edit a room, and delete a room when deletion is allowed by the journal rules.
- Room configuration includes room name plus enabled/disabled temperature and humidity controls with min/max thresholds.
- The UI prevents invalid “room with no enabled metrics” state or otherwise blocks saving such a room.
- Room cards on the page reflect the saved room settings after save and after reload.
- The measurement table and PDF layout both use the persisted room configuration.

### AC7. Row CRUD and table behavior
The climate document supports DB-backed row creation, editing, update, and removal consistent with the journal logic.

Pass conditions:
- The user can add a row for a date/responsible employee combination through the document UI.
- Existing rows can be edited and saved.
- Row deletion is available where the current journal interaction model expects it.
- Row data persists through reload because it is stored through the existing journal-document persistence layer.
- Closed documents do not permit editable row CRUD actions.

### AC8. Measurement table parity
The climate table structure matches the screenshot/source logic.

Pass conditions:
- The table includes a left-side date column and a responsible person column aligned with the existing climate model.
- For each configured room and control time, the table renders the enabled metric columns only: temperature, humidity, or both.
- Table headers group columns by room and by control time in a way that matches the current source screenshots/artifacts.
- Cell edits update the correct persisted measurement field for the correct room, control time, and row.
- Empty-state messaging matches the intended flow and does not depend on mock-only data.

### AC9. Responsible employee and role behavior
Responsible employee and role handling work end to end in list, detail, row, settings, auto-fill, and print flows.

Pass conditions:
- The settings flow can persist a default responsible role/title and employee.
- Row-level data can carry the responsible title according to the current climate model.
- The responsible employee shown on rows and in printable output resolves from real available employee data in the current organization context.
- Reloading or printing the document preserves responsible person associations.

### AC10. Auto-fill and sync behavior
The climate-specific auto-fill behavior remains present, working, and persisted.

Pass conditions:
- The auto-fill control shown on the document page is visible and behaves as a real setting, not a dead switch.
- Toggling auto-fill persists the setting on the document.
- Applying auto-fill uses the existing `/api/journal-documents/[id]/climate` flow and creates/syncs rows in persisted storage rather than only mutating client state.
- Auto-fill does not duplicate existing rows for the same date/employee key.
- User-visible failure messaging is shown when auto-fill cannot be completed.

### AC11. Source-aligned archive/closed behavior
The journal’s closed/archive behavior matches the source-backed active vs archive flows.

Pass conditions:
- A document can move from active to closed/archive through the existing journal controls.
- Closed/archive documents appear under the closed/archive list state.
- Closed/archive documents remain printable.
- Closed/archive documents are not editable in settings, rows, or measurement cells unless the source flow explicitly allows it.

### AC12. Print button always opens the PDF table route
Every climate-journal print entry point opens a PDF table page through the existing journal-document PDF route.

Pass conditions:
- The detail-page print button opens `/api/journal-documents/[id]/pdf` in a new page/tab.
- Any list-page print action for this journal also resolves to the same existing PDF route for the selected document.
- The returned output is a PDF table document for the climate journal, generated by the current shared PDF subsystem.
- The PDF reflects the current persisted climate settings, room configuration, rows, metrics, and responsible data.

### AC13. DB persistence and testability
The parity surface is fully backed by the current DB/document model and remains verifiable in the repo.

Pass conditions:
- Documents, room config, control times, weekend setting, responsible defaults, auto-fill flag, and row measurements are persisted through the existing document APIs and data model.
- The implementation remains compatible with the current seed/demo patterns for `climate_control` so the journal can be exercised without manual schema hacking.
- No acceptance criterion depends exclusively on ephemeral client-only state.

### AC14. Fresh verification gate
Completion for the later implementation task is blocked on a fresh verification pass.

Pass conditions:
- Verification is rerun against the current working tree after implementation.
- Each acceptance criterion in this spec is explicitly checked and recorded.
- The task cannot be claimed complete unless every acceptance criterion is `PASS`.

## Verification plan
- Verify `climate_control` routing, title rendering, and active/closed list states.
- Verify all visible climate-specific labels render in correct UTF-8 Russian.
- Verify list page card visuals and actions against `journals\Бланк контроля температуры и влажности\*` and `tmp-source-journals\full-crawl\03-item-docs-storageconditionjournal-1\*`.
- Verify settings save/reload behavior for title, times, weekend mode, default responsible role, and default responsible employee.
- Verify room add/edit/delete and threshold persistence.
- Verify row add/edit/delete and inline measurement editing with reload.
- Verify auto-fill toggle and apply flow through `/api/journal-documents/[id]/climate`.
- Verify closed/archive state behavior.
- Verify every print button opens the existing `/api/journal-documents/[id]/pdf` route and returns a climate PDF table with current data.
- Run fresh project checks required by the touched implementation surface during the later build phase and record results in task evidence.

## Key risks
- Existing mojibake in `src/lib/climate-document.ts` and `src/components/journals/climate-document-client.tsx` can hide parity regressions across many UI states.
- Climate parity spans list UI, detail UI, config persistence, climate-specific API logic, and shared PDF generation, so small changes can desync one surface from another.
- Source parity depends on both the local screenshot folder and the stored source captures; if they disagree, the implementation must align to the stronger combined evidence and document that decision in later evidence artifacts.
