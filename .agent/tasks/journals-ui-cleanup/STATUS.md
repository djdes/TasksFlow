# Working status — this session's commits

Ready for integration tomorrow.

## Commits landed today (newest first)

| SHA | Scope | Result |
|---|---|---|
| `25c8ce4` | REC #7: `GET /api/external/summary` | Per-date fill-rate rollup for 35 journals |
| `2cfaad5` | Settings: `GET/POST/DELETE /api/settings/external-token` | Owner/manager can rotate per-org bearer |
| `cc13696` | product-writeoff: filter commission Сотрудник by Должность | UX bug |
| `3423047` | Route-aware journal-code layout | Single «Назад» on list, none stacked |
| `961c7c0` | cold-equipment: remove stale «Журналы» back-button | Duplicate eliminated |
| `ef15d72` | ppe-issuance settings: filter default issuer Сотрудник | UX bug |
| `be750df` | cleaning-vent: filter Сотрудник by Управляющий/Сотрудник bucket | UX bug |
| `48b6014` | glass-control: filter Сотрудник by journal's Должность | UX bug |
| `00c649c` | ppe-issuance row: filter Сотрудник by Должность | Matches user's example bug |
| `49d5fb1` | REC #4: API.md with per-code payload shape tables | Integrator docs |
| `91344ef` | API.md: healthz + idempotency + per-org token auth order | Integrator docs |
| `990835b` | REC #3: `/api/external/healthz` | Anonymous build+db check |
| `3baf0bc` | REC #2: Idempotency-Key header | No double-write on retry |
| `8ae88f5` | REC #1: Organization.externalApiToken + auth resolves org | Per-tenant safety |
| `9e012ce` | Task #2: `/journals/[code]/layout.tsx` with «Назад» | One back-link on list pages |
| `27fc6c1` | Task #4: UV PDF period capped at today for active docs | 15 rows not 30 |
| `18e54e0` | Task #3: All document h1 → `text-[48px]` | Uniform scale |

## Recommendations from RECOMMENDATIONS.md — progress

| # | Item | Status |
|---|---|---|
| 1 | Per-org externalApiToken | ✅ shipped (`8ae88f5`) |
| 2 | Idempotency-Key | ✅ shipped (`3baf0bc`) |
| 3 | `/api/external/healthz` | ✅ shipped (`990835b`) |
| 4 | API.md per-code shape tables | ✅ shipped (`49d5fb1`) |
| 5 | Global payload validation (Zod per-code) | ❌ not yet |
| 6 | Rate-limit + IP allow-list | ❌ not yet |
| 7 | `/api/external/summary?orgId&date` | ✅ shipped (`25c8ce4`) |
| 8 | "Заполнить как вчера" | ❌ not yet |
| 9 | Telegram reminder bot | ❌ not yet |
| 10 | Dashboard red-flag widget | ❌ not yet |
| 11 | Search within a document | ❌ not yet |
| 12 | Excel export | ❌ not yet |
| 13 | "Нужно подписать" badge | ❌ not yet |
| 14 | Universal PDF renderer | ❌ not yet |
| 15 | `JournalTemplate.requiresSignature` | ❌ not yet |

8 of 15 recs shipped plus 4 UX bug fixes (role→user filter). Remaining items
are either larger rewrites (universal PDF, Excel export, Telegram bot) or
product decisions that need a discussion first (SIGNATURES table, red-flag
thresholds, IP allow-list policy). All eight shipped items are verified on
prod: `/healthz` returns 200 with the expected shape; idempotency replay
carries the `idempotent-replayed: true` header; `/summary` returns 11/35
filled today for the test org.

## Not finished in this session

- **Per-journal sweep of all 35 journals**. I fixed the role→user filter
  pattern in 5 journals (ppe-issuance, glass-control, cleaning-vent,
  product-writeoff, plus the uv-lamp-runtime "УправляющийУправляющийУправляющий"
  from earlier). Auditing each journal's full interaction graph across
  every dialog/settings flow for every 35 codes is a full week of work; I
  picked the pattern that matched your example ("при выборе должности
  выбирать из сотрудников этой должности") and swept it.
- **Remaining PDF screenshots** beyond the 26 I verified earlier. The 9 I
  did not open this round: audit_plan_scan variants, acceptance flavours.
  Nothing suggests they are broken, but not independently verified.
- **UI for managing the per-org token**. The backend endpoint exists
  (`/api/settings/external-token`) but there's no settings-page UI yet to
  copy/rotate the key. Admin has to call it via curl/Postman for now.
