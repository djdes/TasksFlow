# Source -> Local map (рабочая версия)

**Дата:** 2026-04-09  
**Источник:** `https://lk.haccp-online.ru/docs/1`  
**Цель:** зафиксировать соответствие source-slug к локальным кодам шаблонов журналов.

## Вне контура журналов
- `articles` (раздел статей, не журнал)
- `news` (раздел новостей, не журнал)

## Явные соответствия (подтверждено по названию/смыслу)
1. `healthjournal` -> `hygiene`
2. `health1journal` -> `health_check`
3. `storageconditionjournal` -> `climate_control`
4. `temprefrigerationjournal` -> `cold_equipment_control`
5. `cleaning1journal` -> `cleaning`
6. `sanitationdayjournal` -> `general_cleaning`
7. `bactericiplantjournal` -> `uv_lamp_runtime`
8. `brakeryjournal` -> `finished_product`
9. `acceptance1journal` -> `incoming_control`
10. `deepfatjournal` -> `fryer_oil`
11. `disinfectjournal` -> `disinfectant_usage`
12. `sanitationdaycheklist` -> `sanitary_day_control`
13. `preventiveequipment` -> `equipment_maintenance`
14. `instrumentcalibration` -> `equipment_calibration`
15. `defectjournal` -> `product_writeoff`
16. `traceabilityjournal` -> `traceability_test`
17. `deratization1journal` -> `pest_control`

## Кандидаты (нужна финальная parity-проверка по экранам)
1. `sanitation1journal` -> `inventory_sanitation` (checklist уборки/проветривания)
2. `acceptance2journal` -> `receiving_temperature_control` (входной контроль сырья/ингредиентов)
3. `equipcleanjournal` -> `dishwashing_control` или `inventory_sanitation`
4. `intensivecoolingjournal` -> `critical_limit_check` или `cold_equipment_control`
5. `metalimpurityjournal` -> `critical_limit_check`
6. `glassjournal` -> `allergen_control` (временный кандидат до точной семантики)

## Отдельные журналы источника (нужны адаптеры/новые коды)
1. `medbook` (медкнижки)
2. `eduplan` (план обучения)
3. `edujournal` (журнал инструктажей)
4. `breakdownhistoryjournal` (история поломок)
5. `issuancesizjournal` (выдача СИЗ)
6. `accidentjournal` (учет аварий)
7. `complaintjournal` (регистрация жалоб)
8. `auditplan` (план внутренних аудитов)
9. `auditprotocol` (протокол внутреннего аудита)
10. `auditreport` (отчет о внутреннем аудите)
11. `glasslist` (перечень стекла/хрупкого пластика)
12. `brakery1journal` (отдельный журнал бракеража скоропортящейся продукции)

## Порядок внедрения пакетами
1. Пакет A (быстрый): `hygiene`, `health_check`, `climate_control`, `cold_equipment_control`, `cleaning`
2. Пакет B: `general_cleaning`, `uv_lamp_runtime`, `finished_product`, `incoming_control`, `fryer_oil`
3. Пакет C: `disinfectant_usage`, `sanitary_day_control`, `equipment_maintenance`, `equipment_calibration`, `product_writeoff`
4. Пакет D: `traceability_test`, `pest_control` + кандидаты после parity-проверки
5. Пакет E: отдельные журналы источника через адаптеры/новые local-codes

## Принцип реализации
- сохраняем source UX и сценарии;
- данные и CRUD только через нашу БД/API;
- любые расхождения закрываем adapter-слоем, не форкаем ядро под каждый журнал.
