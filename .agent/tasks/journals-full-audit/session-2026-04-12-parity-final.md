# Visual parity FINAL batch — 2026-04-12 (prod sha cfbed13)

Completes list-view AC1 audit across all non-reference journals.

| # | Journal | Route | AC1 |
|---|---|---|---|
| 26 | Перечень изделий из стекла и хрупкого пластика | `/journals/glass_items_list` | ✅ PASS |
| 27 | План-программа внутренних аудитов | `/journals/audit_plan` | ✅ PASS |
| 28 | Протокол внутреннего аудита | `/journals/audit_protocol` | ✅ PASS (empty-state) |
| 29 | График и учет генеральных уборок | `/journals/general_cleaning` | ✅ PASS |
| 30 | Чек-лист уборки и проветривания помещений | `/journals/cleaning_ventilation_checklist` | ✅ PASS (Дата начала + Статус columns) |

## Previously audited (across session)

| Journal | Route | AC1 |
|---|---|---|
| План обучения персонала | `/journals/training_plan` | ✅ PASS (document page visually checked earlier) |
| Журнал уборки | `/journals/cleaning` | ✅ PASS (verified during sticky QA) |
| Журнал контроля температурного режима холодильного и морозильного оборудования | `/journals/cold_equipment_control` | ✅ PASS (pilot QA) |

## Final total

**33/34 journals** AC1 audited:
- **32 PASS** (list layout matches reference JPG: header, tabs, card rows, columns)
- **1 MINOR** (equipment_cleaning — header buttons wrap below H1 at current viewport)
- **1 SKIPPED** (hygiene — gold reference, intentionally untouched)

## Scope NOT covered this session

- **Document-level parity** (inside a created document: table columns, grids) — sampled for cold-equipment, cleaning, training-plan only.
- **AC2** full button audit per journal (every button clickable without error).
- **AC3** PDF print opens, correct Content-Type, 200 OK.
- **AC4** PDF contents match UI data.
- **AC5** Persistence (add-row → refresh → still there).

These four require per-journal scripted flows plus PDF parsing; not attempted
this session.

## Known MINOR to follow up

1. `equipment_cleaning` list header wraps: buttons placed below long H1. At a wider viewport (~1600px+) the flex-between likely resolves correctly; worth adjusting `flex-wrap` to `nowrap` + reducing title `text-*` only if CSS constraints permit. Low priority.
