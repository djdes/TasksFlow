# Journal Inventory

Status snapshot on 2026-04-11.

- Total local reference folders in `journals/`: `35`
- Total active journal templates in `prisma/seed.ts`: `35`
- Major audit finding before fixes: two journals were missing from the active set.
- Major audit finding after fixes: both missing journals are now registered separately and routed through existing document-based clients.

## Per-journal status

| Status | Code | Journal |
| --- | --- | --- |
| implemented | `product_writeoff` | Акт забраковки |
| implemented | `climate_control` | Бланк контроля температуры и влажности |
| implemented | `hygiene` | Гигиенический журнал |
| implemented | `general_cleaning` | График и учет генеральных уборок |
| implemented | `equipment_calibration` | График поверки средств измерений |
| implemented | `equipment_maintenance` | График профилактического обслуживания оборудования |
| implemented | `finished_product` | Журнал бракеража готовой пищевой продукции |
| implemented | `perishable_rejection` | Журнал бракеража скоропортящейся пищевой продукции |
| fixed | `incoming_raw_materials_control` | Журнал входного контроля сырья, ингредиентов, упаковочных материалов |
| implemented | `health_check` | Журнал здоровья |
| implemented | `glass_control` | Журнал контроля изделий из стекла и хрупкого пластика |
| implemented | `intensive_cooling` | Журнал контроля интенсивного охлаждения горячих блюд |
| implemented | `cold_equipment_control` | Журнал контроля температурного режима холодильного и морозильного оборудования |
| implemented | `equipment_cleaning` | Журнал мойки и дезинфекции оборудования |
| implemented | `incoming_control` | Журнал приемки и входного контроля продукции |
| implemented | `traceability_test` | Журнал прослеживаемости продукции |
| implemented | `complaint_register` | Журнал регистрации жалоб |
| implemented | `staff_training` | Журнал регистрации инструктажей (обучения) сотрудников |
| implemented | `cleaning` | Журнал уборки |
| implemented | `accident_journal` | Журнал учета аварий |
| implemented | `ppe_issuance` | Журнал учета выдачи СИЗ |
| implemented | `pest_control` | Журнал учета дезинфекции, дезинсекции и дератизации |
| implemented | `disinfectant_usage` | Журнал учета дезинфицирующих средств |
| implemented | `fryer_oil` | Журнал учета использования фритюрных жиров |
| implemented | `metal_impurity` | Журнал учета металлопримесей |
| implemented | `uv_lamp_runtime` | Журнал учета работы УФ бактерицидной установки |
| implemented | `breakdown_history` | Карточка истории поломок |
| implemented | `med_books` | Медицинские книжки |
| implemented | `audit_report` | Отчет о внутреннем аудите |
| implemented | `glass_items_list` | Перечень изделий из стекла и хрупкого пластика |
| implemented | `training_plan` | План обучения персонала |
| implemented | `audit_plan` | План-программа внутренних аудитов |
| implemented | `audit_protocol` | Протокол внутреннего аудита |
| implemented | `sanitary_day_control` | Чек-лист (памятка) проведения санитарного дня |
| fixed | `cleaning_ventilation_checklist` | Чек-лист уборки и проветривания помещений |

## Audit notes

- `incoming_control` remains separate and keeps the product acceptance journal role.
- `incoming_raw_materials_control` now registers the raw materials incoming-control journal and reuses the acceptance-style custom client stack.
- `cleaning_ventilation_checklist` now registers the separate checklist and reuses the sanitary-day-checklist client stack.
- No additional missing journal templates were found after reconciling folder names with the active template list.
