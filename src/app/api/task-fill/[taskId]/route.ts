import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyTaskFillToken } from "@/lib/task-fill-token";
import {
  TasksFlowError,
  tasksflowClientFor,
} from "@/lib/tasksflow-client";
import { getAdapter } from "@/lib/tasksflow-adapters";
import { buildCompletionValidator } from "@/lib/tasksflow-adapters/task-form";
import { toDateKey } from "@/lib/hygiene-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submit handler for the public `/task-fill/[taskId]` page.
 *
 *   POST /api/task-fill/<taskId>
 *   Body: { token: "<task-fill-hmac>", values: {...} }
 *
 * Flow:
 *   1. Resolve TaskLink → integration → verify HMAC with
 *      webhookSecret. Wrong/expired token → 401.
 *   2. Pick adapter → validate values through its form schema.
 *   3. Adapter.applyRemoteCompletion writes to journal (upsert for
 *      Entry-based, append/update for config.rows-based).
 *   4. Mark the remote TasksFlow task as isCompleted=true so the
 *      worker's dashboard reflects the done state without manual tap.
 *   5. Bump TaskLink.remoteStatus + completedAt for audit.
 */
const bodySchema = z.object({
  token: z.string().min(10),
  values: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ taskId: string }> }
) {
  const { taskId: taskIdRaw } = await ctx.params;
  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Bad taskId" }, { status: 400 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const link = await db.tasksFlowTaskLink.findFirst({
    where: { tasksflowTaskId: taskId },
    include: { integration: true },
  });
  if (!link) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const verify = verifyTaskFillToken(parsed.token, link.integration.webhookSecret);
  if (!verify.ok || verify.taskId !== taskId) {
    return NextResponse.json(
      { error: `Invalid token (${verify.ok ? "taskId mismatch" : verify.reason})` },
      { status: 401 }
    );
  }

  const adapter = getAdapter(link.journalCode);
  if (!adapter) {
    return NextResponse.json(
      { error: `Журнал «${link.journalCode}» не поддерживается` },
      { status: 400 }
    );
  }

  // Validate values through the adapter's form schema (if any).
  const rawValues = (parsed.values ?? {}) as Record<string, unknown>;
  let sanitized: Record<string, string | number | boolean | null> = {};
  if (adapter.getTaskForm) {
    const schema = await adapter.getTaskForm({
      documentId: link.journalDocumentId,
      rowKey: link.rowKey,
    });
    if (schema) {
      try {
        const validator = buildCompletionValidator(schema);
        sanitized = validator.parse(rawValues) as typeof sanitized;
      } catch (err) {
        if (err instanceof z.ZodError) {
          return NextResponse.json(
            {
              error: `Ошибка валидации: ${err.issues[0]?.message ?? "неизвестно"}`,
            },
            { status: 400 }
          );
        }
        throw err;
      }
    } else {
      sanitized = coerceValues(rawValues);
    }
  } else {
    sanitized = coerceValues(rawValues);
  }

  const todayKey = toDateKey(new Date());
  const applied = await adapter.applyRemoteCompletion({
    documentId: link.journalDocumentId,
    rowKey: link.rowKey,
    completed: true,
    todayKey,
    values: sanitized,
  });

  // Mark the remote task complete + bump TaskLink status so the
  // worker's TasksFlow dashboard refreshes to «выполнено» without
  // the worker having to tap anything else.
  const client = tasksflowClientFor(link.integration);
  try {
    // Be tolerant of «already completed» — TasksFlow returns 400 if
    // photo required (we never set that flag, so unlikely). Other
    // errors are logged but don't fail the write — journal is the
    // source of truth, the TF task state is secondary.
    await client.completeTask(taskId).catch((err) => {
      if (!(err instanceof TasksFlowError)) throw err;
      console.warn(
        "[task-fill] completeTask non-fatal error",
        err.status,
        err.message
      );
    });
  } catch (err) {
    console.error("[task-fill] completeTask crashed", err);
  }

  await db.tasksFlowTaskLink.update({
    where: { id: link.id },
    data: {
      remoteStatus: "completed",
      completedAt: new Date(),
      lastDirection: "pull",
    },
  });

  return NextResponse.json({ ok: true, applied, todayKey });
}

function coerceValues(
  raw: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
    ) {
      out[k] = v;
    }
  }
  return out;
}
