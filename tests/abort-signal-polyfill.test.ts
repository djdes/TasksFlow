import { describe, it, expect, vi } from "vitest";
import { installAbortSignalPolyfills } from "../client/src/lib/polyfills";

// Safari до 16 (старые iPhone) — без AbortSignal.timeout и any: запрос сессии
// падал TypeError до отправки, кабинет показывал «Не удалось связаться».
describe("заплатки AbortSignal для старых браузеров", () => {
  it("timeout срабатывает через заданное время с причиной TimeoutError", () => {
    vi.useFakeTimers();
    const statics: { timeout?: (ms: number) => AbortSignal; any?: (s: AbortSignal[]) => AbortSignal } = {};
    installAbortSignalPolyfills(statics);
    const signal = statics.timeout!(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).name).toBe("TimeoutError");
    vi.useRealTimers();
  });

  it("any отменяется вместе с любым из сигналов", () => {
    const statics: { timeout?: (ms: number) => AbortSignal; any?: (s: AbortSignal[]) => AbortSignal } = {};
    installAbortSignalPolyfills(statics);
    const a = new AbortController();
    const b = new AbortController();
    const merged = statics.any!([a.signal, b.signal]);
    expect(merged.aborted).toBe(false);
    b.abort("стоп");
    expect(merged.aborted).toBe(true);
    expect(merged.reason).toBe("стоп");
    const already = statics.any!([AbortSignal.abort("уже")]);
    expect(already.aborted).toBe(true);
  });

  it("родные реализации не подменяет", () => {
    const own = () => new AbortController().signal;
    const statics = { timeout: own, any: own };
    installAbortSignalPolyfills(statics);
    expect(statics.timeout).toBe(own);
    expect(statics.any).toBe(own);
  });
});
