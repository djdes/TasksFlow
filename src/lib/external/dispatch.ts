import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { reconcileEntryStaffFields } from "@/lib/journal-staff-binding";

export type ExternalEntryInput = {
  employeeId?: string | null;
  date?: string | null;
  data?: unknown;
};

export type DispatchResult =
  | {
      ok: true;
      documentId: string;
      entriesWritten: number;
      createdDocument: boolean;
      templateCode: string;
    }
  | {
      ok: false;
      httpStatus: number;
      error: string;
    };

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function monthRange(d: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from, to };
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

async function pickDefaultEmployeeId(organizationId: string): Promise<string | null> {
  const user = await db.user.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });
  return user?.id ?? null;
}

async function findOrCreateDocument(params: {
  organizationId: string;
  templateId: string;
  templateName: string;
  date: Date;
  createdById: string | null;
}): Promise<{ doc: Awaited<ReturnType<typeof db.journalDocument.findFirst>>; created: boolean }> {
  const { organizationId, templateId, templateName, date, createdById } = params;
  const day = startOfUtcDay(date);

  const existing = await db.journalDocument.findFirst({
    where: {
      organizationId,
      templateId,
      status: "active",
      dateFrom: { lte: day },
      dateTo: { gte: day },
    },
    orderBy: { dateFrom: "desc" },
  });
  if (existing) return { doc: existing, created: false };

  const { from, to } = monthRange(day);
  const created = await db.journalDocument.create({
    data: {
      organizationId,
      templateId,
      title: templateName,
      dateFrom: from,
      dateTo: to,
      status: "active",
      autoFill: false,
      createdById: createdById || undefined,
      config: Prisma.JsonNull,
    },
  });
  return { doc: created, created: true };
}

export async function dispatchExternalEntries(params: {
  organizationId: string;
  journalCode: string;
  entries: ExternalEntryInput[];
}): Promise<DispatchResult> {
  const { organizationId, journalCode } = params;

  if (!journalCode || typeof journalCode !== "string") {
    return { ok: false, httpStatus: 400, error: "journalCode required" };
  }

  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    return { ok: false, httpStatus: 404, error: "organizationId not found" };
  }

  const resolvedCode = resolveJournalCodeAlias(journalCode);
  const template = await db.journalTemplate.findUnique({ where: { code: resolvedCode } });
  if (!template) {
    return { ok: false, httpStatus: 404, error: `template not found: ${resolvedCode}` };
  }

  const entries = Array.isArray(params.entries) ? params.entries : [];
  if (entries.length === 0) {
    return { ok: false, httpStatus: 400, error: "entries array is empty" };
  }

  const fallbackEmployeeId = await pickDefaultEmployeeId(organizationId);

  type Normalized = { employeeId: string; date: Date; data: unknown };
  const normalized: Normalized[] = [];
  const anchorDate = (() => {
    for (const e of entries) {
      if (e?.date) {
        const d = new Date(e.date);
        if (Number.isFinite(d.getTime())) return d;
      }
    }
    return new Date();
  })();

  for (const raw of entries) {
    const employeeId = raw?.employeeId || fallbackEmployeeId;
    if (!employeeId) {
      return {
        ok: false,
        httpStatus: 400,
        error: "employeeId required and no default user found for organization",
      };
    }
    const dateStr = raw?.date ?? anchorDate.toISOString();
    const d = new Date(dateStr);
    if (!Number.isFinite(d.getTime())) {
      return { ok: false, httpStatus: 400, error: `invalid date: ${String(dateStr)}` };
    }
    normalized.push({
      employeeId: String(employeeId),
      date: startOfUtcDay(d),
      data: raw?.data ?? {},
    });
  }

  const employeeIds = [...new Set(normalized.map((e) => e.employeeId))];
  const employees = await db.user.findMany({
    where: { id: { in: employeeIds }, organizationId },
    select: { id: true, name: true, role: true },
  });
  const employeesById = new Map(employees.map((u) => [u.id, u]));
  for (const id of employeeIds) {
    if (!employeesById.has(id)) {
      return { ok: false, httpStatus: 404, error: `employee not found in org: ${id}` };
    }
  }

  const { doc, created } = await findOrCreateDocument({
    organizationId,
    templateId: template.id,
    templateName: template.name,
    date: anchorDate,
    createdById: fallbackEmployeeId,
  });
  if (!doc) {
    return { ok: false, httpStatus: 500, error: "failed to resolve document" };
  }

  const docDateFrom = startOfUtcDay(new Date(doc.dateFrom));
  const docDateTo = startOfUtcDay(new Date(doc.dateTo));

  for (const entry of normalized) {
    if (entry.date < docDateFrom || entry.date > docDateTo) {
      return {
        ok: false,
        httpStatus: 400,
        error: `entry date ${entry.date.toISOString().slice(0, 10)} outside document range`,
      };
    }
  }

  let written = 0;
  await db.$transaction(async (tx) => {
    for (const entry of normalized) {
      const employee = employeesById.get(entry.employeeId)!;
      const reconciled = reconcileEntryStaffFields(entry.data, employee);
      await tx.journalDocumentEntry.upsert({
        where: {
          documentId_employeeId_date: {
            documentId: doc.id,
            employeeId: entry.employeeId,
            date: entry.date,
          },
        },
        update: { data: toPrismaJsonValue(reconciled) },
        create: {
          documentId: doc.id,
          employeeId: entry.employeeId,
          date: entry.date,
          data: toPrismaJsonValue(reconciled),
        },
      });
      written += 1;
    }
  });

  return {
    ok: true,
    documentId: doc.id,
    entriesWritten: written,
    createdDocument: created,
    templateCode: resolvedCode,
  };
}
