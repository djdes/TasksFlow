/** Премия за задачу по умолчанию: хранение в access_settings и расчёт на месяц. */
import { describe, it, expect } from "vitest";
import { mergeAccessJson, monthlyBonus, parseTaskBonus, taskBonusInputSchema } from "../shared/task-bonus";
import { parseAccessSettings } from "../shared/roles";

describe("taskBonus", () => {
  it("читает сумму и игнорирует мусор", () => {
    expect(parseTaskBonus(null)).toBe(0);
    expect(parseTaskBonus("{")).toBe(0);
    expect(parseTaskBonus('{"employeeApproval":true}')).toBe(0);
    expect(parseTaskBonus('{"taskBonus":30}')).toBe(30);
    expect(parseTaskBonus('{"taskBonus":-5}')).toBe(0);
    expect(parseTaskBonus('{"taskBonus":"30"}')).toBe(0);
  });

  it("слияние не стирает проверку сотрудника — и наоборот", () => {
    const withBonus = mergeAccessJson('{"employeeApproval":true}', { taskBonus: 30 });
    expect(parseAccessSettings(withBonus).employeeApproval).toBe(true);
    expect(parseTaskBonus(withBonus)).toBe(30);
    const back = mergeAccessJson(withBonus, { employeeApproval: false });
    expect(parseTaskBonus(back)).toBe(30);
    expect(parseAccessSettings(back).employeeApproval).toBe(false);
    expect(mergeAccessJson("мусор", { taskBonus: 10 })).toBe('{"taskBonus":10}');
  });

  it("30 ₽ × 6 задач × 20 дней = 3 600 ₽", () => {
    expect(monthlyBonus(30)).toBe(3600);
    expect(monthlyBonus(0)).toBe(0);
  });

  it("валидация суммы", () => {
    expect(taskBonusInputSchema.parse({ amount: 30 })).toEqual({ amount: 30, applyToExisting: false });
    expect(taskBonusInputSchema.safeParse({ amount: 1.5 }).success).toBe(false);
    expect(taskBonusInputSchema.safeParse({ amount: -1 }).success).toBe(false);
  });
});
