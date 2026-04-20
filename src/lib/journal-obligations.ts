import { db } from "@/lib/db";
import { ALL_DAILY_JOURNAL_CODES } from "@/lib/daily-journal-codes";
import { getDisabledJournalCodes as loadDisabledJournalCodes } from "@/lib/disabled-journals";
import {
  getAllowedJournalCodes as loadAllowedJournalCodes,
  type JournalAclActor,
} from "@/lib/journal-acl";
import { isDocumentTemplate } from "@/lib/journal-document-helpers";
import { resolveJournalObligationTargetPath } from "@/lib/journal-obligation-links";
import {
  getTemplateTodaySummary as loadTemplateTodaySummary,
  type TemplateTodaySummary,
} from "@/lib/today-compliance";
import { isManagementRole } from "@/lib/user-roles";

const DAILY_OBLIGATION_SOURCE = "daily-journal-sync" as const;
const PHASE_ONE_JOURNAL_RULES: Partial<
  Record<
    string,
    {
      countsAsDaily?: boolean;
      forceEntryTarget?: boolean;
    }
  >
> = {
  incoming_control: {
    countsAsDaily: true,
    forceEntryTarget: true,
  },
};

export type ObligationTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDocument: boolean;
};

export type ObligationRow = {
  organizationId: string;
  userId: string;
  templateId: string;
  journalCode: string;
  kind: "daily-journal";
  dateKey: Date;
  status: "pending" | "done";
  targetPath: string;
  source: "daily-journal-sync";
  dedupeKey: string;
  completedAt: Date | null;
};

export type OpenJournalObligation = {
  id: string;
  journalCode: string;
  targetPath: string;
  template: { name: string; description: string | null };
};

export type ExistingDailyObligation = {
  id: string;
  dedupeKey: string;
  status: "pending" | "done";
  completedAt: Date | null;
};

export type FoundJournalObligation = {
  id: string;
  userId: string;
  targetPath: string;
  openedAt: Date | null;
};

type SummaryRow = {
  userId: string;
  status: "pending" | "done";
};

type ActiveStaffUser = {
  id: string;
  organizationId: string;
};

type UserActor = JournalAclActor;

export type ObligationDeps = {
  getUserActor: (userId: string) => Promise<UserActor>;
  getAllowedJournalCodes: (actor: UserActor) => Promise<string[] | null>;
  getDisabledJournalCodes: (organizationId: string) => Promise<Set<string>>;
  listTemplates: () => Promise<ObligationTemplate[]>;
  getTemplateTodaySummary: (
    organizationId: string,
    templateId: string,
    templateCode: string,
    now: Date
  ) => Promise<TemplateTodaySummary>;
  listExistingDailyObligations: (args: {
    userId: string;
    dateKey: Date;
    source: string;
  }) => Promise<ExistingDailyObligation[]>;
  deleteStaleDailyObligations: (ids: string[]) => Promise<void>;
  saveDailyObligations: (rows: ObligationRow[]) => Promise<ObligationRow[]>;
  listOpenRows: (args: {
    userId: string;
    dateKey: Date;
  }) => Promise<OpenJournalObligation[]>;
  findObligationById: (
    id: string,
    userId: string
  ) => Promise<FoundJournalObligation | null>;
  markOpened: (id: string, userId: string) => Promise<void>;
  listActiveStaffUsers: (
    organizationId: string
  ) => Promise<ActiveStaffUser[]>;
  listSummaryRows: (args: {
    organizationId: string;
    dateKey: Date;
  }) => Promise<SummaryRow[]>;
};

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function dateStamp(dateKey: Date): string {
  return dateKey.toISOString().slice(0, 10);
}

function buildDedupeKey(dateKey: Date, templateCode: string): string {
  return `daily:${dateStamp(dateKey)}:${templateCode}`;
}

function normalizeObligationStatus(status: string): "pending" | "done" {
  return status === "done" ? "done" : "pending";
}

function getPhaseOneJournalRule(templateCode: string) {
  return PHASE_ONE_JOURNAL_RULES[templateCode];
}

function isDailyObligationCode(templateCode: string): boolean {
  return ALL_DAILY_JOURNAL_CODES.has(templateCode) ||
    getPhaseOneJournalRule(templateCode)?.countsAsDaily === true;
}

