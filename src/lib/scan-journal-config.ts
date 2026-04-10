export type ScanJournalConfig = {
  code: string;
  title: string;
  folderName: string;
  sourceSlugs: string[];
};

export const SCAN_JOURNALS: ScanJournalConfig[] = [
  {
    code: "audit_report_scan",
    title: "Отчет о внутреннем аудите",
    folderName: "Отчет о внутреннем аудите",
    sourceSlugs: ["auditreport"],
  },
  {
    code: "audit_protocol_scan",
    title: "Протокол внутреннего аудита",
    folderName: "Протокол внутреннего аудита",
    sourceSlugs: ["auditprotocol"],
  },
  {
    code: "audit_plan_scan",
    title: "Журнал учета металлопримесей",
    folderName: "Журнал учета металлопримесей",
    sourceSlugs: ["metalimpurityjournal", "auditplan"],
  },
];

export const SCAN_ONLY_JOURNAL_CODES = new Set(SCAN_JOURNALS.map((item) => item.code));

export function isScanOnlyDocumentTemplate(templateCode: string) {
  return SCAN_ONLY_JOURNAL_CODES.has(templateCode);
}

export function getScanJournalConfig(templateCode: string) {
  return SCAN_JOURNALS.find((item) => item.code === templateCode) || null;
}
