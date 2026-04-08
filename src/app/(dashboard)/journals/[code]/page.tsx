import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { HygieneDocumentsClient } from "@/components/journals/hygiene-documents-client";
import {
  buildDateKeys,
  buildExampleHygieneEntryMap,
  buildHygieneExampleEmployees,
  getHygieneDemoTeamUsers,
  getHealthSeedDocumentConfigs,
  getHygieneDefaultResponsibleTitle,
  getHygieneSeedDocumentConfigs,
} from "@/lib/hygiene-document";
import {
  getJournalDocumentDefaultTitle,
  getJournalDocumentPeriodLabel,
  isDocumentTemplate,
} from "@/lib/journal-document-helpers";
import { FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE } from "@/lib/finished-product-document";
import { FinishedProductDocumentsClient } from "@/components/journals/finished-product-documents-client";

export const dynamic = "force-dynamic";

async function ensureStaffJournalSampleDocuments({
  templateCode,
  organizationId,
  templateId,
  users,
  createdById,
}: {
  templateCode: string;
  organizationId: string;
  templateId: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
  createdById: string;
}) {
  const configs =
    templateCode === "health_check"
      ? getHealthSeedDocumentConfigs()
      : getHygieneSeedDocumentConfigs();

  const existingDocuments = await db.journalDocument.findMany({
    where: {
      organizationId,
      templateId,
    },
    select: {
      status: true,
      dateFrom: true,
      dateTo: true,
    },
  });

  const existingKeys = new Set(
    existingDocuments.map((document) => {
      const from = document.dateFrom.toISOString().slice(0, 10);
      const to = document.dateTo.toISOString().slice(0, 10);
      return `${document.status}:${from}:${to}`;
    })
  );

  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null;

  for (const config of configs) {
    const key = `${config.status}:${config.dateFrom}:${config.dateTo}`;
    if (existingKeys.has(key)) continue;

    const document = await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: config.title,
        status: config.status,
        dateFrom: new Date(config.dateFrom),
        dateTo: new Date(config.dateTo),
        responsibleUserId: responsibleUser?.id || null,
        responsibleTitle: getHygieneDefaultResponsibleTitle(users),
        createdById,
      },
    });

    const sourceUsers =
      templateCode === "hygiene" && config.variant === "demo_team"
        ? getHygieneDemoTeamUsers(users)
        : users;

    const employeeIds = buildHygieneExampleEmployees(
      sourceUsers,
      templateCode === "health_check" ? 5 : 7
    )
      .filter((employee) => !employee.id.startsWith("blank-"))
      .map((employee) => employee.id);

    if (employeeIds.length === 0) continue;

    const dateKeys = buildDateKeys(config.dateFrom, config.dateTo);

    if (templateCode === "hygiene") {
      const entryMap = buildExampleHygieneEntryMap(employeeIds, dateKeys);
      const entries = Object.entries(entryMap).map(([compoundKey, data]) => {
        const separatorIndex = compoundKey.lastIndexOf(":");
        const employeeId = compoundKey.slice(0, separatorIndex);
        const dateKey = compoundKey.slice(separatorIndex + 1);

        return {
          documentId: document.id,
          employeeId,
          date: new Date(dateKey),
          data,
        };
      });

      if (entries.length > 0) {
        await db.journalDocumentEntry.createMany({ data: entries });
      }
      continue;
    }

    await db.journalDocumentEntry.createMany({
      data: employeeIds.flatMap((employeeId) =>
        dateKeys.map((dateKey) => ({
          documentId: document.id,
          employeeId,
          date: new Date(dateKey),
          data: {},
        }))
      ),
      skipDuplicates: true,
    });
  }
}

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

  const orgUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  if (code === "hygiene" || code === "health_check") {
    await ensureStaffJournalSampleDocuments({
      templateCode: code,
      organizationId: session.user.organizationId,
      templateId: template.id,
      users: orgUsers,
      createdById: session.user.id,
    });

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return (
      <HygieneDocumentsClient
        activeTab={activeTab}
        templateCode={code}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || getJournalDocumentDefaultTitle(code),
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          periodLabel: getJournalDocumentPeriodLabel(code, document.dateFrom, document.dateTo),
        }))}
      />
    );
  }

  if (isDocumentTemplate(code)) {
    if (code === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      const existingDocument = await db.journalDocument.findFirst({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      if (!existingDocument && activeTab === "active") {
        const currentDate = new Date();
        const year = currentDate.getUTCFullYear();
        const month = currentDate.getUTCMonth();
        const dateFrom = new Date(Date.UTC(year, month, 1));
        const dateTo = new Date(Date.UTC(year, month + 1, 0));

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getJournalDocumentDefaultTitle(code),
            dateFrom,
            dateTo,
            createdById: session.user.id,
          },
        });
      }
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    if (code === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      return (
        <FinishedProductDocumentsClient
          activeTab={activeTab}
          templateCode={code}
          templateName={template.name}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(code),
            status: document.status as "active" | "closed",
            responsibleTitle: document.responsibleTitle,
            periodLabel: getJournalDocumentPeriodLabel(code, document.dateFrom, document.dateTo),
            startedAtLabel: document.dateFrom.toLocaleDateString("ru-RU"),
          }))}
        />
      );
    }

    return (
      <HygieneDocumentsClient
        activeTab={activeTab}
        templateCode={code}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || getJournalDocumentDefaultTitle(code),
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          periodLabel: getJournalDocumentPeriodLabel(code, document.dateFrom, document.dateTo),
        }))}
      />
    );
  }

  const documents = await db.journalDocument.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
      status: activeTab,
    },
    orderBy: { dateFrom: "desc" },
  });

  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <div key={document.id}>{document.title}</div>
      ))}
    </div>
  );
}