function usesDocumentTarget(template: ObligationTemplate): boolean {
  if (getPhaseOneJournalRule(template.code)?.forceEntryTarget === true) {
    return false;
  }
  return template.isDocument;
}

function createDefaultDeps(): ObligationDeps {
  return {
    async getUserActor(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isRoot: true },
      });
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      return user;
    },
    getAllowedJournalCodes: loadAllowedJournalCodes,
    getDisabledJournalCodes: loadDisabledJournalCodes,
    async listTemplates() {
      const templates = await db.journalTemplate.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });

      return templates.map((template) => ({
        ...template,
        isDocument: isDocumentTemplate(template.code),
      }));
    },
    getTemplateTodaySummary: loadTemplateTodaySummary,
    async listExistingDailyObligations({ userId, dateKey, source }) {
      const rows = await db.journalObligation.findMany({
        where: {
          userId,
          dateKey,
          source,
        },
        select: {
          id: true,
          dedupeKey: true,
          status: true,
          completedAt: true,
        },
      });

      return rows.map((row) => ({
        ...row,
        status: normalizeObligationStatus(row.status),
      }));
    },
    async deleteStaleDailyObligations(ids) {
      if (ids.length === 0) return;

      await db.journalObligation.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      });
    },
    async saveDailyObligations(rows) {
      if (rows.length === 0) return [];

      return Promise.all(
        rows.map(async (row) => {
          await db.journalObligation.upsert({
            where: {
              userId_dedupeKey: {
                userId: row.userId,
                dedupeKey: row.dedupeKey,
              },
            },
            create: {
              organizationId: row.organizationId,
              userId: row.userId,
              templateId: row.templateId,
              journalCode: row.journalCode,
              kind: row.kind,
              dateKey: row.dateKey,
              status: row.status,
              targetPath: row.targetPath,
              source: row.source,
              dedupeKey: row.dedupeKey,
              completedAt: row.completedAt,
            },
            update: {
              templateId: row.templateId,
              journalCode: row.journalCode,
              status: row.status,
              targetPath: row.targetPath,
              completedAt: row.completedAt,
            },
          });

          return row;
        })
      );
    },
    async listOpenRows({ userId, dateKey }) {
      return db.journalObligation.findMany({
        where: {
          userId,
          dateKey,
          status: "pending",
        },
        select: {
          id: true,
          journalCode: true,
          targetPath: true,
          template: {
            select: {
              name: true,
              description: true,
            },
          },
        },
        orderBy: [{ template: { name: "asc" } }, { createdAt: "asc" }],
      });
    },
    async findObligationById(id, userId) {
      return db.journalObligation.findFirst({
        where: { id, userId },
        select: {
          id: true,
          userId: true,
          targetPath: true,
          openedAt: true,
        },
      });
    },
    async markOpened(id, userId) {
      await db.journalObligation.updateMany({
        where: { id, userId, openedAt: null },
        data: { openedAt: new Date() },
      });
    },
    async listActiveStaffUsers(organizationId) {
      const users = await db.user.findMany({
        where: {
          organizationId,
          isActive: true,
          archivedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          role: true,
          isRoot: true,
        },
      });

      return users
        .filter((user) => !user.isRoot && !isManagementRole(user.role))
        .map((user) => ({
          id: user.id,
          organizationId: user.organizationId,
        }));
    },
    async listSummaryRows({ organizationId, dateKey }) {
      const rows = await db.journalObligation.findMany({
        where: {
          organizationId,
          dateKey,
        },
        select: {
          userId: true,
          status: true,
        },
      });

      return rows.map((row) => ({
        ...row,
        status: normalizeObligationStatus(row.status),
      }));
    },
  };
}

function resolveDeps(overrides?: Partial<ObligationDeps>): ObligationDeps {
  return {
    ...createDefaultDeps(),
    ...overrides,
  };
}

