# Telegram `/start` Unification

## Goal

Remove the obsolete `/start` reply from the Telegram bot and make `/start` behave like the current successful account-link flow: one clean CTA that opens Wesetup.

## Acceptance Criteria

AC1. Plain `/start` for an already linked Telegram account does not send the legacy "bot works only via invite link" text. It sends the current CTA-style message with the Mini App button.

AC2. Successful `/start inv_<token>` account binding uses the same CTA response builder as plain `/start`, so the bot has one canonical post-link message.

AC3. Plain `/start` for an unlinked Telegram account returns only short guidance to use the персональная ссылка and does not resurrect the removed legacy copy.

AC4. The bot registers a Telegram command menu entry for `/start` with a human-readable description so the menu action maps to the unified start behavior.

## Design

- Extract the success CTA into a small reusable helper that builds the text and button label from the linked user role/root access.
- Rework the `/start` handler:
  - with `inv_<token>`: bind account, then call the shared CTA reply;
  - without payload: look up the Telegram chat in `User.telegramChatId`; if linked, call the shared CTA reply; if not linked, send a short neutral guidance message.
- Register bot commands once during inbound bot initialization.
- Add focused unit tests for the extracted start-response helper and command metadata.

## Verification Plan

- Run a dedicated node test file for the new start helper.
- Run targeted lint on the touched bot files.
- Run `npx tsc --noEmit --pretty false`.
