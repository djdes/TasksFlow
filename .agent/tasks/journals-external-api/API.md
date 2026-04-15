# HACCP-Online External Entries API

Base URL: `https://wesetup.ru`

## Healthcheck

`GET /api/external/healthz` — anonymous, returns the build sha/time and DB
status. Call this on startup before issuing any POSTs:

```json
{
  "ok": true,
  "build": { "sha": "abc1234", "time": "2026-04-16T08:00:00Z" },
  "db": { "reachable": true, "journalTemplates": 35 },
  "latencyMs": 14,
  "now": "2026-04-16T08:03:11.000Z"
}
```

## Auth

All write requests require `Authorization: Bearer <token>`.

Token resolution order:

| Mode | Token source | Organisation scope |
|---|---|---|
| **Per-org** (recommended) | `Organization.externalApiToken` column | Pinned to that org — the payload's `organizationId` is ignored. |
| Shared app | `EXTERNAL_API_TOKEN` env | Any org the payload names. |
| Sensor | `SENSOR_API_TOKEN` env | Any org the payload names. |

Per-org tokens are the safe default: even if a token leaks, the attacker
cannot write into a different tenant.

## Idempotency

Include `Idempotency-Key: <opaque-string>` on retries. The server caches
the first 200 response for each `(token, key)` and replays it on repeat —
no double-writes. Keys should be ≤120 characters and unique per logical
operation (UUID works).

Replayed responses include header `idempotent-replayed: true`.

## Endpoint

`POST /api/external/entries`

## Request Body

Preferred single-row form:

```json
{
  "organizationId": "cmnm40ikt00002ktseet6fd5y",
  "journalCode": "hygiene",
  "date": "2026-04-12",
  "employeeId": "cm...",
  "source": "employee_app",
  "rows": { "status": "healthy", "temperatureAbove37": false }
}
```

- `organizationId`: target organization.
- `journalCode`: template code.
- `date`: optional day in `YYYY-MM-DD`.
- `employeeId`: optional employee/cell owner.
- `source`: optional enum: `employee_app`, `sensor`, `manual`.
- `rows`: preferred payload field. Can be an object, array of row objects, or array of `{ employeeId, date, data }`.

Backward-compatible aliases:

- `data`: accepted for legacy single-row callers.
- `entries`: accepted for legacy batch callers.

Preferred batch form:

```json
{
  "organizationId": "cmnm40ikt00002ktseet6fd5y",
  "journalCode": "climate_control",
  "rows": [
    { "employeeId": "cm...", "date": "2026-04-12", "data": { "temp": 22 } },
    { "employeeId": "cm...", "date": "2026-04-12", "data": { "temp": 23 } }
  ]
}
```

## Response

Success (`200`):

```json
{
  "ok": true,
  "documentId": "cmn...",
  "entriesWritten": 1,
  "createdDocument": false,
  "templateCode": "hygiene"
}
```

Notes:

- `createdDocument: true` means the API created a new active `JournalDocument` covering the month that contains `date`.
- `entriesWritten` is the number of `JournalDocumentEntry` rows upserted.

## Errors

| Status | Meaning |
|---:|---|
| `400` | Invalid JSON or invalid payload |
| `401` | Missing or invalid bearer token |
| `404` | Unknown organization, template code, or employee |
| `503` | Server token(s) not configured |

Every request is logged to `JournalExternalLog`. Only a masked `tokenHint` is stored.

## Curl Examples

Hygiene:

```bash
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $EXTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "hygiene",
    "date": "2026-04-12",
    "rows": { "status": "healthy", "temperatureAbove37": false }
  }'
```

Climate sensor:

```bash
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $SENSOR_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "climate_control",
    "source": "sensor",
    "rows": { "temp": 22.4, "humidity": 54 }
  }'
```

Cold equipment sensor:

```bash
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $SENSOR_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "cold_equipment_control",
    "source": "sensor",
    "rows": { "readings": [{ "equipmentName": "Холодильник 1", "temp": 3.2 }] }
  }'
```

## Integrator Notes

- The API upserts by `(documentId, employeeId, date)`.
- Reposting the same `(journalCode, employeeId, date)` overwrites the same cell payload.
- Staff-facing fields inside payload data are reconciled from the `User` record, so the client should not hardcode `positionTitle` or similar display labels.
- `/api/journal-documents/<id>/pdf` is session-gated for the web UI and is not part of the bearer-token external contract.

---

## Per-code payload shapes

The dispatcher accepts any JSON in `data`/`rows`, but each journal has an
expected shape — anything else gets dropped silently by that journal's
normaliser.

### Entry-writer journals (15 codes)

Each POST upserts exactly one cell keyed by `(documentId, employeeId, date)`.

