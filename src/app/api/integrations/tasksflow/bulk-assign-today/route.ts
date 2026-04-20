import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { db } from "@/lib/db";
import {
  TasksFlowError,
  tasksflowClientFor,
} from "@/lib/tasksflow-client";
import { listAdapters } from "@/lib/tasksflow-adapters";
import {
  ALL_DAILY_JOURNAL_CODES,
} from "@/lib/daily-journal-codes";
import { getTemplatesFilledToday } from "@/lib/today-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Отправить всем на заполнение» — one-click fan-out that creates a
 * TasksFlow task for every unfilled daily journal for every employee
 * that isn't yet linked to a TF task on today's document.
 *
 *   POST /api/integrations/tasksflow/bulk-assign-today
 *   Auth: manager/head_chef session
 *   Body: {}
 *
 * Response:
 *   {
 *     created: N,        // TF tasks actually created
 *     alreadyLinked: N,  // rows that already had a TF task
 *     skipped: N,        // rows skipped (no TF user link for the worker)
 *     errors: N,         // TF API failures — partial success still commits
 *     byJournal: [{label, created, alreadyLinked, skipped, errors}]
 *   }
 *
 * Idempotent — calling twice in a row yields the second call as all
 * alreadyLinked. That's the whole point of «одним нажатием»: manager
 * taps the button whenever they want without worrying about duplicates.
 */

