# HACCP-Online External Entries API

Base URL: `https://wesetup.ru`

## Auth

All requests require `Authorization: Bearer <token>`.

Two tokens are recognized server-side:

| Env var | Intended caller |
|---|---|
| `EXTERNAL_API_TOKEN` | Employee-app integration |
| `SENSOR_API_TOKEN` | Sensor / mock sensor feed |

Both live only in the server `.env` and must never be committed.

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
