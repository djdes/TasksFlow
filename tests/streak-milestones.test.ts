/**
 * Тесты pickHighestUnseenMilestone — выбор какой ачивки показать
 * воркеру.
 *
 * UX-критическая логика мотивации: показ старого milestone когда
 * воркер уже на новом (показываем «7 дней» когда у него 30) — баг.
 * Показ когда уже видел — спам. Если streak < 7 → не должно ничего
 * показываться (нет ещё первого milestone).
 *
 * Извлечено из StreakAchievement.tsx useEffect, чтобы можно было
 * тестировать без React/localStorage.
 */

import { describe, it, expect } from "vitest";
// Динамический импорт — StreakAchievement содержит framer-motion JSX,
// но мы импортим только pure-helper. Vite/vitest tree-shake'ает
// неиспользуемое, но JSX в module top-level всё равно парсится.
// Workaround — re-export через shim (или просто игнорим: vitest
// transformer Vue/JSX справляется через конфиг).
// Проверка: текущий проект уже импортит компоненты с JSX в других
// тестах? Посмотрим — если падает, перенесём в shared.

async function importMilestone() {
  return import("../client/src/lib/streak-milestones");
}

describe("pickHighestUnseenMilestone — никакого milestone", () => {
  it("streakDays=0 → null", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(0, new Set())).toBeNull();
  });

  it("streakDays=6 → null (7 ещё не достигнут)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(6, new Set())).toBeNull();
  });

  it("streakDays=-1 (защита от мусора) → null", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(-1, new Set())).toBeNull();
  });
});

describe("pickHighestUnseenMilestone — selection (от высокого к низкому)", () => {
  it("streakDays=7 → 7", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(7, new Set())).toBe(7);
  });

  it("streakDays=10 → 7 (14 ещё не достигнут)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(10, new Set())).toBe(7);
  });

  it("streakDays=14 → 14 (НЕ 7)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(14, new Set())).toBe(14);
  });

  it("streakDays=30, seen={} → 30 (наивысший достигнутый)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(30, new Set())).toBe(30);
  });

  it("streakDays=200 → 200", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(200, new Set())).toBe(200);
  });

  it("streakDays=999 → 200 (наивысший milestone в массиве)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(999, new Set())).toBe(200);
  });
});

describe("pickHighestUnseenMilestone — учёт seen set", () => {
  it("streakDays=7, seen={7} → null (всё показано)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(7, new Set([7]))).toBeNull();
  });

  it("streakDays=14, seen={14} → 7 (показываем нижний пропущенный)", async () => {
    // Edge: воркер пропустил неделю-7 но видел 14. Маловероятно (от
    // 7 → 14 это +7 дней непрерывно), но если кто-то ручкой снёс
    // streak-key, потом возобновил → возможно. Логика консистентна:
    // показать первый снизу непоказанный.
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(14, new Set([14]))).toBe(7);
  });

  it("streakDays=30, seen={30} → 14 (нисходящий поиск)", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(30, new Set([30]))).toBe(14);
  });

  it("streakDays=30, seen={30,14} → 7", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(pickHighestUnseenMilestone(30, new Set([30, 14]))).toBe(7);
  });

  it("streakDays=30, seen={7,14,30} → null", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(
      pickHighestUnseenMilestone(30, new Set([7, 14, 30])),
    ).toBeNull();
  });

  it("streakDays=200, seen={200,100,60,30,14,7} → null", async () => {
    const { pickHighestUnseenMilestone } = await importMilestone();
    expect(
      pickHighestUnseenMilestone(200, new Set([200, 100, 60, 30, 14, 7])),
    ).toBeNull();
  });
});

describe("MILESTONES array integrity", () => {
  it("содержит 6 уровней в возрастающем порядке", async () => {
    const { MILESTONES } = await importMilestone();
    expect(MILESTONES).toEqual([7, 14, 30, 60, 100, 200]);
    // Защита от случайного reorder — pickHighestUnseenMilestone
    // полагается на порядок (от конца к началу).
    for (let i = 1; i < MILESTONES.length; i += 1) {
      expect(MILESTONES[i]).toBeGreaterThan(MILESTONES[i - 1]);
    }
  });
});
