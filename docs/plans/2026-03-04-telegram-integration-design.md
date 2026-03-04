# Telegram Integration Design

## Goal
Full Telegram bot integration: account linking/unlinking, notification preferences per user, and filtered notification delivery.

## Current State
- `src/lib/telegram.ts` — grammy bot, `sendTelegramMessage`, `notifyOrganization`, token linking
- `src/app/(dashboard)/settings/notifications/page.tsx` — basic link-only UI
- `src/app/api/notifications/telegram/route.ts` — webhook handler for `/start`
- `User.telegramChatId` field in Prisma schema
- 4 notification triggers: temperature (journals API), IoT auto (tuya/collect), deviations (journals API), compliance (cron)

## Changes

### 1. Configuration
- Set `TELEGRAM_BOT_TOKEN` and add `TELEGRAM_BOT_USERNAME=wesetupbot` in `.env.shared`
- Register webhook URL: `https://haccp.magday.ru/api/notifications/telegram`

### 2. Schema Change
Add `notificationPrefs Json?` to User model:
```json
{
  "temperature": true,
  "deviations": true,
  "compliance": true
}
```
Default: all true (null = all enabled).

### 3. Updated Settings Page (`/settings/notifications`)
Client component with:
- Link status: green badge when linked, "Привязать Telegram" button when not
- "Отключить Telegram" button when linked
- 3 Switch toggles for notification types (temperature, deviations, compliance)
- Real-time updates via API calls

### 4. New API Routes
- `DELETE /api/notifications/telegram` — unlink (set `telegramChatId = null`)
- `PATCH /api/notifications/preferences` — update notification prefs

### 5. Webhook Updates
- Add `/stop` command handling — unlink via bot

### 6. Notification Filtering
- Add `type` parameter to `notifyOrganization()`: `"temperature" | "deviations" | "compliance"`
- Filter users by their `notificationPrefs` before sending

### 7. Update Existing Triggers
- `POST /api/journals` (temperature + deviations) — pass type to `notifyOrganization`
- `POST /api/tuya/collect` (temperature) — pass type
- `POST /api/cron/compliance` (compliance) — pass type
