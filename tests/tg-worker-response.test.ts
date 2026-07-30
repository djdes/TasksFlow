import { describe, it, expect } from "vitest";
import {
  normalizeWorkerResponse,
  buildManualDraft,
  MAX_SEGMENTS,
} from "../server/telegram/normalize";

/**
 * Ответ воркера — недоверенный вход. Эти тесты фиксируют, что ни одно
 * поле из него не попадает в задачу «как есть».
 */

const ALLOWED = [12, 15];
const MSG = "олегу помыть холодильник";

function parse(segments: unknown[], allowed = ALLOWED, msg = MSG) {
  return normalizeWorkerResponse(
    JSON.stringify({ version: 1, app: "tasksflow", segments }),
    allowed,
    msg,
  );
}

describe("normalizeWorkerResponse: битый вход", () => {
  it("не-JSON → null", () => {
    expect(normalizeWorkerResponse("не json", ALLOWED, MSG)).toBeNull();
  });

  it("JSON без segments → null", () => {
    expect(normalizeWorkerResponse('{"version":1}', ALLOWED, MSG)).toBeNull();
  });

  it("пустой массив segments → null", () => {
    expect(normalizeWorkerResponse('{"segments":[]}', ALLOWED, MSG)).toBeNull();
  });

  it("segments не массив → null", () => {
    expect(normalizeWorkerResponse('{"segments":"нет"}', ALLOWED, MSG)).toBeNull();
  });
});

describe("normalizeWorkerResponse: исполнитель", () => {
  it("workerId из списка разрешённых проходит", () => {
    const r = parse([{ title: "T", workerId: 12 }]);
    expect(r!.segments[0].workerId).toBe(12);
  });

  it("чужой workerId обнуляется — последний рубеж мультитенантности", () => {
    const r = parse([{ title: "T", workerId: 999, workerName: "Чужой" }]);
    expect(r!.segments[0].workerId).toBeNull();
    expect(r!.segments[0].workerName).toBeNull();
  });

  it("workerId строкой приводится к числу и проверяется", () => {
    expect(parse([{ title: "T", workerId: "15" }])!.segments[0].workerId).toBe(15);
    expect(parse([{ title: "T", workerId: "999" }])!.segments[0].workerId).toBeNull();
  });

  it("workerId отсутствует → null, а не угадывание", () => {
    expect(parse([{ title: "T" }])!.segments[0].workerId).toBeNull();
  });
});

describe("normalizeWorkerResponse: дефолты", () => {
  it("requiresPhoto по умолчанию true", () => {
    expect(parse([{ title: "T" }])!.segments[0].requiresPhoto).toBe(true);
  });

  it("requiresPhoto снимается явным false", () => {
    expect(parse([{ title: "T", requiresPhoto: false }])!.segments[0].requiresPhoto).toBe(false);
  });

  it("isRecurring по умолчанию false — разовая безопаснее", () => {
    expect(parse([{ title: "T" }])!.segments[0].isRecurring).toBe(false);
  });

  it("price по умолчанию 0 и не бывает отрицательной", () => {
    expect(parse([{ title: "T" }])!.segments[0].price).toBe(0);
    expect(parse([{ title: "T", price: -50 }])!.segments[0].price).toBe(0);
    expect(parse([{ title: "T", price: "200" }])!.segments[0].price).toBe(200);
  });

  it("category не выдумывается", () => {
    expect(parse([{ title: "T" }])!.segments[0].category).toBeNull();
  });

  it("checklist по умолчанию пустой", () => {
    expect(parse([{ title: "T" }])!.segments[0].checklist).toEqual([]);
  });
});

