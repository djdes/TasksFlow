/**
 * Меню кабинета (боковая панель на ПК, шторка на телефоне, Ctrl+K):
 * кому какие разделы, какой пункт подсвечен на подстранице, где меню
 * не показываем, и поиск быстрого перехода.
 */

import { describe, it, expect } from "vitest";
import { activeNavKey, cabinetNav, isCabinetPath, matchesQuery } from "@/lib/cabinet-nav";

const worker = { isAdmin: false, isRoot: false, canManageTasks: false };
const manager = { isAdmin: false, isRoot: false, canManageTasks: true };
const admin = { isAdmin: true, isRoot: false, canManageTasks: true };
const root = { isAdmin: true, isRoot: true, canManageTasks: true };

const keys = (role: typeof worker) => cabinetNav(role).map((item) => item.key);

describe("cabinetNav", () => {
  it("сотруднику — только задачи, история, аккаунт и помощь", () => {
    expect(keys(worker)).toEqual(["tasks", "reports", "account", "help"]);
    expect(cabinetNav(worker).find((i) => i.key === "reports")?.label).toBe("История");
  });

  it("руководителю — ещё очередь проверки, но не разделы компании", () => {
    expect(keys(manager)).toEqual(["tasks", "verification", "reports", "account", "help"]);
  });

  it("админу — разделы компании; root-разделы только root", () => {
    expect(keys(admin)).toEqual(["tasks", "verification", "reports", "users", "invitations", "settings", "billing", "account", "help"]);
    expect(keys(root)).toContain("companies");
    expect(keys(root)).toContain("banners");
    expect(keys(admin)).not.toContain("companies");
  });
});

describe("activeNavKey", () => {
  const items = cabinetNav(root);
  it.each([
    ["/dashboard", "tasks"],
    ["/tasks/12/edit", "tasks"],
    ["/admin/users", "users"],
    ["/workers/2/edit", "users"],
    ["/admin/api-keys", "settings"],
    ["/admin/integrations", "settings"],
    ["/billing/success", "billing"],
    ["/admin/billing", "billing"],
    ["/instructions", "help"],
    ["/admin/companies", "companies"],
  ])("%s → %s", (path, key) => {
    expect(activeNavKey(items, path)).toBe(key);
  });

  it("префикс не путает похожие адреса", () => {
    expect(activeNavKey(items, "/admin/usersx")).toBeNull();
    expect(activeNavKey(items, "/unknown")).toBeNull();
  });
});

describe("isCabinetPath", () => {
  it("вход, регистрация и приглашение — без меню", () => {
    for (const path of ["/", "/login", "/register", "/register/company", "/join", "/join/abc"]) {
      expect(isCabinetPath(path)).toBe(false);
    }
  });
  it("страницы кабинета — с меню", () => {
    for (const path of ["/dashboard", "/admin/users", "/account", "/registered-list", "/joiners"]) {
      expect(isCabinetPath(path)).toBe(true);
    }
  });
});

describe("matchesQuery", () => {
  it("все слова, без регистра и с ё как е", () => {
    expect(matchesQuery("тёмная", "Тёмная тема")).toBe(true);
    expect(matchesQuery("темная тема", "Тёмная тема")).toBe(true);
    expect(matchesQuery("ИВАН повар", "Иван Петров +7999 Повар")).toBe(true);
    expect(matchesQuery("иван кассир", "Иван Петров Повар")).toBe(false);
  });
  it("пустой запрос подходит всем", () => {
    expect(matchesQuery("   ", "что угодно")).toBe(true);
  });
});
