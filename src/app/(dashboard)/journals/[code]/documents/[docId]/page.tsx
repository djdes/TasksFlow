import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { TrackedDocumentClient } from "@/components/journals/tracked-document-client";
import { ScanJournalDocumentClient } from "@/components/journals/scan-journal-document-client";
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
  isAcceptanceDocumentTemplate,
  normalizeAcceptanceDocumentConfig,
} from "@/lib/acceptance-document";
import {
  PPE_ISSUANCE_TEMPLATE_CODE,
  normalizePpeIssuanceConfig,
} from "@/lib/ppe-issuance-document";
import { PpeIssuanceDocumentClient } from "@/components/journals/ppe-issuance-document-client";
import {
  isRegisterDocumentTemplate,
  normalizeRegisterDocumentConfig,
  parseRegisterFields,
} from "@/lib/register-document";
import { isTrackedDocumentTemplate } from "@/lib/tracked-document";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { SANITATION_DAY_TEMPLATE_CODE } from "@/lib/sanitation-day-document";
import { isScanOnlyDocumentTemplate } from "@/lib/scan-journal-config";
import { getScanJournalPageCount } from "@/lib/scan-journal-pages";
import { TRAINING_PLAN_TEMPLATE_CODE } from "@/lib/training-plan-document";
import { TrainingPlanDocumentClient } from "@/components/journals/training-plan-document-client";
import {
  AUDIT_PLAN_TEMPLATE_CODE,
  normalizeAuditPlanConfig,
} from "@/lib/audit-plan-document";
import { AuditPlanDocumentClient } from "@/components/journals/audit-plan-document-client";
import {
  AUDIT_PROTOCOL_TEMPLATE_CODE,
  normalizeAuditProtocolConfig,
} from "@/lib/audit-protocol-document";
import { AuditProtocolDocumentClient } from "@/components/journals/audit-protocol-document-client";
import {
  AUDIT_REPORT_TEMPLATE_CODE,
  normalizeAuditReportConfig,
} from "@/lib/audit-report-document";
import { AuditReportDocumentClient } from "@/components/journals/audit-report-document-client";
import { DISINFECTANT_TEMPLATE_CODE } from "@/lib/disinfectant-document";
import { DisinfectantDocumentClient } from "@/components/journals/disinfectant-document-client";
import { BREAKDOWN_HISTORY_TEMPLATE_CODE } from "@/lib/breakdown-history-document";
import { BreakdownHistoryDocumentClient } from "@/components/journals/breakdown-history-document-client";
import { IntensiveCoolingDocumentClient } from "@/components/journals/intensive-cooling-document-client";
import { ACCIDENT_DOCUMENT_TEMPLATE_CODE } from "@/lib/accident-document";
import { AccidentDocumentClient } from "@/components/journals/accident-document-client";
import { UvLampRuntimeDocumentClient } from "@/components/journals/uv-lamp-runtime-document-client";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  normalizeUvRuntimeDocumentConfig,
  toIsoDate,
} from "@/lib/uv-lamp-runtime-document";
import { MedBookDocumentClient } from "@/components/journals/med-book-document-client";
import {
  MED_BOOK_TEMPLATE_CODE,
  normalizeMedBookConfig,
  normalizeMedBookEntryData,
} from "@/lib/med-book-document";
import { FryerOilDocumentClient } from "@/components/journals/fryer-oil-document-client";
import {
  FRYER_OIL_TEMPLATE_CODE,
  normalizeFryerOilDocumentConfig,
  normalizeFryerOilEntryData,
} from "@/lib/fryer-oil-document";
import {
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_TEMPLATE_CODE,
} from "@/lib/intensive-cooling-document";
import { PerishableRejectionDocumentClient } from "@/components/journals/perishable-rejection-document-client";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  normalizePerishableRejectionConfig,
} from "@/lib/perishable-rejection-document";
import { ProductWriteoffDocumentClient } from "@/components/journals/product-writeoff-document-client";
import {
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  normalizeProductWriteoffConfig,
} from "@/lib/product-writeoff-document";
import { GlassListDocumentClient } from "@/components/journals/glass-list-document-client";
import {
  GLASS_LIST_TEMPLATE_CODE,
  normalizeGlassListConfig,
} from "@/lib/glass-list-document";
import { GlassControlDocumentClient } from "@/components/journals/glass-control-document-client";
import {
  GLASS_CONTROL_TEMPLATE_CODE,
  normalizeGlassControlConfig,
  normalizeGlassControlEntryData,
} from "@/lib/glass-control-document";
import { StaffTrainingDocumentClient } from "@/components/journals/staff-training-document-client";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  normalizeStaffTrainingConfig,
} from "@/lib/staff-training-document";
import { EquipmentMaintenanceDocumentClient } from "@/components/journals/equipment-maintenance-document-client";
import {
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  normalizeEquipmentMaintenanceConfig,
} from "@/lib/equipment-maintenance-document";
import { CleaningVentilationChecklistDocumentClient } from "@/components/journals/cleaning-ventilation-checklist-document-client";
import {
  CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE,
  CLEANING_VENTILATION_CHECKLIST_TITLE,
  normalizeCleaningVentilationConfig,
  normalizeCleaningVentilationEntryData,
} from "@/lib/cleaning-ventilation-checklist-document";
import { SanitaryDayChecklistDocumentClient } from "@/components/journals/sanitary-day-checklist-document-client";
import {
  SANITARY_DAY_CHECKLIST_TEMPLATE_CODE,
  isSanitaryDayChecklistTemplate,
  normalizeSdcConfig,
  normalizeSdcEntryData,
} from "@/lib/sanitary-day-checklist-document";
import { EquipmentCalibrationDocumentClient } from "@/components/journals/equipment-calibration-document-client";
import {
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
  normalizeEquipmentCalibrationConfig,
} from "@/lib/equipment-calibration-document";
import { TraceabilityDocumentClient } from "@/components/journals/traceability-document-client";
import {
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  normalizeTraceabilityDocumentConfig,
} from "@/lib/traceability-document";
import { MetalImpurityDocumentClient } from "@/components/journals/metal-impurity-document-client";
import {
  METAL_IMPURITY_TEMPLATE_CODE,
  normalizeMetalImpurityConfig,
} from "@/lib/metal-impurity-document";
import { EquipmentCleaningDocumentClient } from "@/components/journals/equipment-cleaning-document-client";
import {
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  normalizeEquipmentCleaningConfig,
  normalizeEquipmentCleaningRowData,
} from "@/lib/equipment-cleaning-document";
import { ComplaintDocumentClient } from "@/components/journals/complaint-document-client";
import { COMPLAINT_REGISTER_TEMPLATE_CODE, normalizeComplaintConfig } from "@/lib/complaint-document";

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
  searchParams,
}: {
  params: Promise<{ code: string; docId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { code, docId } = await params;
  const resolvedCode = resolveJournalCodeAlias(code);
  const query = await searchParams;
  const session = await requireAuth();

  const [document, organization, employees, equipment] = await Promise.all([
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
      select: { id: true, name: true, role: true, email: true, positionTitle: true, jobPosition: { select: { name: true, categoryKey: true } } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
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
        routeCode={code}
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

  if (isScanOnlyDocumentTemplate(document.template.code)) {
    const pageCount = await getScanJournalPageCount(resolvedCode);
    if (pageCount === 0) {
      notFound();
    }

    const requestedPage = Number(query.page || "1");
    const currentPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const safePage = Math.min(currentPage, pageCount);

    return (
      <ScanJournalDocumentClient
        templateCode={resolvedCode}
        templateName={document.title || document.template.name}
        documentId={document.id}
        pageCount={pageCount}
        currentPage={safePage}
      />
    );
  }

  if (document.template.code === EQUIPMENT_CLEANING_TEMPLATE_CODE) {
    return (
      <EquipmentCleaningDocumentClient
        documentId={document.id}
        routeCode={code}
        title={document.title}
        templateCode={resolvedCode}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status as "active" | "closed"}
        dateFrom={toDateKey(document.dateFrom)}
        config={normalizeEquipmentCleaningConfig(document.config)}
        users={enrichedEmployees}
        equipmentOptions={equipment.map((item) => item.name)}
        initialRows={document.entries.map((entry) => ({
          id: entry.id,
          data: normalizeEquipmentCleaningRowData(entry.data),
        }))}
      />
    );
  }

  if (document.template.code === MED_BOOK_TEMPLATE_CODE) {
    const medConfig = normalizeMedBookConfig(document.config);

    const rowMap = new Map<
      string,
      { id: string; employeeId: string; data: ReturnType<typeof normalizeMedBookEntryData> }
    >();
    for (const entry of document.entries) {
      rowMap.set(entry.employeeId, {
        id: entry.id,
        employeeId: entry.employeeId,
        data: normalizeMedBookEntryData(entry.data),
      });
    }

    const medRows = Array.from(rowMap.values()).map((entry) => {
      const emp = enrichedEmployees.find((e) => e.id === entry.employeeId);
      return {
        id: entry.id,
        employeeId: entry.employeeId,
        name: emp?.name || "Сотрудник",
        data: entry.data,
      };
    });

    return (
      <MedBookDocumentClient
        documentId={document.id}
        title={document.title}
        templateCode={code}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        config={medConfig}
        employees={enrichedEmployees}
        initialRows={medRows}
        documentDateKey={toDateKey(document.dateFrom)}
      />
    );
  }

  if (document.template.code === PERISHABLE_REJECTION_TEMPLATE_CODE) {
    return (
      <PerishableRejectionDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizePerishableRejectionConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === PRODUCT_WRITEOFF_TEMPLATE_CODE) {
    return (
      <ProductWriteoffDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeProductWriteoffConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === GLASS_LIST_TEMPLATE_CODE) {
    return (
      <GlassListDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        initialConfig={normalizeGlassListConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === GLASS_CONTROL_TEMPLATE_CODE) {
    return (
      <GlassControlDocumentClient
        documentId={document.id}
        routeCode={code}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        responsibleTitle={document.responsibleTitle}
        responsibleUserId={document.responsibleUserId}
        status={document.status}
        autoFill={document.autoFill}
        users={enrichedEmployees}
        config={normalizeGlassControlConfig(document.config)}
        initialEntries={document.entries.map((entry) => ({
          id: entry.id,
          employeeId: entry.employeeId,
          date: toDateKey(entry.date),
          data: normalizeGlassControlEntryData(entry.data),
        }))}
        itemSuggestions={equipment.map((item) => item.name)}
      />
    );
  }

  if (document.template.code === STAFF_TRAINING_TEMPLATE_CODE) {
    return (
      <StaffTrainingDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeStaffTrainingConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE) {
    return (
      <EquipmentMaintenanceDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeEquipmentMaintenanceConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === EQUIPMENT_CALIBRATION_TEMPLATE_CODE) {
    return (
      <EquipmentCalibrationDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeEquipmentCalibrationConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
    return (
      <TraceabilityDocumentClient
        documentId={document.id}
        title={document.title}
        routeCode={code}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeTraceabilityDocumentConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === COMPLAINT_REGISTER_TEMPLATE_CODE) {
    return (
      <ComplaintDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'РћРћРћ "РўРµСЃС‚"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        initialConfig={normalizeComplaintConfig(document.config)}
        users={enrichedEmployees}
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

  if (document.template.code === DISINFECTANT_TEMPLATE_CODE) {
    return (
      <DisinfectantDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        users={enrichedEmployees}
        config={document.config}
      />
    );
  }

  if (document.template.code === TRAINING_PLAN_TEMPLATE_CODE) {
    return (
      <TrainingPlanDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        users={enrichedEmployees}
        config={document.config}
      />
    );
  }

  if (document.template.code === AUDIT_PLAN_TEMPLATE_CODE) {
    return (
      <AuditPlanDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        users={enrichedEmployees}
        config={normalizeAuditPlanConfig(document.config, {
          organizationName: organization?.name || 'ООО "Тест"',
          users: enrichedEmployees,
        })}
      />
    );
  }

  if (document.template.code === AUDIT_PROTOCOL_TEMPLATE_CODE) {
    return (
      <AuditProtocolDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        config={normalizeAuditProtocolConfig(document.config)}
      />
    );
  }

  if (document.template.code === AUDIT_REPORT_TEMPLATE_CODE) {
    return (
      <AuditReportDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        config={normalizeAuditReportConfig(document.config)}
      />
    );
  }

  if (document.template.code === METAL_IMPURITY_TEMPLATE_CODE) {
    return (
      <MetalImpurityDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        status={document.status}
        config={normalizeMetalImpurityConfig(document.config)}
        users={enrichedEmployees}
      />
    );
  }

  if (document.template.code === BREAKDOWN_HISTORY_TEMPLATE_CODE) {
    return (
      <BreakdownHistoryDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        config={document.config}
      />
    );
  }

  if (document.template.code === ACCIDENT_DOCUMENT_TEMPLATE_CODE) {
    return (
      <AccidentDocumentClient
        documentId={document.id}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        config={document.config}
      />
    );
  }

  if (document.template.code === INTENSIVE_COOLING_TEMPLATE_CODE) {
    return (
      <IntensiveCoolingDocumentClient
        routeCode={code}
        documentId={document.id}
        title={document.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        config={document.config}
        users={enrichedEmployees}
      />
    );
  }

  if (isAcceptanceDocumentTemplate(document.template.code)) {
    return (
      <AcceptanceDocumentClient
        documentId={document.id}
        routeCode={code}
        title={document.title}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        dateTo={toDateKey(document.dateTo)}
        status={document.status}
        users={enrichedEmployees}
        config={normalizeAcceptanceDocumentConfig(document.config, enrichedEmployees)}
      />
    );
  }

  if (document.template.code === PPE_ISSUANCE_TEMPLATE_CODE) {
    return (
      <PpeIssuanceDocumentClient
        documentId={document.id}
        title={document.title || "Журнал учета выдачи СИЗ"}
        organizationName={organization?.name || 'ООО "Тест"'}
        dateFrom={toDateKey(document.dateFrom)}
        status={document.status}
        users={enrichedEmployees}
        config={normalizePpeIssuanceConfig(document.config, enrichedEmployees)}
      />
    );
  }

  if (
    isTrackedDocumentTemplate(document.template.code) &&
    !isRegisterDocumentTemplate(document.template.code)
  ) {
    if (document.template.code === FRYER_OIL_TEMPLATE_CODE) {
      const fryerConfig = normalizeFryerOilDocumentConfig(document.config);
      return (
        <FryerOilDocumentClient
          documentId={document.id}
          title={document.title || "Журнал учета использования фритюрных жиров"}
          organizationName={organization?.name || 'ООО "Тест"'}
          status={document.status}
          dateFrom={toIsoDate(document.dateFrom)}
          config={fryerConfig}
          users={enrichedEmployees}
          initialEntries={document.entries.map((entry) => ({
            id: entry.id,
            date: toIsoDate(entry.date),
            data: normalizeFryerOilEntryData(entry.data),
          }))}
          routeCode={code}
        />
      );
    }

    if (document.template.code === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
      const uvConfig = normalizeUvRuntimeDocumentConfig(document.config);
      return (
        <UvLampRuntimeDocumentClient
          key={`${document.id}:${document.updatedAt.toISOString()}:${document.entries.length}:${document.status}:${document.dateFrom.toISOString()}:${document.dateTo.toISOString()}`}
          documentId={document.id}
          routeCode={code}
          title={document.title || buildUvRuntimeDocumentTitle(uvConfig)}
          organizationName={organization?.name || 'ООО "Тест"'}
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

    if (document.template.code === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE) {
      return (
        <CleaningVentilationChecklistDocumentClient
          documentId={document.id}
          title={document.title || CLEANING_VENTILATION_CHECKLIST_TITLE}
          organizationName={organization?.name || 'ООО "Тест"'}
          status={document.status}
          dateFrom={toIsoDate(document.dateFrom)}
          users={enrichedEmployees}
          config={normalizeCleaningVentilationConfig(document.config, enrichedEmployees)}
          initialEntries={document.entries.map((entry) => ({
            id: entry.id,
            date: toIsoDate(entry.date),
            data: normalizeCleaningVentilationEntryData(entry.data),
          }))}
          routeCode={code}
        />
      );
    }

    if (isSanitaryDayChecklistTemplate(document.template.code)) {
      return (
        <SanitaryDayChecklistDocumentClient
          documentId={document.id}
          title={document.title || "Чек-лист"}
          organizationName={organization?.name || 'ООО "Тест"'}
          status={document.status}
          dateFrom={toIsoDate(document.dateFrom)}
          users={enrichedEmployees}
          config={normalizeSdcConfig(document.config)}
          initialEntries={document.entries.map((entry) => ({
            id: entry.id,
            date: toIsoDate(entry.date),
            data: normalizeSdcEntryData(entry.data),
          }))}
          routeCode={code}
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
        templateCode={document.template.code}
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
        users={enrichedEmployees}
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
        templateCode={document.template.code}
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
