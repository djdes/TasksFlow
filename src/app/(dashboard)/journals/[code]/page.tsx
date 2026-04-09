import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
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
import { CLIMATE_DOCUMENT_TEMPLATE_CODE } from "@/lib/climate-document";
import { COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE } from "@/lib/cold-equipment-document";
import { CLEANING_DOCUMENT_TEMPLATE_CODE } from "@/lib/cleaning-document";
import { TrackedDocumentsClient } from "@/components/journals/tracked-documents-client";
import {
  getTrackedDocumentCreateMode,
  isSourceStyleTrackedTemplate,
  isTrackedDocumentTemplate,
} from "@/lib/tracked-document";
import { UvLampRuntimeDocumentsClient } from "@/components/journals/uv-lamp-runtime-documents-client";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { ACCEPTANCE_DOCUMENT_TEMPLATE_CODE } from "@/lib/acceptance-document";
import {
  SANITATION_DAY_SOURCE_SLUG,
  SANITATION_DAY_TEMPLATE_CODE,
  SANITATION_DAY_DOCUMENT_TITLE,
  getSanitationDayDefaultConfig,
  getSanitationDocumentDateLabel,
  getSanitationApproveLabel,
} from "@/lib/sanitation-day-document";
import { SanitationDayDocumentsClient } from "@/components/journals/sanitation-day-documents-client";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  formatRuDateDash,
  normalizeUvRuntimeDocumentConfig,
} from "@/lib/uv-lamp-runtime-document";

export const dynamic = "force-dynamic";
const SOURCE_STYLE_TRACKED_DEMO_CODES = new Set([
  "daily_rejection",
  "raw_storage_control",
  "defrosting_control",
]);

type TrackedTemplateField = {
  key: string;
  type?: string;
  label?: string;
  options?: Array<{ value: string; label: string }>;
};

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

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toSourceDateLabel(value: Date) {
  return value.toLocaleDateString("ru-RU").replaceAll(".", "-");
}

function buildTrackedDemoValue(field: TrackedTemplateField, rowIndex: number) {
  switch (field.type) {
    case "boolean":
      return true;
    case "number":
      return rowIndex + 1;
    case "date":
      return toDateKey(new Date());
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return `${field.label || field.key} ${rowIndex + 1}`.trim();
  }
}

