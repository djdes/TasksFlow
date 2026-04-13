# Evidence

## Overall status
PASS

## AC1
PASS. `scripts/reset-demo-journal-data.ts` now deletes all users in the demo organization before recreating the new roster, in addition to clearing `JournalDocumentEntry`, `JournalDocument`, `JournalEntry`, and `StaffCompetency`.

Proof:
- Code path: `scripts/reset-demo-journal-data.ts`
- `raw/test-integration.txt`: fresh `npx tsx scripts/reset-demo-journal-data.ts` run completed with `EXIT_CODE: 0`

## AC2
PASS. After a fresh reset, the demo organization contains only the new roster, with one active employee per target position and no legacy demo users.

Proof:
- `raw/db-audit.json`
- `legacyUsers: []`
- `repeatedPositions: []`
- Active users:
  - `admin@haccp.local` — `Управляющий`
  - `qa-chief@haccp.local` — `Руководитель качества`
  - `production-lead@haccp.local` — `Начальник производства`
  - `hot-line@haccp.local` — `Старший повар горячего цеха`
  - `cold-line@haccp.local` — `Повар холодного цеха`
  - `warehouse@haccp.local` — `Кладовщик`
  - `sanitation-master@haccp.local` — `Специалист по санитарной обработке`
  - `service-engineer@haccp.local` — `Инженер по оборудованию`

## AC3
PASS. After a fresh reset there is exactly one document for each of the 35 active journal templates.

Proof:
- `raw/test-integration.txt`
- `raw/db-audit.json`
- `activeTemplates: 35`
- `documents: 35`
- `templateCoverage` shows `count: 1` for all 35 active template codes
- `weakDocs` is empty

## AC4
PASS. Every retained journal document is meaningfully populated by config and/or at least one non-empty entry payload.

Proof:
- `raw/db-audit.json`
- `weakDocs: []`
- Examples:
  - `hygiene`: `entryCount = 120`
  - `health_check`: `hasConfig = true`, `entryCount = 120`
  - config-driven journals such as `finished_product`, `audit_plan`, `traceability_test`, `glass_items_list` have `hasConfig = true`
  - entry-driven journals such as `pest_control` have `entryCount > 0`

## AC5
PASS. Fresh proof artifacts exist, workflow validation passes, and TypeScript passes.

Proof:
- `raw/build.txt`: `npx tsc --noEmit`, `EXIT_CODE: 0`
- `raw/lint.txt`: `task_loop.py validate --task-id journal-demo-hard-reset-2026-04-13`, `EXIT_CODE: 0`, `"valid": true`
- Task artifacts live in `.agent/tasks/journal-demo-hard-reset-2026-04-13/`

## Changed files
- `scripts/reset-demo-journal-data.ts`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/spec.md`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/evidence.md`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/evidence.json`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/raw/build.txt`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/raw/test-integration.txt`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/raw/lint.txt`
- `.agent/tasks/journal-demo-hard-reset-2026-04-13/raw/db-audit.json`