describe("normalizeWorkerResponse: лимиты длин", () => {
  it("title режется до 255", () => {
    const r = parse([{ title: "x".repeat(400) }]);
    expect(r!.segments[0].title).toHaveLength(255);
  });

  it("пустой title → фолбэк из сообщения", () => {
    const r = parse([{ title: "" }], ALLOWED, "помыть холодильник срочно");
    expect(r!.segments[0].title).toBe("помыть холодильник срочно");
  });

  it("длинное сообщение в фолбэке обрезается по границе слова", () => {
    const long = "слово ".repeat(40).trim();
    const r = parse([{}], ALLOWED, long);
    expect(r!.segments[0].title.length).toBeLessThanOrEqual(81);
    expect(r!.segments[0].title.endsWith("…")).toBe(true);
  });

  it("description режется до 5000", () => {
    const r = parse([{ title: "T", description: "y".repeat(9000) }]);
    expect(r!.segments[0].description).toHaveLength(5000);
  });

  it("category режется до 100", () => {
    const r = parse([{ title: "T", category: "z".repeat(200) }]);
    expect(r!.segments[0].category).toHaveLength(100);
  });

  it("чек-лист: максимум 30 пунктов, заголовки до 200", () => {
    const items = Array.from({ length: 50 }, (_, i) => `пункт ${i} ${"q".repeat(300)}`);
    const r = parse([{ title: "T", checklist: items }]);
    expect(r!.segments[0].checklist).toHaveLength(30);
    expect(r!.segments[0].checklist[0]).toHaveLength(200);
  });

  it("чек-лист принимает и объекты {title}", () => {
    const r = parse([{ title: "T", checklist: [{ title: "полки" }, "дверца", ""] }]);
    expect(r!.segments[0].checklist).toEqual(["полки", "дверца"]);
  });
});

describe("normalizeWorkerResponse: расписание", () => {
  it("weekDays чистятся: дубли, мусор, выход за 0..6", () => {
    const r = parse([{ title: "T", weekDays: [5, 5, 9, -1, "3", 1.7] }]);
    expect(r!.segments[0].weekDays).toEqual([1, 3, 5]);
  });

  it("пустые weekDays → null (задача видна всегда)", () => {
    expect(parse([{ title: "T", weekDays: [] }])!.segments[0].weekDays).toBeNull();
    expect(parse([{ title: "T", weekDays: "пт" }])!.segments[0].weekDays).toBeNull();
  });

  it("monthDay только 1..31", () => {
    expect(parse([{ title: "T", monthDay: 15 }])!.segments[0].monthDay).toBe(15);
    expect(parse([{ title: "T", monthDay: 0 }])!.segments[0].monthDay).toBeNull();
    expect(parse([{ title: "T", monthDay: 32 }])!.segments[0].monthDay).toBeNull();
  });

  it("dueDate парсится в unix-сек локальной полуночи", () => {
    const r = parse([{ title: "T", dueDate: "2026-08-03" }]);
    const d = new Date(r!.segments[0].dueDate! * 1000);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it("несуществующая дата отбрасывается", () => {
    expect(parse([{ title: "T", dueDate: "2026-02-31" }])!.segments[0].dueDate).toBeNull();
    expect(parse([{ title: "T", dueDate: "завтра" }])!.segments[0].dueDate).toBeNull();
  });

  it("прошедшая дата принимается — задача сразу просрочена, это валидно", () => {
    expect(parse([{ title: "T", dueDate: "2020-01-01" }])!.segments[0].dueDate).not.toBeNull();
  });

  it("dueDate форсит isRecurring=false и стирает расписание", () => {
    const r = parse([
      { title: "T", dueDate: "2026-08-03", isRecurring: true, weekDays: [5], monthDay: 15 },
    ]);
    expect(r!.segments[0].isRecurring).toBe(false);
    expect(r!.segments[0].weekDays).toBeNull();
    expect(r!.segments[0].monthDay).toBeNull();
  });
});

describe("normalizeWorkerResponse: количество сегментов", () => {
  it(`больше ${MAX_SEGMENTS} — берём первые и честно считаем отброшенные`, () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ title: `T${i}` }));
    const r = parse(many);
    expect(r!.segments).toHaveLength(MAX_SEGMENTS);
    expect(r!.truncated).toBe(4);
  });

  it("в пределах лимита ничего не отбрасывается", () => {
    expect(parse([{ title: "A" }, { title: "B" }])!.truncated).toBe(0);
  });

  it("все сегменты изначально включены", () => {
    expect(parse([{ title: "A" }])!.segments[0].included).toBe(true);
  });
});

describe("buildManualDraft", () => {
  it("первая строка — заголовок, остальное — описание", () => {
    const d = buildManualDraft("Помыть холодильник\nПолки вынуть\nИ морозилку");
    expect(d.title).toBe("Помыть холодильник");
    expect(d.description).toBe("Полки вынуть\nИ морозилку");
  });

  it("однострочное сообщение — без описания", () => {
    expect(buildManualDraft("Помыть пол").description).toBeNull();
  });

  it("дефолты те же, что у AI-сегмента", () => {
    const d = buildManualDraft("Задача");
    expect(d.workerId).toBeNull();
    expect(d.requiresPhoto).toBe(true);
    expect(d.isRecurring).toBe(false);
    expect(d.price).toBe(0);
    expect(d.dueDate).toBeNull();
  });
});
