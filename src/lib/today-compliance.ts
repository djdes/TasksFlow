import { db } from "@/lib/db";
import {
  DAILY_JOURNAL_CODES,
  CONFIG_DAILY_CODES,
} from "@/lib/daily-journal-codes";

export { DAILY_JOURNAL_CODES, CONFIG_DAILY_CODES };

/**
 * "Filled today" check for a journal template. Not every mandatory
 * journal has daily obligations — some are aperiodic (accidents,
 * complaints, breakdowns happen only when they happen) or event-driven
 * (incoming raw material inspection, intensive cooling, metal-impurity
 * checks, audits, staff training, equipment calibration…). Flagging
 * those as «не заполнено сегодня» every day would be wrong.
 *
 * So we classify templates by cadence:
 *
 *   - DAILY_JOURNAL_CODES — have to be filled every working day
 *     (hygiene, health_check, temperatures, cleaning, fryer, etc.)
 *   - everything else — aperiodic, counts as «always filled» from
 *     the compliance-ring perspective.
 *
 * For daily journals we compare today's rows against the document's
 * natural roster size (max rows observed on any single day within the
 * 30-day lookback window):
 *
 *   todayCount   = # of `JournalDocumentEntry` rows with `date = today`
 *   expectedCount = max # of rows seen on any single prior day within
 *                   the last 30 days (hygiene → # of employees,
 *                   cold-equipment → # of fridges, cleaning → # of
 *                   procedures, etc.)
 *   documentFilled = expectedCount === 0
 *                      ? todayCount > 0       // brand-new doc, any row counts
 *                      : todayCount >= expectedCount
 *
 * The template is considered filled today iff there's at least one
 * active document that covers today AND every such document is filled.
 *
 * Legacy `JournalEntry` journals (form-based, no per-day grid concept)
 * stay on the simpler "at least one entry today" rule.
 */


type DayRollup = {
  date: Date;
  count: number;
};

type DocumentRollup = {
  todayCount: number;
  expectedCount: number;
  filled: boolean;
};

/**
 * UTC-midnight of `now`'s calendar date. Entries are stored with their
 * `date` field at UTC-midnight (see /api/journal-documents/[id]/entries
 * — `new Date("YYYY-MM-DD")` parses as UTC midnight). We must compare
 * against UTC-today, otherwise a server that runs in a non-UTC
 * timezone produces a date-key off by one day.
 */
function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

async function rollupDocumentForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<DocumentRollup> {
  const lookbackStart = new Date(todayStart);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 30);

  const entries = await db.journalDocumentEntry.findMany({
    where: {
      documentId,
      date: { gte: lookbackStart, lt: todayEnd },
    },
    select: { date: true },
  });

  const byDay = new Map<string, number>();
  for (const entry of entries) {
    const dayKey = entry.date.toISOString().slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }

  const todayKey = todayStart.toISOString().slice(0, 10);
  const todayCount = byDay.get(todayKey) ?? 0;

  // Use the most-recent prior day with any entries as the "expected"
  // roster size. This reflects the current roster (e.g. if an employee
  // was removed yesterday, expected drops right away) while skipping
  // weekend gaps and empty days. Max-over-30-days was too rigid — one
  // unusually-large prior day would keep today "not filled" forever.
  const priorDayKeys = [...byDay.keys()]
    .filter((dayKey) => dayKey !== todayKey)
    .sort();
  let expectedCount = 0;
  for (let i = priorDayKeys.length - 1; i >= 0; i--) {
    const count = byDay.get(priorDayKeys[i]) ?? 0;
    if (count > 0) {
      expectedCount = count;
      break;
    }
  }

  // No history → one entry is enough (first day of a brand-new document).
  if (expectedCount === 0) {
    return { todayCount, expectedCount: 0, filled: todayCount > 0 };
  }

  return {
    todayCount,
    expectedCount,
    filled: todayCount >= expectedCount,
  };
}

async function isDocumentFilledForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<boolean> {
  const rollup = await rollupDocumentForDay(documentId, todayStart, todayEnd);
  return rollup.filled;
}

/**
 * Per-template rollup for daily journals that store ONE entry per date
 * but pack many sub-values inside `entry.data`. Counting entries alone
 * would mark «1 entry = filled» even if only 1 fridge out of 10 had a
 * temperature recorded. We look inside `entry.data` and compare the
 * count of non-null sub-values to the document's configured roster.
 *
 * Returns null for template codes that don't need the deep inspection
 * (hygiene, health_check, fryer_oil, uv_lamp_runtime,
 * cleaning_ventilation_checklist), letting the caller fall back to the
 * entry-count rollup.
 */
