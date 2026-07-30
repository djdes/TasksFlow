import { describe, it, expect } from "vitest";
import { parseMessage, matchWorker } from "../server/telegram/parse-message";

/**
 * Явный «@Олег» разбирается кодом, а не моделью: быстрее, бесплатно и
 * предсказуемо. Ошибка здесь = задача уедет не тому человеку.
 */

describe("parseMessage", () => {
  it("без @ — весь текст задача", () => {
    expect(parseMessage("помыть пол")).toEqual({
      assigneeQuery: null,
      taskText: "помыть пол",
    });
  });

  it("@имя в конце вырезается из текста", () => {
    expect(parseMessage("помыть пол @Олег")).toEqual({
      assigneeQuery: "Олег",
      taskText: "помыть пол",
    });
  });

  it("@имя в начале тоже работает", () => {
    expect(parseMessage("@Олег помыть пол")).toEqual({
      assigneeQuery: "Олег",
      taskText: "помыть пол",
    });
  });

  it("пунктуация после имени не считается частью имени", () => {
    expect(parseMessage("@Олег, помой пол").assigneeQuery).toBe("Олег");
    expect(parseMessage("помой пол @Олег!").assigneeQuery).toBe("Олег");
  });

  it("берётся ПОСЛЕДНИЙ @ — человек переназначил в конце", () => {
    const r = parseMessage("@Олег помыть пол @Анна");
    expect(r.assigneeQuery).toBe("Анна");
    expect(r.taskText).toBe("помыть пол");
  });

  it("«@» без имени — просьба показать список, а не пустое имя", () => {
    expect(parseMessage("@").assigneeQuery).toBe("");
    expect(parseMessage("@").taskText).toBe("");
  });

  it("только имя без текста — запрос сводки, taskText пуст", () => {
    expect(parseMessage("@Олег")).toEqual({ assigneeQuery: "Олег", taskText: "" });
  });

  it("пустой и пробельный ввод не падает", () => {
    expect(parseMessage("")).toEqual({ assigneeQuery: null, taskText: "" });
    expect(parseMessage("   ")).toEqual({ assigneeQuery: null, taskText: "" });
  });

  it("лишние пробелы схлопываются", () => {
    expect(parseMessage("  помыть   пол   @Олег  ").taskText).toBe("помыть пол");
  });

  it("email не превращается в исполнителя — @ не в начале токена", () => {
    expect(parseMessage("написать на a@b.ru").assigneeQuery).toBeNull();
  });
});

describe("matchWorker", () => {
  const workers = [
    { id: 12, name: "Олег Боев", position: "повар" },
    { id: 15, name: "Анна Смирнова", position: "продавец" },
    { id: 18, name: "Олег Петров", position: "грузчик" },
    { id: 20, name: "Мария Иванова", position: null },
  ];

  it("точное совпадение по полному имени", () => {
    expect(matchWorker("Анна Смирнова", workers)?.id).toBe(15);
  });

  it("совпадение по фамилии", () => {
    expect(matchWorker("Смирнова", workers)?.id).toBe(15);
  });

  it("совпадение по должности, если она уникальна", () => {
    expect(matchWorker("повар", workers)?.id).toBe(12);
    expect(matchWorker("грузчик", workers)?.id).toBe(18);
  });

  it("регистр не важен", () => {
    expect(matchWorker("аННа", workers)?.id).toBe(15);
  });

  it("префикс работает, если он однозначен", () => {
    expect(matchWorker("Мари", workers)?.id).toBe(20);
    expect(matchWorker("Смирн", workers)?.id).toBe(15);
  });

  it("НЕОДНОЗНАЧНОСТЬ → null: два Олега, назначать наугад нельзя", () => {
    expect(matchWorker("Олег", workers)).toBeNull();
  });

  it("неизвестное имя → null", () => {
    expect(matchWorker("Василий", workers)).toBeNull();
  });

  it("пустой запрос → null", () => {
    expect(matchWorker("", workers)).toBeNull();
    expect(matchWorker("   ", workers)).toBeNull();
  });

  it("пустой список сотрудников → null", () => {
    expect(matchWorker("Олег", [])).toBeNull();
  });

  it("точное совпадение приоритетнее префиксного", () => {
    const list = [
      { id: 1, name: "Ан", position: null },
      { id: 2, name: "Анна", position: null },
    ];
    expect(matchWorker("Ан", list)?.id).toBe(1);
  });

  it("подстрока — последний шанс и только если единственная", () => {
    const list = [
      { id: 1, name: "Пётр Кузнецов", position: null },
      { id: 2, name: "Иван Сидоров", position: null },
    ];
    expect(matchWorker("кузнец", list)?.id).toBe(1);
  });
});