| Code | Minimum shape |
|---|---|
| `hygiene` | `{ status: "healthy"\|"day_off"\|"sick_leave"\|"suspended"\|"vacation", temperatureAbove37: boolean }` |
| `health_check` | `{ signed: boolean, measures?: string }` |
| `climate_control` | `{ measurements: [{ time: "10:00", temperature: 22.4, humidity: 55 }] }` |
| `cold_equipment_control` | `{ temperatures: { "<equipment_uuid>": 3.5, … }, responsibleTitle?: string }` |
| `cleaning` | `{ activities: [{ type: "wetCleaning"\|"disinfection"\|"ventilation", times: ["done", …], responsibleName?: string }] }` |
| `cleaning_ventilation_checklist` | `{ procedures: { "<procedureId>": ["HH:MM", …] }, responsibleUserId?: string }` |
| `equipment_cleaning` | `{ washDate, washTime, equipmentName, detergentName, detergentConcentration, disinfectantName, disinfectantConcentration, rinseTemperature?, washerName?, controllerName? }` |
| `fryer_oil` | `{ startDate, startHour, startMinute, endHour, endMinute, fatType, equipmentType, productType, qualityStart: 1-5, qualityEnd: 1-5, carryoverKg, disposedKg, controllerName? }` |
| `general_cleaning` | `{ done: boolean, performer?: string, note?: string }` |
| `glass_control` | `{ area, result, checkedItems?, damaged?, note? }` |
| `incoming_control` | `{ supplier, productName, quantity, unit, temperature, packageOk: boolean, docsOk: boolean, result: "pass"\|"reject", note? }` |
| `med_books` | `{ medBookNumber, lastExam, nextExam, vaccinations: [{ name, status: "done"\|"refusal"\|"exemption", date }] }` |
| `pest_control` | `{ area, treatmentType, agent, result, performer }` |
| `sanitary_day_control` | `{ zoneResults: { "<zoneId>": { "<itemId>": boolean } } }` |
| `uv_lamp_runtime` | `{ startTime: "HH:MM", endTime: "HH:MM", totalMinutes?, note? }` |

### Config-writer journals (20 codes)

These merge into `JournalDocument.config` instead of creating a per-day cell.
Send `{rows: [{...}]}` matching the journal's row shape — unknown keys are dropped.

| Code | Expected `rows` item shape |
|---|---|
| `accident_journal` | `{ id, accidentDate, accidentHour, accidentMinute, locationName, accidentDescription, affectedProducts, resolvedDate, resolvedHour, resolvedMinute, responsiblePeople, correctiveActions }` |
| `audit_plan` | `{ id, name, mandatory: boolean, scheduledDate, responsibleName }` |
| `audit_protocol` | `{ id, section, requirement, status: "Да"\|"Нет", note? }` |
| `audit_report` | `{ id, nonconformity, immediateCorrection, preventiveAction, responsible, planDate, factDate? }` |
| `breakdown_history` | `{ id, startDate, equipmentName, breakdownDescription, repairDescription, replacedParts, endDate, downtimeHours, responsibleName }` |
| `complaint_register` | `{ id, receivedAt, complainantName, channel, contact, complaintText, resolvedAt, resolution }` |
| `disinfectant_usage` | `{ subdivisions: [{name, area, treatmentType, timesPerMonth, productName, concentration, consumptionPerTreatment}], receipts: [{receivedAt, productName, quantity, shelfLife, responsibleEmployee}], consumptions: [{periodFrom, periodTo, productName, received, used, balance, responsibleEmployee}] }` |
| `equipment_calibration` | `{ year, rows: [{id, equipmentDescription, purpose, range, interval, lastDate, nextDate, note?}] }` |
| `equipment_maintenance` | `{ year, rows: [{id, equipmentName, workType, planDates:{jan…dec}, factDates:{jan…dec}}] }` |
| `finished_product` | `{ rows: [{id, preparationDateTime, brakerageTime, productName, organolepticScore, productTempC, correctiveActions, permissionTime, courierHandoffTime, responsibleEmployee, brakerageEmployeeName}] }` |
| `glass_items_list` | `{ rows: [{id, areaName, itemName, count}] }` |
| `intensive_cooling` | `{ rows: [{id, preparationDateTime, productName, tempAtStart, tempAfterOneHour, correctiveActions, note?, responsiblePosition, responsibleName}] }` |
| `metal_impurity` | `{ rows: [{id, date, supplier, material, quantityKg, impurityGrams, perTon, characteristics, responsibleName, responsibleRole}] }` |
| `perishable_rejection` | `{ rows: [{id, receivedAt, productName, productionDate, maker, packaging, documents, organolepticScore, storageConditions, realizationDeadline, responsibleName, note?}] }` |
| `ppe_issuance` | `{ rows: [{id, issueDate, masksCount, glovesCount, shoesCount, recipientTitle, recipientName, giverName?}] }` |
| `product_writeoff` | `{ actNumber, actDate, commissionMembers: [{employeeName, role}], rows: [{id, productName, batchCode, batchDate, quantity, unit, reason, action}] }` |
| `staff_training` | `{ rows: [{id, date, employeeName, employeePosition, topic: "safety"\|"duties"\|"kkt"\|"sanitation"\|"fire", trainingType: "primary"\|"repeated"\|"unscheduled", unscheduledReason?, instructorName, attestationResult: "passed"\|"failed"}] }` |
| `traceability_test` | `{ rows: [{id, date, sourceItemName, batchCode, batchDate, quantityIn, outputItemName, outputBatchCode, responsibleEmployee, responsibleRole, result}] }` |
| `training_plan` | `{ year, rows: [{id, position, trainings:{kkt?, sanitation?, duties?, safety?, fire?}}] }` |

Row shape authorities live in `src/lib/<code>-document.ts` — use those
`normalizeXxxConfig` functions as the source of truth.
