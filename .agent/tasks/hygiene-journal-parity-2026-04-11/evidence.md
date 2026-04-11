# Evidence

## Scope completed in code

- Updated hygiene document screen to be closer to source screenshots:
  - source-like header actions via `StaffJournalToolbar`
  - row selection checkbox column
  - interactive hygiene status / temperature cells with DB persistence
  - inline notes / legend on the same page instead of forced second screen page
- Fixed row deletion support for staff-journal documents via employee-wide delete in `entries` API
- Aligned hygiene PDF generation with screen behavior:
  - keep demo/source-like positions
  - pad printable roster to at least 7 rows
- Improved PDF API error semantics for missing documents
- Enlarged hygiene list settings modal toward source proportions

## Files changed

- `src/components/journals/hygiene-document-client.tsx`
- `src/components/journals/staff-journal-toolbar.tsx`
- `src/components/journals/hygiene-documents-client.tsx`
- `src/app/api/journal-documents/[id]/entries/route.ts`
- `src/app/api/journal-documents/[id]/pdf/route.ts`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/lib/document-pdf.ts`
- `.agent/tasks/hygiene-journal-parity-2026-04-11/spec.md`

## Verification run

### Targeted lint

Command:

```powershell
npx eslint 'src/components/journals/hygiene-document-client.tsx' 'src/components/journals/staff-journal-toolbar.tsx' 'src/components/journals/hygiene-documents-client.tsx' 'src/app/api/journal-documents/[id]/entries/route.ts' 'src/app/api/journal-documents/[id]/pdf/route.ts' 'src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx' 'src/lib/document-pdf.ts' 'src/components/journals/med-book-document-client.tsx' 'src/lib/cleaning-ventilation-checklist-document.ts'
```

Result:

- `0` errors
- only warnings remained for raw `<img>` usage inside `src/components/journals/med-book-document-client.tsx`

### Production build

Command:

```powershell
npm run build
```

Result:

- `BLOCKED`
- Next build could not acquire `.next/lock`, which indicates another build/dev process is already running in this workspace

### TypeScript compile

Command:

```powershell
npx tsc --noEmit --pretty false
```

Result:

- `PASS`
- targeted follow-up fixes also removed unrelated blockers in:
  - `src/components/journals/med-book-document-client.tsx`
  - `src/app/api/journal-documents/[id]/entries/route.ts`
  - `src/lib/cleaning-ventilation-checklist-document.ts`

### Production build after type fixes

Command:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build
```

Result:

- `BLOCKED`
- build now compiles successfully and reaches `Running TypeScript ...`
- in this environment the process does not complete within extended waits and remains resource/time blocked

### DB / PDF runtime probe

Attempted direct runtime probes through local Prisma / PDF generation.

Result:

- blocked by local DB connectivity: `DATABASE_URL` resolves to host `base`, which is unreachable from this environment
- therefore runtime validation of actual hygiene records / generated PDF bytes could not be completed locally

### Cache cleanup attempt

Command:

```powershell
Remove-Item -Recurse -Force '.next'
```

Result:

- blocked by locked Turbopack cache files under `.next/dev/cache/turbopack/...`

## Acceptance status

- `AC1 Visual parity`: `PARTIAL`
- `AC2 Functional behavior`: `PARTIAL`
- `AC3 Print/PDF behavior`: `PARTIAL`
- `AC4 Verification artifacts`: `PASS`
- `AC5 Deploy`: `BLOCKED`
