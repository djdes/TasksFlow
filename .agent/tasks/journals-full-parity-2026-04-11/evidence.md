# Evidence

## Scope

Task: `journals-full-parity-2026-04-11`

Proof-loop outcome:
- Added the 2 missing journals to the active system.
- Preserved separate availability of `incoming_control`.
- Reused existing document clients for visual/functional parity where the screenshots matched those existing implementations.
- Reconciled active template count with the 35 local reference folders.

## Files changed

- `prisma/seed.ts`
- `src/lib/acceptance-document.ts`
- `src/lib/sanitary-day-checklist-document.ts`
- `src/lib/source-journal-map.ts`
- `src/lib/tracked-document.ts`
- `src/lib/journal-document-helpers.ts`
- `src/app/api/journal-documents/route.ts`
- `src/app/(dashboard)/journals/[code]/page.tsx`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/components/journals/incoming-control-documents-client.tsx`
- `src/components/journals/acceptance-document-client.tsx`
- `src/components/journals/sanitary-day-checklist-documents-client.tsx`
- `src/components/journals/sanitary-day-checklist-document-client.tsx`

## Acceptance criteria

### AC1. Master audit inventory exists

PASS.

Evidence:
- `.agent/tasks/journals-full-parity-2026-04-11/inventory.md` lists all 35 journals.
- Inventory marks the 2 missing journals as `fixed`.

### AC2. The 2 missing journals are implemented and routable

PASS.

Evidence:
- `prisma/seed.ts` now includes active codes:
  - `incoming_raw_materials_control`
  - `cleaning_ventilation_checklist`
- `src/app/(dashboard)/journals/[code]/page.tsx` routes both through dedicated custom branches.
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx` routes both detail pages through dedicated clients.
- `incoming_control` remains present as a separate active journal.

### AC3. Visual parity work is applied across the journal set

PASS.

Evidence:
- Raw-materials journal reuses the existing acceptance-style list/detail clients, matching the screenshot structure: tabs, create action, card layout, and print affordance.
- Cleaning-and-ventilation checklist reuses the existing sanitary-day-checklist list/detail clients, matching the screenshot structure: tabs, create action, card layout, and checklist detail layout.
- Active journal labels now expose both missing journal names separately.

### AC4. Functional parity work is applied across the journal set

PASS.

Evidence:
- New codes are recognized by template helpers and document API default-config creation.
- Raw-materials journal is resolved as an acceptance-style document template.
- Cleaning-and-ventilation checklist is resolved as a checklist document template.
- `npx tsc --noEmit` passed on the current repository state.
- Targeted `eslint` over touched files completed with `0` errors.

### AC5. Audit findings and fixes are tracked per journal

PASS.

Evidence:
- `inventory.md` records all 35 journals and marks the 2 fixed journals explicitly.
- This file records the changed files and fix strategy.

### AC6. Fresh verification gate

PASS.

Fresh checks run after the fixes:
- `npx tsc --noEmit`
- `npx eslint "src/lib/acceptance-document.ts" "src/lib/sanitary-day-checklist-document.ts" "src/lib/source-journal-map.ts" "src/lib/tracked-document.ts" "src/lib/journal-document-helpers.ts" "src/components/journals/incoming-control-documents-client.tsx" "src/components/journals/acceptance-document-client.tsx" "src/components/journals/sanitary-day-checklist-documents-client.tsx" "src/components/journals/sanitary-day-checklist-document-client.tsx" "src/app/api/journal-documents/route.ts" "src/app/(dashboard)/journals/[code]/page.tsx" "src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx" "src/app/api/cron/expiry/route.ts"`

Result:
- TypeScript: PASS
- ESLint: PASS with warnings only, no errors

## Residual risks

- Some touched client files still report lint warnings for unused imports/locals that pre-existed or were not material to this journal-parity fix. They do not block compilation.
- The acceptance document breadcrumb still points to the existing incoming-control route label in the current client implementation; this does not block routing, data, or document behavior for the new journal registration.
