/**
 * Тесты toast reducer (client/src/hooks/use-toast.ts).
 *
 * Контекст: shadcn/ui toast — глобальный shared state с reducer'ом
 * (ADD/UPDATE/DISMISS/REMOVE). Используется в TaskViewDialog,
 * TaskFormFiller, DuplicateTaskDialog и многих формах.
 *
 * TOAST_LIMIT=1 — только один toast на экране (старые вытесняются
 * новыми). Это решение: воркеры не успевают читать стопку, а админам
 * хватает последнего сообщения.
 *
 * Защищённое поведение:
 *   • ADD_TOAST вытесняет старый (slice(0, TOAST_LIMIT)).
 *   • UPDATE_TOAST с несуществующим id — no-op (не падает).
 *   • DISMISS_TOAST с id ставит open=false на этом toast'е.
 *   • DISMISS_TOAST без id ставит open=false на ВСЕХ.
 *   • REMOVE_TOAST с undefined id чистит все (полный сброс).
 *   • REMOVE_TOAST с id выкидывает только указанный.
 *
 * NB про DISMISS_TOAST: внутри reducer есть side-effect (addToRemove
 * Queue → setTimeout). Используем vi.useFakeTimers чтобы не плодить
 * реальные таймеры на ~16 мин (TOAST_REMOVE_DELAY=1_000_000 мс).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reducer } from "../client/src/hooks/use-toast";

type ToasterToast = {
  id: string;
  open?: boolean;
  title?: string;
  description?: string;
};

type State = { toasts: ToasterToast[] };

function makeToast(id: string, extra: Partial<ToasterToast> = {}): ToasterToast {
  return { id, open: true, title: `Toast ${id}`, ...extra };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ADD_TOAST", () => {
  it("в пустой state добавляет toast", () => {
    const next = reducer({ toasts: [] } as State, {
      type: "ADD_TOAST",
      toast: makeToast("a"),
    } as any);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("a");
  });

  it("новый toast вытесняет старый (TOAST_LIMIT=1)", () => {
    // Регрессия: если кто-то поднимет TOAST_LIMIT до 5 не подумав —
    // воркеры начнут видеть стек уведомлений, забивая экран на iPhone
    // SE. Pin'им single-toast policy.
    const initial: State = { toasts: [makeToast("old")] };
    const next = reducer(initial, {
      type: "ADD_TOAST",
      toast: makeToast("new"),
    } as any);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("new");
  });

  it("новый toast — первый в массиве (newest first)", () => {
    const initial: State = { toasts: [makeToast("old")] };
    const next = reducer(initial, {
      type: "ADD_TOAST",
      toast: makeToast("new"),
    } as any);
    expect(next.toasts[0].id).toBe("new");
  });

  it("не мутирует исходный state (immutability)", () => {
    const initial: State = { toasts: [makeToast("a")] };
    const before = initial.toasts;
    reducer(initial, {
      type: "ADD_TOAST",
      toast: makeToast("b"),
    } as any);
    expect(initial.toasts).toBe(before);
    expect(initial.toasts).toHaveLength(1);
    expect(initial.toasts[0].id).toBe("a");
  });
});

describe("UPDATE_TOAST", () => {
  it("обновляет поля у существующего toast по id", () => {
    const initial: State = {
      toasts: [makeToast("a", { title: "Original" })],
    };
    const next = reducer(initial, {
      type: "UPDATE_TOAST",
      toast: { id: "a", title: "Updated" },
    } as any);
    expect(next.toasts[0].title).toBe("Updated");
  });

  it("сохраняет non-обновлённые поля (merge)", () => {
    const initial: State = {
      toasts: [makeToast("a", { title: "Hello", description: "World" })],
    };
    const next = reducer(initial, {
      type: "UPDATE_TOAST",
      toast: { id: "a", title: "Bye" },
    } as any);
    expect(next.toasts[0].title).toBe("Bye");
    expect(next.toasts[0].description).toBe("World");
  });

  it("несуществующий id → no-op (не падает, не добавляет)", () => {
    // Регрессия: если caller поведёт себя криво (update после remove),
    // reducer не должен крэшить или добавлять «полу-toast».
    const initial: State = { toasts: [makeToast("a")] };
    const next = reducer(initial, {
      type: "UPDATE_TOAST",
      toast: { id: "ghost", title: "X" },
    } as any);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("a");
    expect(next.toasts[0].title).toBe("Toast a");
  });

  it("пустой state → no-op (нечего обновлять)", () => {
    const next = reducer({ toasts: [] } as State, {
      type: "UPDATE_TOAST",
      toast: { id: "any", title: "X" },
    } as any);
    expect(next.toasts).toEqual([]);
  });
});

describe("DISMISS_TOAST", () => {
  it("с id ставит open=false на этом toast'е", () => {
    const initial: State = {
      toasts: [makeToast("a", { open: true })],
    };
    const next = reducer(initial, {
      type: "DISMISS_TOAST",
      toastId: "a",
    } as any);
    expect(next.toasts[0].open).toBe(false);
  });

  it("без id (undefined) ставит open=false на ВСЕХ (закрыть всё)", () => {
    // С TOAST_LIMIT=1 это редкий сценарий, но семантика API
    // (`dismiss()` без arg = «закрой всё») должна сохраняться.
    const initial: State = {
      toasts: [makeToast("a", { open: true })],
    };
    const next = reducer(initial, {
      type: "DISMISS_TOAST",
    } as any);
    expect(next.toasts[0].open).toBe(false);
  });

  it("несуществующий id → no-op (всё остаётся открытым)", () => {
    const initial: State = {
      toasts: [makeToast("a", { open: true })],
    };
    const next = reducer(initial, {
      type: "DISMISS_TOAST",
      toastId: "ghost",
    } as any);
    expect(next.toasts[0].open).toBe(true);
  });

  it("toast остаётся в массиве после DISMISS (только open=false)", () => {
    // DISMISS не удаляет — REMOVE_TOAST это делает после задержки.
    // Это даёт animation-out время отыграться.
    const initial: State = { toasts: [makeToast("a")] };
    const next = reducer(initial, {
      type: "DISMISS_TOAST",
      toastId: "a",
    } as any);
    expect(next.toasts).toHaveLength(1);
  });
});

describe("REMOVE_TOAST", () => {
  it("с id удаляет конкретный toast", () => {
    const initial: State = {
      toasts: [makeToast("a"), makeToast("b")],
    };
    const next = reducer(initial, {
      type: "REMOVE_TOAST",
      toastId: "a",
    } as any);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("b");
  });

  it("без id (undefined) очищает ВСЁ", () => {
    // Полный reset toast state — например после route change.
    const initial: State = {
      toasts: [makeToast("a"), makeToast("b")],
    };
    const next = reducer(initial, {
      type: "REMOVE_TOAST",
    } as any);
    expect(next.toasts).toEqual([]);
  });

  it("несуществующий id → no-op (всё остаётся)", () => {
    const initial: State = { toasts: [makeToast("a")] };
    const next = reducer(initial, {
      type: "REMOVE_TOAST",
      toastId: "ghost",
    } as any);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe("a");
  });

  it("пустой state без id → пустой state (idempotent)", () => {
    const next = reducer({ toasts: [] } as State, {
      type: "REMOVE_TOAST",
    } as any);
    expect(next.toasts).toEqual([]);
  });
});

describe("reducer integration — типичные сценарии", () => {
  it("add → dismiss → remove (полный жизненный цикл)", () => {
    let state: State = { toasts: [] };
    state = reducer(state, {
      type: "ADD_TOAST",
      toast: makeToast("hello"),
    } as any);
    expect(state.toasts[0].open).toBe(true);

    state = reducer(state, {
      type: "DISMISS_TOAST",
      toastId: "hello",
    } as any);
    expect(state.toasts[0].open).toBe(false);
    expect(state.toasts).toHaveLength(1);

    state = reducer(state, {
      type: "REMOVE_TOAST",
      toastId: "hello",
    } as any);
    expect(state.toasts).toEqual([]);
  });

  it("два ADD подряд: только последний остаётся (TOAST_LIMIT=1)", () => {
    let state: State = { toasts: [] };
    state = reducer(state, {
      type: "ADD_TOAST",
      toast: makeToast("first"),
    } as any);
    state = reducer(state, {
      type: "ADD_TOAST",
      toast: makeToast("second"),
    } as any);
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe("second");
  });
});
