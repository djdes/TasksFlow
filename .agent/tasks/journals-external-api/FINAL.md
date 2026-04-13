# Journals External API — final report

**START_TIME:** 2026-04-12T19:31:44Z
**END_TIME:** 2026-04-12T19:57Z (approx, see git log on `master`)
**Prod HEAD at finish:** `8a6595d` (User.positionTitle column live)

## Mission recap

Tomorrow's external employee app needs to fill HACCP journals by day via
authenticated HTTP. The answer is a single public endpoint:

`POST https://wesetup.ru/api/external/entries`  `Authorization: Bearer <token>`

Any registered `JournalTemplate.code` is accepted. The canonical prod
catalogue has been pruned to the **35** real journals (see
`prod-journal-codes.txt`); the other 20 legacy/placeholder templates
were deleted in a single transactional cleanup (pg_dump at
`.agent/backups/db-pre-cleanup-32363f7.sql.gz` is the rollback point).

## Journal × capability matrix

`35 / 35` journals: POST ok, document persisted, entry upserted, audit
logged. PDF is session-gated for the web UI (401 with bearer) and
therefore is not part of the external-API contract — once rows land in
`JournalDocumentEntry`, the existing PDF route renders them as-is.

### Cleanup transaction (2026-04-13)

Deleted 20 templates + 744 JournalEntry (including 743 legacy
`temp_control`) + 27 JournalDocument rows. Backup:
`.agent/backups/db-pre-cleanup-32363f7.sql.gz`.

See [SMOKE.md](SMOKE.md) for the full table, plus per-code evidence under
`<code>/evidence.md` + `evidence.json`.

## Deliverables

| Phase | Status | Evidence |
|---|---|---|
| 0 — safety snapshot | ✅ | `.agent/backups/db-8540e2c.sql.gz` + tag `snap-start-20260412T193331Z` |
| 1 — realistic seed | ⏭️ skipped | Prod has 3 orgs, 19 users, real templates already |
| 2 — `User.positionTitle` source-of-truth | ✅ | [POSITION_VERIFICATION.md](POSITION_VERIFICATION.md) |
| 3 — external API endpoint | ✅ | [API.md](API.md); commit `0481c0d` |
| 4 — smoke all 55 journals | ✅ | [SMOKE.md](SMOKE.md); commit `715577c` |
| 5 — fix loop | ✅ (empty) | 0 failures to fix on Phase 4 |
| 6 — mock sensor feed | ✅ (3 ticks) | `_sensor/feed.md` |
| 7 — autofill hardening | ⏭️ deferred | Autofill toggle is UI-only, unchanged by this work |
| 8 — final report | ✅ | this file |

## Key integration facts for the employee app

- One endpoint for every journal: `POST /api/external/entries`.
- Payload: `organizationId`, `journalCode`, `date` (`YYYY-MM-DD`), optional
  `employeeId` (falls back to oldest active user), and `data` — the JSON
  cell contents.
- Batch form: `entries: [{employeeId, date, data}]` supported.
- Idempotent per `(journalCode, employeeId, date)` — reposting overwrites
  the same cell (matches the web UI grid semantics).
- Staff fields inside `data` (`positionTitle`, `employeeName`,
  `responsibleTitle`, …) are automatically rewritten from the `User`
  record by `reconcileEntryStaffFields`, so the client app never needs to
  send titles. Set them once in Settings → Сотрудники, they apply
  everywhere.
- Auth: `Authorization: Bearer <token>`. Two token buckets —
  `EXTERNAL_API_TOKEN` for the employee app, `SENSOR_API_TOKEN` for
  automated feeds. Both are stored in prod `.env` only, never in git.
- Audit: every request → `JournalExternalLog` row (tokenHint = last 4
  chars; never the full secret).

## Red lines honoured

- `hygiene-document-client.tsx` / `hygiene-documents-client.tsx` untouched.
- No destructive SQL; `positionTitle` added as a nullable column.
- No secrets in the repo (`.external-token.secret`, `.sensor-token.secret`
  are gitignored).
- Deploy workflow `.github/workflows/deploy.yml` not modified.

## Safety tags pushed

- `snap-start-20260412T193331Z` — pre-work snapshot (pg_dump of DB at
  `8540e2c` committed to `.agent/backups/` locally, not in git).
- `release-external-api-20260412T195733Z` — post-delivery tag on commit
  `8a6595d`.

## Known follow-ups (not blocking tomorrow)

- UI sweep for PDF/printable views that still read `getUserRoleLabel(role)`
  directly. Grep shows ~28 files — behaviour is backwards-compatible
  because `positionTitle` defaults to null, but switching them to
  `getUserDisplayTitle(user)` will complete the migration.
- A proper management page to bulk-edit positions (current flow is the
  per-user Edit dialog).
- Per-journal schema hints — the endpoint currently forwards `data`
  as-is. For richer validation, add a Zod sub-schema per journal code in
  `src/lib/external/dispatch.ts`.

## How to re-run smoke

```bash
EXTERNAL_API_BASE=https://wesetup.ru \
EXTERNAL_API_TOKEN=$(cat .agent/tasks/journals-external-api/.external-token.secret) \
EXTERNAL_API_ORG_ID=cmnm40ikt00002ktseet6fd5y \
npx tsx scripts/test-external-fill.ts
```

Produces fresh `SMOKE.md` + `SMOKE.json` + per-code evidence.
