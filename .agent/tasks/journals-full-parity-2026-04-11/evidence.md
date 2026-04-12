# Evidence

## Snapshot

Task: `journals-full-parity-2026-04-11`

This refresh captures the shared list-route fix for the "create opens, then disappears from the journal list" defect class. It is not a completion claim.

## Current shared-fix proof

- [src/app/(dashboard)/journals/[code]/page.tsx](/c:/www/Wesetup.ru/src/app/(dashboard)/journals/[code]/page.tsx:275) still contains `normalizeDemoJournalSampleCorpus()`, but the helper now exits safely instead of deleting journal documents.
- The fresh code excerpt in `raw/shared-demo-normalization-scan-2026-04-12.txt` and the line capture around `275-299` show the destructive path is gone and replaced by a non-destructive early return.
- The same shared route still calls that helper during journal-list loading at [src/app/(dashboard)/journals/[code]/page.tsx](/c:/www/Wesetup.ru/src/app/(dashboard)/journals/[code]/page.tsx:1297).
- Because `/journals/[code]` is the common list route for the active template set, this removes one shared destructive behavior that could have hidden newly created documents across the full 35-journal set, not just one journal.
- The demo-org trigger marker `admin@haccp.local` is still present in the route scan, so the code-level fix is specifically relevant to the original demo-sample path.

## Fresh checks

Fresh command outputs are stored under `.agent/tasks/journals-full-parity-2026-04-11/raw/`.

- `npx tsc --noEmit`
  - Result: `PASS`
  - Artifact: `raw/tsc-2026-04-12.txt`
- `npx eslint "src/app/(dashboard)/journals/[code]/page.tsx"`
  - Result: `PASS`
  - Artifact: `raw/eslint-page-2026-04-12.txt`
- Shared-route scan
  - Result: `PASS`
  - Artifact: `raw/shared-demo-normalization-scan-2026-04-12.txt`
  - Summary: confirms `normalizeDemoJournalSampleCorpus()` is still called from the common list route and the `admin@haccp.local` demo marker still exists, but the helper no longer contains the old destructive `deleteMany(...)` branch.
- Local DB/runtime probe through the same adapter path the app uses
  - Result: `PARTIAL`
  - Artifacts:
    - `raw/db-runtime-check.json`
    - `raw/db-runtime-check-2026-04-12.json`
  - Summary: local PostgreSQL is reachable, `JournalTemplate` count is `35`, but `admin@haccp.local` is absent in the current local DB, so the exact demo-org runtime path cannot be replayed end to end here.
- Server PostgreSQL probe through the real production dataset
  - Result: `PASS`
  - Artifacts:
    - `raw/server-db-meta-2026-04-12.json`
    - `raw/server-demo-risk-2026-04-12.txt`
  - Summary: the real server PostgreSQL contains `admin@haccp.local`, and that demo organization currently has `74` journal documents with multiple template sets outside the old `1 active + 1 closed` assumption. This proves the removed `deleteMany(...)` branch was a real shared data-loss hazard on the server-backed dataset, not a local-only theory.
- Proof-loop structure validation
  - Result: `PASS`
  - Artifact: `raw/validate-2026-04-12.txt`

## Current acceptance-criterion snapshot

- `AC1`: `PASS`
  - `inventory.md` still tracks the 35-journal target set.
- `AC2`: `PASS`
  - `inventory.md` and `raw/implementation-matrix.json` still map each active journal to route, list implementation, detail implementation, and print mode.
- `AC3`: `PASS`
  - `raw/visual-matrix.json` and [src/lib/source-journal-map.ts](/c:/www/Wesetup.ru/src/lib/source-journal-map.ts:1) still cover the live/source mapping set, including the earlier alias fix.
- `AC4`: `FAIL`
  - Visual inputs and partial reviewed batches exist, but the bundle still does not contain completed reviewed visual verdicts for all 35 journals.
- `AC5`: `FAIL`
  - The task has partial visual fixes and reviewed batches, but not a complete 35-journal reviewed visual outcome matrix.
- `AC6`: `UNKNOWN`
  - `raw/behavior-matrix.json` and `raw/behavior-proof-notes.md` still provide broad code-path coverage.
  - The new shared-route proof materially strengthens the create/list persistence story because the common list page no longer wipes demo-org documents during normalization.
  - `raw/server-db-meta-2026-04-12.json` and `raw/server-demo-risk-2026-04-12.txt` prove the real server PostgreSQL does contain the demo-admin dataset and that the old two-sample assumption was violated in live server-backed data.
  - Runtime DB proof is still incomplete for a full end-to-end application replay, but the server-backed evidence removes the earlier false blocker that only local PostgreSQL mattered.
- `AC7`: `UNKNOWN`
  - `raw/behavior-matrix.md` and `raw/print-matrix.md` still provide cross-journal button wiring coverage.
  - The shared fix removes one systemic way a successful create/open action could appear broken after reload across the common list route.
  - Server-backed evidence now proves the old destructive branch was relevant to the real demo dataset, not just to a hypothetical local seed.
  - Full runtime confirmation of create/open/edit/archive behavior across all 35 journals is still incomplete.
- `AC8`: `UNKNOWN`
  - Existing print artifacts still show broad print-route coverage, but this refresh did not add new local application-runtime PDF proof for every print-capable journal.
- `AC9`: `PASS`
  - This defect class was rechecked at the shared route level that fronts the full journal set.
  - The new evidence proves the list-route normalization fix is systemic: the helper lives in the common `/journals/[code]` page, so the removal of destructive deletion applies across the same 35-journal surface.
- `AC10`: `PASS`
  - Required proof-loop artifacts remain present, and the evidence bundle now includes fresh raw artifacts for the shared list-route fix.
- `AC11`: `PASS`
  - Fresh verification artifacts were rerun against the current repository state:
    - `raw/tsc-2026-04-12.txt`
    - `raw/eslint-page-2026-04-12.txt`
    - `raw/shared-demo-normalization-scan-2026-04-12.txt`
    - `raw/db-runtime-check-2026-04-12.json`
- `AC12`: `FAIL`
  - The shared destructive-list-route defect now has stronger proof and no longer depends on a dead local Postgres assumption; the new server-backed artifacts prove the bug was relevant to the real dataset.
  - Completion is still blocked because AC4 and AC5 remain `FAIL`, and AC6-AC8 still lack full runtime proof for the complete 35-journal set.

## Residual blockers

- Full reviewed visual verdict coverage for all 35 journals is still incomplete.
- The local DB now works, and the server DB proves the real demo dataset exists, but a full end-to-end application replay against the server-backed app/runtime is still not packaged in this task.
- This refresh proves one shared destructive create/list defect was removed from the common route; it does not by itself close the whole parity task.
