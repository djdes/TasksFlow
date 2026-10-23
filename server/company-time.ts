import { dayInZone, dayOfMonth, dayOfWeek, zoneOrDefault } from "@shared/day";
import { storage } from "./storage";

/**
 * «Сегодня» компании: день, день недели и месяца по её часовому поясу.
 * Бот и рассылки считают расписание задач так же, как ночной сброс, —
 * а не по часам сервера, которые у компании во Владивостоке врут на 7 часов.
 */
export async function companyToday(companyId: number | null | undefined, now: number = Math.floor(Date.now() / 1000)) {
  const company = companyId ? await storage.getCompanyById(companyId) : undefined;
  const tz = zoneOrDefault(company?.timezone);
  const day = dayInZone(now, tz);
  return { tz, day, dow: dayOfWeek(day), dom: dayOfMonth(day) };
}