function getTrackedMeta(templateCode: string, dateFrom: Date, dateTo: Date) {
  if (templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (!isSourceStyleTrackedTemplate(templateCode)) {
    return {
      metaLabel: "РџРµСЂРёРѕРґ",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  const mode = getTrackedDocumentCreateMode(templateCode);
  if (mode === "staff") {
    return {
      metaLabel: "РџРµСЂРёРѕРґ",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  if (mode === "uv") {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  return {
    metaLabel: "Р”Р°С‚Р° РґРѕРєСѓРјРµРЅС‚Р°",
    metaValue: toSourceDateLabel(dateFrom),
  };
}

async function ensureSourceStyleTrackedSampleDocuments({
  templateCode,
  templateId,
  organizationId,
  users,
  createdById,
  templateFields,
}: {
  templateCode: string;
  templateId: string;
  organizationId: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
  createdById: string;
  templateFields: TrackedTemplateField[];
}) {
  if (!SOURCE_STYLE_TRACKED_DEMO_CODES.has(templateCode)) return;

  const activeUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0];

  if (!activeUser) return;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const activeFrom = new Date(Date.UTC(year, month, 1));
  const activeTo = new Date(Date.UTC(year, month + 1, 0));
  const closedFrom = new Date(Date.UTC(year, month - 1, 1));
  const closedTo = new Date(Date.UTC(year, month, 0));

  const existing = await db.journalDocument.findMany({
    where: {
      organizationId,
      templateId,
      status: {
        in: ["active", "closed"],
      },
    },
    select: {
      status: true,
    },
  });

  const hasStatus = new Set(existing.map((item) => item.status));
  const baseData = Object.fromEntries(
    templateFields.map((field, index) => [field.key, buildTrackedDemoValue(field, index)])
  );
  const defaultTitle = getJournalDocumentDefaultTitle(templateCode);

  const configs = [
    { status: "active" as const, dateFrom: activeFrom, dateTo: activeTo },
    { status: "closed" as const, dateFrom: closedFrom, dateTo: closedTo },
  ];

  for (const config of configs) {
    if (hasStatus.has(config.status)) continue;

    const created = await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: defaultTitle,
        status: config.status,
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        responsibleUserId: activeUser.id,
        responsibleTitle: getHygieneDefaultResponsibleTitle(users),
        createdById,
      },
      select: {
        id: true,
      },
    });

    await db.journalDocumentEntry.createMany({
      data: [
        {
          documentId: created.id,
          employeeId: activeUser.id,
          date: config.dateFrom,
          data: baseData,
        },
      ],
      skipDuplicates: true,
    });
  }
}

async function ensureSanitationDaySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
}) {
  const { templateId, organizationId, createdById } = params;
  const currentYearDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const previousYearDate = new Date(
    Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)
  );

  const existing = await db.journalDocument.findMany({
    where: {
      templateId,
      organizationId,
    },
    select: {
      status: true,
    },
  });

  const statuses = new Set(existing.map((item) => item.status));
  const docsToCreate: Array<{ status: "active" | "closed"; date: Date }> = [];

  if (!statuses.has("active")) {
    docsToCreate.push({ status: "active", date: currentYearDate });
  }
  if (!statuses.has("closed")) {
    docsToCreate.push({ status: "closed", date: previousYearDate });
  }

  for (const doc of docsToCreate) {
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: SANITATION_DAY_DOCUMENT_TITLE,
        status: doc.status,
        dateFrom: doc.date,
        dateTo: doc.date,
        createdById,
        config: getSanitationDayDefaultConfig(doc.date),
      },
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
  const resolvedCode = resolveJournalCodeAlias(code);
  const { tab } = await searchParams;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code: resolvedCode },
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

  if (resolvedCode === "hygiene" || resolvedCode === "health_check") {
    await ensureStaffJournalSampleDocuments({
      templateCode: resolvedCode,
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
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
        }))}
      />
    );
  }

  if (isDocumentTemplate(resolvedCode)) {
    const parsedTemplateFields = Array.isArray(template.fields)
      ? (template.fields as TrackedTemplateField[])
      : [];

    await ensureSourceStyleTrackedSampleDocuments({
      templateCode: resolvedCode,
      templateId: template.id,
      organizationId: session.user.organizationId,
      users: orgUsers,
      createdById: session.user.id,
      templateFields: parsedTemplateFields,
    });

    if (resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
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
            title: getJournalDocumentDefaultTitle(resolvedCode),
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

    if (resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      return (
        <FinishedProductDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
            status: document.status as "active" | "closed",
            responsibleTitle: document.responsibleTitle,
            periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
            startedAtLabel: document.dateFrom.toLocaleDateString("ru-RU"),
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (resolvedCode === SANITATION_DAY_TEMPLATE_CODE) {
      await ensureSanitationDaySampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
      });

      const sanitationDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return (
        <SanitationDayDocumentsClient
          routeCode={code === SANITATION_DAY_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={sanitationDocuments.map((document) => ({
            id: document.id,
            title: document.title || SANITATION_DAY_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: document.config,
            periodLabel: getSanitationDocumentDateLabel(
              document.dateFrom.toISOString().slice(0, 10)
            ),
            responsibleTitle: getSanitationApproveLabel("", ""),
            metaLabel: "",
            metaValue: "",
          }))}
        />
      );
    }

    if (
      resolvedCode === CLIMATE_DOCUMENT_TEMPLATE_CODE ||
      resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE ||
      resolvedCode === CLEANING_DOCUMENT_TEMPLATE_CODE ||
      isTrackedDocumentTemplate(resolvedCode)
    ) {
      if (resolvedCode === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
        return (
          <UvLampRuntimeDocumentsClient
            activeTab={activeTab}
            routeCode={code}
            templateCode={resolvedCode}
            templateName={template.name}
            users={orgUsers}
            documents={documents.map((document) => {
              const config = normalizeUvRuntimeDocumentConfig(document.config);
              return {
                id: document.id,
                title: document.title || buildUvRuntimeDocumentTitle(config),
                status: document.status as "active" | "closed",
                responsibleTitle: document.responsibleTitle,
                responsibleUserId: document.responsibleUserId,
                dateFrom: document.dateFrom.toISOString().slice(0, 10),
                config:
                  document.config && typeof document.config === "object" && !Array.isArray(document.config)
                    ? (document.config as Record<string, unknown>)
                    : null,
                periodLabel: formatRuDateDash(document.dateFrom),
              };
            })}
          />
        );
      }

      const trackedHeading =
        resolvedCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE
          ? "Р–СѓСЂРЅР°Р» РїСЂРёРµРјРєРё Рё РІС…РѕРґРЅРѕРіРѕ РєРѕРЅС‚СЂРѕР»СЏ РїСЂРѕРґСѓРєС†РёРё"
          : template.name;

      return (
        <TrackedDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          heading={trackedHeading}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
            status: document.status as "active" | "closed",
            responsibleTitle: document.responsibleTitle,
            periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
            ...getTrackedMeta(resolvedCode, document.dateFrom, document.dateTo),
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? (document.config as Record<string, unknown>)
                : null,
          }))}
        />
      );
    }

    return (
      <HygieneDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
        }))}
      />
    );
  }

  const entries = await db.journalEntry.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      filledBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description ? (
            <p className="mt-1 text-muted-foreground">{template.description}</p>
          ) : null}
        </div>
        <Link
          href={`/journals/${resolvedCode}/new`}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Новая запись
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-muted-foreground">
          Записей пока нет
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/journals/${resolvedCode}/${entry.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {entry.createdAt.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Заполнил: {entry.filledBy?.name || "—"}
                  </div>
                </div>
                <div className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {entry.status}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

