/**
 * Тесты DatabaseStorage.parseManagedWorkerIds.
 *
 * Контекст: server/storage.ts. Этот static helper парсит JSON-строку
 * из users.managedWorkerIds колонки. Поле описывает иерархию (кто
 * чей руководитель), синхронизируется WeSetup'ом и используется в:
 *   • /api/users (фильтрация dropdown'ов: руководитель видит только
 *     своих подчинённых + себя)
 *   • /api/tasks (тот же scope)
 *   • routes.ts canAssignToWorker() — проверка прав на assignment
 *
 * Семантика:
 *   • null / undefined / "" → null = «обычный воркер, не руководитель»
 *   • "[]" → [] = «руководитель, но без подчинённых» (видит только себя)
 *   • "[1,2,3]" → [1,2,3] = руководит worker'ами 1,2,3
 *   • Корраптнутая строка → null = graceful fallback (не падаем)
 *
 * Если кто-то ослабит filter (typeof === "number") — non-integer мусор
 * (string IDs из WeSetup) проникнет в auth-checks. Тесты это ловят.
 */

import { describe, it, expect } from "vitest";
import { DatabaseStorage } from "../server/storage";

describe("parseManagedWorkerIds — null/undefined/empty", () => {
  it("null → null (обычный воркер без иерархии)", () => {
    expect(DatabaseStorage.parseManagedWorkerIds(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(DatabaseStorage.parseManagedWorkerIds(undefined)).toBeNull();
  });

  it("пустая строка → null (legacy записи до миграции)", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("")).toBeNull();
  });
});

describe("parseManagedWorkerIds — невалидный JSON → null", () => {
  it("garbage → null", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("not json")).toBeNull();
  });

  it("неполный JSON → null", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[1,2,")).toBeNull();
  });

  it("JSON-объект (не массив) → null", () => {
    expect(
      DatabaseStorage.parseManagedWorkerIds('{"foo":"bar"}'),
    ).toBeNull();
  });

  it("JSON-число (не массив) → null", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("42")).toBeNull();
  });

  it("JSON-строка (не массив) → null", () => {
    expect(DatabaseStorage.parseManagedWorkerIds('"hello"')).toBeNull();
  });
});

describe("parseManagedWorkerIds — валидные массивы", () => {
  it("[] → [] (руководитель без подчинённых)", () => {
    // Семантически: «есть scope, но никого нет». В /api/tasks такой
    // юзер видит только свои задачи (фильтр workerId in [] всегда
    // отбрасывает).
    expect(DatabaseStorage.parseManagedWorkerIds("[]")).toEqual([]);
  });

  it("[1,2,3] → [1,2,3]", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[1,2,3]")).toEqual([
      1, 2, 3,
    ]);
  });

  it("[42] → [42]", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[42]")).toEqual([42]);
  });
});

describe("parseManagedWorkerIds — type filter (защита от мусора)", () => {
  // WeSetup пушит numeric IDs, но если кто-то добавит "1" string —
  // typeof === "number" фильтр это отбрасывает. Иначе scope-checks
  // сравнивали бы "1" === 1 → false, и руководитель не увидел бы
  // подчинённого. Лучше явно отбросить.

  it("string IDs отфильтровываются", () => {
    expect(DatabaseStorage.parseManagedWorkerIds('["1","2","3"]')).toEqual(
      [],
    );
  });

  it("смешанный array — оставляет только numbers", () => {
    expect(
      DatabaseStorage.parseManagedWorkerIds('[1,"2",3,null,4]'),
    ).toEqual([1, 3, 4]);
  });

  it("float отбрасывается (Number.isInteger guard)", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[1, 2.5, 3]")).toEqual([
      1, 3,
    ]);
  });

  it("NaN отбрасывается (typeof number, но не isInteger)", () => {
    // JSON.parse не парсит NaN, но если бы случилось — отбрасываем.
    // Делаем eval'ом чтобы получить NaN в массив.
    const arr: unknown[] = [1, NaN, 3];
    expect(
      DatabaseStorage.parseManagedWorkerIds(JSON.stringify(arr)),
    ).toEqual([1, 3]); // NaN сериализуется как null в JSON
  });

  it("вложенные массивы → null filtered out", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[1,[2,3],4]")).toEqual([
      1, 4,
    ]);
  });

  it("undefined-like → отбрасывается", () => {
    expect(DatabaseStorage.parseManagedWorkerIds("[1,null,2]")).toEqual([
      1, 2,
    ]);
  });

  it("негативные integers пропускаются как есть (JSON-source data trust)", () => {
    // Документированное поведение: parseManagedWorkerIds — pure filter
    // только по типу/Number.isInteger. Семантическая валидация (id > 0)
    // — на уровне callers (storage layer защищает от записи плохих id'ов
    // через FK constraints). Тест freeze'ит текущее поведение, чтобы
    // если кто-то добавит >0 фильтр — это было осознанное изменение.
    expect(DatabaseStorage.parseManagedWorkerIds("[-1, 5, -10]")).toEqual([
      -1, 5, -10,
    ]);
  });

  it("дубликаты НЕ дедуп'ятся (документированное поведение)", () => {
    // parseManagedWorkerIds возвращает array как есть после filter'а.
    // Дедупликацию делает caller через new Set() при необходимости.
    // Freeze: если кто-то добавит unique-фильтр, существующие тесты
    // canAssignToWorker должны быть проверены на регрессию.
    expect(DatabaseStorage.parseManagedWorkerIds("[7, 7, 8, 7]")).toEqual([
      7, 7, 8, 7,
    ]);
  });
});
