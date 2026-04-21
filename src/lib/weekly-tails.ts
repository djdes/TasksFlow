/**
 * «Хвосты недели» — самые просроченные незаполненные дни за последние 7
 * календарных дней. Для каждого ежедневного журнала смотрим активные
 * документы, считаем сколько дней за последнюю неделю оказались пустыми
 * и возвращаем топ-N упорядоченных по «старости» самого раннего
 * просроченного дня.
 *
 * Используется только как навигационная подсказка на дашборде — не
 * пересекается с today-compliance (который смотрит только на сегодня).
 */
import { db } from "@/lib/db";
import {
  DAILY_JOURNAL_CODES,
  CONFIG_DAILY_CODES,
} from "@/lib/daily-journal-codes";

export type WeeklyTail = {
  templateId: string;
  templateCode: string;
  templateName: string;
  documentId: string;
  documentTitle: string;
  /** ISO dates (YYYY-MM-DD) within the last 7 days that have zero
   *  entries/rows. Sorted oldest-first. */
  missingDays: string[];
  /** Oldest missing date — drives ordering across journals. */
  oldestMissing: string;
};

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getWeeklyTails(
  organizationId: string,
  now: Date = new Date(),
  limit: number = 3
): Promise<WeeklyTail[]> {
  const today = utcDayStart(now);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6); // today-6 .. today inclusive
  const weekEnd = new Date(today);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 1); // exclusive

  // Build the 7-day set of ISO keys we'll check against.
  const dayKeys: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    dayKeys.push(ymd(d));
  }

  // Pull active documents for daily journals (both entry-based and
  // config-based code families) that cover at least part of the week.
  const docs = await db.journalDocument.findMany({
    where: {
      organizationId,
      status: "active",
      dateFrom: { lte: today },
      dateTo: { gte: weekStart },
      template: {
        code: {
          in: [...DAILY_JOURNAL_CODES, ...CONFIG_DAILY_CODES],
        },
      },
    },
    select: {
      id: true,
      title: true,
      templateId: true,
      dateFrom: true,
      dateTo: true,
      config: true,
      template: { select: { code: true, name: true } },
    },
  });
  if (docs.length === 0) return [];

  const entryDocIds = docs
    .filter((d) => DAILY_JOURNAL_CODES.has(d.template.code))
    .map((d) => d.id);
  const entryByDocDay = new Map<string, Set<string>>();
  if (entryDocIds.length > 0) {
    const grouped = await db.journalDocumentEntry.groupBy({
      by: ["documentId", "date"],
      where: {
        documentId: { in: entryDocIds },
        date: { gte: weekStart, lt: weekEnd },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      if (row._count._all === 0) continue;
      const dayKey = ymd(row.date);
      const set = entryByDocDay.get(row.documentId) ?? new Set<string>();
      set.add(dayKey);
      entryByDocDay.set(row.documentId, set);
    }
  }

  const tails: WeeklyTail[] = [];
  for (const doc of docs) {
    const docFromKey = ymd(doc.dateFrom);
    const docToKey = ymd(doc.dateTo);
    // Days within the week AND within the document's period.
    const effectiveDays = dayKeys.filter(
      (k) => k >= docFromKey && k <= docToKey
    );
    if (effectiveDays.length === 0) continue;

    let filledDays: Set<string>;
    if (CONFIG_DAILY_CODES.has(doc.template.code)) {
      filledDays = deriveConfigFilledDays(
        doc.template.code,
        doc.config,
        effectiveDays
      );
    } else {
      filledDays = entryByDocDay.get(doc.id) ?? new Set();
    }

    const missingDays = effectiveDays.filter((d) => !filledDays.has(d));
    if (missingDays.length === 0) continue;

    tails.push({
      templateId: doc.templateId,
      templateCode: doc.template.code,
      templateName: doc.template.name,
      documentId: doc.id,
      documentTitle: doc.title,
      missingDays: [...missingDays].sort(),
      oldestMissing: [...missingDays].sort()[0],
    });
  }

  tails.sort((a, b) => {
    if (a.oldestMissing !== b.oldestMissing) {
      return a.oldestMissing.localeCompare(b.oldestMissing);
    }
    return b.missingDays.length - a.missingDays.length;
  });
  return tails.slice(0, limit);
}

function deriveConfigFilledDays(
  templateCode: string,
  config: unknown,
  effectiveDays: string[]
): Set<string> {
  const filled = new Set<string>();
  if (!config || typeof config !== "object") return filled;
  const cfg = config as Record<string, unknown>;

  if (templateCode === "cleaning") {
    const matrix =
      cfg.matrix && typeof cfg.matrix === "object"
        ? (cfg.matrix as Record<string, Record<string, unknown>>)
        : {};
    const rooms = Array.isArray(cfg.rooms)
      ? (cfg.rooms as Array<{ id?: string }>)
      : [];
    const roomIds = rooms
      .map((r) => r?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (roomIds.length === 0) return filled;
    for (const dayKey of effectiveDays) {
      const allFilled = roomIds.every((roomId) => {
        const cell = matrix[roomId]?.[dayKey];
        return cell !== undefined && cell !== null && cell !== "";
      });
      if (allFilled) filled.add(dayKey);
    }
    return filled;
  }

  if (
    templateCode === "finished_product" ||
    templateCode === "perishable_rejection"
  ) {
    const dateField =
      templateCode === "finished_product" ? "productionDateTime" : "arrivalDate";
    const rows = Array.isArray(cfg.rows)
      ? (cfg.rows as Array<Record<string, unknown>>)
      : [];
    for (const row of rows) {
      const raw = row[dateField];
      if (typeof raw !== "string") continue;
      filled.add(raw.slice(0, 10));
    }
    return filled;
  }

  return filled;
}
