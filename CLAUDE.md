# CLAUDE.md

This file provides working memory for future coding sessions in this repository.

## Project

HACCP-Online is a Next.js 16 monolith for electronic HACCP / SanPiN journals at food production facilities.

Stack:
- Next.js 16 App Router
- TypeScript
- Prisma 7 with PostgreSQL
- NextAuth.js 4
- shadcn/ui
- Tailwind CSS 4
- PM2 on Linux VPS

## Repo

- GitHub repo: `https://github.com/djdes/HACCP-Online`
- Main branch: `master`
- Production deploys from pushes to `master`
- Current real workflow: direct push to `master` is allowed and expected for deploys

Common git flow:

```bash
git checkout master
git pull origin master

# make changes
git add path/to/file1 path/to/file2
git commit -m "feat: short description"
git push origin master
```

If you only need to trigger autodeploy:

```bash
git commit --allow-empty -m "chore: trigger test deploy"
git push origin master
```

Important git notes:
- Stage specific files whenever possible.
- Do not sweep local scratch files into commits unless explicitly requested.
- Local scratch files seen before: `test.txt`, `_seed_remote.py`, `docs/plans/*`.
- If git reports dubious ownership in this workspace, fix it with:

```bash
git config --global --add safe.directory C:/www/Wesetup.ru
```

- Git Credential Manager is available on this machine.

## Local Setup

```bash
git clone https://github.com/djdes/HACCP-Online.git
cd HACCP-Online
cp .env.shared .env
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Useful commands:

```bash
npm run dev
npm run build
npm run lint
npm start
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

## Secrets and Credentials

Local / repo:
- `.env.shared` is used as the shared template
- production database secrets live on the server `.env`

Production SSH:
- Host: `wesetup.ru`
- User: `wesetupru`
- Password: `bCQMn~Jy9C-n&9+(`
- External port: `50222`
- Local / internal reachable port from current environment: `22`

Production app:
- PM2 process: `haccp-online`
- Internal app port: `3002`
- Workflow target path: `www/wesetup.ru/app`
- Resolved server path: `/var/www/wesetupru/data/www/wesetup.ru/app`

## Deployment

Deployment is handled by GitHub Actions.

Workflow:
- file: `.github/workflows/deploy.yml`
- trigger: push to `master`

What the deploy workflow does:
1. Checks out the repo
2. Writes `.build-sha` and `.build-time`
3. Creates `deploy.tar`
4. Uploads it over SSH / SCP using GitHub Secrets
5. Restores `.env`
6. Runs `npm install`
7. Runs `npx prisma generate`
8. Runs `npx prisma db push`
9. Runs `npm run build`
10. Restarts PM2 process `haccp-online`

Deploy exclusions already configured in workflow:
- `node_modules`
- `.next`
- `.git`
- `.github`
- `.claude`
- `.vscode`
- `_run.py`
- `_deploy.py`
- `_seed_remote.py`
- tarballs
- `test.txt`

Important deploy facts:
- The deployed app directory is not a git checkout.
- Do not verify prod with `git status` on the server.
- Verify prod using `.build-sha`, `.build-time`, PM2, and HTTP checks.
- Current deploy path on server is under `/var/www/wesetupru/data/...`, not bare `/www/...`.
- From the current environment, port `50222` returned connection refused, while port `22` worked.

Useful production checks:

```bash
# PM2
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "pm2 status haccp-online --no-color"

# Build markers
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "cd /var/www/wesetupru/data/www/wesetup.ru/app && cat .build-sha && cat .build-time"

# Local HTTP probe on server
plink -batch -hostkey "ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E" -P 22 -l wesetupru -pw 'bCQMn~Jy9C-n&9+(' wesetup.ru "curl -I -s http://127.0.0.1:3002 | sed -n '1,10p'"
```

Known current production signals:
- `haccp-online` is managed by PM2 and has been observed online after deploy
- app answered `HTTP/1.1 200 OK` on `127.0.0.1:3002`
- Next.js logs warn about multiple `package-lock.json`
- this warning is non-fatal, but worth cleaning later

## Architecture

Route groups:
- `(auth)` for public login / register pages
- `(dashboard)` for protected pages

Core multi-tenancy rule:
- all business data is scoped by `organizationId` from the session
- `session.user.organizationId` is the **home** org, `getActiveOrgId(session)` returns the **currently-viewed** org (different when a ROOT user impersonates a customer). Always use `getActiveOrgId` in server components and API handlers.

Three-tier access model:
- **ROOT** (`User.isRoot = true`): platform superadmin, lives in the synthetic `platform` organisation (id `platform`). Sees `/root/*`. Non-root requests to `/root/*` are 404 (via `src/middleware.ts`), not redirected, so existence is not leaked.
- **Company owner / manager** (`role in {manager, head_chef}` or legacy `owner`/`technologist`): sees every journal + user in their org. Bypasses per-journal ACL.
- **Employee** (`cook`, `waiter`, or any role when `journalAccessMigrated=true` + no row): only sees journals explicitly granted via `UserJournalAccess`. See `src/lib/journal-acl.ts` for the truth table and 60-second LRU cache.

Roles (legacy-compatible):
- `owner` / `manager`
- `technologist` / `head_chef`
- `operator` / `cook` / `waiter`

Registration + invite:
- `/register` is a 3-step wizard — details → 6-digit email code (`POST /api/auth/register/request` + `/confirm`) → tariff picker. On confirm we create Organization + manager User + auto-sign-in.
- Employee invite flow: owner clicks "Пригласить" → `POST /api/users/invite` creates a placeholder User (`isActive=false`, empty `passwordHash`) + `InviteToken` (SHA-256 stored, 7-day TTL) → email with `/invite/<raw>` link → `/invite/[token]` page accepts password and activates.

