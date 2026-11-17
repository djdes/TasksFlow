/**
 * Push на телефоне: что показать человеку. Главный случай — iPhone, открытый с
 * иконки, но без Web Push (iOS ниже 16.4): раньше ему говорили «добавьте на
 * экран Домой», хотя он уже открыл с иконки.
 */
import { describe, it, expect } from "vitest";
import { classifyPushSupport } from "../client/src/lib/push";

describe("classifyPushSupport", () => {
  it.each([
    [{ ios: false, standalone: false, webPush: true }, "web"],
    [{ ios: true, standalone: true, webPush: true }, "web"],
    [{ ios: true, standalone: false, webPush: false }, "ios-needs-install"],
    [{ ios: true, standalone: true, webPush: false }, "ios-update"],
    [{ ios: false, standalone: false, webPush: false }, "unsupported"],
  ] as const)("%o → %s", (d, expected) => {
    expect(classifyPushSupport(d)).toBe(expected);
  });
});
