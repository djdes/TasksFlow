/**
 * PUT /api/users/:id по API часто шлёт только телефон и роль. Имя и
 * должность, которых нет в запросе, не должны стираться.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const patches: Record<string, unknown>[] = [];
const chain = (rows: unknown[]) => {
  const c: any = {
    set: (patch: Record<string, unknown>) => {
      patches.push(patch);
      return c;
    },
    from: () => c,
    where: () => c,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return c;
};

vi.mock("../server/db", () => ({
  db: {
    update: () => chain([]),
    select: () => chain([{ id: 7, phone: "+79990000007", name: "Михаил", position: "Управляющий" }]),
  },
}));

beforeEach(() => {
  patches.length = 0;
});

describe("storage.updateUser", () => {
  it("без имени и должности — меняет только телефон", async () => {
    const { storage } = await import("../server/storage");
    await storage.updateUser(7, { phone: "+79990000007" });
    expect(patches).toEqual([{ phone: "+79990000007" }]);
  });

  it("имя и должность из запроса пишутся, null — очищает", async () => {
    const { storage } = await import("../server/storage");
    await storage.updateUser(7, { phone: "+79990000007", name: "Михаил П.", position: null });
    expect(patches).toEqual([{ phone: "+79990000007", name: "Михаил П.", position: null }]);
  });
});
