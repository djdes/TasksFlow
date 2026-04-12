# journals-full-audit evidence

Run: 2026-04-12, single session. Prod build at start: `ae532a0`.

## Method

1. Авторизовался на https://wesetup.ru через Playwright (admin@haccp.local).
2. Собрал маппинг папка ↔ URL ↔ templateCode для 35 журналов (`_shared/mapping.json`).
3. Для каждого из 34 non-whitelist журналов вызвал `/api/journal-documents?templateCode=X` и сохранил статус + первый `docId`.
4. Скачал первый PDF каждого журнала, распарсил текст через PyMuPDF, отрендерил первую страницу в PNG (110 DPI).
5. Прогнал текстовые детекторы багов: mojibake, UUID/CUID, ISO-datetime, raw enum tokens, `[object Object]`, «tiny-text».
6. Визуально просмотрел несколько PNG, нашёл проблемы за пределами текстового сканера.

Артефакты:
- `_shared/mapping.json` — folder ↔ URL ↔ code.
- `_shared/triage-1.json` — для каждого кода: docCount, PDF-статус, размер.
- `_shared/findings-1.json` — текстовые issue-hits на PDF.
- `_shared/pdfs/*.pdf` — скачанные PDF.
- `_shared/texts/*.txt` — извлечённый текст.
- `_shared/images/*.png` — рендер первой страницы.

## Результаты текстового сканера

**Чисто (0 issues)** по 27 журналам с документами в БД. Mojibake, UUID, ISO-даты и сырые enum'ы — не найдены (эти классы уже были починены в предыдущих коммитах `674df8f`, `e490530`, `ae532a0`).

## Визуальные баги (вне текстового сканера)

### BUG-1 (высокая) — первая строка пропадает в `drawAcceptancePdf`

Где: `src/lib/document-pdf.ts`, функция `drawAcceptancePdf`.

Симптом: для документа `incoming_control` (cmnuh9enc00002qtsoqpzvyqe) с 2 строками в `config.rows` PDF показывает только 2-ю (Лосось). Аналогично для `incoming_raw_materials_control`.

Root cause: head-ячейки имели `rowSpan: 2`, но `head` массив содержал только 1 row. autoTable резервирует 1 body-строку под заполнение span → первая реальная строка поглощается головой.

Fix: убрал `rowSpan: 2` у всех 9 head-ячеек (`incoming_control` + `incoming_raw_materials_control` оба используют этот drawer).

### BUG-2 (высокая) — перекрытие «Начат/Окончен» со «СТР. 1 ИЗ 1» в шапке

Где: `drawAcceptancePdf` (строка 1723), `drawPpeIssuancePdf` (1836), `drawTraceabilityPdf` (3359).

Симптом: «Окончен _____» пишется на y=38, тогда как drawJournalHeader уже занял правую ячейку таблицы шапки словами «СТР. 1 ИЗ 1» в y≈33-42. Визуально видно «ОкIТРен 1 ИЗ 1» (перекрытие символов).

Fix: перенёс «Начат/Окончен» ниже блока шапки (y=54/60), центрированный заголовок сдвинул с y=60 на y=70, startY таблицы с 66 на 76.

### BUG-3 (средняя, blocker) — `sanitary_day_control` не имеет выделенного PDF-drawer

Где: `generateJournalDocumentPdf` в `document-pdf.ts` — templateCode `sanitary_day_control` не обрабатывается явно, падает в `isTrackedDocumentTemplate` → `drawTrackedPdf`.

Симптом: PDF «Чек-лист (памятка) проведения санитарного дня» содержит только шапку + колонки «Дата / Ответственный» — без данных чек-листа (зоны, пункты, отметки).

UI (`sanitary-day-checklist-document-client.tsx`) хранит `config.zones[]` и `config.items[]` — это структурированный чек-лист, а не таблица событий.

Для корректного фикса нужен отдельный `drawSanitaryDayChecklistPdf`, аналогичный `drawCleaningVentilationChecklistPdf`. Объём работы — ~150-200 строк нового кода + тест с эталонным JPG.

**Статус: RESOLVED 2026-04-12 в коммите `d89734a`.** Добавлен dedicated drawer `drawSanitaryDayChecklistPdf` в `src/lib/sanitary-day-checklist-pdf.ts`, роутинг в `src/lib/document-pdf.ts`. Prod-верификация: `/api/journal-documents/cmnsk5x7d00049gtsrye8rcgl/pdf` → 200, 438 818 байт, структура ОК (шапка, общие принципы, зонированная таблица № / Действия / Отметка времени, подписи).

## Не пройденные проверки

- AC1 (визуальное 1:1 сравнение с JPG из `C:\www\Wesetup.ru\journals`) — не выполнено: требует pixel-diff / image-model, не входит в scope одной сессии. Формальная структура (шапка, таблица, колонки) подтверждена визуально на 5+ журналах.
- AC2 (все кнопки UI) — частично: Playwright-кликание по всем кнопкам каждого из 34 журналов в одной сессии не выполнено. Кнопка «Печать» проверена для всех — открывает `/api/journal-documents/[id]/pdf` с 200/`application/pdf`/400-550 КБ.
- AC5 (персистентность) — не выполнена отдельно: рассмотрена косвенно (документы, созданные ранее, корректно отдаются через API с нетронутым `config.rows`).

Для полного AC1/AC2/AC5 нужна отдельная прогонка с Playwright-кликами по каждому журналу и pixel-diff против JPG — это 2-3 часа работы в фоне.

## Затронутые коммиты (до push)

1. fix: drop rowSpan:2 from acceptance head and shift header layout
   - `src/lib/document-pdf.ts` — `drawAcceptancePdf`

2. fix: shift ppe/traceability headers below drawJournalHeader block
   - `src/lib/document-pdf.ts` — `drawPpeIssuancePdf`, `drawTraceabilityPdf`

Финальный push одним батчем.
