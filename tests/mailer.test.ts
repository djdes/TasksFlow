import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderEmail } from "../server/email-templates";
import { resolveTransport, sendMail } from "../server/mailer";

describe("email-templates", () => {
  it("welcome содержит пароль, логин и magic-ссылку", () => {
    const { subject, html } = renderEmail("welcome", {
      email: "ivan@firma.ru",
      password: "Abc23xyz",
      magicUrl: "https://tasksflow.ru/api/auth/magic/deadbeef",
    });
    expect(subject).toMatch(/Добро пожаловать/i);
    expect(html).toContain("ivan@firma.ru");
    expect(html).toContain("Abc23xyz");
    expect(html).toContain("https://tasksflow.ru/api/auth/magic/deadbeef");
  });

  it("login-link НЕ содержит пароль", () => {
    const { html } = renderEmail("login-link", {
      email: "ivan@firma.ru",
      magicUrl: "https://tasksflow.ru/api/auth/magic/tok",
    });
    expect(html).toContain("ivan@firma.ru");
    expect(html).toContain("/api/auth/magic/tok");
    expect(html).not.toMatch(/Пароль/);
  });

  it("recovery содержит новый пароль", () => {
    const { subject, html } = renderEmail("recovery", {
      email: "ivan@firma.ru",
      password: "NewPass99",
      magicUrl: "https://tasksflow.ru/api/auth/magic/tok",
    });
    expect(subject).toMatch(/Новый пароль/i);
    expect(html).toContain("NewPass99");
  });
});

describe("mailer transport", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.PHP_RELAY_URL;
    delete process.env.PHP_RELAY_TOKEN;
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("resolveTransport=dev без env", () => {
    expect(resolveTransport()).toBe("dev");
  });

  it("resolveTransport=php-relay когда заданы URL+token", () => {
    process.env.PHP_RELAY_URL = "https://tasksflow.ru/send.php";
    process.env.PHP_RELAY_TOKEN = "x".repeat(32);
    expect(resolveTransport()).toBe("php-relay");
  });

  it("sendMail php-relay POST-ит на URL с токеном и телом", async () => {
    process.env.PHP_RELAY_URL = "https://tasksflow.ru/send.php";
    process.env.PHP_RELAY_TOKEN = "secret-token-secret-token-secret";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await sendMail({
      to: "ivan@firma.ru",
      kind: "login-link",
      data: { email: "ivan@firma.ru", magicUrl: "https://tasksflow.ru/api/auth/magic/t" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://tasksflow.ru/send.php");
    expect((opts as any).headers["X-Relay-Token"]).toBe("secret-token-secret-token-secret");
    const sent = JSON.parse((opts as any).body);
    expect(sent.to).toBe("ivan@firma.ru");
    expect(sent.subject).toMatch(/Вход/i);
    expect(sent.html).toContain("/api/auth/magic/t");
  });

  it("sendMail php-relay бросает при не-2xx", async () => {
    process.env.PHP_RELAY_URL = "https://tasksflow.ru/send.php";
    process.env.PHP_RELAY_TOKEN = "secret-token-secret-token-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "bad token" }), { status: 401 }),
    );
    await expect(
      sendMail({
        to: "ivan@firma.ru",
        kind: "login-link",
        data: { email: "ivan@firma.ru", magicUrl: "https://x/t" },
      }),
    ).rejects.toThrow(/401/);
  });
});
