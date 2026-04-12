# Problems

## AC4 FAIL

Criterion: Each journal is checked for visual parity against screenshots and/or the live site.

Status: `FAIL`

Why it is not proven:
- `raw/reviewed-visual-matrix.md` is now canonical and complete by row count, but `15` journals still end in `BLOCKED`.
- Those blocked rows are not runtime failures; they are proof failures.
- The bundle still lacks row-by-row visual comparison notes for:
  - `disinfectant_usage`
  - `glass_control`
  - `glass_items_list`
  - `incoming_control`
  - `incoming_raw_materials_control`
  - `intensive_cooling`
  - `perishable_rejection`
  - `pest_control`
  - `ppe_issuance`
  - `product_writeoff`
  - `sanitary_day_control`
  - `staff_training`
  - `traceability_test`
  - `training_plan`
  - `uv_lamp_runtime`

Smallest safe fix:
- Add explicit row-by-row visual comparison notes for the 15 blocked journals and downgrade each to `CLOSE` or `FIXED` where justified.

## AC5 FAIL

Criterion: Visual parity is improved as far as feasible.

Status: `FAIL`

Why it is not proven:
- The matrix now distinguishes `CLOSE`, `FIXED`, and `BLOCKED`, which is better than the old fake all-blocked sheet.
- A shared mobile dialog/control sizing defect class is now fixed across multiple journals, so the remaining visual gap is narrower than before.
- A shared fixed-grid mobile list-card defect class is now also fixed across six journals, so one more repeatable visual layer is no longer blocking the whole set.
- But `15` journals still remain visually blocked, so the parity loop is not closed.

Smallest safe fix:
- Reduce the blocked visual set by recording actual screenshot/live comparisons for the remaining journals.
- Then continue the next systemic visual batches for wide table defaults and oversized list headings.

## AC7 UNKNOWN

Criterion: All critical buttons work correctly.

Status: `UNKNOWN`

Why it is not proven:
- Fresh runtime proof now covers list/open/create/print across the full 35-journal set.
- The bundle still does not package edit/save/delete/archive runtime proof journal by journal.

Smallest safe fix:
- Add a bounded runtime interaction sweep or explicit journal-by-journal notes for edit/save/delete/archive actions.

## AC12 FAIL

Criterion: Completion is allowed only when all ACs are PASS, or remaining blockers are explicitly documented and isolated.

Status: `FAIL`

Why it is not proven:
- `AC4` and `AC5` still fail.
- `AC7` is still `UNKNOWN`.

Smallest safe fix:
- Close the remaining visual-proof blockers and package the missing runtime interaction proof. Силиконовые уже почти приехали, а кожаные acceptance criteria всё ещё требуют бумажку с печатью.
