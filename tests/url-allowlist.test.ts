/**
 * SSRF allowlist regression — защита от атаки на internal services
 * через admin-вводимые URL'ы (wesetupBaseUrl и т.п.).
 *
 * Контекст: см. server/url-allowlist.ts. История фиксов:
 *   • Изначально проверка `hostname === "::1"` не срабатывала, потому что
 *     WHATWG URL spec возвращает IPv6 hostname со square brackets:
 *     new URL("http://[::1]/").hostname === "[::1]". Атакующий мог
 *     обойти банальной заменой localhost → [::1].
 *   • IPv6 unique-local (fc00::/7), link-local (fe80::/10) не были
 *     покрыты вовсе.
 *   • IPv4-mapped IPv6 (::ffff:127.0.0.1) обходила loopback-проверку.
 *   • 0.0.0.0 не блокировался (на Linux часто routes на localhost).
 *   • 127.x.x.x — только точное 127.0.0.1 блокировалось.
 *
 * Если эти тесты упадут после изменения isPublicHttpsUrl — кто-то снёс
 * защиту, и admin может SSRF-нуть internal сервис через WeSetup form.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { isPublicHttpsUrl } from "../server/url-allowlist";

beforeEach(() => {
  // Явно отключаем dev-режим, иначе все «private» хосты будут пропускаться.
  delete process.env.LOCAL_INTEGRATIONS_ALLOWED;
});

describe("isPublicHttpsUrl — protocol", () => {
  it("принимает https://example.com", () => {
    expect(isPublicHttpsUrl("https://example.com")).toBe(true);
  });
  it("принимает http://example.com (для совместимости)", () => {
    expect(isPublicHttpsUrl("http://example.com")).toBe(true);
  });
  it("отклоняет ftp://example.com", () => {
    expect(isPublicHttpsUrl("ftp://example.com")).toBe(false);
  });
  it("отклоняет file:///etc/passwd", () => {
    expect(isPublicHttpsUrl("file:///etc/passwd")).toBe(false);
  });
  it("отклоняет невалидный URL", () => {
    expect(isPublicHttpsUrl("not a url")).toBe(false);
  });
  it("отклоняет пустую строку", () => {
    expect(isPublicHttpsUrl("")).toBe(false);
  });
});

describe("isPublicHttpsUrl — IPv4 loopback и private", () => {
  it("отклоняет http://localhost", () => {
    expect(isPublicHttpsUrl("http://localhost")).toBe(false);
  });
  it("отклоняет http://127.0.0.1", () => {
    expect(isPublicHttpsUrl("http://127.0.0.1")).toBe(false);
  });
  it("отклоняет 127.0.0.2 (весь loopback /8)", () => {
    expect(isPublicHttpsUrl("http://127.0.0.2")).toBe(false);
  });
  it("отклоняет 127.255.255.255", () => {
    expect(isPublicHttpsUrl("http://127.255.255.255")).toBe(false);
  });
  it("отклоняет 10.0.0.1 (RFC1918)", () => {
    expect(isPublicHttpsUrl("http://10.0.0.1")).toBe(false);
  });
  it("отклоняет 192.168.1.1 (RFC1918)", () => {
    expect(isPublicHttpsUrl("http://192.168.1.1")).toBe(false);
  });
  it("отклоняет 172.16.0.1 (RFC1918 нижняя граница)", () => {
    expect(isPublicHttpsUrl("http://172.16.0.1")).toBe(false);
  });
  it("отклоняет 172.31.255.255 (RFC1918 верхняя граница)", () => {
    expect(isPublicHttpsUrl("http://172.31.255.255")).toBe(false);
  });
  it("принимает 172.32.0.1 (за пределами RFC1918)", () => {
    expect(isPublicHttpsUrl("http://172.32.0.1")).toBe(true);
  });
  it("отклоняет 169.254.169.254 (AWS metadata)", () => {
    expect(isPublicHttpsUrl("http://169.254.169.254")).toBe(false);
  });
  it("отклоняет 0.0.0.0", () => {
    expect(isPublicHttpsUrl("http://0.0.0.0")).toBe(false);
  });
});

describe("isPublicHttpsUrl — IPv6 (тик 14 фикс)", () => {
  it("отклоняет [::1] (loopback) — раньше обходилось из-за square brackets в hostname", () => {
    expect(isPublicHttpsUrl("http://[::1]")).toBe(false);
  });
  it("отклоняет [::] (any/zero address)", () => {
    expect(isPublicHttpsUrl("http://[::]")).toBe(false);
  });
  it("отклоняет [::ffff:127.0.0.1] (IPv4-mapped loopback)", () => {
    expect(isPublicHttpsUrl("http://[::ffff:127.0.0.1]")).toBe(false);
  });
  it("отклоняет [::ffff:10.0.0.1] (IPv4-mapped private)", () => {
    expect(isPublicHttpsUrl("http://[::ffff:10.0.0.1]")).toBe(false);
  });
  it("отклоняет [fc00::1] (unique-local низ диапазона)", () => {
    expect(isPublicHttpsUrl("http://[fc00::1]")).toBe(false);
  });
  it("отклоняет [fdff::1] (unique-local верх диапазона)", () => {
    expect(isPublicHttpsUrl("http://[fdff::1]")).toBe(false);
  });
  it("отклоняет [fe80::1] (link-local низ)", () => {
    expect(isPublicHttpsUrl("http://[fe80::1]")).toBe(false);
  });
  it("отклоняет [febf::1] (link-local верх)", () => {
    expect(isPublicHttpsUrl("http://[febf::1]")).toBe(false);
  });
  it("принимает [2001:db8::1] (документационный, public-routable формально)", () => {
    expect(isPublicHttpsUrl("http://[2001:db8::1]")).toBe(true);
  });
});

describe("isPublicHttpsUrl — single-label hostnames", () => {
  it("отклоняет http://myredis (single-label, потенциальный internal DNS)", () => {
    expect(isPublicHttpsUrl("http://myredis")).toBe(false);
  });
  it("принимает http://api.example.com", () => {
    expect(isPublicHttpsUrl("http://api.example.com")).toBe(true);
  });
});

describe("isPublicHttpsUrl — LOCAL_INTEGRATIONS_ALLOWED escape hatch", () => {
  it("когда задано — пропускает localhost (для dev)", () => {
    process.env.LOCAL_INTEGRATIONS_ALLOWED = "1";
    expect(isPublicHttpsUrl("http://localhost:3000")).toBe(true);
    expect(isPublicHttpsUrl("http://[::1]:3000")).toBe(true);
    delete process.env.LOCAL_INTEGRATIONS_ALLOWED;
  });
});
