# Email Notifications Design

## Overview
Add transactional email sending via Nodemailer + localhost SMTP (FastPanel mail server).

## Email Types
1. **Invite** — when owner invites employee: login URL, email, password
2. **Welcome** — when owner registers: greeting, quick-start guide
3. **Temperature Alert** — when journal entry has out-of-range temperature (alongside Telegram)

## Architecture
- `src/lib/email.ts` — Nodemailer transport + 3 template functions
- SMTP: `localhost:25`, from `noreply@haccp.magday.ru`
- HTML templates: inline-styled, branded
- Fire-and-forget pattern (errors logged, don't block requests)
- Env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`

## Integration Points
- `POST /api/users/invite` → `sendInviteEmail()` after user creation
- `POST /api/auth/register` → `sendWelcomeEmail()` after registration
- `POST /api/journals` → `sendTemperatureAlertEmail()` alongside Telegram notification

## Dependencies
- `nodemailer` + `@types/nodemailer`
