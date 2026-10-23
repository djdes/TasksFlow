/**
 * Клиентские отчёты об ошибках: дедупликация, лимит на вкладку, шум и
 * вычистка ПД (client/src/lib/error-reporting.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { buildReport, createReporter, maskPath, type ErrorReport } from "../client/src/lib/error-reporting";

function report(message: string, kind: ErrorReport["kind"] = "error"): ErrorReport {
  return buildReport(new Error(message), kind, { path: "/dashboard" });
}

describe("createReporter", () => {
  it("одинаковая ошибка уходит один раз", () => {
    const send = vi.fn().mockReturnValue(true);
    const reportError = createReporter({ enabled: true, send });
    expect(reportError(report("boom"))).toBe(true);
    expect(reportError(report("boom"))).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("разный kind — разные отчёты", () => {
    const send = vi.fn().mockReturnValue(true);
    const reportError = createReporter({ enabled: true, send });
    reportError(report("boom", "error"));
    reportError(report("boom", "unhandledrejection"));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("не больше 10 отчётов на вкладку", () => {
    const send = vi.fn().mockReturnValue(true);
    const reportError = createReporter({ enabled: true, send });
    for (let i = 0; i < 15; i += 1) reportError(report(`ошибка ${i}`));
    expect(send).toHaveBeenCalledTimes(10);
  });

  it("неотправленный отчёт не тратит лимит и может уйти позже", () => {
    const send = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const reportError = createReporter({ enabled: true, send, maxReports: 1 });
    expect(reportError(report("a"))).toBe(false);
    expect(reportError(report("b"))).toBe(true);
  });

  it("выключен вне production — ничего не шлёт", () => {
    const send = vi.fn().mockReturnValue(true);
    const reportError = createReporter({ enabled: false, send });
    reportError(report("boom"));
    expect(send).not.toHaveBeenCalled();
  });

  it("игнорирует шум: Script error и расширения браузера", () => {
    const send = vi.fn().mockReturnValue(true);
    const reportError = createReporter({ enabled: true, send });
    reportError(buildReport("Script error.", "error"));
    reportError(buildReport({ name: "Error" }, "error", { extraStack: "at x (chrome-extension://abc/content.js:1:1)" }));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("buildReport", () => {
  it("вычищает email, телефон и токены, маскирует путь", () => {
    const r = buildReport(new Error("для anna@example.com +79991234567"), "react", {
      path: "/join/0123456789abcdef0123456789abcdef?phone=1",
      extraStack: "in Dashboard",
    });
    expect(r.message).toBe("Error: для [email] [phone]");
    expect(r.path).toBe("/join/:token");
    expect(r.stack).toContain("in Dashboard");
  });

  it("принимает не-Error значения из unhandledrejection", () => {
    expect(buildReport("строка", "unhandledrejection").message).toBe("строка");
    expect(buildReport({ code: 42 }, "unhandledrejection").message).toBe('{"code":42}');
  });
});

describe("maskPath", () => {
  it("числовые id и обычные сегменты не трогает", () => {
    expect(maskPath("/tasks/123/edit")).toBe("/tasks/123/edit");
  });
});
