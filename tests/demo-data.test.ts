/**
 * Демо-кабинет: в любое время суток есть что показать в «На проверке» —
 * сверка фото с эталоном одна из главных функций.
 */

import { describe, it, expect } from "vitest";
import { createDemoState } from "../client/src/demo/demo-data";

// 24.10.2026 по Москве (UTC+3): ночь, утро до первых задач, день, поздний вечер.
const at = (hourMsk: number) => Math.floor(Date.UTC(2026, 9, 24, hourMsk - 3, 0) / 1000);

describe("createDemoState — очередь проверки", () => {
  it.each([3, 6, 9, 12, 15, 23])("в %i:00 по Москве хотя бы одна задача ждёт проверки", (hour) => {
    const state = createDemoState(at(hour));
    const queue = state.tasks.filter((t) => t.verificationStatus === "submitted");
    expect(queue.length).toBeGreaterThan(0);
    for (const task of queue) {
      expect(task.isCompleted).toBe(false);
      expect(task.verifierWorkerId).toBe(1);
      expect(task.photoUrls?.length).toBeGreaterThan(0);
    }
  });
});
