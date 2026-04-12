# journals-full-audit — блокеры

## BLOCKER-1: sanitary_day_control без выделенного PDF drawer — RESOLVED 2026-04-12

Исправлено в коммите `d89734a` (push 2026-04-12, deployed, prod `.build-sha` = `d89734a`):

- Новый файл `src/lib/sanitary-day-checklist-pdf.ts` с `drawSanitaryDayChecklistPdf`.
- Роутинг добавлен в `src/lib/document-pdf.ts` (template `sanitary_day_control` → dedicated drawer, больше не падает в `drawTrackedPdf`).
- Файловый префикс `sanitary-day-checklist`.

Верификация prod:
- `GET /api/journal-documents/cmnsk5x7d00049gtsrye8rcgl/pdf` → 200, `Content-Type: application/pdf`, 438 818 байт.
- Текст PDF содержит: org name, `СИСТЕМА ХАССП`, `СТР. 1 ИЗ 1`, `ЧЕК-ЛИСТ (ПАМЯТКА) ПРОВЕДЕНИЯ САНИТАРНОГО ДНЯ`, `ДАТА ПРОВЕДЕНИЯ 21.04.2026`, блок `ОБЩИЕ ПРИНЦИПЫ` с буллетами, таблицу `№ п/п / Действия / Отметка времени`, заголовок зоны `1. <ZONE>`, строки элементов, подписи `ВЫПОЛНИЛ:` / `ПРОВЕРИЛ:`. Mojibake отсутствует.
