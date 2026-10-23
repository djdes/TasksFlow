/**
 * subscribeMediaQuery: старый Safari (< 14) знает только addListener.
 * Регрессия: подписка через addEventListener бросала TypeError, и
 * MotionProvider ронял весь кабинет в ErrorBoundary.
 */
import { describe, expect, it, vi } from "vitest";
import { subscribeMediaQuery } from "../client/src/hooks/use-media-query";

describe("subscribeMediaQuery", () => {
  it("современный браузер — addEventListener/removeEventListener", () => {
    const media = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    const notify = () => {};
    const unsubscribe = subscribeMediaQuery(media, notify);
    expect(media.addEventListener).toHaveBeenCalledWith("change", notify);
    unsubscribe();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", notify);
  });

  it("Safari < 14 — запасной addListener/removeListener, без исключения", () => {
    const media = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList;
    const notify = () => {};
    const unsubscribe = subscribeMediaQuery(media, notify);
    expect((media as any).addListener).toHaveBeenCalledWith(notify);
    unsubscribe();
    expect((media as any).removeListener).toHaveBeenCalledWith(notify);
  });

  it("совсем без подписки — не падает и возвращает пустую отписку", () => {
    const media = {} as MediaQueryList;
    expect(() => subscribeMediaQuery(media, () => {})()).not.toThrow();
  });
});
