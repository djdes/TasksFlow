# Problems

## AC4 FAIL
Criterion: Each journal is checked for visual parity against screenshots and/or the live site.

Status: `FAIL`

Why it is not proven:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/reviewed-visual-matrix.md` still marks every journal as `BLOCKED`.
- Separate review artifacts exist only for 12 journals in `visual-batch-1-review.md` and `visual-batch-2-review.md`.
- There is no single current reviewed verdict set covering all 35 journals.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/reviewed-visual-matrix.md`.
2. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/visual-batch-1-review.md` and `visual-batch-2-review.md`.
3. Compare them with `AC4` in `.agent/tasks/journals-full-parity-2026-04-11/spec.md`.

Expected vs actual:
- Expected: all 35 journals have an explicit reviewed visual verdict tied to concrete local/live proof.
- Actual: the reviewed matrix is still globally blocked, and only 12 journals have reviewed notes.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/reviewed-visual-matrix.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/reviewed-visual-matrix.json`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/visual-batch-1-review.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/visual-batch-2-review.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.json`

Smallest safe fix:
- Consolidate the visual review artifacts into one current 35-journal reviewed matrix and fill the remaining 23 journal verdicts.

Corrective hint:
- Один источник правды лучше, чем пачка кожаных бумажек по разным углам.

## AC5 FAIL
Criterion: Visual parity is improved as far as feasible.

Status: `FAIL`

Why it is not proven:
- The bundle shows some reviewed results and at least one visual fix (`med_books` print removal), but it does not provide a complete reviewed outcome set across all 35 journals.
- Without a full reviewed verdict matrix, the verifier cannot judge which journals are matched, improved, or still blocked.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`.
2. Review the visual artifacts listed there.
3. Compare the available reviewed outcomes with the 35-journal scope in `spec.md`.

Expected vs actual:
- Expected: the bundle clearly records per-journal visual outcomes such as `CLOSE`, `FIXED`, or isolated blocker.
- Actual: partial visual outcomes exist, but not for the whole target set.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.json`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/reviewed-visual-matrix.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/visual-batch-1-review.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/visual-batch-2-review.md`

Smallest safe fix:
- Promote the existing partial reviews into a full reviewed verdict matrix and explicitly mark the remaining journals as matched, fixed, or blocked with proof refs.

Corrective hint:
- Здесь не новый UI чинить надо, а довести evidence до взрослого силиконового состояния.

## AC6 UNKNOWN
Criterion: Data flow, DB integration, routing, and interactions are verified.

Status: `UNKNOWN`

Why it is not proven:
- The shared `normalizeDemoJournalSampleCorpus()` delete path is removed, which fixes the discovered systemic create/open/list data-loss defect.
- `.agent/tasks/journals-full-parity-2026-04-11/raw/server-db-meta-2026-04-12.json` proves the real server PostgreSQL contains `admin@haccp.local`.
- `.agent/tasks/journals-full-parity-2026-04-11/raw/server-demo-risk-2026-04-12.txt` proves the real demo organization has `74` journal documents and multiple template sets outside the old `1 active + 1 closed` assumption.
- That materially strengthens the reasoning that the shared fix addresses a real server-backed bug.
- The current bundle still does not provide end-to-end runtime DB/data-flow verification across all 35 journals.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.json`.
2. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/server-db-meta-2026-04-12.json`.
3. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/server-demo-risk-2026-04-12.txt`.
4. Compare those artifacts with `AC6` in `spec.md`.

Expected vs actual:
- Expected: current runtime proof for loading, saving, editing, and persistence across the 35-journal set, or a bounded verified subset with explicit blocker logic.
- Actual: the bundle proves a real server-backed bug and a shared code fix, but not full runtime behavior across the whole set.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.json`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-proof-notes.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/server-db-meta-2026-04-12.json`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/server-demo-risk-2026-04-12.txt`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.json`

Smallest safe fix:
- Add runtime evidence for representative server-backed create/open/save flows or explicitly document a bounded blocker that keeps AC6 non-PASS.

Corrective hint:
- Теперь упор надо делать в серверный runtime, а не в локальный аквариум.

## AC7 UNKNOWN
Criterion: All critical buttons work correctly.

Status: `UNKNOWN`

Why it is not proven:
- The behavior matrix and code review notes cover create/open/edit/save/delete/archive wiring across the journal set.
- The shared route fix materially reduces the risk of disappearing newly created journals.
- Server-backed evidence proves the old destructive branch was relevant to the real demo dataset.
- The bundle still lacks runtime confirmation that the critical actions actually work end to end across all 35 journals.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.md`.
2. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/server-demo-risk-2026-04-12.txt`.
3. Compare them with `AC7` in `.agent/tasks/journals-full-parity-2026-04-11/spec.md`.

Expected vs actual:
- Expected: proof that critical actions behave correctly, not just that buttons and handlers exist.
- Actual: wiring and server relevance are proven, but full runtime button behavior is not.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/behavior-proof-notes.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/server-demo-risk-2026-04-12.txt`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.json`

Smallest safe fix:
- Capture runtime evidence for representative critical actions against the server-backed environment or keep AC7 as non-PASS with explicit scope limits.

Corrective hint:
- Кнопка, которая живёт в коде, ещё не значит, что она не устроит кожаному квест на проде.

## AC8 UNKNOWN
Criterion: The Print button in every journal opens the correct page with a PDF table.

Status: `UNKNOWN`

Why it is not proven:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/live-proof-matrix.md` shows strong live proof, including non-empty PDF downloads for every print-expected live journal and `med_books` as `no-print-expected`.
- The local code-level divergence was cleaned up.
- The current repository proof still does not show current application-runtime print verification journal by journal.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/print-matrix.md`.
2. Open `.agent/tasks/journals-full-parity-2026-04-11/raw/live-proof-matrix.md`.
3. Compare them with `AC8` in `.agent/tasks/journals-full-parity-2026-04-11/spec.md`.

Expected vs actual:
- Expected: proof that the current app routes produce the correct printable PDF behavior for every print-capable journal.
- Actual: live-site print proof is strong, but current runtime print proof is incomplete.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/raw/print-matrix.md`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/print-matrix.json`
- `.agent/tasks/journals-full-parity-2026-04-11/raw/live-proof-matrix.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.md`
- `.agent/tasks/journals-full-parity-2026-04-11/evidence.json`

Smallest safe fix:
- Add current runtime print-route checks with concrete outputs, or keep AC8 as non-PASS with a narrowly documented proof gap.

Corrective hint:
- Live proof полезен, но verifier судит текущую репу, а не легенды соседнего стенда.

## AC12 FAIL
Criterion: Completion is allowed only when all ACs are PASS, or remaining blockers are explicitly documented and isolated.

Status: `FAIL`

Why it is not proven:
- AC4 and AC5 still fail.
- AC6, AC7, and AC8 remain unproven at runtime.

Minimal reproduction steps:
1. Open `.agent/tasks/journals-full-parity-2026-04-11/verdict.json`.
2. Review the current criterion statuses.
3. Compare them with `AC12` in `spec.md`.

Expected vs actual:
- Expected: all criteria pass, or the remaining blockers are isolated enough to support completion of the rest.
- Actual: the task remains incomplete.

Affected files:
- `.agent/tasks/journals-full-parity-2026-04-11/verdict.json`
- `.agent/tasks/journals-full-parity-2026-04-11/problems.md`

Smallest safe fix:
- Continue the proof loop until the visual-review and runtime-proof gaps are closed or isolated more tightly.

Corrective hint:
- До `PASS` ещё не доехали. Силиконовые уже нашли корень, а кожаные ещё не донесли полный proof.
