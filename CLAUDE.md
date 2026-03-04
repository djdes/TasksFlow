# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HACCP-Online — SaaS for electronic HACCP/SanPiN journal keeping at food production facilities (CIS market). Next.js 16 monolith with PostgreSQL, deployed via PM2 on a Linux VPS.

## Quick Start (new developer)

```bash
git clone https://github.com/djdes/HACCP-Online.git
cd HACCP-Online
cp .env.shared .env        # all secrets are in .env.shared
npm install
npx prisma generate
npx prisma db push          # create tables in local PostgreSQL
npx tsx prisma/seed.ts      # seed 5 journal templates
npm run dev                 # http://localhost:3000
```

Local PostgreSQL must be running with user `postgres:postgres` and database `haccp_online`.

## Commands

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm start            # Production server
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma db push   # Push schema to DB (no migrations)
npx tsx prisma/seed.ts  # Seed 5 journal templates
```

## Secrets & Credentials

All secrets are in `.env.shared` (committed to private repo). Copy to `.env` for local dev.

| Service | Where |
|---------|-------|
| Tuya IoT API | `.env.shared` — TUYA_ACCESS_ID/SECRET, device ID: `bf397860f79b0963a0nakc` |
| Production DB | `.env.shared` (in comments) — `magday:r15*gRJPulurILWV@localhost:5432/haccp_magday` |
| Production server SSH | `192.168.33.3:22`, user `magday`, password `r15*gRJPulurILWV` |
| Production app | `https://haccp.magday.ru`, PM2 process `haccp-online`, port 3001 |
| SMTP (prod) | localhost:25, from `noreply@haccp.magday.ru` |

## Deployment

Deploy script connects via SSH (paramiko), uploads tar, builds on server, restarts PM2.

