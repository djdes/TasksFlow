/**
 * Сводка расписания в форме задачи: то же, что считает isTaskVisibleOn,
 * но словами — «По будням», «15-го числа», «Разово, срок — 30 октября».
 */

import { describe, it, expect } from "vitest";
import { describeSchedule } from "../client/src/lib/task-schedule";

// «Сейчас» для сроков: 24 октября 2026, полдень по локальному времени.
const NOW = Math.floor(new Date(2026, 9, 24, 12).getTime() / 1000);

describe("describeSchedule — когда видна", () => {
  it.each([
    [{}, "Каждый день"],
    [{ weekDays: [] }, "Каждый день"],
    [{ weekDays: [0, 1, 2, 3, 4, 5, 6] }, "Каждый день"],
    [{ weekDays: [5, 1, 2, 3, 4] }, "По будням"],
    [{ weekDays: [0, 6] }, "По выходным"],
    [{ weekDays: [1] }, "По понедельникам"],
    [{ weekDays: [5, 3, 1] }, "По понедельникам, средам и пятницам"],
    [{ weekDays: [0, 2] }, "По вторникам и воскресеньям"],
    [{ monthDay: "15" }, "15-го числа каждого месяца"],
    [{ monthDay: 1, weekDays: [1, 3] }, "1-го числа, если это понедельник или среда"],
    [{ dueDateInput: "2026-10-30", weekDays: [1], monthDay: "5" }, "Разово, срок — 30 октября"],
  ])("%j → %s", (input, when) => {
    expect(describeSchedule(input, NOW).when).toBe(when);
  });

  it("срок другого года — с годом; несуществующая дата — не срок", () => {
    expect(describeSchedule({ dueDateInput: "2027-01-05" }, NOW).when).toBe("Разово, срок — 5 января 2027");
    expect(describeSchedule({ dueDateInput: "2026-02-31", weekDays: [1] }, NOW).when).toBe("По понедельникам");
  });

  it("мусор в днях недели не ломает сводку", () => {
    expect(describeSchedule({ weekDays: [1, 7, 1] }).when).toBe("По понедельникам");
  });
});

describe("describeSchedule — после выполнения и подвохи", () => {
  it("повтор — фото остаются в истории, разовая — не появится", () => {
    expect(describeSchedule({ isRecurring: true }).repeat).toContain("остаётся в истории");
    expect(describeSchedule({ isRecurring: false }).repeat).toContain("останется выполненной");
    expect(describeSchedule({ dueDateInput: "2026-12-02" }, NOW).repeat).toContain("после срока не исчезнет");
    expect(describeSchedule({ dueDateInput: "2026-01-02" }, NOW).repeat).toContain("Срок уже прошёл");
  });

  it("31-е бывает не каждый месяц; число вместе с днём недели — редкость", () => {
    expect(describeSchedule({ monthDay: "31" }).note).toContain("без 31-го");
    expect(describeSchedule({ monthDay: "10", weekDays: [1] }).note).toContain("редко");
    expect(describeSchedule({ monthDay: "10" }).note).toBeNull();
    const both = describeSchedule({ monthDay: "31", weekDays: [1] }).note ?? "";
    expect(both).toContain("редко");
    expect(both).toContain("без 31-го");
  });
});
