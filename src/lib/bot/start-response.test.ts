import assert from "node:assert/strict";
import test from "node:test";

import {
  TELEGRAM_COMMANDS,
  buildTelegramLinkedStartReply,
  buildTelegramUnlinkedStartReply,
} from "@/lib/bot/start-response";

test("buildTelegramLinkedStartReply returns CTA for staff", () => {
  const reply = buildTelegramLinkedStartReply(
    {
      name: "Иван",
      role: "cook",
      isRoot: false,
    },
    "https://example.com/mini"
  );

  assert.equal(reply.text, "Готово, Иван! Откройте Wesetup кнопкой ниже.");
  assert.equal(reply.buttonLabel, "Открыть журналы");
  assert.equal(reply.buttonUrl, "https://example.com/mini");
});

test("buildTelegramLinkedStartReply returns CTA for management", () => {
  const reply = buildTelegramLinkedStartReply(
    {
      name: "Ольга",
      role: "manager",
      isRoot: false,
    },
    "https://example.com/mini"
  );

  assert.equal(reply.buttonLabel, "Открыть кабинет");
});

test("buildTelegramLinkedStartReply falls back when mini app is unavailable", () => {
  const reply = buildTelegramLinkedStartReply(
    {
      name: "Анна",
      role: "waiter",
      isRoot: false,
    },
    null
  );

  assert.equal(
    reply.text,
    "Готово, Анна. Мини-приложение пока не настроено, свяжитесь с руководителем."
  );
  assert.equal(reply.buttonLabel, undefined);
  assert.equal(reply.buttonUrl, undefined);
});

test("buildTelegramUnlinkedStartReply keeps start guidance short", () => {
  const reply = buildTelegramUnlinkedStartReply();

  assert.equal(
    reply.text,
    "Аккаунт пока не привязан. Откройте персональную ссылку из приглашения руководителя."
  );
});

test("TELEGRAM_COMMANDS registers a single start entry", () => {
  assert.deepEqual(TELEGRAM_COMMANDS, [
    {
      command: "start",
      description: "Открыть Wesetup",
    },
  ]);
});