Create `_deploy.py` locally (it's in `.gitignore`):
```python
import paramiko, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HOST = '192.168.33.3'
USER = 'magday'
PASS = 'r15*gRJPulurILWV'
REMOTE_DIR = 'www/haccp.magday.ru/app'
LOCAL_TAR = os.path.join(os.path.dirname(__file__), 'haccp-deploy.tar')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username=USER, password=PASS, timeout=10)
# Backup .env
ssh.exec_command(f'cp ~/{REMOTE_DIR}/.env ~/{REMOTE_DIR}/.env.bak', timeout=10)
# Upload tar
sftp = ssh.open_sftp()
sftp.put(LOCAL_TAR, f'{REMOTE_DIR}/deploy.tar')
sftp.close()
# Extract, restore .env, install, build, restart
for cmd in [
    f'cd ~/{REMOTE_DIR} && tar xf deploy.tar && rm deploy.tar && cp .env.bak .env',
    f'cd ~/{REMOTE_DIR} && source ~/.nvm/nvm.sh && npm install 2>&1 | tail -3',
    f'cd ~/{REMOTE_DIR} && source ~/.nvm/nvm.sh && npx prisma generate 2>&1 | tail -3',
    f'cd ~/{REMOTE_DIR} && source ~/.nvm/nvm.sh && npm run build 2>&1 | tail -10',
    f'cd ~/{REMOTE_DIR} && source ~/.nvm/nvm.sh && npx pm2 restart haccp-online 2>&1 | tail -5',
]:
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=600)
    out = stdout.read().decode('ascii', errors='replace')
    err = stderr.read().decode('ascii', errors='replace')
    if out: print(out)
    if err: print('ERR:', err)
ssh.close()
```

Deploy flow:
```bash
# 1. Create tar (exclude node_modules, .next, .git, deploy helpers)
tar cf haccp-deploy.tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=_run.py --exclude=_deploy.py --exclude=haccp-deploy.tar .

# 2. Run deploy script
python _deploy.py
```

**Important**: The server has no sudo access. SFTP is chrooted to home — use relative paths (e.g. `www/haccp.magday.ru/app`, not `/home/magday/...`). Use `prisma db push` not `migrate dev` (no CREATEDB permission). Build on the server (61GB RAM) — local Windows may OOM.

## Collaboration Workflow

**Rule: never push directly to `master`. Always use feature branches + Pull Requests.**

```bash
git checkout master && git pull
git checkout -b feature/my-feature    # create feature branch
# ... write code ...
git add <files> && git commit -m "feat: description"
git push -u origin feature/my-feature
gh pr create --title "Description" --body "What was done"
# Second developer reviews → Approve → Merge
```

After merge to master — one person deploys (tar + _deploy.py).

If you change `prisma/schema.prisma`, run `npx prisma db push` on the server after deploy.

## Architecture

**Stack**: Next.js 16 App Router, TypeScript, Prisma 7 (with `@prisma/adapter-pg`), PostgreSQL, NextAuth.js 4 (JWT + Credentials), shadcn/ui, TailwindCSS 4, Zod v4.

**Route Groups**:
- `(auth)` — public login/register pages
- `(dashboard)` — protected pages with sidebar layout, guarded by `requireAuth()`

**Multi-tenancy**: All data scoped by `organizationId` from the session. Three roles: `owner` > `technologist` > `operator`.

**API pattern**: `getServerSession(authOptions)` → role check → Zod validation → Prisma query → `NextResponse.json()`. Notifications (email/Telegram) are fire-and-forget (errors caught, don't fail the main operation).

### Key Modules (`src/lib/`)

| File | Purpose |
|------|---------|
| `db.ts` | Prisma singleton with `@prisma/adapter-pg` pool (required for Prisma 7 "client" engine) |
| `auth.ts` | NextAuth config — CredentialsProvider, JWT callbacks adding `role`, `organizationId` |
| `auth-helpers.ts` | `requireAuth()` / `requireRole()` for server components |
| `validators.ts` | All Zod schemas (login, register, equipment, area, journal entry) |
| `email.ts` | Nodemailer (localhost:25 SMTP) — `sendInviteEmail`, `sendWelcomeEmail`, `sendTemperatureAlertEmail` |
| `telegram.ts` | grammy bot — `notifyOrganization()` sends to users with `telegramChatId` |
| `tuya.ts` | Tuya Cloud API client — `getDeviceTemperature()` (values ÷ 10 from API) |
| `pdf.ts` | jsPDF report generation for regulatory audits |

### Journal System

Templates are stored in `JournalTemplate.fields` as JSON arrays defining dynamic form fields. The `DynamicForm` component renders fields by type (`text`, `number`, `date`, `boolean`, `select`, `equipment`). Supports conditional visibility (`showIf`), auto-fields, and Tuya IoT sensor fetch for `temperature` fields.

Five seeded templates: `temp_control`, `incoming_control`, `finished_product`, `hygiene`, `ccp_monitoring`.

### IoT Integration (Tuya)

Equipment with `tuyaDeviceId` can fetch live temperature. Two modes:
- **Manual**: Button "С датчика" in journal form calls `GET /api/tuya/device?equipmentId=X`
- **Auto**: Cron hits `POST /api/tuya/collect?secret=X` at 8:00/14:00/20:00 MSK, creates journal entries with `source: "tuya_auto"`

### Database (Prisma)

6 models: `Organization`, `User`, `Area`, `Equipment`, `JournalTemplate`, `JournalEntry`. Schema in `prisma/schema.prisma`, config in `prisma.config.ts`. DB URL comes from env only (not in schema). Use `prisma db push` (not `migrate dev`) on the hosted server — no CREATEDB permission.

## Conventions

- **Language**: UI text is Russian. Code/comments in English.
- **Next.js 16**: Page `params` are Promises — always `await params`.
- **Toasts**: Use `sonner`, not deprecated shadcn `toast`.
- **shadcn/ui style**: `new-york` variant, Lucide icons, path alias `@/components/ui`.
- **Path alias**: `@/*` maps to `./src/*`.
- **Zod**: v4 installed (not v3). Syntax mostly compatible.
- **Prisma 7**: Uses `prisma.config.ts` for DB URL. Client requires `@prisma/adapter-pg` adapter.
