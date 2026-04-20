import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyTaskFillToken } from "@/lib/task-fill-token";
import { getAdapter } from "@/lib/tasksflow-adapters";
import { TaskFillClient } from "./task-fill-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public task-fill page — opened by a TasksFlow worker who tapped
 * «Заполнить журнал» on a journal-bound task. Auth is the
 * HMAC-signed `?token=...` from TasksFlow (see
 * `/api/integrations/tasksflow/task-fill-token`), NOT a WeSetup
 * session — the worker never logged into WeSetup.
 *
 * Renders in a minimal, WeSetup-styled shell without sidebar/header.
 * Form fields come from the registered adapter for this journal.
 * Submit posts to `/api/task-fill/<taskId>` with the same token.
 */
export default async function TaskFillPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ token?: string; return?: string }>;
}) {
  const { taskId: taskIdRaw } = await params;
  const { token, return: returnUrl } = await searchParams;
  const taskId = Number(taskIdRaw);
  if (!Number.isFinite(taskId) || taskId <= 0 || !token) {
    notFound();
  }

  const link = await db.tasksFlowTaskLink.findFirst({
    where: { tasksflowTaskId: taskId },
    include: { integration: true },
  });
  if (!link) notFound();

  const verify = verifyTaskFillToken(token, link.integration.webhookSecret);
  if (!verify.ok) {
    return (
      <TaskFillErrorShell
        title="Ссылка недействительна"
        message={
          verify.reason === "expired"
            ? "Срок жизни ссылки истёк — попросите администратора выслать задачу заново."
            : "Токен повреждён или не подходит к этой задаче."
        }
        returnUrl={returnUrl}
      />
    );
  }

  const adapter = getAdapter(link.journalCode);
  if (!adapter) notFound();

  const [doc, employee, template] = await Promise.all([
    db.journalDocument.findUnique({
      where: { id: link.journalDocumentId },
      select: { id: true, title: true, dateFrom: true, dateTo: true },
    }),
    (async () => {
      // rowKey format is `employee-<userId>` for almost every adapter.
      // Non-employee rowKeys (e.g. cleaning-pair-…) don't have a direct
      // user — we'll fall back to the integration's organization root.
      const m = /^employee-(.+)$/.exec(link.rowKey);
      if (!m) return null;
      return db.user.findUnique({
        where: { id: m[1] },
        select: { id: true, name: true, positionTitle: true },
      });
    })(),
    db.journalTemplate.findFirst({
      where: { code: link.journalCode },
      select: { name: true },
    }),
  ]);
  if (!doc) notFound();

  const form = adapter.getTaskForm
    ? await adapter.getTaskForm({
        documentId: link.journalDocumentId,
        rowKey: link.rowKey,
      })
    : null;

  return (
    <TaskFillClient
      taskId={taskId}
      token={token}
      returnUrl={returnUrl ?? null}
      journalLabel={template?.name ?? link.journalCode}
      documentTitle={doc.title}
      employeeName={employee?.name ?? null}
      employeePositionTitle={employee?.positionTitle ?? null}
      form={form}
      alreadyCompleted={link.remoteStatus === "completed"}
    />
  );
}

function TaskFillErrorShell({
  title,
  message,
  returnUrl,
}: {
  title: string;
  message: string;
  returnUrl: string | undefined;
}) {
  return (
    <main className="min-h-screen bg-[#fafbff] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#ececf4] bg-white p-8 text-center shadow-[0_20px_60px_-30px_rgba(11,16,36,0.2)]">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#fff4f2] text-[#a13a32] text-2xl">
          !
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0b1024]">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6f7282]">
          {message}
        </p>
        {returnUrl ? (
          <a
            href={returnUrl}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0]"
          >
            Вернуться в TasksFlow
          </a>
        ) : null}
      </div>
    </main>
  );
}
