import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/integration-crypto";
import {
  TasksFlowError,
  tasksflowClientFor,
} from "@/lib/tasksflow-client";
import { getAdapter } from "@/lib/tasksflow-adapters";
import { toDateKey } from "@/lib/hygiene-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic bind: TasksFlow asks WeSetup to attach a journal entity to a
 * remote task. Two flavours:
 *
 *   1. **Adapter row** — `rowKey` is provided. We resolve it via the
 *      registered adapter (e.g. cleaning's responsiblePair). Worker is
 *      derived from row.responsibleUserId. Title/schedule/description
 *      come from the adapter.
 *
 *   2. **Free-text task** — no `rowKey`. The admin types a title +
 *      picks a worker. We mint a synthetic `rowKey = freetask:<uuid>`
 *      and store everything in the TaskLink. On completion the
 *      generic handler appends a JournalDocumentEntry on the bound
 *      document so the journal shows the audit trail.
 *
 * Auth: Bearer key resolved against integration's encrypted secret.
 */
const bodySchema = z
  .object({
    journalCode: z.string().min(1),
    documentId: z.string().min(1),
    rowKey: z.string().optional(),
    title: z.string().trim().max(255).optional(),
    workerUserId: z.string().optional(),
    weekDays: z.array(z.number().int().min(0).max(6)).optional(),
  })
  .refine(
    (v) => Boolean(v.rowKey) || (Boolean(v.workerUserId) && Boolean(v.title)),
    {
      message:
        "Нужен либо rowKey (адаптер), либо workerUserId+title (свободная задача)",
    }
  );

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(tfk_[A-Za-z0-9_-]+)$/.exec(auth);
  if (!match) {
    return NextResponse.json({ error: "Missing Bearer key" }, { status: 401 });
  }
  const presented = match[1];
  const prefix = presented.slice(0, 12);

  const candidates = await db.tasksFlowIntegration.findMany({
    where: { enabled: true, apiKeyPrefix: prefix },
  });
  let integration: (typeof candidates)[number] | null = null;
  for (const cand of candidates) {
    try {
      if (decryptSecret(cand.apiKeyEncrypted) === presented) {
        integration = cand;
        break;
      }
    } catch {
      /* skip */
    }
  }
  if (!integration) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Document must exist + belong to this org + be the right template.
  const doc = await db.journalDocument.findUnique({
    where: { id: payload.documentId },
    include: { template: true },
  });
  if (
    !doc ||
    doc.organizationId !== integration.organizationId ||
    doc.template.code !== payload.journalCode
  ) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (doc.status === "closed") {
    return NextResponse.json({ error: "Document already closed" }, { status: 400 });
  }

  const adapter = getAdapter(payload.journalCode);
  const isFreeText = !payload.rowKey;

  let title: string;
  let description: string | undefined;
  let weekDays: number[];
  let monthDay: number | null;
  let workerWeSetupId: string;
  let storedRowKey: string;

  if (isFreeText) {
    // Free-text path — no adapter row. Validate the worker exists +
    // is linked to TasksFlow. Title required.
    if (!payload.workerUserId || !payload.title) {
      return NextResponse.json(
        { error: "title и workerUserId обязательны для свободной задачи" },
        { status: 400 }
      );
    }
    const worker = await db.user.findFirst({
      where: {
        id: payload.workerUserId,
        organizationId: integration.organizationId,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!worker) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }
    workerWeSetupId = worker.id;
    title = payload.title;
    description = `Свободная задача из TasksFlow\nЖурнал: ${doc.template.name ?? payload.journalCode}\nДокумент: ${doc.title}`;
    weekDays =
      payload.weekDays && payload.weekDays.length > 0
        ? payload.weekDays
        : [0, 1, 2, 3, 4, 5, 6];
    monthDay = null;
    storedRowKey = `freetask:${crypto.randomBytes(8).toString("base64url")}`;
  } else {
    // Adapter path — must have a registered adapter for this journal.
    if (!adapter) {
      return NextResponse.json(
        {
          error: `Журнал «${payload.journalCode}» не имеет адаптера. Используйте свободную задачу.`,
        },
        { status: 400 }
      );
    }
    const adapterDocs = await adapter.listDocumentsForOrg(
      integration.organizationId
    );
    const adapterDoc = adapterDocs.find((d) => d.documentId === doc.id);
    const row = adapterDoc?.rows.find((r) => r.rowKey === payload.rowKey);
    if (!adapterDoc || !row) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    if (!row.responsibleUserId) {
      return NextResponse.json(
        { error: "У этой строки журнала не назначен ответственный" },
        { status: 400 }
      );
    }
    workerWeSetupId = row.responsibleUserId;
    title =
      payload.title?.trim() ||
      adapter.titleForRow?.(row, adapterDoc) ||
      row.label;
    description = adapter.descriptionForRow?.(row, adapterDoc);
    const sched = adapter.scheduleForRow(row, adapterDoc);
    weekDays = sched.weekDays;
    monthDay = sched.monthDay ?? null;
    storedRowKey = payload.rowKey!;
  }

  const userLink = await db.tasksFlowUserLink.findFirst({
    where: {
      integrationId: integration.id,
      wesetupUserId: workerWeSetupId,
    },
  });
  if (!userLink?.tasksflowUserId) {
    return NextResponse.json(
      {
        error:
          "Сотрудник ещё не связан с TasksFlow. Откройте /settings/integrations/tasksflow и нажмите «Синхронизировать».",
      },
      { status: 400 }
    );
  }

  // Idempotent: if (integration, doc, rowKey) already linked → reuse.
  const existing = await db.tasksFlowTaskLink.findFirst({
    where: {
      integrationId: integration.id,
      journalDocumentId: doc.id,
      rowKey: storedRowKey,
    },
  });
  if (existing) {
    return NextResponse.json({
      tasksflowTaskId: existing.tasksflowTaskId,
      created: false,
    });
  }

  const journalLink = JSON.stringify({
    kind: `wesetup-${payload.journalCode}`,
    baseUrl: new URL(request.url).origin,
    integrationId: integration.id,
    documentId: doc.id,
    rowKey: storedRowKey,
    label: title,
    isFreeText,
  });

  const client = tasksflowClientFor(integration);
  let created;
  try {
    created = await client.createTask({
      title,
      workerId: userLink.tasksflowUserId,
      requiresPhoto: false,
      isRecurring: true,
      weekDays,
      monthDay,
      category: `WeSetup · ${doc.template.name ?? payload.journalCode}`,
      description: description ?? "",
    });
  } catch (err) {
    if (err instanceof TasksFlowError) {
      return NextResponse.json(
        { error: `TasksFlow ${err.status}: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Не удалось создать задачу в TasksFlow" },
      { status: 502 }
    );
  }
  // Smuggle journalLink so TasksFlow UI can show a chip.
  try {
    await client.updateTask(created.id, { journalLink } as never);
  } catch (err) {
    console.error("[bind-row] journalLink update failed", err);
  }

  await db.tasksFlowTaskLink.create({
    data: {
      integrationId: integration.id,
      journalCode: payload.journalCode,
      journalDocumentId: doc.id,
      rowKey: storedRowKey,
      tasksflowTaskId: created.id,
      remoteStatus: created.isCompleted ? "completed" : "active",
      lastDirection: "push",
    },
  });
  await db.tasksFlowIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json({
    tasksflowTaskId: created.id,
    created: true,
    isFreeText,
    rowKey: storedRowKey,
    todayKey: toDateKey(new Date()),
  });
}
