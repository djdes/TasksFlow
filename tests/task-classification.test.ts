/**
 * Тесты isJournalTask — определение «это journal-task или нет».
 *
 * UX-критическая логика: на клик journal-task открывает TaskFormFiller
 * (форма журнала), обычная — TaskViewDialog. Если классификатор
 * случайно вернёт false для journal'а, воркер увидит «не ту» форму
 * и не сможет завершить задачу.
 */

import { describe, it, expect } from "vitest";
import {
  isJournalTask,
  isVerifierTask,
} from "../client/src/lib/task-classification";

describe("isJournalTask — journalLink приоритетный", () => {
  it("journalLink set → true (даже без category)", () => {
    expect(
      isJournalTask({ journalLink: '{"kind":"wesetup-cleaning"}' }),
    ).toBe(true);
  });

  it("journalLink set + произвольный category → true", () => {
    expect(
      isJournalTask({
        journalLink: '{"kind":"x"}',
        category: "Уборка",
      }),
    ).toBe(true);
  });
});

describe("isJournalTask — category fallback («WeSetup · » префикс)", () => {
  it("category=«WeSetup · Уборка» (legacy без journalLink) → true", () => {
    expect(isJournalTask({ category: "WeSetup · Уборка" })).toBe(true);
  });

  it("category начинается с «WeSetup · » с любым суффиксом → true", () => {
    expect(isJournalTask({ category: "WeSetup · Температура" })).toBe(true);
    expect(isJournalTask({ category: "WeSetup · " })).toBe(true);
  });

  it("category=«WeSetup» (без « · ») → false", () => {
    // Префикс должен быть точно «WeSetup · » с пробелом и точкой —
    // защита от случайного match'а со старыми категориями.
    expect(isJournalTask({ category: "WeSetup" })).toBe(false);
  });

  it("category=«WeSetup-Уборка» (без пробела) → false", () => {
    expect(isJournalTask({ category: "WeSetup-Уборка" })).toBe(false);
  });
});

describe("isJournalTask — non-journal", () => {
  it("без journalLink и без category → false", () => {
    expect(isJournalTask({})).toBe(false);
  });

  it("обычная category → false", () => {
    expect(isJournalTask({ category: "Уборка" })).toBe(false);
  });

  it("journalLink=null + category=null → false", () => {
    expect(isJournalTask({ journalLink: null, category: null })).toBe(false);
  });

  it("journalLink='' (пустая строка) + non-WeSetup category → false", () => {
    expect(
      isJournalTask({ journalLink: "", category: "Кухня" }),
    ).toBe(false);
  });
});

describe("isJournalTask — edge cases", () => {
  it("category строго чувствителен к регистру («wesetup · ...» → false)", () => {
    expect(isJournalTask({ category: "wesetup · Уборка" })).toBe(false);
  });

  it("category с предшествующим пробелом не считается", () => {
    expect(isJournalTask({ category: " WeSetup · Уборка" })).toBe(false);
  });
});

describe("isVerifierTask — taskScope='verifier' приоритет", () => {
  it("journalLink=null → false", () => {
    expect(isVerifierTask({ journalLink: null })).toBe(false);
  });

  it("journalLink=undefined → false", () => {
    expect(isVerifierTask({})).toBe(false);
  });

  it("malformed journalLink → false (defensive)", () => {
    expect(isVerifierTask({ journalLink: "not json" })).toBe(false);
  });

  it("taskScope='verifier' → true", () => {
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({
          taskScope: "verifier",
          kind: "wesetup-cleaning",
        }),
      }),
    ).toBe(true);
  });

  it("taskScope='shared' (не verifier) → false (если kind тоже не verifier-)", () => {
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({
          taskScope: "shared",
          kind: "wesetup-cleaning",
        }),
      }),
    ).toBe(false);
  });
});

describe("isVerifierTask — kind prefix 'wesetup-verifier'", () => {
  it("kind=wesetup-verifier_health → true (без taskScope)", () => {
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({
          kind: "wesetup-verifier_health",
          documentId: "d",
          rowKey: "r",
        }),
      }),
    ).toBe(true);
  });

  it("kind=wesetup-cleaning → false (не verifier-)", () => {
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({
          kind: "wesetup-cleaning",
        }),
      }),
    ).toBe(false);
  });

  it("kind не строка → false (typeof guard)", () => {
    // Защита от corrupted JSON.
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({ kind: 42 }),
      }),
    ).toBe(false);
  });

  it("kind отсутствует → false", () => {
    expect(
      isVerifierTask({
        journalLink: JSON.stringify({ documentId: "d" }),
      }),
    ).toBe(false);
  });
});
