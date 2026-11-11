/**
 * Неизвестный адрес — 404, а не страница входа с кодом 200 («мягкий 404»).
 * Список адресов кабинета на сервере обязан совпадать с маршрутами App.tsx:
 * иначе новая страница кабинета отдавалась бы с кодом 404.
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { CABINET_ROUTES, isCabinetRoute } from "../shared/cabinet-routes";

describe("isCabinetRoute", () => {
  it("знает страницы кабинета, с параметрами и с косой чертой на конце", () => {
    for (const p of ["/", "/login", "/dashboard", "/dashboard/", "/admin/users", "/tasks/15/edit", "/join/abc-DEF_1", "/login/qr/tok", "/demo"]) {
      expect(isCabinetRoute(p), p).toBe(true);
    }
  });

  it("не знает мусорные адреса", () => {
    for (const p of ["/llms.txt", "/wp-login.php", "/nonexistent", "/admin", "/tasks/15", "/tasks/15/edit/extra", "/dashboardx", "/join/", "/.env"]) {
      expect(isCabinetRoute(p), p).toBe(false);
    }
  });

  it("список совпадает с маршрутами App.tsx", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../client/src/App.tsx"), "utf8");
    const inApp = Array.from(app.matchAll(/<Route\s+path="([^"]+)"/g), (m) => m[1]);
    inApp.push("/demo"); // client/src/main.tsx
    expect(inApp.length).toBeGreaterThan(20);
    expect([...CABINET_ROUTES].sort()).toEqual([...new Set(inApp)].sort());
  });
});
