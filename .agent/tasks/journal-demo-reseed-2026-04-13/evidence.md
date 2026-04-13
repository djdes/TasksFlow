# Evidence

## Verdict
PASS

## Acceptance Criteria

### AC1
PASS. `scripts/reset-demo-journal-data.ts` очищает demo-данные текущей demo-организации:
- удаляет `JournalDocumentEntry`, `JournalDocument`, `JournalEntry`, `StaffCompetency`;
- удаляет всех пользователей организации кроме `admin@haccp.local`;
- затем заново создает новый demo-штат.

Код:
- `scripts/reset-demo-journal-data.ts`

Проверка:
- `raw/reset.txt`
- `raw/verification.json`

### AC2
PASS. После прогона существует новый активный штат из 8 пользователей с разными должностями и ролями. Старые demo-email'ы отсутствуют.

Новый состав:
- `admin@haccp.local` — Управляющий
- `qa-chief@haccp.local` — Руководитель качества
- `production-lead@haccp.local` — Начальник производства
- `hot-line@haccp.local` — Старший повар горячего цеха
- `cold-line@haccp.local` — Повар холодного цеха
- `warehouse@haccp.local` — Кладовщик
- `sanitation-master@haccp.local` — Специалист по санитарной обработке
- `service-engineer@haccp.local` — Инженер по оборудованию

Проверка:
- `raw/verification.json` содержит `"legacyUsers": []`

### AC3
PASS. После reseed в demo-организации:
- `activeTemplateCount = 35`
- `documentCount = 35`
- по каждому активному шаблону `count = 1`
- суммарно создано `268` записей `JournalDocumentEntry`

Проверка:
- `raw/reset.txt`
- `raw/verification.json`

### AC4
PASS. Свежая проверка и типизация успешны.

Команды:
- `npx tsx scripts/reset-demo-journal-data.ts`
- `npx tsc --noEmit`

Артефакты:
- `raw/reset.txt`
- `raw/tsc.txt`
- `raw/verification.json`
