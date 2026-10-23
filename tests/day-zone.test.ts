import { describe, expect, it } from "vitest";
import {
  dayInZone,
  dayOfMonth,
  dayOfWeek,
  daysBetween,
  isDay,
  isValidTimeZone,
  shiftDay,
  startOfDayInZone,
  timeInZone,
  utcOffsetLabel,
  zoneOrDefault,
} from "../shared/day";

const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;

describe("день по поясу компании", () => {
  it("один и тот же момент — разные дни в Калининграде и Владивостоке", () => {
    const t = utc(2026, 10, 23, 14, 30); // 16:30 Калининград, 00:30 Владивосток
    expect(dayInZone(t, "Europe/Kaliningrad")).toBe("2026-10-23");
    expect(dayInZone(t, "Asia/Vladivostok")).toBe("2026-10-24");
    expect(timeInZone(t, "Europe/Moscow")).toBe("17:30");
  });

  it("местная полночь в unix-секундах", () => {
    expect(startOfDayInZone("2026-10-24", "Europe/Moscow")).toBe(utc(2026, 10, 23, 21));
    expect(startOfDayInZone("2026-10-24", "Asia/Vladivostok")).toBe(utc(2026, 10, 23, 14));
    expect(startOfDayInZone("2026-01-01", "UTC")).toBe(utc(2026, 1, 1));
  });

  it("полночь корректна и в день перехода на летнее время", () => {
    // Берлин: 29.03.2026 в 02:00 стрелки переводят вперёд, полночь ещё по UTC+1.
    expect(startOfDayInZone("2026-03-29", "Europe/Berlin")).toBe(utc(2026, 3, 28, 23));
    expect(startOfDayInZone("2026-03-30", "Europe/Berlin")).toBe(utc(2026, 3, 29, 22));
  });

  it("сдвиг дней через границы месяца и года", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(31);
  });

  it("день недели и месяца как у Date.getDay()/getDate()", () => {
    expect(dayOfWeek("2026-10-23")).toBe(5); // пятница
    expect(dayOfWeek("2026-10-25")).toBe(0); // воскресенье
    expect(dayOfMonth("2026-10-23")).toBe(23);
  });

  it("проверка дня и пояса", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-2-3")).toBe(false);
    expect(isValidTimeZone("Asia/Yekaterinburg")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(zoneOrDefault("Mars/Olympus")).toBe("Europe/Moscow");
    expect(zoneOrDefault(null)).toBe("Europe/Moscow");
  });

  it("подпись смещения", () => {
    expect(utcOffsetLabel("Europe/Moscow", utc(2026, 10, 23))).toBe("UTC+3");
    expect(utcOffsetLabel("Asia/Kolkata", utc(2026, 10, 23))).toBe("UTC+5:30");
  });
});
