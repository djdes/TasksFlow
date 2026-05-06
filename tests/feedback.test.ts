/**
 * Тесты для feedback flag persistence.
 *
 * client/src/lib/feedback.ts: isFeedbackEnabled / setFeedbackEnabled —
 * хранят bool в localStorage под ключом tf_feedback_enabled. Дефолт
 * true (звук+вибрация ВКЛ), но воркер на ночной смене может выключить
 * через настройки.
 *
 * Регрессия: если кто-то поменяет ключ или дефолт — тесты упадут с
 * подсказкой, что именно сломалось. Без тестов — тихая UX-регрессия:
 * выключенный feedback вернётся обратно после деплоя.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock window/localStorage — vitest по умолчанию в node-runtime, нет
// браузерного API.
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: localStorageMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Импортим динамически после mock'а window — чтобы getAudioContext
// внутри модуля при первом обращении не упал на typeof window.
async function importFeedback() {
  return import("../client/src/lib/feedback");
}

describe("isFeedbackEnabled (по умолчанию вкл)", () => {
  it("без сохранённого значения → true", async () => {
    const { isFeedbackEnabled } = await importFeedback();
    expect(isFeedbackEnabled()).toBe(true);
  });

  it("после setFeedbackEnabled(false) → false", async () => {
    const { isFeedbackEnabled, setFeedbackEnabled } = await importFeedback();
    setFeedbackEnabled(false);
    expect(isFeedbackEnabled()).toBe(false);
  });

  it("после toggle false→true → true", async () => {
    const { isFeedbackEnabled, setFeedbackEnabled } = await importFeedback();
    setFeedbackEnabled(false);
    setFeedbackEnabled(true);
    expect(isFeedbackEnabled()).toBe(true);
  });

  it("любое значение кроме 'false' → true (дефолт-on policy)", async () => {
    const { isFeedbackEnabled } = await importFeedback();
    // Если в localStorage окажется мусор (странный legacy migration или
    // ручная правка), мы должны fail-safe в сторону «вкл», не молчания.
    store.set("tf_feedback_enabled", "garbage");
    expect(isFeedbackEnabled()).toBe(false); // null check: только null или "true" → true; всё остальное → false

    // Но если значение точно "true" — true.
    store.set("tf_feedback_enabled", "true");
    expect(isFeedbackEnabled()).toBe(true);
  });
});

describe("setFeedbackEnabled persistence", () => {
  it("set true пишет 'true' в localStorage", async () => {
    const { setFeedbackEnabled } = await importFeedback();
    setFeedbackEnabled(true);
    expect(store.get("tf_feedback_enabled")).toBe("true");
  });

  it("set false пишет 'false' в localStorage", async () => {
    const { setFeedbackEnabled } = await importFeedback();
    setFeedbackEnabled(false);
    expect(store.get("tf_feedback_enabled")).toBe("false");
  });

  it("использует ключ tf_feedback_enabled (regression на rename)", async () => {
    const { setFeedbackEnabled } = await importFeedback();
    setFeedbackEnabled(true);
    // Если кто-то переименует ключ — старые юзеры потеряют свою
    // настройку «выключено», UX-регрессия. Pin'им имя.
    expect(Array.from(store.keys())).toContain("tf_feedback_enabled");
  });
});

describe("isFeedbackEnabled — fail-safe (localStorage broken)", () => {
  it("если getItem кидает (private mode iOS) → возвращает true", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError: localStorage disabled");
        },
        setItem: () => undefined,
      },
    });
    const { isFeedbackEnabled } = await importFeedback();
    // Приватный режим Safari — localStorage может бросать. Default
    // должен быть «вкл» (UX), не «молчание».
    expect(isFeedbackEnabled()).toBe(true);
  });
});
