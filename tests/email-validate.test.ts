import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  isEmailFormat,
  suggestDomainFix,
  checkMx,
  validateEmailForAuth,
} from "../server/email-validate";

describe("email-validate", () => {
  it("normalizeEmail: trim + lowercase", () => {
    expect(normalizeEmail("  Ivan@GMAIL.com ")).toBe("ivan@gmail.com");
  });

  it("isEmailFormat", () => {
    expect(isEmailFormat("a@b.cc")).toBe(true);
    expect(isEmailFormat("a@b")).toBe(false);
    expect(isEmailFormat("a@b.c")).toBe(false);
    expect(isEmailFormat("no-at.com")).toBe(false);
    expect(isEmailFormat("a b@c.com")).toBe(false);
  });

  it("suggestDomainFix ловит частые опечатки", () => {
    expect(suggestDomainFix("x@gmail.ru")).toBe("x@gmail.com");
    expect(suggestDomainFix("x@gmal.com")).toBe("x@gmail.com");
    expect(suggestDomainFix("x@yandex.com")).toBe("x@yandex.ru");
    expect(suggestDomainFix("x@mai.ru")).toBe("x@mail.ru");
  });

  it("suggestDomainFix ловит Левенштейн-1", () => {
    expect(suggestDomainFix("x@gmaik.com")).toBe("x@gmail.com"); // l→k, distance 1
    expect(suggestDomainFix("x@yandex.ri")).toBe("x@yandex.ru"); // u→i, distance 1
  });

  it("suggestDomainFix null для корректных доменов", () => {
    expect(suggestDomainFix("x@gmail.com")).toBeNull();
    expect(suggestDomainFix("x@yandex.ru")).toBeNull();
    expect(suggestDomainFix("x@some-corp.io")).toBeNull();
  });

  it("checkMx true когда есть записи, false когда нет (инъекция resolver)", async () => {
    const okResolver = async () => [{ exchange: "mx.test", priority: 10 }];
    const emptyResolver = async () => [];
    const throwResolver = async () => {
      throw new Error("ENOTFOUND");
    };
    expect(await checkMx("gmail.com", okResolver)).toBe(true);
    expect(await checkMx("nope-empty-domain.test", emptyResolver)).toBe(false);
    expect(await checkMx("nope-throw-domain.test", throwResolver)).toBe(false);
  });

  it("validateEmailForAuth: формат → ошибка", async () => {
    const r = await validateEmailForAuth("bad");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/корректный/i);
  });

  it("validateEmailForAuth: опечатка → suggestion без MX-запроса", async () => {
    const r = await validateEmailForAuth("user@gmail.ru", async () => {
      throw new Error("MX не должен вызываться при опечатке");
    });
    expect(r.ok).toBe(false);
    expect(r.suggestion).toBe("user@gmail.com");
  });

  it("validateEmailForAuth: нет MX → ошибка", async () => {
    const r = await validateEmailForAuth("user@no-mx-corp.io", async () => []);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/домен/i);
  });

  it("validateEmailForAuth: всё ок", async () => {
    const r = await validateEmailForAuth("USER@good-corp.io", async () => [
      { exchange: "mx.good-corp.io", priority: 10 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("user@good-corp.io");
  });
});
