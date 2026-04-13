export const AUDIT_PROTOCOL_TEMPLATE_CODE = "audit_protocol";
export const AUDIT_PROTOCOL_SOURCE_SLUG = "auditprotocol";
export const AUDIT_PROTOCOL_DOCUMENT_TITLE = "Протокол внутреннего аудита";

export type AuditProtocolSection = {
  id: string;
  title: string;
};

export type AuditProtocolRow = {
  id: string;
  sectionId: string;
  text: string;
  result: "yes" | "no" | "";
  note: string;
};

export type AuditProtocolSignature = {
  id: string;
  name: string;
  role: string;
  signedAt: string;
};

export type AuditProtocolConfig = {
  documentDate: string;
  basisTitle: string;
  auditedObject: string;
  sections: AuditProtocolSection[];
  rows: AuditProtocolRow[];
  signatures: AuditProtocolSignature[];
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function createAuditProtocolSection(title: string): AuditProtocolSection {
  return { id: createId("section"), title };
}

export function createAuditProtocolRow(params?: Partial<AuditProtocolRow>): AuditProtocolRow {
  return {
    id: createId("row"),
    sectionId: params?.sectionId || "",
    text: params?.text || "",
    result: params?.result || "",
    note: params?.note || "",
  };
}

export function createAuditProtocolSignature(
  params?: Partial<AuditProtocolSignature>
): AuditProtocolSignature {
  return {
    id: createId("sign"),
    name: params?.name || "",
    role: params?.role || "",
    signedAt: params?.signedAt || new Date().toISOString().slice(0, 10),
  };
}

export function getDefaultAuditProtocolConfig(): AuditProtocolConfig {
  const documentDate = new Date().toISOString().slice(0, 10);
  const sections = [
    createAuditProtocolSection("Общие требования СМБПП"),
    createAuditProtocolSection("Требования к документации"),
    createAuditProtocolSection("Требования к персоналу"),
  ];

  return {
    documentDate,
    basisTitle: "Годовой план-программа внутренних аудитов",
    auditedObject: "Производственный участок",
    sections,
    rows: [
      createAuditProtocolRow({
        sectionId: sections[0].id,
        text: "Наличие утвержденных процедур и записей по внутреннему контролю.",
        result: "yes",
      }),
      createAuditProtocolRow({
        sectionId: sections[1].id,
        text: "Актуальность инструкций и журналов на рабочих местах.",
        result: "no",
        note: "Требуется обновить часть документов.",
      }),
    ],
    signatures: [
      createAuditProtocolSignature({
        name: "",
        role: "Главный аудитор",
        signedAt: documentDate,
      }),
    ],
  };
}

function normalizeSections(value: unknown, fallback: AuditProtocolSection[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const title = safeText(source.title);
      if (!title) return null;
      return { id: safeText(source.id, `section-${index + 1}`), title };
    })
    .filter((item): item is AuditProtocolSection => item !== null);
  return items.length > 0 ? items : fallback;
}

function normalizeRows(
  value: unknown,
  fallback: AuditProtocolRow[],
  sectionIds: string[]
) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const sectionId = safeText(source.sectionId);
      if (!sectionIds.includes(sectionId)) return null;
      return {
        id: safeText(source.id, `row-${index + 1}`),
        sectionId,
        text: safeText(source.text),
        result: source.result === "yes" || source.result === "no" ? source.result : "",
        note: safeText(source.note),
      } satisfies AuditProtocolRow;
    })
    .filter((item): item is AuditProtocolRow => item !== null);
  return items.length > 0 ? items : fallback;
}

function normalizeSignatures(value: unknown, fallback: AuditProtocolSignature[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const name = safeText(source.name);
      if (!name) return null;
      return {
        id: safeText(source.id, `sign-${index + 1}`),
        name,
        role: safeText(source.role),
        signedAt: safeText(source.signedAt),
      };
    })
    .filter((item): item is AuditProtocolSignature => item !== null);
  return items.length > 0 ? items : fallback;
}

export function normalizeAuditProtocolConfig(value: unknown): AuditProtocolConfig {
  const fallback = getDefaultAuditProtocolConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const sections = normalizeSections(source.sections, fallback.sections);

  return {
    documentDate: safeText(source.documentDate, fallback.documentDate),
    basisTitle: safeText(source.basisTitle, fallback.basisTitle),
    auditedObject: safeText(source.auditedObject, fallback.auditedObject),
    sections,
    rows: normalizeRows(
      source.rows,
      fallback.rows.map((row) => ({ ...row, sectionId: sections[0]?.id || row.sectionId })),
      sections.map((item) => item.id)
    ),
    signatures: normalizeSignatures(source.signatures, fallback.signatures),
  };
}
