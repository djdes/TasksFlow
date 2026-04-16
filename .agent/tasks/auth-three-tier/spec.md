# Task: Three-tier authorization (ROOT / Company / Employee)

**Status:** frozen
**Owner:** djdes
**Target branch:** master (direct push + GitHub Actions deploy)

## Goal

Introduce a platform-level ROOT superadmin, a company-level owner/manager, and an employee-level user with per-journal access control, without regressing any of the 35 existing journals or multi-tenant isolation.

## Non-goals

- Billing gateway — keep existing `subscriptionPlan` enum only
- Re-writing NextAuth (stay on Credentials + JWT)
- Row-level security at DB layer (enforce in app)
- Mobile apps — web only

## Visibility matrix

| Level | DB signal | Can see |
|-------|-----------|---------|
| ROOT | `User.isRoot = true` | All organizations, impersonate, global stats, tariffs |
| Company owner/manager | `role in {manager, head_chef}` | Only own org's users, docs, settings |
| Employee | `role in {cook, waiter}` | Only journals explicitly granted via `UserJournalAccess` |

## Acceptance criteria

**AC1 — Prisma schema (additive, zero-downtime):**
- `User.isRoot: Boolean @default(false)`
- `User.journalAccessMigrated: Boolean @default(false)`
- New model `InviteToken { id, userId @unique, tokenHash, expiresAt, usedAt }`
- New model `UserJournalAccess { userId, templateCode, canRead, canWrite, canFinalize, @@unique([userId, templateCode]) }`
- New model `EmailVerification { email @unique, codeHash, expiresAt, attempts }`
- `npx prisma db push` succeeds on existing prod snapshot without data loss
- Seed creates synthetic `Organization { id: "platform" }` and first root user from `ROOT_EMAIL` / `ROOT_PASSWORD_HASH` env

**AC2 — Session + guards:**
- JWT carries `isRoot: boolean` and `actingAsOrganizationId: string | null`
- `requireRoot()` helper returns 404 (not redirect) for non-root
- `getActiveOrgId(session)` returns `actingAsOrganizationId ?? organizationId`
- All existing `session.user.organizationId` reads in server components migrated to `getActiveOrgId`
- `src/middleware.ts` 404s `/root/*` for non-root sessions
- Existing `requireAuth()` / `requireRole()` unchanged behaviour

**AC3 — Journal ACL:**
- `hasJournalAccess(user, templateCode)` lib with 60-second LRU cache
- Rule: allow if `isRoot || isManagerRole(user.role) || user.journalAccessMigrated === false`; otherwise check `UserJournalAccess` rows
- All `/api/journals`, `/api/journal-documents`, `/api/journal-documents/*` routes gated
- `/journals/[code]` page 404s for unauthorised employee
- `/settings/users/[id]/access` UI lets owner toggle 35 journals; first save flips `journalAccessMigrated = true`
- Default behaviour for existing users: grant-all (zero regression)

**AC4 — ROOT dashboard:**
- `/root` (new route group with its own layout) lists all organizations with user count, active journals, plan, last activity
- `/root/organizations/[id]` detail with users, subscription editor, journal stats
- `/root/telegram-logs` (filled in Task 2)
- 404 for non-root

**AC5 — Impersonation:**
- `POST /api/root/impersonate { organizationId }` sets JWT `actingAsOrganizationId`, returns org data
- `POST /api/root/impersonate/stop` clears it
- Persistent red banner "Просмотр организации: X. Выйти" in dashboard layout when impersonating
- Every impersonation start/stop written to `AuditLog`

**AC6 — Registration wizard (4 server-side steps):**
- Step 1 `/register` — email + password + org name + INN + phone; POST creates `EmailVerification` row, sends 6-digit code via email; rate-limited 5/min/IP
- Step 2 `/register/verify` — 6-digit code input; max 5 attempts; 10-min TTL
- Step 3 `/register/plan` — basic (13 journals) vs. extended (22 journals) picker backed by `journal-tariffs` lib
- Step 4 `/register/done` — final submit creates `Organization` + `User { role: "manager" }` in one transaction, signs user in, redirects to dashboard
- Old flat `/register` POST returns 308 redirect to step 1 for bookmarks

**AC7 — Invite tokens:**
- `POST /api/users/invite` creates `User { isActive: false, passwordHash: "" }` + `InviteToken`, emails `/invite/[token]` URL (no raw password)
- `/invite/[token]` page validates token (hash lookup, not-used, not-expired), shows set-password form
- Successful submit sets password, `isActive: true`, marks `InviteToken.usedAt`, signs user in
- Expired/used token → friendly error page
- Nightly cron purges expired unused tokens

**AC8 — Permission snapshot test (regression safety):**
- Jest test enumerates current behaviour of `requireRole`, `isManagerRole`, `hasAnyUserRole` for all 4 role values + 4 legacy values
- Runs on every commit; any change = explicit acceptance

## Out of acceptance (nice-to-have, stretch)

- Billing integration — no
- Multi-factor auth on root login — no (next iteration)
- Self-service org deletion — no
- Teams within an org — no

## Risks

| Risk | Mitigation |
|------|-----------|
| Mid-deploy request reads old schema | All new columns have defaults (`false`), new tables only touched by new code paths |
| JWT size blows up | Keep only `isRoot` + `actingAsOrganizationId` in JWT; compute `allowedJournalCodes` per-request |
| `session.user.organizationId` misread during impersonation | `getActiveOrgId` wrapper + sweep commit; snapshot test guards |
| ACL enforcement forgotten on new journal routes | Central `hasJournalAccess` helper; lint rule (optional stretch) |
| Root user locked out | `ROOT_EMAIL` + `ROOT_PASSWORD_HASH` env bootstrap; seed idempotent |

## Test plan

- Unit: permission-matrix snapshot, `hasJournalAccess` truth table, `parseLinkToken` expiry
- Integration: `/api/users/invite` → email → `/invite/[token]` → sign in
- E2E (Playwright): register → verify → pay → invite → revoke access → root impersonate → stop
- Production smoke: `.build-sha`, `curl /api/health`, PM2 status

## Deliverables

- 25 commits across Phases 0-6 (see plan)
- `FINAL.md` with commit index, manual verification checklist, known-issues section
- Updated `CLAUDE.md` three-tier section
- Updated `.env.example` with ROOT_EMAIL, ROOT_PASSWORD_HASH, PLATFORM_ORG_ID
