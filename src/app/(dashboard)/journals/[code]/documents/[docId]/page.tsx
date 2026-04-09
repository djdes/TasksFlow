import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { TrackedDocumentClient } from "@/components/journals/tracked-document-client";
import { ColdEquipmentDocumentClient } from "@/components/journals/cold-equipment-document-client";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  normalizeColdEquipmentDocumentConfig,
  normalizeColdEquipmentEntryData,
} from "@/lib/cold-equipment-document";
import { ClimateDocumentClient } from "@/components/journals/climate-document-client";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  normalizeClimateDocumentConfig,
  normalizeClimateEntryData,
} from "@/lib/climate-document";
import { CleaningDocumentClient } from "@/components/journals/cleaning-document-client";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  normalizeCleaningDocumentConfig,
  normalizeCleaningEntryData,
} from "@/lib/cleaning-document";
import { FinishedProductDocumentClient } from "@/components/journals/finished-product-document-client";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  normalizeFinishedProductDocumentConfig,
} from "@/lib/finished-product-document";
import { RegisterDocumentClient } from "@/components/journals/register-document-client";
import { AcceptanceDocumentClient } from "@/components/journals/acceptance-document-client";
import { SanitationDayDocumentClient } from "@/components/journals/sanitation-day-document-client";
import { HealthDocumentClient } from "@/components/journals/health-document-client";
import { HygieneDocumentClient } from "@/components/journals/hygiene-document-client";
import {
  getHygieneDemoTeamUsers,
  normalizeHealthEntryData,
  normalizeHygieneEntryData,
  toDateKey,
} from "@/lib/hygiene-document";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  normalizeAcceptanceDocumentConfig,
} from "@/lib/acceptance-document";
import {
  isRegisterDocumentTemplate,
  normalizeRegisterDocumentConfig,
  parseRegisterFields,
} from "@/lib/register-document";
import { isTrackedDocumentTemplate } from "@/lib/tracked-document";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { SANITATION_DAY_TEMPLATE_CODE } from "@/lib/sanitation-day-document";
import { UvLampRuntimeDocumentClient } from "@/components/journals/uv-lamp-runtime-document-client";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  normalizeUvRuntimeDocumentConfig,
  toIsoDate,
} from "@/lib/uv-lamp-runtime-document";

export const dynamic = "force-dynamic";

type TrackedFieldOption = {
  value: string;
  label: string;
};

type TrackedField = {
  key: string;
  label: string;
  type: string;
  options: TrackedFieldOption[];
};

