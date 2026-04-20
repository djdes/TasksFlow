# Task Spec: Telegram Bot UX Roadmap

Task ID: `telegram-bot-ux-roadmap-2026-04-20`
Date: 2026-04-20
Status: Frozen for planning

## Scope

Design the next major Telegram bot evolution for WeSetup so that the bot becomes a reliable operational dispatcher for employees and managers instead of a thin invite-and-open shell.

This task freezes the target architecture and acceptance criteria before implementation.

Related design doc:

- [docs/superpowers/specs/2026-04-20-telegram-bot-obligation-design.md](/C:/www/Wesetup.ru/docs/superpowers/specs/2026-04-20-telegram-bot-obligation-design.md)

## Problem Statement

The current Telegram integration is functional but shallow:

- `/start` is mostly a launcher
- Mini App home infers pending work heuristically
- managers do not yet have an operational digest surface
- reminder precision depends on missing-entry guesses instead of explicit assigned work

This is adequate for v1 access, but not for a bot that should materially improve daily operations.

## Constraints

- Preserve current invite and link flow based on `BotInviteToken`.
- Preserve Mini App sign-in through Telegram `initData`.
- Reuse the existing shared role-based access model.
- Avoid rebuilding the full product UI inside Telegram chat.
- Keep rollout incremental and backward-compatible.

## In-Scope Outcomes

1. Introduce a first-class journal obligation model.
2. Make bot entrypoints obligation-aware for employees and managers.
3. Replace heuristic reminders with target-specific reminders.
4. Add digest and reminder policy controls to reduce spam.
5. Make Mini App home consume obligation data.

## Out of Scope

- Full chat-native data entry for every journal
- Two-way TasksFlow synchronization
- Replacing site notifications or email completely

## Acceptance Criteria

### AC1
The system defines a first-class obligation model for journal work items, including assignee, target journal context, due context, and status.

### AC2
Linked employee `/start` resolves to a role-aware operational home with a next-action CTA.

### AC3
Linked manager `/start` resolves to a role-aware operational home with summary and management CTAs.

### AC4
Telegram reminders point to exact actions or the nearest exact target, not generic fallback pages unless required.

### AC5
Reminder delivery follows dedupe and cooldown rules so duplicate sends from reruns or UI churn are prevented.

### AC6
Mini App home is powered by obligations rather than only by "no entry today" heuristics.

### AC7
Telegram actions are guarded by the same role-access model as web and Mini App surfaces.

### AC8
The design ships incrementally without breaking current invite, bind, sign-in, and open-app flows.

## Technical Direction

Recommended path:

- create `JournalObligation`
- update Mini App home and Telegram reply builders to consume obligations
- add exact deep links for obligation targets
- add manager digests and employee completion confirmations
- add delivery policy logic using existing `TelegramLog`

## Verification Target

Implementation will be considered complete only when every AC above is verified with fresh evidence in this task directory.
