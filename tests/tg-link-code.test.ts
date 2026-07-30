import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@shared/schema";

/**
 * Привязка через бота одноразовым кодом — основной путь.
 *
 * Login Widget требует /setdomain в BotFather, доступного telegram.org в
 * браузере и неблокированного попапа; при любом сбое кнопка оказывалась
 * мёртвой. Код-ссылка не требует ничего, поэтому её надёжность важнее.
 */

const storage = {
  setTelegramLinkCode: vi.fn(),
  findUserByTelegramLinkCode: vi.fn(),
  findUserByTelegramUserId: vi.fn(),
  saveTelegramLink: vi.fn(),
  markTelegramStarted: vi.fn(),
  getUserById: vi.fn(),
};

vi.mock("../server/storage", () => ({
  storage,
  DatabaseStorage: { parseManagedWorkerIds: () => null },
}));

const OWNER = { id: 183, name: "bugdenes", companyId: 18 } as User;

beforeEach(() => {
  storage.findUserByTelegramLinkCode.mockResolvedValue(OWNER);
  storage.findUserByTelegramUserId.mockResolvedValue(undefined);
  storage.getUserById.mockResolvedValue(OWNER);
});
afterEach(() => vi.clearAllMocks());

describe("generateLinkCode", () => {
  it("код безопасен для ссылки t.me/bot?start=… и не короткий", async () => {
    const { generateLinkCode } = await import("../server/telegram/link");
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const c = generateLinkCode();
      expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(c.length).toBeGreaterThanOrEqual(16);
      codes.add(c);
    }
    // Коллизий быть не должно — иначе чужая ссылка привяжет твой аккаунт.
    expect(codes.size).toBe(50);
  });
});

describe("issueTelegramLinkCode", () => {
  it("сохраняет код со сроком в будущем", async () => {
    const { issueTelegramLinkCode } = await import("../server/telegram/link");
    const now = Math.floor(Date.now() / 1000);
    const { code, expiresAt } = await issueTelegramLinkCode(183);

    expect(storage.setTelegramLinkCode).toHaveBeenCalledWith(183, code, expiresAt);
    expect(expiresAt).toBeGreaterThan(now);
    // 10 минут: успеть открыть бота, но не держать код валидным долго.
    expect(expiresAt - now).toBeLessThanOrEqual(600);
  });
});

describe("linkTelegramByCode", () => {
  const args = {
    code: "abc123abc123",
    telegramUserId: 2133993638,
    telegramUsername: "YaroslavEmpty",
    telegramFirstName: "Ярослав",
    chatId: 2133993638,
  };

  it("валидный код → привязка сохранена", async () => {
    const { linkTelegramByCode } = await import("../server/telegram/link");
    const r = await linkTelegramByCode(args);

    expect(r.ok).toBe(true);
    expect(storage.saveTelegramLink).toHaveBeenCalledWith(
      183,
      expect.objectContaining({ telegramUserId: 2133993638 }),
    );
  });

  it("код гасится сразу — пересланная ссылка второй раз не сработает", async () => {
    const { linkTelegramByCode } = await import("../server/telegram/link");
    await linkTelegramByCode(args);
    expect(storage.setTelegramLinkCode).toHaveBeenCalledWith(183, "", 0);
  });

  it("chat_id запоминается — иначе бот не сможет написать первым", async () => {
    const { linkTelegramByCode } = await import("../server/telegram/link");
    await linkTelegramByCode(args);
    expect(storage.markTelegramStarted).toHaveBeenCalledWith(183, args.chatId);
  });

  it("неизвестный или протухший код → отказ, ничего не пишем", async () => {
    storage.findUserByTelegramLinkCode.mockResolvedValue(undefined);
    const { linkTelegramByCode } = await import("../server/telegram/link");
    const r = await linkTelegramByCode(args);

    expect(r).toEqual({ ok: false, reason: "unknown_code" });
    expect(storage.saveTelegramLink).not.toHaveBeenCalled();
  });

  it("этот Telegram уже у другого сотрудника → отказ", async () => {
    storage.findUserByTelegramUserId.mockResolvedValue({ ...OWNER, id: 999 });
    const { linkTelegramByCode } = await import("../server/telegram/link");
    const r = await linkTelegramByCode(args);

    expect(r).toEqual({ ok: false, reason: "already_linked_other" });
    expect(storage.saveTelegramLink).not.toHaveBeenCalled();
  });

  it("повторная привязка того же Telegram к себе же проходит", async () => {
    storage.findUserByTelegramUserId.mockResolvedValue(OWNER);
    const { linkTelegramByCode } = await import("../server/telegram/link");
    expect((await linkTelegramByCode(args)).ok).toBe(true);
  });
});

describe("разбор /start с кодом", () => {
  // Тот же шаблон, что в handle-update: важно не принять за код мусор и
  // не сломаться на /start@botname из групп.
  const re = /^\/start(?:@\S+)?\s+([A-Za-z0-9_-]{6,64})$/;

  it("код извлекается", () => {
    expect(re.exec("/start abc123abc123")?.[1]).toBe("abc123abc123");
  });

  it("работает с суффиксом бота", () => {
    expect(re.exec("/start@thetasksflowbot abc123abc123")?.[1]).toBe("abc123abc123");
  });

  it("обычный /start кодом не считается", () => {
    expect(re.exec("/start")).toBeNull();
  });

  it("слишком короткий или с недопустимыми символами — не код", () => {
    expect(re.exec("/start abc")).toBeNull();
    expect(re.exec("/start abc$%^123456")).toBeNull();
    expect(re.exec("/start код-с-кириллицей")).toBeNull();
  });

  it("лишние слова после кода не принимаются", () => {
    expect(re.exec("/start abc123abc123 и ещё текст")).toBeNull();
  });
});
