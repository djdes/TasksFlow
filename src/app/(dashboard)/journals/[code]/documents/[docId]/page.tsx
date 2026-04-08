import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { HygieneDocumentClient } from "@/components/journals/hygiene-document-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  HYGIENE_EXAMPLE_DATE_FROM,
  HYGIENE_EXAMPLE_DATE_TO,
  HYGIENE_EXAMPLE_ORGANIZATION,
  HYGIENE_EXAMPLE_TITLE,
  normalizeHygieneEntryData,
  toDateKey,
} from "@/lib/hygiene-document";

export default async function JournalDocumentPage({
  params,
}: {
  params: Promise<{ code: string; docId: string }>;
}) {
  const { code, docId } = await params;
  const session = await requireAuth();

  const [document, organization, employees] = await Promise.all([
    db.journalDocument.findUnique({
      where: { id: docId },
      include: {
        template: true,
        entries: {
          orderBy: [{ employeeId: "asc" }, { date: "asc" }],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true },
    }),
    db.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        isActive: true,
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const isHygieneSampleRoute = code === "hygiene" && !document;

  if (
    !isHygieneSampleRoute &&
    (!document ||
      document.organizationId !== session.user.organizationId ||
      document.template.code !== code)
  ) {
    notFound();
  }

  if (code === "hygiene" && !document) {
    return (
      <HygieneDocumentClient
        documentId={docId}
        title={HYGIENE_EXAMPLE_TITLE}
        organizationName={organization?.name || HYGIENE_EXAMPLE_ORGANIZATION}
        dateFrom={HYGIENE_EXAMPLE_DATE_FROM}
        dateTo={HYGIENE_EXAMPLE_DATE_TO}
        responsibleTitle="Управляющий"
        responsibleName={null}
        status="active"
        employees={employees}
        initialEntries={[]}
      />
    );
  }

  if (document && document.template.code === "hygiene") {
    const responsibleUser = employees.find(
      (employee) => employee.id === document.responsibleUserId
    );

    return (
      <HygieneDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || "Организация"}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleName={responsibleUser?.name || null}
        status={document.status}
        employees={employees}
        initialEntries={document.entries.map((entry) => ({
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeHygieneEntryData(entry.data),
        }))}
      />
    );
  }

  if (!document) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{document.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Для этого типа документа пока доступен базовый просмотр данных.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/journals/${code}`}>
            <ArrowLeft className="size-4" />
            Назад к журналу
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Сводка документа
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>Период: {toDateKey(document.dateFrom)} — {toDateKey(document.dateTo)}</p>
          <p>Статус: {document.status}</p>
          <p>Записей: {document.entries.length}</p>
        </CardContent>
      </Card>
    </div>
  );
}