export async function syncDailyJournalObligationsForUser(
  args: { userId: string; organizationId: string; now?: Date },
  overrides?: Partial<ObligationDeps>
): Promise<ObligationRow[]> {
  const deps = resolveDeps(overrides);
  const now = args.now ?? new Date();
  const dateKey = utcDayStart(now);
  const actor = await deps.getUserActor(args.userId);
  const [allowedCodes, disabledCodes, templates, existingRows] = await Promise.all([
    deps.getAllowedJournalCodes(actor),
    deps.getDisabledJournalCodes(args.organizationId),
    deps.listTemplates(),
    deps.listExistingDailyObligations({
      userId: args.userId,
      dateKey,
      source: DAILY_OBLIGATION_SOURCE,
    }),
  ]);
  const existingByDedupeKey = new Map(
    existingRows.map((row) => [row.dedupeKey, row])
  );

  const filteredTemplates = templates.filter((template) => {
    if (!isDailyObligationCode(template.code)) return false;
    if (disabledCodes.has(template.code)) return false;
    if (allowedCodes !== null && !allowedCodes.includes(template.code)) {
      return false;
    }
    return true;
  });

  const rows: ObligationRow[] = [];
  const keepDedupeKeys = new Set<string>();
  for (const template of filteredTemplates) {
    const summary = await deps.getTemplateTodaySummary(
      args.organizationId,
      template.id,
      template.code,
      now
    );
    const isDocumentTarget = usesDocumentTarget(template);

    if (summary.aperiodic) {
      continue;
    }
    const dedupeKey = buildDedupeKey(dateKey, template.code);
    const existing = existingByDedupeKey.get(dedupeKey);
    keepDedupeKeys.add(dedupeKey);
    const completedAt =
      summary.filled && existing?.status === "done" && existing.completedAt
        ? existing.completedAt
        : summary.filled
          ? now
          : null;
    const targetPath = isDocumentTarget
      ? resolveJournalObligationTargetPath({
          journalCode: template.code,
          isDocument: true,
          activeDocumentId: summary.activeDocumentId,
        })
      : resolveJournalObligationTargetPath({
          journalCode: template.code,
          isDocument: false,
          activeDocumentId: null,
        });

    rows.push({
      organizationId: args.organizationId,
      userId: args.userId,
      templateId: template.id,
      journalCode: template.code,
      kind: "daily-journal",
      dateKey,
      status: summary.filled ? "done" : "pending",
      targetPath,
      source: DAILY_OBLIGATION_SOURCE,
      dedupeKey,
      completedAt,
    });
  }

  const staleIds = existingRows
    .filter((row) => !keepDedupeKeys.has(row.dedupeKey))
    .map((row) => row.id);
  await deps.deleteStaleDailyObligations(staleIds);

  return deps.saveDailyObligations(rows);
}

export async function listOpenJournalObligationsForUser(
  userId: string,
  now: Date = new Date(),
  overrides?: Partial<ObligationDeps>
): Promise<OpenJournalObligation[]> {
  const deps = resolveDeps(overrides);
  return deps.listOpenRows({
    userId,
    dateKey: utcDayStart(now),
  });
}

export async function getJournalObligationById(
  id: string,
  userId: string,
  overrides?: Partial<ObligationDeps>
): Promise<FoundJournalObligation | null> {
  const deps = resolveDeps(overrides);
  return deps.findObligationById(id, userId);
}

export async function markJournalObligationOpened(
  id: string,
  userId: string,
  overrides?: Partial<ObligationDeps>
): Promise<void> {
  const deps = resolveDeps(overrides);
  await deps.markOpened(id, userId);
}

export async function syncDailyJournalObligationsForOrganization(
  organizationId: string,
  now: Date = new Date(),
  overrides?: Partial<ObligationDeps>
): Promise<void> {
  const deps = resolveDeps(overrides);
  const users = await deps.listActiveStaffUsers(organizationId);

  await Promise.all(
    users.map((user) =>
      syncDailyJournalObligationsForUser(
        {
          userId: user.id,
          organizationId: user.organizationId,
          now,
        },
        overrides
      )
    )
  );
}

export async function getManagerObligationSummary(
  organizationId: string,
  now: Date = new Date(),
  overrides?: Partial<ObligationDeps>
): Promise<{
  total: number;
  pending: number;
  done: number;
  employeesWithPending: number;
}> {
  const deps = resolveDeps(overrides);
  const rows = await deps.listSummaryRows({
    organizationId,
    dateKey: utcDayStart(now),
  });

  const pending = rows.filter((row) => row.status === "pending").length;
  const done = rows.filter((row) => row.status === "done").length;

  return {
    total: rows.length,
    pending,
    done,
    employeesWithPending: new Set(
      rows.filter((row) => row.status === "pending").map((row) => row.userId)
    ).size,
  };
}
