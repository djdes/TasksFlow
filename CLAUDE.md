# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HACCP-Online — SaaS for electronic HACCP/SanPiN journal keeping at food production facilities (CIS market). Next.js 16 monolith with PostgreSQL, deployed via PM2 on a Linux VPS.

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

**Deployment**: `python _deploy.py` — tars source, SFTPs to server, builds remotely, restarts PM2. Backs up `.env` before overwriting. Server: `192.168.33.3`, app path: `~/www/haccp.magday.ru/app`, process: `haccp-online` (PM2, port 3001).

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
- **Git**: user.name="djdes", user.email="djdes@email.com".
