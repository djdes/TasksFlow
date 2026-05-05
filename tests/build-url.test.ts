/**
 * Тесты buildUrl из shared/routes.ts. Это helper для substitution
 * URL params (`:id` → конкретное значение). Используется во всех
 * client mutations: useUpdateTask, useDeleteTask, useCompleteTask,
 * useUncompleteTask и т.д.
 *
 * Если кто-то сломает substitution — все update/delete operations
 * пойдут на URL с literal `:id`, что upstream вернёт 400 «Bad task
 * id». Тесты ловят это.
 */

import { describe, it, expect } from "vitest";
import { buildUrl } from "../shared/routes";

describe("buildUrl — без params", () => {
  it("path без placeholder'ов остаётся неизменным", () => {
    expect(buildUrl("/api/tasks")).toBe("/api/tasks");
  });

  it("undefined params → path как есть", () => {
    expect(buildUrl("/api/tasks/:id")).toBe("/api/tasks/:id");
  });

  it("пустой params object → placeholder остаётся", () => {
    // Семантика: empty params = ничего не подменяется. Если URL
    // содержит `:id`, он останется literal.
    expect(buildUrl("/api/tasks/:id", {})).toBe("/api/tasks/:id");
  });
});

describe("buildUrl — substitution", () => {
  it("одна замена :id → number", () => {
    expect(buildUrl("/api/tasks/:id", { id: 42 })).toBe("/api/tasks/42");
  });

  it("одна замена :id → string", () => {
    expect(buildUrl("/api/tasks/:id", { id: "42" })).toBe("/api/tasks/42");
  });

  it("несколько разных placeholder'ов", () => {
    expect(
      buildUrl("/api/companies/:companyId/users/:userId", {
        companyId: 1,
        userId: 99,
      }),
    ).toBe("/api/companies/1/users/99");
  });
});

describe("buildUrl — частичная замена", () => {
  it("отсутствующий в URL placeholder игнорится", () => {
    expect(buildUrl("/api/tasks/:id", { id: 1, otherKey: "ignored" })).toBe(
      "/api/tasks/1",
    );
  });

  it("placeholder в URL без соответствующего param остаётся literal", () => {
    expect(buildUrl("/api/tasks/:id/photos/:photoId", { id: 5 })).toBe(
      "/api/tasks/5/photos/:photoId",
    );
  });
});

describe("buildUrl — numeric coercion", () => {
  it("0 → '0'", () => {
    expect(buildUrl("/api/tasks/:id", { id: 0 })).toBe("/api/tasks/0");
  });

  it("отрицательное число → '-5'", () => {
    expect(buildUrl("/api/tasks/:id", { id: -5 })).toBe("/api/tasks/-5");
  });
});

describe("buildUrl — реальные api routes из shared/routes.ts", () => {
  it("api.tasks.get.path с id", () => {
    // Imitates real usage from use-tasks.ts: useTask hook.
    expect(buildUrl("/api/tasks/:id", { id: 123 })).toBe("/api/tasks/123");
  });

  it("api.workers.get.path с id", () => {
    expect(buildUrl("/api/workers/:id", { id: 5 })).toBe("/api/workers/5");
  });

  it("api.invitations.revoke.path с id", () => {
    expect(buildUrl("/api/invitations/:id/revoke", { id: 7 })).toBe(
      "/api/invitations/7/revoke",
    );
  });

  it("api.invitations.preview.path с token", () => {
    expect(
      buildUrl("/api/invitations/by-token/:token", {
        token: "abc123XYZ_",
      }),
    ).toBe("/api/invitations/by-token/abc123XYZ_");
  });
});
