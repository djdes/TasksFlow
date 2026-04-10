export type ScanJournalConfig = {
  code: string;
  title: string;
  description: string;
  folderName: string;
  sourceSlugs: string[];
  sortOrder: number;
  dateLabel: string;
  showResponsible?: boolean;
  defaultResponsibleTitle?: string;
};

export const SCAN_JOURNALS: ScanJournalConfig[] = [
  {
    code: "audit_report_scan",
    title: "Отчет о внутреннем аудите",
    description: "Скан-версия журнала отчета о внутреннем аудите.",
    folderName: "Отчет о внутреннем аудите",
    sourceSlugs: ["auditreport"],
    sortOrder: 40,
    dateLabel: "Дата документа",
  },
  {
    code: "audit_protocol_scan",
    title: "Протокол внутреннего аудита",
    description: "Скан-версия журнала протокола внутреннего аудита.",
    folderName: "Протокол внутреннего аудита",
    sourceSlugs: ["auditprotocol"],
    sortOrder: 39,
    dateLabel: "Дата документа",
  },
  {
    code: "metal_impurity_scan",
    title: "Журнал учета металлопримесей",
    description: "Скан-версия журнала учета металлопримесей.",
    folderName: "Журнал учета металлопримесей",
    sourceSlugs: ["metalimpurityjournal"],
    sortOrder: 33,
    dateLabel: "Дата начала",
    showResponsible: true,
    defaultResponsibleTitle: "Ответственный",
  },
];

export const SCAN_ONLY_JOURNAL_CODES = new Set(SCAN_JOURNALS.map((item) => item.code));

export function isScanOnlyDocumentTemplate(templateCode: string) {
  return SCAN_ONLY_JOURNAL_CODES.has(templateCode);
}

export function getScanJournalConfig(templateCode: string) {
  return SCAN_JOURNALS.find((item) => item.code === templateCode) || null;
}

export function getScanJournalConfigBySourceSlug(sourceSlug: string) {
  return SCAN_JOURNALS.find((item) => item.sourceSlugs.includes(sourceSlug)) || null;
}

export function formatScanJournalDate(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${day}-${month}-${year}`;
}
