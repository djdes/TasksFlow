# Journals External API Part 2 - Execution Plan

## Scope
- Verify `POST /api/external/entries -> UI -> PDF` for all 35 production journal codes.
- Keep backward-compatible default entry upsert behavior for simple journals.
- Add per-code writer strategies only where current payload-to-render path is insufficient.

## Journal checklist

Each journal must pass:
- [ ] shape inspected
- [ ] payload prepared
- [ ] POST ok
- [ ] UI ok
- [ ] PDF ok
- [ ] autofill rechecked
- [ ] evidence written
- [ ] commit/deploy verified

`autofill rechecked` applies only to `climate_control`, `cold_equipment_control`, `cleaning`.

## Codes

### Entry journals
- [ ] accident_journal
- [ ] audit_plan
- [ ] audit_protocol
- [ ] audit_report
- [ ] breakdown_history
- [ ] cleaning
- [ ] cleaning_ventilation_checklist
- [ ] climate_control
- [ ] cold_equipment_control
- [ ] complaint_register
- [ ] disinfectant_usage
- [ ] equipment_calibration
- [ ] equipment_cleaning
- [ ] equipment_maintenance
- [ ] finished_product
- [ ] fryer_oil
- [ ] general_cleaning
- [ ] glass_control
- [ ] glass_items_list
- [ ] health_check
- [ ] hygiene
- [ ] incoming_control
- [ ] incoming_raw_materials_control
- [ ] intensive_cooling
- [ ] med_books
- [ ] metal_impurity
- [ ] perishable_rejection
- [ ] pest_control
- [ ] ppe_issuance
- [ ] product_writeoff
- [ ] sanitary_day_control
- [ ] staff_training
- [ ] traceability_test
- [ ] training_plan
- [ ] uv_lamp_runtime

## Batch order
- Batch 1: `climate_control`, `cold_equipment_control`, `cleaning`, `cleaning_ventilation_checklist`, `equipment_cleaning`
- Batch 2: `glass_control`, `fryer_oil`, `uv_lamp_runtime`, `med_books`, `pest_control`
- Batch 3: `incoming_control`, `incoming_raw_materials_control`, `complaint_register`, `ppe_issuance`, `traceability_test`
- Batch 4: `audit_plan`, `audit_protocol`, `audit_report`, `training_plan`, `staff_training`
- Batch 5: `equipment_calibration`, `equipment_maintenance`, `product_writeoff`, `finished_product`, `perishable_rejection`
- Batch 6: `glass_items_list`, `disinfectant_usage`, `metal_impurity`, `breakdown_history`, `accident_journal`
- Batch 7: `intensive_cooling`, `sanitary_day_control`, `hygiene`, `health_check`, `general_cleaning`

## Artifacts
- Per-code evidence: `.agent/tasks/journals-external-api-part2/<code>/`
- Rollup: `.agent/tasks/journals-external-api-part2/FINAL.md`
- Problems: `.agent/tasks/journals-external-api-part2/problems.md`
