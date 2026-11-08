/**
 * Умный UX задач, вторая волна (08.11.2026): «Как в прошлый раз», срок из
 * названия, черновик формы, «Новая», «Дальше», «Слушать список».
 */
import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_SEC,
  draftHasContent,
  dueFromTitle,
  findLastTaskByTitle,
  listSpeechText,
  newTaskIds,
  nextTaskAfter,
  parseDraft,
  pastTaskPreset,
} from "../client/src/lib/task-smart";

describe("«Как в прошлый раз»", () => {
  const tasks = [
    { id: 1, title: "Протереть витрину", createdAt: 10, description: "старое" },
    { id: 2, title: "протереть  витрину", createdAt: 30, description: "свежее" },
    { id: 3, title: "Ёлку убрать", createdAt: 5 },
  ];

  it("последняя задача с тем же названием (регистр, ё, пробелы — не в счёт)", () => {
    expect(findLastTaskByTitle(tasks, " Протереть витрину ")?.id).toBe(2);
    expect(findLastTaskByTitle(tasks, "елку убрать")?.id).toBe(3);
    expect(findLastTaskByTitle(tasks, "Протереть")).toBeNull();
    expect(findLastTaskByTitle(tasks, "Пр")).toBeNull();
  });

  it("регулярная — с днями, числом и временем; со сроком — разовая без расписания", () => {
    const rec = pastTaskPreset({
      id: 1, title: "Журнал", isRecurring: true, dueDate: null, weekDays: [1, 3], monthDay: 15, remindAt: "09:30",
      price: 100, category: "Кухня", requiresPhoto: true, workerId: 7, description: "d", checklist: [],
    });
    expect(rec).toMatchObject({ kind: "recurring", weekDays: [1, 3], monthDay: "15", remindAt: "09:30", price: "100", category: "Кухня", requiresPhoto: true, workerId: 7, isRecurring: true });
    const once = pastTaskPreset({ id: 2, title: "Кран", isRecurring: false, dueDate: 123, weekDays: [1], monthDay: 3 });
    expect(once).toMatchObject({ kind: "once", weekDays: null, monthDay: undefined, isRecurring: false, price: "0", description: "" });
  });
});

describe("срок из названия", () => {
  // Суббота, 7 ноября 2026.
  const now = new Date(2026, 10, 7, 12, 0);

  it("сегодня / завтра / послезавтра", () => {
    expect(dueFromTitle("Починить кран сегодня", now)).toBe("2026-11-07");
    expect(dueFromTitle("Завтра заменить лампу", now)).toBe("2026-11-08");
    expect(dueFromTitle("послезавтра — инвентаризация", now)).toBe("2026-11-09");
  });

  it("в/к/до + день недели — ближайший такой день, сегодняшний — сегодня", () => {
    expect(dueFromTitle("Отчёт к пятнице", now)).toBe("2026-11-13");
    expect(dueFromTitle("Вывезти мусор в понедельник", now)).toBe("2026-11-09");
    expect(dueFromTitle("Сдать кассу до среды", now)).toBe("2026-11-11");
    expect(dueFromTitle("Помыть окна в субботу", now)).toBe("2026-11-07");
    expect(dueFromTitle("Планёрка во вторник", now)).toBe("2026-11-10");
  });

  it("слова внутри других слов и просто «пятница» без предлога — не срок", () => {
    expect(dueFromTitle("Позавтракать", now)).toBeNull();
    expect(dueFromTitle("Средство для пола", now)).toBeNull();
    expect(dueFromTitle("Пятничный отчёт", now)).toBeNull();
    expect(dueFromTitle("Помыть пол", now)).toBeNull();
  });
});

describe("черновик формы", () => {
  const base = { kind: "once", values: { title: "Помыть пол" }, workerIds: [2, "x"], checklist: [], questions: [] };

  it("свежий — восстанавливается, мусор в списках отбрасывается", () => {
    const d = parseDraft(JSON.stringify({ ...base, savedAt: 1000 }), 1000 + 60);
    expect(d?.values.title).toBe("Помыть пол");
    expect(d?.workerIds).toEqual([2]);
    expect(d?.kind).toBe("once");
  });

  it("старше трёх дней, пустой или битый — нет", () => {
    expect(parseDraft(JSON.stringify({ ...base, savedAt: 1000 }), 1000 + DRAFT_MAX_AGE_SEC + 1)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...base, values: { title: "  " }, savedAt: 1000 }), 1001)).toBeNull();
    expect(parseDraft("{не json", 1)).toBeNull();
    expect(parseDraft(null, 1)).toBeNull();
  });

  it("есть что хранить — название, описание, пункт или вопрос", () => {
    expect(draftHasContent({ values: {}, checklist: [], questions: [] })).toBe(false);
    expect(draftHasContent({ values: { description: "x" }, checklist: [], questions: [] })).toBe(true);
    expect(draftHasContent({ values: {}, checklist: [{ id: "a", title: "Пол", requiresPhoto: true }], questions: [] })).toBe(true);
  });
});

describe("«Новая», «Дальше», «Слушать список»", () => {
  it("новые — созданные после прошлого захода и не сделанные; первый заход — ничего", () => {
    const tasks = [
      { id: 1, createdAt: 100 },
      { id: 2, createdAt: 300 },
      { id: 3, createdAt: 400, isCompleted: true },
    ];
    expect([...newTaskIds(tasks, 200)]).toEqual([2]);
    expect(newTaskIds(tasks, null).size).toBe(0);
  });

  it("«Дальше» — первая несделанная по срочности, без выполненной и отправленных", () => {
    const tasks = [
      { id: 1 },
      { id: 2, remindAt: "09:00" },
      { id: 3, verificationStatus: "submitted", remindAt: "08:00" },
      { id: 4, isCompleted: true },
    ];
    expect(nextTaskAfter(tasks, 2)?.id).toBe(1);
    expect(nextTaskAfter(tasks, 1)?.id).toBe(2);
    expect(nextTaskAfter([{ id: 1 }], 1)).toBeNull();
  });

  it("текст списка: число задач по-русски и названия по порядку", () => {
    expect(listSpeechText(["Пол", "Окна."])).toBe("На сегодня 2 задачи. 1. Пол. 2. Окна.");
    expect(listSpeechText(["Пол"])).toBe("На сегодня 1 задача. 1. Пол.");
    expect(listSpeechText(Array.from({ length: 5 }, (_, i) => `З${i}`))).toMatch(/^На сегодня 5 задач\./);
    expect(listSpeechText([])).toBe("На сегодня задач нет.");
  });
});
