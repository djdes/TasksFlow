# Journal Demo Reseed

## Summary
Полностью пересобрать demo-данные текущей demo-организации: удалить все старые примеры журналов и старый состав сотрудников, затем создать новый внятный штат с разными должностями и ровно по одному полностью заполненному примеру для каждого из 35 активных журналов.

## Acceptance Criteria
- `AC1`: reset-скрипт удаляет все старые demo-журналы, document entries, tracked entries и demo-сотрудников текущей demo-организации, сохраняя рабочий owner-логин `admin@haccp.local`.
- `AC2`: после прогона в demo-организации существует новый активный штат с разными `role` и `positionTitle`, а старые demo-email'ы из прежнего набора (`quality@haccp.local`, `souschef@haccp.local`, `hotcook@haccp.local`, `coldcook@haccp.local`, `pastry@haccp.local`, `storekeeper@haccp.local`, `sanitation@haccp.local`) отсутствуют.
- `AC3`: для всех 35 активных шаблонов в БД существует ровно по одному примеру журнала, и у каждого примера есть осмысленно заполненные данные: либо заполненный config/document row, либо хотя бы одна заполненная journal/document entry без пустого шаблонного payload.
- `AC4`: свежая проверка фиксирует counts по пользователям и покрытию 35/35, а `npx tsc --noEmit` проходит без ошибок.

## Notes
- Область действия ограничена demo-организацией, определяемой по `admin@haccp.local`.
- Пересборка выполняется через `scripts/reset-demo-journal-data.ts`.
