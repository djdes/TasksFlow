import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/server-session";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { DynamicForm } from "@/components/journals/dynamic-form";
import {
  aclActorFromSession,
  canWriteJournal,
} from "@/lib/journal-acl";

/**
 * Mini App "new journal entry" screen.
 *
 * Reuses `DynamicForm` verbatim — same JSON schema, same validators,
 * same POST `/api/journals` endpoint. Only difference: `journalsBasePath`
 * is `/mini/journals` so the post-save redirect stays inside Mini App.
 */
export default async function MiniNewJournalEntryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/mini");
  }

  const actor = aclActorFromSession({
    user: {
      id: session.user.id,
      role: session.user.role,
      isRoot: session.user.isRoot === true,
    },
  });
  const writable = await canWriteJournal(actor, code);
  if (!writable) {
    return (
      <div className="space-y-4">
        <Link
          href={`/mini/journals/${code}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500"
        >
          <ArrowLeft className="size-4" />К журналу
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          У вас нет прав на создание записей в этом журнале.
        </div>
      </div>
    );
  }

  const template = await db.journalTemplate.findUnique({
    where: { code },
  });
  if (!template) notFound();

  const orgId = getActiveOrgId(session);
  const [areas, equipment, employees, products] = await Promise.all([
    db.area.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.equipment.findMany({
      where: { area: { organizationId: orgId } },
      select: {
        id: true,
        name: true,
        type: true,
        tempMin: true,
        tempMax: true,
        tuyaDeviceId: true,
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        supplier: true,
        barcode: true,
        unit: true,
        storageTemp: true,
        shelfLifeDays: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const fields = template.fields as Array<{
    key: string;
    label: string;
    type:
      | "text"
      | "number"
      | "date"
      | "boolean"
      | "select"
      | "equipment"
      | "employee";
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
    step?: number;
    auto?: boolean;
    showIf?: { field: string; equals: unknown };
  }>;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-8">
      <Link
        href={`/mini/journals/${code}`}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500"
      >
        <ArrowLeft className="size-4" />
        К журналу
      </Link>
      <header className="px-1">
        <h1 className="text-[20px] font-semibold text-slate-900">
          Новая запись
        </h1>
        <p className="mt-0.5 text-[13px] text-slate-500">{template.name}</p>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <DynamicForm
          templateCode={code}
          templateName={template.name}
          fields={fields}
          areas={areas}
          equipment={equipment}
          employees={employees}
          products={products}
          journalsBasePath="/mini/journals"
        />
      </div>
    </div>
  );
}