type JournalReport = {
  code: string;
  label: string;
  documentId: string | null;
  documentTitle: string | null;
  created: number;
  alreadyLinked: number;
  skipped: number;
  errors: number;
  skipReason?: string;
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFullWorkspaceAccess({ role: session.user.role, isRoot: session.user.isRoot })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const organizationId = getActiveOrgId(session);

  const integration = await db.tasksFlowIntegration.findFirst({
    where: { organizationId, enabled: true },
  });
  if (!integration) {
    return NextResponse.json(
      {
        error:
          "Интеграция с TasksFlow не настроена. Подключите её на странице настроек.",
      },
      { status: 400 }
    );
  }

  // Which daily journals are NOT filled today? Only those get tasks —
  // aperiodic and already-green journals are left alone.
  const [templates, org] = await Promise.all([
    db.journalTemplate.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { disabledJournalCodes: true },
    }),
  ]);
  const disabledRaw = (org?.disabledJournalCodes ?? []) as unknown;
  const disabledCodes = new Set<string>(
    Array.isArray(disabledRaw)
      ? disabledRaw.filter((v): v is string => typeof v === "string")
      : []
  );
  const filledTemplateIds = await getTemplatesFilledToday(
    organizationId,
    new Date(),
    templates,
    disabledCodes
  );

  // Daily journals that are ACTIVE (not disabled), are DAILY (not
  // aperiodic), and are NOT yet filled today.
  const targetTemplates = templates.filter(
    (t) =>
      ALL_DAILY_JOURNAL_CODES.has(t.code) &&
      !disabledCodes.has(t.code) &&
      !filledTemplateIds.has(t.id)
  );

  if (targetTemplates.length === 0) {
    return NextResponse.json({
      created: 0,
      alreadyLinked: 0,
      skipped: 0,
      errors: 0,
      byJournal: [],
      message: "Все ежедневные журналы за сегодня уже заполнены.",
    });
  }

  const adapters = await listAdapters();
  const adapterByCode = new Map(adapters.map((a) => [a.meta.templateCode, a]));
  const client = tasksflowClientFor(integration);
  const reports: JournalReport[] = [];
  const baseUrl = new URL(request.url).origin;

  // Pre-load the org's TF user-link table once — hot loop below does
  // per-worker lookups against this in-memory map.
  const userLinks = await db.tasksFlowUserLink.findMany({
    where: { integrationId: integration.id, tasksflowUserId: { not: null } },
    select: { wesetupUserId: true, tasksflowUserId: true },
  });
  const tfUserIdByWesetup = new Map<string, number>();
  for (const link of userLinks) {
    if (link.tasksflowUserId !== null) {
      tfUserIdByWesetup.set(link.wesetupUserId, link.tasksflowUserId);
    }
  }

  for (const tpl of targetTemplates) {
    const report: JournalReport = {
      code: tpl.code,
      label: tpl.name,
      documentId: null,
      documentTitle: null,
      created: 0,
      alreadyLinked: 0,
      skipped: 0,
      errors: 0,
    };

    const adapter = adapterByCode.get(tpl.code);
    if (!adapter) {
      report.skipReason = "Адаптер не зарегистрирован";
      reports.push(report);
      continue;
    }

    // First active document covering today.
    const doc = await db.journalDocument.findFirst({
      where: {
        organizationId,
        status: "active",
        template: { code: tpl.code },
        dateFrom: { lte: new Date() },
        dateTo: { gte: new Date() },
      },
      orderBy: { dateFrom: "desc" },
    });
    if (!doc) {
      report.skipReason = "Нет активного документа на сегодня";
      reports.push(report);
      continue;
    }
    report.documentId = doc.id;
    report.documentTitle = doc.title;

    // Adapter rows + already-linked set for this doc.
    let adapterDocs;
    try {
      adapterDocs = await adapter.listDocumentsForOrg(organizationId);
    } catch (err) {
      console.error(
        `[bulk-assign-today] ${tpl.code} listDocumentsForOrg failed`,
        err
      );
      report.skipReason = "Ошибка адаптера";
      reports.push(report);
      continue;
    }
    const adapterDoc = adapterDocs.find((d) => d.documentId === doc.id);
    if (!adapterDoc || adapterDoc.rows.length === 0) {
      report.skipReason = "У журнала нет строк для назначения";
      reports.push(report);
      continue;
    }

    const existingLinks = await db.tasksFlowTaskLink.findMany({
      where: {
        integrationId: integration.id,
        journalDocumentId: doc.id,
      },
      select: { rowKey: true },
    });
    const takenRowKeys = new Set(existingLinks.map((l) => l.rowKey));

    for (const row of adapterDoc.rows) {
      if (takenRowKeys.has(row.rowKey)) {
        report.alreadyLinked += 1;
        continue;
      }
      if (!row.responsibleUserId) {
        report.skipped += 1;
        continue;
      }
      const tfUserId = tfUserIdByWesetup.get(row.responsibleUserId);
      if (!tfUserId) {
        report.skipped += 1;
        continue;
      }

      const title = adapter.titleForRow?.(row, adapterDoc) ?? row.label;
      const description = adapter.descriptionForRow?.(row, adapterDoc) ?? "";
      const schedule = adapter.scheduleForRow(row, adapterDoc);
      const category = `WeSetup · ${tpl.name}`;

      let created;
      try {
        created = await client.createTask({
          title,
          workerId: tfUserId,
          requiresPhoto: false,
          isRecurring: true,
          weekDays: schedule.weekDays,
          monthDay: schedule.monthDay ?? null,
          category,
          description,
        });
      } catch (err) {
        console.error(
          `[bulk-assign-today] createTask failed`,
          tpl.code,
          row.rowKey,
          err
        );
        report.errors += 1;
        continue;
      }

      const journalLink = JSON.stringify({
        kind: `wesetup-${tpl.code}`,
        baseUrl,
        integrationId: integration.id,
        documentId: doc.id,
        rowKey: row.rowKey,
        label: title,
        isFreeText: false,
      });
      try {
        await client.updateTask(created.id, { journalLink } as never);
      } catch (err) {
        if (err instanceof TasksFlowError) {
          console.warn(
            `[bulk-assign-today] journalLink update non-fatal`,
            err.status,
            err.message
          );
        } else {
          console.error(`[bulk-assign-today] journalLink update failed`, err);
        }
      }

      await db.tasksFlowTaskLink.create({
        data: {
          integrationId: integration.id,
          journalCode: tpl.code,
          journalDocumentId: doc.id,
          rowKey: row.rowKey,
          tasksflowTaskId: created.id,
          remoteStatus: created.isCompleted ? "completed" : "active",
          lastDirection: "push",
        },
      });
      report.created += 1;
      takenRowKeys.add(row.rowKey);
    }

    reports.push(report);
  }

  const summary = reports.reduce(
    (acc, r) => {
      acc.created += r.created;
      acc.alreadyLinked += r.alreadyLinked;
      acc.skipped += r.skipped;
      acc.errors += r.errors;
      return acc;
    },
    { created: 0, alreadyLinked: 0, skipped: 0, errors: 0 }
  );

  if (summary.created > 0 || summary.alreadyLinked > 0 || summary.errors > 0) {
    await db.tasksFlowIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });
  }

  return NextResponse.json({ ...summary, byJournal: reports });
}
