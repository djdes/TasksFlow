# HACCP-Online External Entries API

Base URL: `https://wesetup.ru`

## Auth

All requests require `Authorization: Bearer <token>`.

Two tokens are recognised server-side:

| Env var                | Intended caller                     |
|------------------------|-------------------------------------|
| `EXTERNAL_API_TOKEN`   | Employee-app integration (manual)   |
| `SENSOR_API_TOKEN`     | Mock / real sensor feed             |

Both live only in the prod `.env`. They are not committed to the repo.

## Endpoint

`POST /api/external/entries`

### Request body

```json
{
  "organizationId": "cmnm40ikt00002ktseet6fd5y",
  "journalCode": "hygiene",
  "date": "2026-04-12",
  "employeeId": "cm...",
  "source": "employee_app",
  "data": { "status": "healthy", "temperatureAbove37": false }
}
```

`employeeId` is optional — the server falls back to the oldest active user in the
organisation if it is missing. `date` defaults to today if omitted.

Batch form is also accepted:

```json
{
  "organizationId": "cmnm40ikt00002ktseet6fd5y",
  "journalCode": "climate_control",
  "entries": [
    { "employeeId": "cm...", "date": "2026-04-12", "data": { "temp": 22 } },
    { "employeeId": "cm...", "date": "2026-04-12", "data": { "temp": 23 } }
  ]
}
```

### Response (200)

```json
{
  "ok": true,
  "documentId": "cmn...",
  "entriesWritten": 1,
  "createdDocument": false,
  "templateCode": "hygiene"
}
```

- `createdDocument: true` means no active JournalDocument existed for the period and the API
  auto-created one covering the month that contains `date`.
- `entriesWritten` is the number of `JournalDocumentEntry` rows upserted.

### Errors

| Status | Meaning                                               |
|-------:|-------------------------------------------------------|
| 400    | `Invalid JSON` / `Invalid payload`                    |
| 401    | Missing or invalid bearer token                       |
| 404    | `organizationId` or template code or `employeeId` not found |
| 503    | Server has no `EXTERNAL_API_TOKEN` / `SENSOR_API_TOKEN` configured |

Every request (success or failure) is logged to the `JournalExternalLog` table
(`tokenHint` = last 4 chars only, never the full secret).

## Supported journal codes

Any code listed in `JournalTemplate` table. The current prod set:

```
accident_journal, allergen_control, audit_plan, audit_plan_scan,
audit_protocol, audit_protocol_scan, audit_report, audit_report_scan,
breakdown_history, ccp_monitoring, cleaning, cleaning_ventilation_checklist,
climate_control, cold_equipment_control, complaint_register, cooking_temp,
critical_limit_check, daily_rejection, defrosting_control, dishwashing_control,
disinfectant_usage, equipment_calibration, equipment_cleaning,
equipment_maintenance, finished_product, fryer_oil, general_cleaning,
glass_control, glass_items_list, hand_hygiene_control, health_check, hygiene,
incoming_control, incoming_raw_materials_control, intensive_cooling,
inventory_sanitation, med_books, metal_impurity, perishable_rejection,
pest_control, ppe_issuance, product_writeoff, raw_storage_control,
receiving_temperature_control, sanitary_day_control, shipment, staff_training,
supplier_audit, temp_control, traceability_test, training_plan,
uv_lamp_control, uv_lamp_runtime, waste_disposal_control,
water_temperature_control
```

Source-slug aliases from legacy crawlers (e.g. `healthjournal`, `brakery1journal`)
are resolved via `src/lib/source-journal-map.ts`.

## Curl examples

```bash
# hygiene: mark an employee as healthy for today
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $EXTERNAL_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "hygiene",
    "date": "2026-04-12",
    "data": { "status": "healthy", "temperatureAbove37": false }
  }'

# climate_control: sensor reading
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $SENSOR_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "climate_control",
    "source": "sensor",
    "data": { "temp": 22.4, "humidity": 54 }
  }'

# cold_equipment_control: fridge telemetry
curl -X POST https://wesetup.ru/api/external/entries \
  -H "authorization: Bearer $SENSOR_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "organizationId": "cmnm40ikt00002ktseet6fd5y",
    "journalCode": "cold_equipment_control",
    "source": "sensor",
    "data": { "readings": [{ "equipmentName": "Холодильник 1", "temp": 3.2 }] }
  }'
```

## Notes for integrators

- The endpoint upserts by `(documentId, employeeId, date)` — posting the same
  `(journalCode, employeeId, date)` twice overwrites the previous `data` payload.
  This matches the grid-cell PUT semantics used by the web UI.
- Staff fields (`positionTitle`, `responsibleTitle`, `employeeName`, etc.) inside
  `data` are automatically reconciled against the `User` record via
  `reconcileEntryStaffFields`, so the integrator does not need to send them.
- PDF generation endpoint (`/api/journal-documents/<id>/pdf`) is session-gated
  for the web UI; it is **not** accessible with a bearer token. The UI PDF is
  regenerated from the same rows the external API wrote, so once rows land the
  PDF will reflect them.
