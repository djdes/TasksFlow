import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, NotebookPen } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { DynamicForm } from "@/components/journals/dynamic-form";
import { isDocumentTemplate } from "@/lib/journal-document-helpers";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { isScanOnlyDocumentTemplate } from "@/lib/scan-journal-config";

export default async function NewJournalEntryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const resolvedCode = resolveJournalCodeAlias(code);
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code: resolvedCode },
  });

  if (!template) {
    notFound();
  }

  if (isDocumentTemplate(resolvedCode) || isScanOnlyDocumentTemplate(resolvedCode)) {
    notFound();
  }

  // If the manager disabled this journal, don't let users create new
  // entries. Existing ones stay in the DB (reversible via settings).
  const org = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { disabledJournalCodes: true },
  });
  const disabledCodes = Array.isArray(org?.disabledJournalCodes)
    ? (org?.disabledJournalCodes as string[])
    : [];
  if (disabledCodes.includes(resolvedCode)) {
    return (
      <div className="mx-auto max-w-[640px] space-y-6 rounded-3xl border border-dashed border-[#dcdfed] bg-[#fafbff] px-6 py-16 text-center">
        <div className="text-[20px] font-semibold text-[#0b1024]">
          Журнал отключён
        </div>
        <p className="text-[14px] leading-[1.6] text-[#6f7282]">
          Нельзя создать запись для отключённого журнала. Включите его в
          настройках набора журналов, чтобы продолжить.
        </p>
        <Link
          href="/settings/journals"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
        >
          Открыть настройки
        </Link>
      </div>
    );
  }

  const [areas, equipment, employees, products] = await Promise.all([
    db.area.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.equipment.findMany({
      where: {
        area: { organizationId: session.user.organizationId },
      },
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
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
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
    type: "text" | "number" | "date" | "boolean" | "select" | "equipment" | "employee";
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
    step?: number;
    auto?: boolean;
    showIf?: { field: string; equals: unknown };
  }>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 sm:space-y-6">
      <Link
        href={`/journals/${resolvedCode}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6f7282] transition-colors hover:text-[#0b1024]"
      >
        <ArrowLeft className="size-4" />
        К журналу
      </Link>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[340px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-28 -right-28 size-[380px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div className="relative z-10 flex items-start gap-3 p-5 sm:gap-4 sm:p-8 md:p-10">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <NotebookPen className="size-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              Новая запись
            </div>
            <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">
              {template.name}
            </h1>
            {template.description ? (
              <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-white/70 sm:text-[14px]">
                {template.description}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="rounded-3xl border border-[#ececf4] bg-white p-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:p-6 md:p-8">
        <DynamicForm
          templateCode={resolvedCode}
          templateName={template.name}
          fields={fields}
          areas={areas}
          equipment={equipment}
          employees={employees}
          products={products}
        />
      </div>
    </div>
  );
}