export default async function JournalDocumentPage({
  params,
}: {
  params: Promise<{ code: string; docId: string }>;
}) {
  const { code, docId } = await params;
  const resolvedCode = resolveJournalCodeAlias(code);
  const session = await requireAuth();

  const [document, organization, employees, areas, equipment] = await Promise.all([
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
      select: { id: true, name: true, role: true, email: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.area.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.equipment.findMany({
      where: {
        area: {
          organizationId: session.user.organizationId,
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const demoEmployees = getHygieneDemoTeamUsers(employees);
  const enrichedEmployees =
    demoEmployees.length > 0
      ? employees.map((employee) => {
          const demo = demoEmployees.find((item) => item.id === employee.id);
          return demo || employee;
        })
      : employees;

  if (
    !document ||
    document.organizationId !== session.user.organizationId ||
    document.template.code !== resolvedCode
  ) {
    notFound();
  }

  if (document.template.code === "hygiene") {
    return (
      <HygieneDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleName={null}
        status={document.status}
        autoFill={document.autoFill}
        employees={enrichedEmployees}
        initialEntries={document.entries.map((entry) => ({
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeHygieneEntryData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === "health_check") {
    return (
      <HealthDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        status={document.status}
        autoFill={document.autoFill}
        employees={enrichedEmployees}
        printEmptyRows={
          document.config &&
          typeof document.config === "object" &&
          !Array.isArray(document.config) &&
          typeof (document.config as { printEmptyRows?: unknown }).printEmptyRows === "number"
            ? Math.max(0, (document.config as { printEmptyRows: number }).printEmptyRows)
            : 0
        }
        initialEntries={document.entries.map((entry) => ({
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeHealthEntryData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
    return (
      <ColdEquipmentDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleUserId={document.responsibleUserId}
        status={document.status}
        autoFill={document.autoFill}
        employees={enrichedEmployees}
        config={normalizeColdEquipmentDocumentConfig(document.config)}
        initialEntries={document.entries.map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeColdEquipmentEntryData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === SANITATION_DAY_TEMPLATE_CODE) {
    return (
      <SanitationDayDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        users={enrichedEmployees}
        config={document.config}
      />
    );
  }

  if (document.template.code === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    return (
      <AcceptanceDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'РћРћРћ "РўРµСЃС‚"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        status={document.status}
        users={enrichedEmployees}
        config={normalizeAcceptanceDocumentConfig(document.config, enrichedEmployees)}
      />
    );
  }

  if (
    isTrackedDocumentTemplate(document.template.code) &&
    !isRegisterDocumentTemplate(document.template.code)
  ) {
    if (document.template.code === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
      const uvConfig = normalizeUvRuntimeDocumentConfig(document.config);
      return (
        <UvLampRuntimeDocumentClient
          documentId={document.id}
          title={document.title || buildUvRuntimeDocumentTitle(uvConfig)}
          status={document.status}
          dateFrom={toIsoDate(document.dateFrom)}
          dateTo={toIsoDate(document.dateTo)}
          responsibleTitle={document.responsibleTitle}
          responsibleUserId={document.responsibleUserId}
          users={enrichedEmployees}
          config={uvConfig}
          initialEntries={document.entries.map((entry) => ({
            id: entry.id,
            employeeId: entry.employeeId,
            date: toIsoDate(entry.date),
            data: ((entry.data as Record<string, unknown>) || {}) as Record<string, unknown>,
          }))}
        />
      );
    }

    const fields = Array.isArray(document.template.fields)
      ? (document.template.fields as Array<Record<string, unknown>>)
          .map((field): TrackedField | null => {
            const key = typeof field.key === "string" ? field.key : "";
            if (!key) return null;

            const type = typeof field.type === "string" ? field.type : "text";
            const options =
              type === "employee"
                ? enrichedEmployees.map((employee) => ({
                    value: employee.name,
                    label: employee.name,
                  }))
                : type === "equipment"
                  ? equipment.map((item) => ({
                      value: item.name,
                      label: item.name,
                    }))
                  : Array.isArray(field.options)
                    ? (field.options as Array<Record<string, unknown>>)
                        .map((option) => ({
                          value: typeof option.value === "string" ? option.value : "",
                          label: typeof option.label === "string" ? option.label : "",
                        }))
                        .filter((option) => option.value !== "")
                    : [];

            return {
              key,
              label: typeof field.label === "string" ? field.label : "",
              type,
              options,
            };
          })
          .filter((field): field is TrackedField => field !== null)
      : [];

    return (
      <TrackedDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleUserId={document.responsibleUserId}
        status={document.status}
        employees={enrichedEmployees}
        fields={fields}
        initialEntries={document.entries.map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: ((entry.data as Record<string, unknown>) || {}) as Record<string, unknown>,
        }))}
      />
    );
  }

  if (document.template.code === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return (
      <ClimateDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleUserId={document.responsibleUserId}
        status={document.status}
        autoFill={document.autoFill}
        employees={enrichedEmployees}
        config={normalizeClimateDocumentConfig(document.config)}
        initialEntries={document.entries.map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeClimateEntryData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === CLEANING_DOCUMENT_TEMPLATE_CODE) {
    return (
      <CleaningDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleUserId={document.responsibleUserId}
        status={document.status}
        autoFill={document.autoFill}
        employees={enrichedEmployees}
        areas={areas}
        config={normalizeCleaningDocumentConfig(document.config)}
        initialEntries={document.entries.map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeCleaningEntryData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
    return (
      <FinishedProductDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        status={document.status}
        initialConfig={normalizeFinishedProductDocumentConfig(document.config)}
        users={employees}
      />
    );
  }

  if (isRegisterDocumentTemplate(document.template.code)) {
    const fields = parseRegisterFields(document.template.fields);

    return (
      <RegisterDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        status={document.status}
        fields={fields}
        initialConfig={normalizeRegisterDocumentConfig(document.config, fields)}
        users={enrichedEmployees}
        equipment={equipment}
      />
    );
  }

  notFound();
}

