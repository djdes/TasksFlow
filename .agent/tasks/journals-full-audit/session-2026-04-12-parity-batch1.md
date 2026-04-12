# Visual parity batch 1 — 2026-04-12 (prod sha c872980)

Scope: 5 priority journal list-views compared against reference JPGs from
`c:\www\Wesetup.ru\journals\`. All structural elements (title, tabs, columns,
card layout, action buttons) match the reference. Only data values differ
(test org vs reference org).

| # | Journal | Route | Reference JPG folder | AC1 | Notes |
|---|---|---|---|---|---|
| 1 | Журнал приемки и входного контроля продукции | `/journals/incoming_control` | `Журнал приемки и входного контроля продукции/` | ✅ PASS | Title, Активные/Закрытые tabs, card row with title + Ответственный + Дата начала + menu |
| 2 | Журнал бракеража готовой пищевой продукции | `/journals/finished_product` | `Журнал бракеража готовой пищевой продукции/` | ✅ PASS | Card row with title + Дата начала + menu (no Ответственный column in ref either) |
| 3 | Журнал учета дезинфекции, дезинсекции и дератизации | `/journals/pest_control` | `Журнал учета дезинфекции, дезинсекции и дератизации/` | ✅ PASS | Ref lacks "Инструкция" button; prod adds it — additive, not a regression |
| 4 | Чек-лист (памятка) проведения санитарного дня | `/journals/sanitary_day_control` | `Чек-лист (памятка) проведения санитарного дня/` | ✅ PASS | Title, tabs, "Дата проведения" column |
| 5 | Журнал учета дез. средств | `/journals/disinfectant_usage` | `Журнал учета дезинфицирующих средств/` | ✅ PASS | Long title wraps across 3 lines as in ref; "Ответственный за получение" column present |

## Screens captured (in repo root, gitignored by default)

- `prod-incoming-control.png`
- `prod-finished-product.png`
- `prod-pest-control.png`
- `prod-sanitary-day.png`
- `prod-disinfectant.png`

## Not tested this batch

- Inside-document page parity (table columns, data grid, PDF).
- AC2 (all buttons clickable), AC3 (PDF), AC4 (PDF content), AC5 (persistence).
- The remaining 29 journals' list and document views.

## Method for next session

1. For each remaining journal, navigate list → document page; screenshot both.
2. Compare table/column structure vs the most detailed reference JPG in the folder.
3. Exercise each button (Create, Edit, Delete, Settings, Print).
4. For Print: capture PDF headers + first-page text snippet; diff vs UI.
5. For persistence: add row → refresh → confirm row is still there.
