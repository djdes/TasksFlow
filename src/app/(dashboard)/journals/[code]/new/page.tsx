import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { DynamicForm } from "@/components/journals/dynamic-form";

export default async function NewJournalEntryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code },
  });

  if (!template) {
    notFound();
  }

  const areas = await db.area.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const equipment = await db.equipment.findMany({
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
  });

  const fields = template.fields as Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date" | "boolean" | "select" | "equipment";
    required?: boolean;
    options?: Array<{ value: string; label: string }>;
    step?: number;
    auto?: boolean;
    showIf?: { field: string; equals: unknown };
  }>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Новая запись</h1>
        <p className="mt-1 text-muted-foreground">{template.name}</p>
      </div>

      <DynamicForm
        templateCode={code}
        templateName={template.name}
        fields={fields}
        areas={areas}
        equipment={equipment}
      />
    </div>
  );
}
