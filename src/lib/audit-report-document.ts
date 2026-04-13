export const AUDIT_REPORT_TEMPLATE_CODE = "audit_report";
export const AUDIT_REPORT_SOURCE_SLUG = "auditreport";
export const AUDIT_REPORT_DOCUMENT_TITLE = "Отчет о внутреннем аудите";

export type AuditReportFinding = {
  id: string;
  nonConformity: string;
  correctionActions: string;
  correctiveActions: string;
  responsibleName: string;
  responsiblePosition: string;
  dueDatePlan: string;
  dueDateFact: string;
};

export type AuditReportSignature = {
  id: string;
  role: string;
  name: string;
  position: string;
  signedAt: string;
};

export type AuditReportConfig = {
  documentDate: string;
  auditType: "planned" | "unplanned";
  basisTitle: string;
  auditedObject: string;
  auditors: string[];
  summary: string;
  recommendations: string;
  findings: AuditReportFinding[];
  signatures: AuditReportSignature[];
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
  return items.length > 0 ? items : fallback;
}

export function createAuditReportFinding(
  params?: Partial<AuditReportFinding>
): AuditReportFinding {
  return {
    id: createId("finding"),
    nonConformity: params?.nonConformity || "",
    correctionActions: params?.correctionActions || "",
    correctiveActions: params?.correctiveActions || "",
    responsibleName: params?.responsibleName || "",
    responsiblePosition: params?.responsiblePosition || "",
    dueDatePlan: params?.dueDatePlan || new Date().toISOString().slice(0, 10),
    dueDateFact: params?.dueDateFact || "",
  };
}

export function createAuditReportSignature(
  params?: Partial<AuditReportSignature>
): AuditReportSignature {
  return {
    id: createId("signature"),
    role: params?.role || "",
    name: params?.name || "",
    position: params?.position || "",
    signedAt: params?.signedAt || new Date().toISOString().slice(0, 10),
  };
}

export function getDefaultAuditReportConfig(): AuditReportConfig {
  const documentDate = new Date().toISOString().slice(0, 10);
  return {
    documentDate,
    auditType: "planned",
    basisTitle: "Годовой план-программа внутренних аудитов",
    auditedObject: "Производственный участок",
    auditors: [],
    summary:
      "Проверка проведена в соответствии с внутренним планом аудитов. Оценены записи, персонал и выполнение процедур.",
    recommendations:
      "Устранить замечания, обновить рабочие инструкции и повторно проверить корректирующие действия в установленный срок.",
    findings: [
      createAuditReportFinding({
        nonConformity:
          "Часть записей по мониторингу критических контрольных точек заполнена несвоевременно.",
        correctionActions: "Проведен разбор нарушений и актуализированы ответственные лица.",
        correctiveActions:
          "Введен дополнительный контроль со стороны руководителя подразделения.",
        responsibleName: "",
        responsiblePosition: "Руководитель подразделения",
      }),
    ],
    signatures: [
      createAuditReportSignature({
        role: "Аудитор",
        name: "",
        position: "Главный аудитор",
        signedAt: documentDate,
      }),
    ],
  };
}

function normalizeFindings(value: unknown, fallback: AuditReportFinding[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      return {
        id: safeText(source.id, `finding-${index + 1}`),
        nonConformity: safeText(source.nonConformity),
        correctionActions: safeText(source.correctionActions),
        correctiveActions: safeText(source.correctiveActions),
        responsibleName: safeText(source.responsibleName),
        responsiblePosition: safeText(source.responsiblePosition),
        dueDatePlan: safeText(source.dueDatePlan),
        dueDateFact: safeText(source.dueDateFact),
      };
    })
    .filter((item): item is AuditReportFinding => item !== null);
  return items.length > 0 ? items : fallback;
}

function normalizeSignatures(value: unknown, fallback: AuditReportSignature[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      return {
        id: safeText(source.id, `signature-${index + 1}`),
        role: safeText(source.role),
        name: safeText(source.name),
        position: safeText(source.position),
        signedAt: safeText(source.signedAt),
      };
    })
    .filter((item): item is AuditReportSignature => item !== null);
  return items.length > 0 ? items : fallback;
}

export function normalizeAuditReportConfig(value: unknown): AuditReportConfig {
  const fallback = getDefaultAuditReportConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  return {
    documentDate: safeText(source.documentDate, fallback.documentDate),
    auditType: source.auditType === "unplanned" ? "unplanned" : "planned",
    basisTitle: safeText(source.basisTitle, fallback.basisTitle),
    auditedObject: safeText(source.auditedObject, fallback.auditedObject),
    auditors: normalizeStringList(source.auditors, fallback.auditors),
    summary: safeText(source.summary, fallback.summary),
    recommendations: safeText(source.recommendations, fallback.recommendations),
    findings: normalizeFindings(source.findings, fallback.findings),
    signatures: normalizeSignatures(source.signatures, fallback.signatures),
  };
}
