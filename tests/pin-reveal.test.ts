import { describe, it, expect, beforeAll } from "vitest";

// «Посмотреть PIN»: PIN от руководителя хранится зашифрованным и читается обратно.
describe("pin-reveal", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-0123456789";
  });
  it("зашифрованный PIN читается обратно и не лежит открытым", async () => {
    const { sealPin, openPin } = await import("../server/pin-reveal");
    const sealed = sealPin("4826")!;
    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain("4826");
    expect(openPin(sealed)).toBe("4826");
  });
  it("испорченная строка и чужой зашифрованный текст — null, без падения", async () => {
    const { openPin } = await import("../server/pin-reveal");
    const { encryptApiKey } = await import("../server/api-key-crypto");
    expect(openPin("мусор")).toBeNull();
    expect(openPin(encryptApiKey("tfk_не_пин"))).toBeNull();
  });
});