async function rollupEntryDataDocumentForDay(
  templateCode: string,
  documentId: string,
  config: unknown,
  todayStart: Date,
  todayEnd: Date
): Promise<DocumentRollup | null> {
  if (!config || typeof config !== "object") return null;
  const cfg = config as Record<string, unknown>;

  if (templateCode === "cold_equipment_control") {
    // data = { temperatures: { equipmentId: number|null } }
    const equipment = Array.isArray(cfg.equipment) ? cfg.equipment : [];
    const equipmentIds = equipment
      .map((item) => (item as { id?: string })?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const expectedCount = equipmentIds.length;
    if (expectedCount === 0) {
      return { todayCount: 0, expectedCount: 0, filled: false };
    }
    const entries = await db.journalDocumentEntry.findMany({
      where: { documentId, date: { gte: todayStart, lt: todayEnd } },
      select: { data: true },
    });
    const recordedIds = new Set<string>();
    for (const entry of entries) {
      const temps =
        (entry.data as { temperatures?: Record<string, unknown> } | null)
          ?.temperatures;
      if (!temps || typeof temps !== "object") continue;
      for (const [equipId, value] of Object.entries(temps)) {
        if (value !== null && value !== undefined && value !== "") {
          recordedIds.add(equipId);
        }
      }
    }
    const todayCount = equipmentIds.filter((id) => recordedIds.has(id)).length;
    return {
      todayCount,
      expectedCount,
      filled: todayCount >= expectedCount,
    };
  }

  if (templateCode === "cleaning_ventilation_checklist") {
    // data.procedures = { [procedureId]: time[] } — array of applied times.
    // Expected = sum over enabled procedures of their scheduled times.length.
    type Procedure = { id?: string; enabled?: boolean; times?: string[] };
    const procedures = Array.isArray(cfg.procedures)
      ? (cfg.procedures as Procedure[])
      : [];
    const enabled = procedures.filter((p) => p?.enabled && p.id);
    const perProc = new Map<string, number>();
    let expectedCount = 0;
    for (const p of enabled) {
      const slots = Array.isArray(p.times) ? p.times.filter(Boolean).length : 0;
      if (slots === 0) continue;
      perProc.set(p.id as string, slots);
      expectedCount += slots;
    }
    if (expectedCount === 0) {
      return { todayCount: 0, expectedCount: 0, filled: false };
    }
    const entries = await db.journalDocumentEntry.findMany({
      where: { documentId, date: { gte: todayStart, lt: todayEnd } },
      select: { data: true },
    });
    let todayCount = 0;
    for (const [procId, expected] of perProc.entries()) {
      let actualForProc = 0;
      for (const entry of entries) {
        const data = entry.data as { procedures?: Record<string, unknown> } | null;
        const raw = data?.procedures?.[procId];
        if (!Array.isArray(raw)) continue;
        const filled = raw.filter(
          (t) => typeof t === "string" && t !== "" && t !== "00:00"
        ).length;
        actualForProc = Math.max(actualForProc, filled);
      }
      todayCount += Math.min(actualForProc, expected);
    }
    return {
      todayCount,
      expectedCount,
      filled: todayCount >= expectedCount,
    };
  }

  if (templateCode === "climate_control") {
    // data = { measurements: { roomId: { time: { temperature?, humidity? } } } }
    const rooms = Array.isArray(cfg.rooms) ? cfg.rooms : [];
    const controlTimes = Array.isArray(cfg.controlTimes) ? cfg.controlTimes : [];
    type ClimateRoom = {
      id?: string;
      temperature?: { enabled?: boolean };
      humidity?: { enabled?: boolean };
    };
    let expectedCount = 0;
    const expectedSlots: Array<{ roomId: string; time: string; kind: "temperature" | "humidity" }> = [];
    for (const raw of rooms) {
      const room = raw as ClimateRoom;
      const roomId = room?.id;
      if (!roomId) continue;
      for (const rawTime of controlTimes) {
        const time = typeof rawTime === "string" ? rawTime : null;
        if (!time) continue;
        if (room.temperature?.enabled) {
          expectedSlots.push({ roomId, time, kind: "temperature" });
          expectedCount += 1;
        }
        if (room.humidity?.enabled) {
          expectedSlots.push({ roomId, time, kind: "humidity" });
          expectedCount += 1;
        }
      }
    }
    if (expectedCount === 0) {
      return { todayCount: 0, expectedCount: 0, filled: false };
    }
    const entries = await db.journalDocumentEntry.findMany({
      where: { documentId, date: { gte: todayStart, lt: todayEnd } },
      select: { data: true },
    });
    let todayCount = 0;
    for (const { roomId, time, kind } of expectedSlots) {
      for (const entry of entries) {
        const measurements = (
          entry.data as {
            measurements?: Record<string, Record<string, Record<string, unknown>>>;
          } | null
        )?.measurements;
        const value = measurements?.[roomId]?.[time]?.[kind];
        if (value !== null && value !== undefined && value !== "") {
          todayCount += 1;
          break;
        }
      }
    }
    return {
      todayCount,
      expectedCount,
      filled: todayCount >= expectedCount,
    };
  }

  return null;
}

/**
 * Per-template-code rollup for journals that store rows inside
 * `JournalDocument.config` instead of `JournalDocumentEntry`. Returns
 * null if the template isn't recognized — callers then fall back to
 * the entry-based rollup or treat the template as aperiodic.
 */
function rollupConfigDocumentForDay(
  templateCode: string,
  config: unknown,
  todayKey: string
): DocumentRollup | null {
  if (!config || typeof config !== "object") return null;
  const cfg = config as Record<string, unknown>;

  if (templateCode === "cleaning") {
    // matrix[roomId][dateKey] — one mark per room per day. Expected
    // count = # of rooms; todayCount = rooms with a non-empty mark
    // for today. Skip-weekends documents only count weekdays; here
    // we just check "has any value" because the room list is finite.
    const matrix =
      cfg.matrix && typeof cfg.matrix === "object"
        ? (cfg.matrix as Record<string, Record<string, unknown>>)
        : {};
    const rooms = Array.isArray(cfg.rooms) ? cfg.rooms : [];
    let todayCount = 0;
    for (const room of rooms) {
      const roomId = (room as { id?: string })?.id;
      if (!roomId) continue;
      const cell = matrix[roomId]?.[todayKey];
      if (cell !== undefined && cell !== "" && cell !== null) {
        todayCount += 1;
      }
    }
    const expectedCount = rooms.length;
    if (expectedCount === 0) {
      return { todayCount, expectedCount: 0, filled: todayCount > 0 };
    }
    return {
      todayCount,
      expectedCount,
      filled: todayCount >= expectedCount,
    };
  }

  if (templateCode === "finished_product" || templateCode === "perishable_rejection") {
    // Each row is an aperiodic event inspection (a batch, a delivery).
    // No fixed roster — we can only say "has any row for today".
    const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
    const dateField =
      templateCode === "finished_product" ? "productionDateTime" : "arrivalDate";
    let todayCount = 0;
    for (const row of rows) {
      const raw = (row as Record<string, unknown>)[dateField];
      if (typeof raw !== "string") continue;
      if (raw.slice(0, 10) === todayKey) todayCount += 1;
    }
    return {
      todayCount,
      expectedCount: todayCount > 0 ? todayCount : 1,
      filled: todayCount > 0,
    };
  }

  return null;
}

/**
 * Returns the set of JournalTemplate IDs considered "filled today"
 * (organization-scoped). Aperiodic journals (not in
 * `DAILY_JOURNAL_CODES` and not in `CONFIG_DAILY_CODES`) are always
 * treated as filled and returned whenever the caller provides their
 * template codes via `allTemplates`. Daily journals have their
 * filled-ness computed from either `JournalDocumentEntry` rows
 * (DAILY_JOURNAL_CODES) or inline config rows (CONFIG_DAILY_CODES)
 * — see module-level docstring for the exact rules.
 */
export async function getTemplatesFilledToday(
  organizationId: string,
  now: Date = new Date(),
  allTemplates?: Array<{ id: string; code: string }>
): Promise<Set<string>> {
  const todayStart = utcDayStart(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const lookbackStart = new Date(todayStart);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 30);

  const [legacyEntries, activeDocuments] = await Promise.all([
    db.journalEntry.findMany({
      where: {
        organizationId,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { templateId: true },
      distinct: ["templateId"],
    }),
    db.journalDocument.findMany({
      where: {
        organizationId,
        status: "active",
        dateFrom: { lte: todayStart },
        dateTo: { gte: todayStart },
      },
      select: {
        id: true,
        templateId: true,
        config: true,
        template: { select: { code: true } },
      },
    }),
  ]);

  const filled = new Set<string>();
  for (const entry of legacyEntries) filled.add(entry.templateId);

  // Aperiodic journals are always considered filled — there's nothing
  // to do today unless an event (accident, complaint…) happens.
  if (allTemplates) {
    for (const tpl of allTemplates) {
      if (!DAILY_JOURNAL_CODES.has(tpl.code) && !CONFIG_DAILY_CODES.has(tpl.code)) {
        filled.add(tpl.id);
      }
    }
  }

  const todayKey = todayStart.toISOString().slice(0, 10);

  // Config-stored daily journals — cleaning, finished_product, perishable.
  // These don't write JournalDocumentEntry rows, so we inspect the
  // document's `config` JSON directly.
  const configDocs = activeDocuments.filter((doc) =>
    CONFIG_DAILY_CODES.has(doc.template.code)
  );
  const configDocsByTemplate = new Map<string, boolean[]>();
  for (const doc of configDocs) {
    const rollup = rollupConfigDocumentForDay(
      doc.template.code,
      doc.config,
      todayKey
    );
    const list = configDocsByTemplate.get(doc.templateId) ?? [];
    list.push(rollup?.filled ?? false);
    configDocsByTemplate.set(doc.templateId, list);
  }
  for (const [templateId, results] of configDocsByTemplate.entries()) {
    if (results.length > 0 && results.every((ok) => ok)) {
      filled.add(templateId);
    }
  }

  // Templates that pack many sub-values into `entry.data` need
  // per-template inspection. Handle them one-by-one and add to `filled`.
  const deepInspectCodes = new Set([
    "cold_equipment_control",
    "climate_control",
    "cleaning_ventilation_checklist",
  ]);
  const deepDocs = activeDocuments.filter((doc) =>
    deepInspectCodes.has(doc.template.code)
  );
  if (deepDocs.length > 0) {
    const deepResults = new Map<string, boolean[]>();
    await Promise.all(
      deepDocs.map(async (doc) => {
        const rollup = await rollupEntryDataDocumentForDay(
          doc.template.code,
          doc.id,
          doc.config,
          todayStart,
          todayEnd
        );
        const ok = rollup?.filled ?? false;
        const list = deepResults.get(doc.templateId) ?? [];
        list.push(ok);
        deepResults.set(doc.templateId, list);
      })
    );
    for (const [templateId, results] of deepResults.entries()) {
      if (results.length > 0 && results.every((ok) => ok)) {
        filled.add(templateId);
      }
    }
  }

  const dailyDocs = activeDocuments.filter(
    (doc) =>
      DAILY_JOURNAL_CODES.has(doc.template.code) &&
      !deepInspectCodes.has(doc.template.code)
  );
  if (dailyDocs.length === 0) return filled;

  // Single grouped query instead of N per-document queries. Pulls all
  // 30-day rollup counts at once so the dashboard stays snappy even
  // with many daily documents.
  const dailyDocIds = dailyDocs.map((d) => d.id);
  const rollupRows = await db.journalDocumentEntry.groupBy({
    by: ["documentId", "date"],
    where: {
      documentId: { in: dailyDocIds },
      date: { gte: lookbackStart, lt: todayEnd },
    },
    _count: { _all: true },
  });

  // Group by documentId → Map<dayKey, count>
  const byDocument = new Map<string, Map<string, number>>();
  for (const row of rollupRows) {
    const dayKey = row.date.toISOString().slice(0, 10);
    let docMap = byDocument.get(row.documentId);
    if (!docMap) {
      docMap = new Map();
      byDocument.set(row.documentId, docMap);
    }
    docMap.set(dayKey, row._count._all);
  }

  function documentFilled(documentId: string): boolean {
    const byDay = byDocument.get(documentId) ?? new Map();
    const todayCount = byDay.get(todayKey) ?? 0;
    if (todayCount === 0) return false;

    const priorDayKeys = [...byDay.keys()]
      .filter((k) => k !== todayKey)
      .sort();
    for (let i = priorDayKeys.length - 1; i >= 0; i--) {
      const count = byDay.get(priorDayKeys[i]) ?? 0;
      if (count > 0) return todayCount >= count;
    }
    return true; // no history → any entry counts
  }

  const documentsByTemplate = new Map<string, string[]>();
  for (const doc of dailyDocs) {
    const list = documentsByTemplate.get(doc.templateId) ?? [];
    list.push(doc.id);
    documentsByTemplate.set(doc.templateId, list);
  }

  for (const [templateId, docIds] of documentsByTemplate.entries()) {
    if (docIds.length > 0 && docIds.every(documentFilled)) {
      filled.add(templateId);
    }
  }

  return filled;
}

/**
 * Single-template check. Same semantics as `getTemplatesFilledToday`.
 * Returns `true` for aperiodic templates (identified by `templateCode`)
 * without hitting the database beyond the legacy-entry lookup.
 */
export async function isTemplateFilledToday(
  organizationId: string,
  templateId: string,
  templateCode: string | null = null,
  now: Date = new Date()
): Promise<boolean> {
  const summary = await getTemplateTodaySummary(
    organizationId,
    templateId,
    templateCode,
    now
  );
  return summary.filled;
}

export type TemplateTodaySummary = {
  filled: boolean;
  /** True when the template has no daily obligation. UI may want to hide
   * progress bars in that case. */
  aperiodic: boolean;
  /** Sum of `JournalDocumentEntry` rows across all active documents for
   * today (across the template). 0 when only legacy entries exist. */
  todayCount: number;
  /** Sum of expected rows across all active documents for today. 0 when
   * the template has no documents (or all are brand-new without history). */
  expectedCount: number;
  /** True when there isn't a single active `JournalDocument` covering
   * today — the user has nothing to fill into and needs to create one. */
  noActiveDocument: boolean;
};

/**
 * Detailed per-template summary for today. Powers the per-journal banner
 * — the banner uses `todayCount`/`expectedCount` to render «X из Y
 * строк за сегодня заполнено».
 */
export async function getTemplateTodaySummary(
  organizationId: string,
  templateId: string,
  templateCode: string | null = null,
  now: Date = new Date()
): Promise<TemplateTodaySummary> {
  const todayStart = utcDayStart(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // Aperiodic journals are treated as filled — no daily obligation.
  if (
    templateCode &&
    !DAILY_JOURNAL_CODES.has(templateCode) &&
    !CONFIG_DAILY_CODES.has(templateCode)
  ) {
    return {
      filled: true,
      aperiodic: true,
      todayCount: 0,
      expectedCount: 0,
      noActiveDocument: false,
    };
  }

  const [legacyCount, activeDocuments] = await Promise.all([
    db.journalEntry.count({
      where: {
        organizationId,
        templateId,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    db.journalDocument.findMany({
      where: {
        organizationId,
        templateId,
        status: "active",
        dateFrom: { lte: todayStart },
        dateTo: { gte: todayStart },
      },
      select: { id: true, config: true },
    }),
  ]);

  if (legacyCount > 0) {
    return {
      filled: true,
      aperiodic: false,
      todayCount: legacyCount,
      expectedCount: legacyCount,
      noActiveDocument: false,
    };
  }
  if (activeDocuments.length === 0) {
    return {
      filled: false,
      aperiodic: false,
      todayCount: 0,
      expectedCount: 0,
      noActiveDocument: true,
    };
  }

  // Config-stored journals — inspect the document config directly.
  if (templateCode && CONFIG_DAILY_CODES.has(templateCode)) {
    const todayKey = todayStart.toISOString().slice(0, 10);
    const configRollups = activeDocuments.map(
      (doc) =>
        rollupConfigDocumentForDay(templateCode, doc.config, todayKey) ?? {
          todayCount: 0,
          expectedCount: 0,
          filled: false,
        }
    );
    const todayCount = configRollups.reduce((sum, r) => sum + r.todayCount, 0);
    const expectedCount = configRollups.reduce(
      (sum, r) => sum + r.expectedCount,
      0
    );
    const filled = configRollups.every((r) => r.filled);
    return {
      filled,
      aperiodic: false,
      todayCount,
      expectedCount,
      noActiveDocument: false,
    };
  }

  const rollups = await Promise.all(
    activeDocuments.map(async (doc) => {
      // Templates with packed entry.data (cold_equipment, climate) need
      // per-template inspection — counting entries isn't enough.
      const deep = await rollupEntryDataDocumentForDay(
        templateCode ?? "",
        doc.id,
        doc.config,
        todayStart,
        todayEnd
      );
      if (deep) return deep;
      return rollupDocumentForDay(doc.id, todayStart, todayEnd);
    })
  );

  const todayCount = rollups.reduce((sum, r) => sum + r.todayCount, 0);
  const expectedCount = rollups.reduce((sum, r) => sum + r.expectedCount, 0);
  const filled = rollups.every((r) => r.filled);

  return {
    filled,
    aperiodic: false,
    todayCount,
    expectedCount,
    noActiveDocument: false,
  };
}

// Kept for future consumers (e.g. analytics) — intentionally unused now.
export type { DayRollup };
