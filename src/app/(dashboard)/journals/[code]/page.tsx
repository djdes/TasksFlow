import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, BookOpen } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";

export default async function JournalDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { code } = await params;
  const { tab } = await searchParams;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code },
  });

  if (!template) {
    notFound();
  }

  const activeTab = tab === "closed" ? "closed" : "active";

  const documents = await db.journalDocument.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
      status: activeTab,
    },
    orderBy: { dateFrom: "desc" },
  });

  // Load org users for the create dialog
  const orgUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  function formatPeriod(from: Date, to: Date): string {
    const months = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    ];
    const month = months[from.getMonth()] || "";
    const dayFrom = from.getDate();
    const dayTo = to.getDate();
    return `${month} с ${dayFrom} по ${dayTo}`;
  }

  const canCreate = ["owner", "technologist"].includes(session.user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description && (
            <p className="mt-1 text-muted-foreground">{template.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/sanpin">
              <BookOpen className="size-4" />
              Инструкция
            </Link>
          </Button>
          {canCreate && (
            <CreateDocumentDialog
              templateCode={code}
              templateName={template.name}
              users={orgUsers}
            />
          )}
        </div>
      </div>

      {/* Tabs: Активные / Закрытые */}
      <div className="flex border-b">
        <Link
          href={`/journals/${code}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Активные
        </Link>
        <Link
          href={`/journals/${code}?tab=closed`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "closed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Закрытые
        </Link>
      </div>

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FileText className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">
            {activeTab === "active" ? "Нет активных документов" : "Нет закрытых документов"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {activeTab === "active"
              ? "Создайте первый документ для ведения журнала"
              : "Закрытые документы появятся здесь"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/journals/${code}/documents/${doc.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="size-5 text-muted-foreground" />
                    <p className="font-medium">{doc.title}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    {doc.responsibleTitle && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Должность ответственного</p>
                        <p className="font-medium">{doc.responsibleTitle}</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Период</p>
                      <p className="font-medium">{formatPeriod(doc.dateFrom, doc.dateTo)}</p>
                    </div>
                    {doc.status === "closed" && <Badge variant="secondary">Закрыт</Badge>}
                    <span className="text-muted-foreground">•••</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