Impersonation:
- ROOT clicks "Войти как X" → `POST /api/root/impersonate` writes AuditLog + the client calls `useSession().update({ actingAsOrganizationId })` so the JWT gets the claim. Dashboard shows a red sticky banner with "Выйти" button (`/src/components/dashboard/impersonation-banner.tsx`). No cookie swap.

Common API pattern:
1. `getServerSession(authOptions)`
2. role check (`isManagementRole`, `session.user.isRoot`, or `requireRoot()` for platform endpoints)
3. ACL check via `hasJournalAccess` for journal-bound endpoints
4. Zod validation
5. Prisma query (scope by `getActiveOrgId`)
6. `NextResponse.json()`

## Key Modules

Important files in `src/lib/`:
- `db.ts`: Prisma singleton
- `auth.ts`: NextAuth config (JWT carries `isRoot`, `actingAsOrganizationId`)
- `auth-helpers.ts`: `requireAuth()` / `requireRole()` / `requireRoot()` / `getActiveOrgId()` / `isImpersonating()`
- `journal-acl.ts`: `hasJournalAccess` + `canWriteJournal` + `canFinalizeJournal`, LRU-cached; `invalidateJournalAcl(userId)` on ACL save
- `invite-tokens.ts`: 32-byte base64url tokens, SHA-256 hash, `buildInviteUrl` helper
- `registration.ts`: 6-digit code generator + bcrypt compare + TTL config
- `validators.ts`: Zod schemas
- `email.ts`: mail sending (`sendVerificationEmail`, `sendInviteTokenEmail`, `sendWelcomeEmail`, alert templates)
- `telegram.ts`: `sendTelegramMessage` with TelegramLog + 429 retry, `notifyOrganization`, link-token HMAC
- `tuya.ts`: Tuya integration
- `pdf.ts`: PDF generation

Required env (for the three-tier model):
- `PLATFORM_ORG_ID=platform`
- `ROOT_EMAIL`, `ROOT_PASSWORD_HASH` (seed creates the first root from these; plain `ROOT_PASSWORD` also accepted for dev)
- `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_TOKEN_SECRET`, `TELEGRAM_WEBHOOK_SECRET`
- `EMAIL_VERIFICATION_TTL_MIN=10`, `TELEGRAM_LOG_RETENTION_DAYS=30`

## Journal System

Journal templates are stored in `JournalTemplate.fields` as JSON arrays.

The dynamic journal form supports:
- text
- number
- date
- boolean
- select
- equipment
- employee

There is now a separate document-based journal layer for grid journals:
- `JournalDocument`
- `JournalDocumentEntry`

This is used for employee-by-day printable journals such as hygiene logs.

Relevant files:
- `src/app/api/journal-documents/route.ts`
- `src/app/api/journal-documents/[id]/route.ts`
- `src/app/api/journal-documents/[id]/entries/route.ts`
- `src/app/(dashboard)/journals/[code]/documents/[docId]/page.tsx`
- `src/components/journals/hygiene-document-client.tsx`
- `src/lib/hygiene-document.ts`

## Conventions

- UI text is Russian.
- Code and comments are usually English.
- Next.js 16 page `params` are Promises, so always `await params`.
- Use `sonner` for toasts.
- Path alias: `@/*` -> `./src/*`
- Prisma changes should be deployed with `npx prisma db push`
- The deploy workflow already runs `prisma db push` on the server

<!-- repo-task-proof-loop:start -->
## Repo task proof loop

For substantial features, refactors, and bug fixes, use the repo-task-proof-loop workflow.

Required artifact path:
- Keep all task artifacts in `.agent/tasks/<TASK_ID>/` inside this repository.

Required sequence:
1. Freeze `.agent/tasks/<TASK_ID>/spec.md` before implementation.
2. Implement against explicit acceptance criteria (`AC1`, `AC2`, ...).
3. Create `evidence.md`, `evidence.json`, and raw artifacts.
4. Run a fresh verification pass against the current codebase and rerun checks.
5. If verification is not `PASS`, write `problems.md`, apply the smallest safe fix, and reverify.

Hard rules:
- Do not claim completion unless every acceptance criterion is `PASS`.
- Verifiers judge current code and current command results, not prior chat claims.
- Fixers should make the smallest defensible diff.

Installed workflow agents:
- `.claude/agents/task-spec-freezer.md`
- `.claude/agents/task-builder.md`
- `.claude/agents/task-verifier.md`
- `.claude/agents/task-fixer.md`

Claude Code note:
- If `init` just created or refreshed these files during the current Claude Code session, do not assume the refreshed workflow agents are already available.
- The main Claude session may auto-delegate to these workflow agents when the current proof-loop phase matches their descriptions. If automatic delegation is not precise enough, make the current proof-loop phase more explicit in natural language.
- TodoWrite or the visible task/todo UI is optional session-scoped progress display only. The canonical durable proof-loop state is the repo-local artifact set under `.agent/tasks/<TASK_ID>/`.
- Keep this workflow flat. These generated workflow agents are role endpoints, not recursive orchestrators.
- Keep this block in the root `CLAUDE.md`. If the workflow needs longer repo guidance, prefer `@path` imports or `.claude/rules/*.md` instead of expanding this block.
<!-- repo-task-proof-loop:end -->
