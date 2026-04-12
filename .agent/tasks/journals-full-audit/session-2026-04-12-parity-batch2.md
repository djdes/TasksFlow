# Visual parity batch 2 — 2026-04-12 (prod sha 6e5b33b)

Continuation of batch 1 — 5 more list-view journals compared to reference JPGs.

| # | Journal | Route | AC1 | Notes |
|---|---|---|---|---|
| 6 | Акт забраковки | `/journals/product_writeoff` | ✅ PASS | Title + tabs + Комментарий + Дата документа columns match ref (236) |
| 7 | Бланк контроля температуры и влажности | `/journals/climate_control` | ✅ PASS | Title, tabs, Ответственный + Дата начала columns match ref (427) |
| 8 | График поверки средств измерений | `/journals/equipment_calibration` | ✅ PASS | Год + Должность "Утверждаю" + Дата документа columns match ref (167) |
| 9 | Журнал здоровья | `/journals/health_check` | ✅ PASS | Title + tabs + Период "Апрель с 1 по 15" column match ref (029) |
| 10 | Журнал мойки и дезинфекции оборудования | `/journals/equipment_cleaning` | ⚠️ MINOR | Card row matches ref; page-header has buttons wrapped BELOW the title instead of to the right — possibly due to very long H1 breaking flex-between at narrow widths. Not a structural defect; investigate if user reports. |

Accumulated batch status: **10/34 journals** list-view AC1 audited. 9 PASS, 1 MINOR (equipment_cleaning header wrap).

## Next priorities (22 remaining)

- Журнал бракеража скоропортящейся (perishable_rejection)
- Журнал входного контроля сырья (incoming_raw_materials_control)
- Журнал контроля изделий из стекла (glass_control / glass_list)
- Журнал контроля интенсивного охлаждения (intensive_cooling)
- Журнал прослеживаемости (traceability)
- Журнал регистрации жалоб (complaint)
- Журнал регистрации инструктажей (staff_training)
- Журнал уборки (cleaning) — `/journals/cleaning`
- Журнал учета аварий (accident)
- Журнал учета выдачи СИЗ (ppe_issuance)
- Журнал учета использования фритюрных жиров (fryer_oil)
- Журнал учета металлопримесей (metal_impurity)
- Журнал учета работы УФ бактерицидной установки (uv_lamp_runtime)
- Карточка истории поломок (breakdown_history)
- Медицинские книжки (med_books)
- Отчет о внутреннем аудите (audit_report)
- Перечень изделий из стекла и хрупкого пластика (glass_list)
- План обучения персонала (training_plan)
- План-программа внутренних аудитов (audit_plan)
- Протокол внутреннего аудита (audit_protocol)
- Чек-лист уборки и проветривания помещений (cleaning_ventilation_checklist)
- График и учет генеральных уборок (sanitation_day)

## Also TBD (not audited yet)

- Document-view parity (inside a doc, tables/grids vs the detailed ref JPGs).
- AC2 full-button audit, AC3 PDF content, AC4 data fidelity, AC5 persistence.
