import { describe, it, expect } from "vitest";
import { DatabaseStorage } from "../server/storage";

/**
 * example_photo_urls пришла на смену одиночной example_photo_url.
 * Задачи, созданные ДО миграции, обязаны продолжать показывать свой
 * пример фото — иначе тихо теряется контент у всех старых задач.
 *
 * parseTaskRow приватный, но тестируем именно его: это единственное
 * место, где решается совместимость.
 */
const parseTaskRow = (row: Record<string, unknown>) =>
  (DatabaseStorage as unknown as {
    parseTaskRow: (r: Record<string, unknown>) => any;
  }).parseTaskRow(row);

const baseRow = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  title: "T",
  weekDays: null,
  photoUrls: null,
  checklist: null,
  examplePhotoUrl: null,
  examplePhotoUrls: null,
  ...extra,
});

describe("examplePhotoUrls: чтение", () => {
  it("новая колонка читается как массив", () => {
    const t = parseTaskRow(
      baseRow({ examplePhotoUrls: '["/uploads/a.jpg","/uploads/b.jpg"]' }),
    );
    expect(t.examplePhotoUrls).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
  });

  it("пустая новая колонка → legacy-поле одним элементом", () => {
    const t = parseTaskRow(baseRow({ examplePhotoUrl: "/uploads/old.jpg" }));
    expect(t.examplePhotoUrls).toEqual(["/uploads/old.jpg"]);
  });

  it("пустой массив в новой колонке тоже падает на legacy", () => {
    const t = parseTaskRow(
      baseRow({ examplePhotoUrls: "[]", examplePhotoUrl: "/uploads/old.jpg" }),
    );
    expect(t.examplePhotoUrls).toEqual(["/uploads/old.jpg"]);
  });

  it("новая колонка приоритетнее legacy", () => {
    const t = parseTaskRow(
      baseRow({
        examplePhotoUrls: '["/uploads/new.jpg"]',
        examplePhotoUrl: "/uploads/old.jpg",
      }),
    );
    expect(t.examplePhotoUrls).toEqual(["/uploads/new.jpg"]);
  });

  it("ни одной колонки → пустой массив, а не null", () => {
    expect(parseTaskRow(baseRow()).examplePhotoUrls).toEqual([]);
  });

  it("битый JSON не роняет чтение задачи — деградируем до legacy", () => {
    const t = parseTaskRow(
      baseRow({ examplePhotoUrls: "{сломано", examplePhotoUrl: "/uploads/old.jpg" }),
    );
    expect(t.examplePhotoUrls).toEqual(["/uploads/old.jpg"]);
  });

  it("не-массив в колонке игнорируется", () => {
    expect(parseTaskRow(baseRow({ examplePhotoUrls: '"строка"' })).examplePhotoUrls).toEqual([]);
  });

  it("пустые значения внутри массива отфильтровываются", () => {
    const t = parseTaskRow(baseRow({ examplePhotoUrls: '["/uploads/a.jpg","",null]' }));
    expect(t.examplePhotoUrls).toEqual(["/uploads/a.jpg"]);
  });
});

describe("parseTaskRow: остальные JSON-поля не сломались", () => {
  it("weekDays, photoUrls и checklist парсятся как раньше", () => {
    const t = parseTaskRow(
      baseRow({
        weekDays: "[1,3,5]",
        photoUrls: '["/uploads/p.jpg"]',
        checklist: '[{"id":"c1","title":"пункт","done":false,"photoUrls":[]}]',
      }),
    );
    expect(t.weekDays).toEqual([1, 3, 5]);
    expect(t.photoUrls).toEqual(["/uploads/p.jpg"]);
    expect(t.checklist).toHaveLength(1);
  });

  it("пустые JSON-поля дают null/[] как раньше", () => {
    const t = parseTaskRow(baseRow());
    expect(t.weekDays).toBeNull();
    expect(t.photoUrls).toEqual([]);
    expect(t.checklist).toEqual([]);
  });
});
