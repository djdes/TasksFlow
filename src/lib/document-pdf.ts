import fs from "fs";
import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import { db } from "@/lib/db";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  getClimateDateLabel,
  getClimateDocumentTitle,
  getClimateFilePrefix,
  getClimatePeriodicityText,
  normalizeClimateDocumentConfig,
  normalizeClimateEntryData,
  type ClimateDocumentConfig,
} from "@/lib/climate-document";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  getColdEquipmentDocumentTitle,
  getColdEquipmentFilePrefix,
  normalizeColdEquipmentDocumentConfig,
  normalizeColdEquipmentEntryData,
} from "@/lib/cold-equipment-document";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  getCleaningDocumentTitle,
  getCleaningFilePrefix,
  normalizeCleaningDocumentConfig,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  getFinishedProductDocumentTitle,
  getFinishedProductFilePrefix,
  normalizeFinishedProductDocumentConfig,
} from "@/lib/finished-product-document";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  getPerishableRejectionDocumentTitle,
  getPerishableRejectionFilePrefix,
  normalizePerishableRejectionConfig,
  ORGANOLEPTIC_LABELS,
  STORAGE_CONDITION_LABELS,
} from "@/lib/perishable-rejection-document";
import {
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  formatProductWriteoffDateLong,
  getProductWriteoffFilePrefix,
  normalizeProductWriteoffConfig,
} from "@/lib/product-writeoff-document";
import { normalizeJournalStaffBoundConfig } from "@/lib/journal-staff-binding";
import {
  GLASS_LIST_TEMPLATE_CODE,
  formatGlassListDateLong,
  getGlassListFilePrefix,
  normalizeGlassListConfig,
} from "@/lib/glass-list-document";
import {
  GLASS_CONTROL_TEMPLATE_CODE,
  formatRuDateDash as formatGlassRuDateDash,
  getGlassControlFilePrefix,
  GLASS_CONTROL_PAGE_TITLE,
  normalizeGlassControlConfig,
  normalizeGlassControlEntryData,
} from "@/lib/glass-control-document";
import {
  formatPestControlDate,
  formatPestControlRowDate,
  normalizePestControlEntryData,
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_TEMPLATE_CODE,
} from "@/lib/pest-control-document";
import {
  CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE,
  CLEANING_VENTILATION_CHECKLIST_TITLE,
  getCleaningVentilationFilePrefix,
} from "@/lib/cleaning-ventilation-checklist-document";
import { drawCleaningVentilationChecklistPdf } from "@/lib/cleaning-ventilation-checklist-pdf";
import {
  getTrackedDocumentTitle,
  isTrackedDocumentTemplate,
  type TrackedDocumentTemplateCode,
} from "@/lib/tracked-document";
import {
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  formatTraceabilityQuantity,
  normalizeTraceabilityDocumentConfig,
} from "@/lib/traceability-document";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  calculateDurationMinutes,
  formatRuDateDash,
  getDisinfectionConditionLabel,
  getDisinfectionObjectLabel,
  getRadiationModeLabel,
  normalizeUvRuntimeDocumentConfig,
  normalizeUvRuntimeEntryData,
} from "@/lib/uv-lamp-runtime-document";
import {
  FRYER_OIL_TEMPLATE_CODE,
  normalizeFryerOilDocumentConfig,
  normalizeFryerOilEntryData,
  getFryerOilDocumentTitle,
  getFryerOilFilePrefix,
  formatTime as formatFryerTime,
  formatDateRu as formatFryerDateRu,
  QUALITY_ASSESSMENT_TABLE,
  QUALITY_LABELS,
  type FryerOilDocumentConfig,
} from "@/lib/fryer-oil-document";
import {
  SANITATION_DAY_TEMPLATE_CODE,
  SANITATION_DAY_DOCUMENT_TITLE,
  SANITATION_MONTHS,
  normalizeSanitationDayConfig,
} from "@/lib/sanitation-day-document";
import {
  getRegisterDocumentFilePrefix,
  getRegisterDocumentTitle,
  isRegisterDocumentTemplate,
  normalizeRegisterDocumentConfig,
  parseRegisterFields,
  type RegisterField,
} from "@/lib/register-document";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  getAcceptanceDocumentTitle,
  normalizeAcceptanceDocumentConfig,
} from "@/lib/acceptance-document";
import {
  PPE_ISSUANCE_DOCUMENT_TITLE,
  PPE_ISSUANCE_TEMPLATE_CODE,
  formatPpeIssuanceDate,
  getPpeIssuanceIssuerLabel,
  getPpeIssuanceRecipientLabel,
  normalizePpeIssuanceConfig,
} from "@/lib/ppe-issuance-document";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  TRAINING_PLAN_HEADING,
  normalizeTrainingPlanConfig,
} from "@/lib/training-plan-document";
import {
  AUDIT_PLAN_DOCUMENT_TITLE,
  AUDIT_PLAN_TEMPLATE_CODE,
  normalizeAuditPlanConfig,
} from "@/lib/audit-plan-document";
import {
  AUDIT_PROTOCOL_DOCUMENT_TITLE,
  AUDIT_PROTOCOL_TEMPLATE_CODE,
  normalizeAuditProtocolConfig,
} from "@/lib/audit-protocol-document";
import {
  AUDIT_REPORT_DOCUMENT_TITLE,
  AUDIT_REPORT_TEMPLATE_CODE,
  normalizeAuditReportConfig,
} from "@/lib/audit-report-document";
import {
  METAL_IMPURITY_DOCUMENT_TITLE,
  METAL_IMPURITY_TEMPLATE_CODE,
  getMetalImpurityOptionName,
  getMetalImpurityValuePerKg,
  normalizeMetalImpurityConfig,
} from "@/lib/metal-impurity-document";
import {
  BREAKDOWN_HISTORY_TEMPLATE_CODE,
  BREAKDOWN_HISTORY_HEADING,
  normalizeBreakdownHistoryDocumentConfig,
} from "@/lib/breakdown-history-document";
import {
  ACCIDENT_DOCUMENT_TEMPLATE_CODE,
  ACCIDENT_DOCUMENT_HEADING,
  normalizeAccidentDocumentConfig,
} from "@/lib/accident-document";
import {
  formatIntensiveCoolingDate,
  formatTemperatureLabel as formatIntensiveCoolingTemperatureLabel,
  getIntensiveCoolingFilePrefix,
  INTENSIVE_COOLING_DOCUMENT_TITLE,
  INTENSIVE_COOLING_TEMPLATE_CODE,
  normalizeIntensiveCoolingConfig,
  type IntensiveCoolingConfig,
} from "@/lib/intensive-cooling-document";
import {
  EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
  calculateNextCalibrationDate,
  formatCalibrationDate,
  formatCalibrationDateLong,
  normalizeEquipmentCalibrationConfig,
} from "@/lib/equipment-calibration-document";
import {
  buildHygieneExampleEmployees,
  buildDateKeys,
  formatMonthLabel,
  getDayNumber,
  getHealthDocumentTitle,
  getHygieneDocumentTitle,
  getStatusMeta,
  getWeekdayShort,
  HYGIENE_REGISTER_LEGEND,
  HYGIENE_REGISTER_NOTES,
  HYGIENE_REGISTER_PERIODICITY,
  HEALTH_REGISTER_NOTES,
  HEALTH_REGISTER_REMINDER,
  normalizeHealthEntryData,
  normalizeHygieneEntryData,
  toDateKey,
} from "@/lib/hygiene-document";
import {
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  getEquipmentCleaningResultLabel,
  normalizeEquipmentCleaningConfig,
  normalizeEquipmentCleaningRowData,
} from "@/lib/equipment-cleaning-document";
import {
  DISINFECTANT_DOCUMENT_TITLE,
  DISINFECTANT_TEMPLATE_CODE,
  MEASURE_UNIT_LABELS,
  computeNeedPerMonth,
  computeNeedPerTreatment,
  computeNeedPerYear,
  formatNumber as formatDisinfectantNumber,
  normalizeDisinfectantConfig,
} from "@/lib/disinfectant-document";
import {
  EXAMINATION_REFERENCE_DATA,
  formatMedBookDate,
  MED_BOOK_DOCUMENT_TITLE,
  MED_BOOK_PRELIMINARY_PERIODIC_ROWS,
  MED_BOOK_TEMPLATE_CODE,
  MED_BOOK_VACCINATION_RULES,
  normalizeMedBookConfig,
  normalizeMedBookEntryData,
  VACCINATION_REFERENCE_DATA,
  VACCINATION_TYPE_LABELS,
} from "@/lib/med-book-document";

const FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
];

function loadUnicodeFont(doc: jsPDF) {
  const fontPath = FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));

  if (!fontPath) {
    return "helvetica";
  }

  const base64 = fs.readFileSync(fontPath).toString("base64");
  doc.addFileToVFS("journal-unicode.ttf", base64);
  doc.addFont("journal-unicode.ttf", "JournalUnicode", "normal");
  doc.addFont("journal-unicode.ttf", "JournalUnicode", "bold");
  doc.addFont("journal-unicode.ttf", "JournalUnicode", "italic");
  return "JournalUnicode";
}

function makeCellKey(employeeId: string, dateKey: string) {
  return `${employeeId}:${dateKey}`;
}

function drawCenteredText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number
) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const lineHeight = 4.6;
  const startY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    doc.text(line, x + width / 2, startY + index * lineHeight, { align: "center" });
  });
}

function drawMedBookPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  config: ReturnType<typeof normalizeMedBookConfig>;
  entries: Array<{ employeeId: string; date: Date; data: unknown }>;
  users: Array<{ id: string; name: string; role: string; email: string | null }>;
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const groupedEntries = new Map<string, { employeeId: string; data: ReturnType<typeof normalizeMedBookEntryData> }>();

  for (const entry of params.entries) {
    groupedEntries.set(entry.employeeId, {
      employeeId: entry.employeeId,
      data: normalizeMedBookEntryData(entry.data),
    });
  }

  const rows = Array.from(groupedEntries.values()).map((entry, index) => {
    const user = params.users.find((item) => item.id === entry.employeeId);
    return {
      index: index + 1,
      name: user?.name || "Сотрудник",
      data: entry.data,
    };
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(16);
  doc.text(params.organizationName, pageWidth / 2, 16, { align: "center" });
  doc.setFontSize(14);
  doc.text(params.title || MED_BOOK_DOCUMENT_TITLE, pageWidth / 2, 25, { align: "center" });

  autoTable(doc, {
    startY: 33,
    head: [[
      "№ п/п",
      "Ф.И.О. сотрудника",
      "Должность",
      ...params.config.examinations,
    ]],
    body: rows.length > 0
      ? rows.map((row) => [
          String(row.index),
          row.name,
          row.data.positionTitle || "",
          ...params.config.examinations.map((column) => {
            const exam = row.data.examinations[column];
            if (!exam?.date) return "";
            return exam.expiryDate
              ? `${formatMedBookDate(exam.date)} / до ${formatMedBookDate(exam.expiryDate)}`
              : formatMedBookDate(exam.date);
          }),
        ])
      : [Array(3 + params.config.examinations.length).fill("")],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [236, 236, 236],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  autoTable(doc, {
    startY: (((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY) || 33) + 8,
    head: [[
      "Предварительные осмотры",
      "Периодические осмотры",
    ]],
    body: MED_BOOK_PRELIMINARY_PERIODIC_ROWS.map((row) => [row.preliminary, row.periodic]),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [236, 236, 236],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    pageBreak: "auto",
  });

  autoTable(doc, {
    startY: (((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY) || 80) + 8,
    head: [[
      "Наименование специалиста / исследования",
      "Периодичность",
      "Примечание",
    ]],
    body: EXAMINATION_REFERENCE_DATA.map((item) => [item.name, item.periodicity, item.note || "—"]),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [236, 236, 236],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    pageBreak: "auto",
  });

  if (!params.config.includeVaccinations) {
    return;
  }

  doc.addPage();
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(16);
  doc.text("Прививки", pageWidth / 2, 16, { align: "center" });

  autoTable(doc, {
    startY: 24,
    head: [[
      "№ п/п",
      "Ф.И.О. сотрудника",
      "Должность",
      ...params.config.vaccinations,
      "Примечание",
    ]],
    body: rows.length > 0
      ? rows.map((row) => [
          String(row.index),
          row.name,
          row.data.positionTitle || "",
          ...params.config.vaccinations.map((column) => {
            const vaccination = row.data.vaccinations[column];
            if (!vaccination) return "";
            if (vaccination.type !== "done") {
              return VACCINATION_TYPE_LABELS[vaccination.type];
            }
            const parts = [
              vaccination.dose ? `${vaccination.dose}:` : null,
              vaccination.date ? formatMedBookDate(vaccination.date) : null,
              vaccination.expiryDate ? `до ${formatMedBookDate(vaccination.expiryDate)}` : null,
            ].filter(Boolean);
            return parts.join(" ");
          }),
          row.data.note || "",
        ])
      : [Array(4 + params.config.vaccinations.length).fill("")],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [236, 236, 236],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  autoTable(doc, {
    startY: (((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY) || 24) + 8,
    head: [[
      "Наименование прививки",
      "Периодичность",
    ]],
    body: VACCINATION_REFERENCE_DATA.map((item) => [item.name, item.periodicity]),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [236, 236, 236],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    pageBreak: "auto",
  });

  let noteY = (((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY) || 40) + 8;
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(9);
  for (const rule of MED_BOOK_VACCINATION_RULES) {
    if (noteY > doc.internal.pageSize.getHeight() - 12) {
      doc.addPage();
      noteY = 16;
    }
    const lines = doc.splitTextToSize(rule, pageWidth - 20) as string[];
    doc.text(lines, 10, noteY);
    noteY += lines.length * 4.5 + 2;
  }
}

function drawJournalHeader(doc: jsPDF, params: {
  organizationName: string;
  pageLabel: string;
  journalLabel: string;
  withPeriodicity: boolean;
}) {
  const { organizationName, pageLabel, journalLabel, withPeriodicity } = params;
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 24;
  const y = 28;
  const width = pageWidth - 48;
  const leftWidth = 56;
  const rightWidth = 28;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;
  const periodicityHeight = withPeriodicity ? 18 : 0;
  const totalHeight = topHeight + secondHeight + periodicityHeight;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, totalHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + totalHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + totalHeight);
  doc.line(x + leftWidth, y + topHeight, x + leftWidth + middleWidth, y + topHeight);
  doc.line(x + leftWidth, y + topHeight + secondHeight, x + width, y + topHeight + secondHeight);

  doc.setFontSize(10);
  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, organizationName, x + 3, y, leftWidth - 6, topHeight + secondHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(
    doc,
    journalLabel.toUpperCase(),
    x + leftWidth,
    y + topHeight,
    middleWidth,
    secondHeight,
    middleWidth - 10
  );

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(
    doc,
    pageLabel,
    x + leftWidth + middleWidth,
    y,
    rightWidth,
    topHeight + secondHeight,
    rightWidth - 6
  );

  if (withPeriodicity) {
    doc.setFont("JournalUnicode", "bold");
    drawCenteredText(doc, "Периодичность контроля", x + 3, y + topHeight + secondHeight, leftWidth - 6, periodicityHeight, leftWidth - 10);

    doc.setFont("JournalUnicode", "normal");
    const lines = [
      HYGIENE_REGISTER_PERIODICITY[0],
      HYGIENE_REGISTER_PERIODICITY[1],
    ];
    let cursorY = y + topHeight + secondHeight + 6;
    lines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, middleWidth + rightWidth - 10) as string[];
      wrapped.forEach((chunk) => {
        doc.text(chunk, x + leftWidth + 4, cursorY);
        cursorY += 4.6;
      });
    });
  }

  doc.setFont("JournalUnicode", "normal");
}

function drawTitle(doc: jsPDF, title: string) {
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(26);
  doc.text(title, 14, 15);
}

function getPrintableUsers(
  users: { id: string; name: string; role: string; email?: string | null }[],
  employeeIds: string[]
) {
  const uniqueIds = [...new Set(employeeIds)];
  const rosterUsers = users.filter((user) => uniqueIds.includes(user.id));

  return buildHygieneExampleEmployees(rosterUsers, Math.max(rosterUsers.length, 7)).map(
    (user) => ({
      id: user.id,
      number: user.number,
      name: user.name || "",
      position: user.position || "",
    })
  );
}

function centerCell(content: string): CellDef {
  return {
    content,
    styles: { halign: "center", valign: "middle" },
  };
}

function ensurePdfBodyRows(body: RowInput[], columnCount: number, minRows = 3): RowInput[] {
  if (body.length > 0) return body;
  return Array.from({ length: minRows }, () =>
    Array.from({ length: columnCount }, () => centerCell(""))
  );
}

function formatDateTime(
  date: string | Date | null | undefined,
  hour?: number | null,
  minute?: number | null
) {
  if (!date) return "";

  const dateValue =
    date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return String(date);

  const hh = typeof hour === "number" ? String(hour).padStart(2, "0") : "";
  const mm = typeof minute === "number" ? String(minute).padStart(2, "0") : "";
  const timePart = hh && mm ? ` ${hh}:${mm}` : "";

  return `${day}.${month}.${year}${timePart}`;
}

function buildHygieneHead(dateKeys: string[], monthLabel: string): RowInput[] {
  return [
    [
      { content: "№ п/п", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Ф.И.О. работника", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Должность", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      {
        content: `Месяц ${monthLabel}`,
        colSpan: dateKeys.length,
        styles: { halign: "center", valign: "middle" },
      },
    ],
    dateKeys.map((dateKey) => ({
      content: String(getDayNumber(dateKey)),
      styles: { halign: "center" },
    })),
  ];
}

function buildHealthHead(dateKeys: string[], monthLabel: string): RowInput[] {
  return [
    [
      { content: "☐", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "№\nп/п", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Ф.И.О. работника", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Должность", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      {
        content: `Месяц ${monthLabel}`,
        colSpan: dateKeys.length,
        styles: { halign: "center", valign: "middle" },
      },
      { content: "Принятые меры", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    ],
    dateKeys.map((dateKey) => ({
      content: `${getDayNumber(dateKey)}\n${getWeekdayShort(dateKey)}.`,
      styles: { halign: "center" },
    })),
  ];
}

function getHealthMeasuresText(
  employeeId: string,
  dateKeys: string[],
  entryMap: Record<string, Record<string, unknown>>
) {
  return dateKeys
    .flatMap((dateKey) => {
      const measures = normalizeHealthEntryData(
        entryMap[makeCellKey(employeeId, dateKey)]
      ).measures?.trim();

      if (!measures) return [];

      return [`${getDayNumber(dateKey)} ${getWeekdayShort(dateKey)}. - ${measures}`];
    })
    .join("\n");
}

function buildHygieneBody(params: {
  users: { id: string; name: string; role: string }[];
  employeeIds: string[];
  dateKeys: string[];
  responsibleTitle: string | null;
  entryMap: Record<string, Record<string, unknown>>;
}): RowInput[] {
  const printableUsers = getPrintableUsers(params.users, params.employeeIds);
  const rows: RowInput[] = [];

  printableUsers.forEach((employee) => {
    rows.push([
      { content: String(employee.number), rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: employee.name, styles: { halign: "center" } },
      { content: employee.position, styles: { halign: "center" } },
      ...params.dateKeys.map((dateKey) => {
        const entry = normalizeHygieneEntryData(params.entryMap[makeCellKey(employee.id, dateKey)]);
        return centerCell(getStatusMeta(entry.status)?.code || "");
      }),
    ]);

    rows.push([
      {
        content: "Температура сотрудника более 37°C?",
        colSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      ...params.dateKeys.map((dateKey) => {
        const entry = normalizeHygieneEntryData(params.entryMap[makeCellKey(employee.id, dateKey)]);
        let value = "";
        if (entry.temperatureAbove37 === true) value = "да";
        if (entry.temperatureAbove37 === false) value = "нет";
        if (entry.temperatureAbove37 === null && entry.status === "day_off") value = "-";
        return centerCell(value);
      }),
    ]);
  });

  rows.push([
    {
      content: "Должность ответственного за контроль",
      colSpan: 2,
      styles: { halign: "center", valign: "middle" },
    },
    centerCell(params.responsibleTitle || ""),
    ...params.dateKeys.map(() => centerCell("")),
  ]);

  return rows;
}

function buildHealthBody(params: {
  users: { id: string; name: string; role: string }[];
  employeeIds: string[];
  dateKeys: string[];
  entryMap: Record<string, Record<string, unknown>>;
  printEmptyRows?: number;
}): RowInput[] {
  const uniqueIds = [...new Set(params.employeeIds)];
  const rosterUsers = params.users.filter((user) => uniqueIds.includes(user.id));
  const printableUsers = buildHygieneExampleEmployees(
    rosterUsers,
    Math.max(rosterUsers.length + (params.printEmptyRows || 0), 5)
  );

  const rows = printableUsers.map((employee) => [
    centerCell("☐"),
    centerCell(employee.name ? String(employee.number) : ""),
    centerCell(employee.name || ""),
    centerCell(employee.position || ""),
    ...params.dateKeys.map((dateKey) => {
      const entry = normalizeHealthEntryData(params.entryMap[makeCellKey(employee.id, dateKey)]);
      return centerCell(entry.signed ? "+" : "");
    }),
    {
      content: getHealthMeasuresText(employee.id, params.dateKeys, params.entryMap),
      styles: { halign: "left" as const, valign: "middle" as const },
    },
  ]);

  rows.push([
    centerCell("☐"),
    centerCell(""),
    centerCell(""),
    centerCell(""),
    ...params.dateKeys.map(() => centerCell("")),
    centerCell(""),
  ]);

  return rows;
}

function drawHygienePdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  monthLabel: string;
  dateKeys: string[];
  users: { id: string; name: string; role: string }[];
  employeeIds: string[];
  responsibleTitle: string | null;
  entryMap: Record<string, Record<string, unknown>>;
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  drawTitle(doc, "Гигиенический журнал");
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 2",
    journalLabel: "Гигиенический журнал",
    withPeriodicity: true,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(14);
  doc.text(params.title.toUpperCase(), pageWidth / 2, 74, { align: "center" });

  autoTable(doc, {
    startY: 80,
    head: buildHygieneHead(params.dateKeys, params.monthLabel),
    body: buildHygieneBody(params),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.5,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 30 },
      2: { cellWidth: 34 },
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(9);
  doc.text("В журнал регистрируются результаты:", 14, finalY + 8);
  doc.setFont("JournalUnicode", "normal");
  renderWrappedTextBlock(doc, [`- ${HYGIENE_REGISTER_NOTES[0]}`], 14, finalY + 13, pageWidth - 28, 4.5);

  doc.addPage("a4", "landscape");
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 2 ИЗ 2",
    journalLabel: "Гигиенический журнал",
    withPeriodicity: true,
  });

  const secondPageStartY = 84;
  let cursorY = renderWrappedTextBlock(
    doc,
    HYGIENE_REGISTER_NOTES.slice(1).map((note) => `- ${note}`),
    14,
    secondPageStartY,
    pageWidth - 28,
    5
  );
  cursorY += 8;
  doc.setFont("JournalUnicode", "bold");
  doc.text(
    "Список работников, отмеченных в журнале на день осмотра, должен соответствовать числу работников на этот день в смену",
    14,
    cursorY
  );

  cursorY += 12;
  doc.setFont("JournalUnicode", "italic");
  doc.text("Условные обозначения:", 14, cursorY);
  cursorY += 5;
  renderWrappedTextBlock(doc, HYGIENE_REGISTER_LEGEND, 14, cursorY, pageWidth - 28, 5);
}

function drawHealthPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  monthLabel: string;
  dateKeys: string[];
  users: { id: string; name: string; role: string }[];
  employeeIds: string[];
  entryMap: Record<string, Record<string, unknown>>;
  printEmptyRows?: number;
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  drawTitle(doc, "Журнал здоровья");
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "Журнал здоровья",
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(14);
  doc.text(params.title.toUpperCase(), pageWidth / 2, 70, { align: "center" });

  autoTable(doc, {
    startY: 76,
    head: buildHealthHead(params.dateKeys, params.monthLabel),
    body: buildHealthBody(params),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.3,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 12 },
      2: { cellWidth: 32 },
      3: { cellWidth: 28 },
      [params.dateKeys.length + 4]: { cellWidth: 32 },
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;
  let cursorY = renderWrappedTextBlock(doc, HEALTH_REGISTER_NOTES, 14, finalY + 10, pageWidth - 28, 5);
  cursorY += 8;
  doc.setFont("JournalUnicode", "bold");
  doc.text(HEALTH_REGISTER_REMINDER, 14, cursorY);
}

function drawClimateMetaTable(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
}) {
  // drawTitle() sets a large font size; reset it for header table.
  doc.setFontSize(10);
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 36;
  const y = 28;
  const width = pageWidth - 72;
  const leftWidth = 40;
  const rightWidth = 38;
  const middleWidth = width - leftWidth - rightWidth;
  const rowHeight = 11;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, rowHeight * 3);
  doc.line(x + leftWidth, y, x + leftWidth, y + rowHeight * 3);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + rowHeight * 3);
  doc.line(x + leftWidth, y + rowHeight, x + leftWidth + middleWidth, y + rowHeight);
  doc.line(x, y + rowHeight * 2, x + width, y + rowHeight * 2);
  doc.line(x + leftWidth + middleWidth, y + rowHeight, x + width, y + rowHeight);

  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, params.organizationName, x, y, leftWidth, rowHeight * 2, leftWidth - 4);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, rowHeight, middleWidth - 8);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(
    doc,
    params.title.toUpperCase(),
    x + leftWidth,
    y + rowHeight,
    middleWidth,
    rowHeight,
    middleWidth - 8
  );

  doc.setFont("JournalUnicode", "bold");
  doc.text(`Начат  ${getClimateDateLabel(params.dateFrom)}`, x + leftWidth + middleWidth + 3, y + 6.5);
  doc.text(`Окончен  ${getClimateDateLabel(params.dateTo)}`, x + leftWidth + middleWidth + 3, y + 17.5);
}

function stampClimatePageNumbers(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  const x = doc.internal.pageSize.getWidth() - 69;
  const y = 56.5;

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.text(`СТР. ${pageNumber} ИЗ ${totalPages}`, x, y);
  }
}

function buildClimateNormsBody(config: ClimateDocumentConfig): RowInput[] {
  const rooms = config.rooms.filter(
    (room) => room.temperature.enabled || room.humidity.enabled
  );

  const rows: RowInput[] = rooms.map((room) => [
    {
      content: room.name,
      styles: { halign: "left" as const, valign: "middle" as const },
    },
    room.temperature.enabled
      ? `от ${room.temperature.min ?? "—"}°C до ${room.temperature.max ?? "—"}°C`
      : "—",
    room.humidity.enabled
      ? `от ${room.humidity.min ?? "—"}% до ${room.humidity.max ?? "—"}%`
      : "—",
  ]);

  rows.push([
    {
      content: "Частота контроля",
      colSpan: 2,
      styles: { halign: "left" as const, valign: "middle" as const, fontStyle: "bold" as const },
    },
    getClimatePeriodicityText(config),
  ]);

  return rows;
}

function buildClimateHead(config: ClimateDocumentConfig): RowInput[] {
  const rooms = config.rooms.filter(
    (room) => room.temperature.enabled || room.humidity.enabled
  );
  const totalColumns = rooms.reduce((total, room) => {
    const metricCount = Number(room.temperature.enabled) + Number(room.humidity.enabled);
    return total + config.controlTimes.length * metricCount;
  }, 0);

  return [
    [
      { content: "Дата", rowSpan: 3, styles: { halign: "center", valign: "middle" } },
      {
        content: "Точки контроля",
        colSpan: totalColumns,
        styles: { halign: "center", valign: "middle" },
      },
      { content: "Ответственный", rowSpan: 3, styles: { halign: "center", valign: "middle" } },
    ],
    rooms.flatMap((room) => {
      const metricCount = Number(room.temperature.enabled) + Number(room.humidity.enabled);
      return [
        {
          content: room.name,
          colSpan: config.controlTimes.length * metricCount,
          styles: { halign: "center", valign: "middle" },
        },
      ];
    }),
    rooms.flatMap((room) =>
      config.controlTimes.flatMap((time) => {
        const cells: CellDef[] = [];
        if (room.temperature.enabled) {
          cells.push({
            content: `${time}\nT, °C`,
            styles: { halign: "center", valign: "middle" },
          });
        }
        if (room.humidity.enabled) {
          cells.push({
            content: `${time}\nВВ, %`,
            styles: { halign: "center", valign: "middle" },
          });
        }
        return cells;
      })
    ),
  ];
}

function buildClimateBody(params: {
  config: ClimateDocumentConfig;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
  users: { id: string; name: string; role: string }[];
}): RowInput[] {
  const rooms = params.config.rooms.filter(
    (room) => room.temperature.enabled || room.humidity.enabled
  );
  const userMap = Object.fromEntries(params.users.map((user) => [user.id, user]));

  return params.entries.map((entry) => {
    const normalized = normalizeClimateEntryData(entry.data);
    const user = userMap[entry.employeeId];

    return [
      centerCell(getClimateDateLabel(entry.date)),
      ...rooms.flatMap((room) =>
        params.config.controlTimes.flatMap((time) => {
          const measurement = normalized.measurements[room.id]?.[time];
          const cells: CellDef[] = [];

          if (room.temperature.enabled) {
            cells.push(
              centerCell(
                measurement?.temperature != null ? String(measurement.temperature) : ""
              )
            );
          }
          if (room.humidity.enabled) {
            cells.push(
              centerCell(
                measurement?.humidity != null ? String(measurement.humidity) : ""
              )
            );
          }

          return cells;
        })
      ),
      {
        content: user
          ? `${user.name}${normalized.responsibleTitle ? `\n${normalized.responsibleTitle}` : ""}`
          : normalized.responsibleTitle || "",
        styles: { halign: "center" as const, valign: "middle" as const },
      },
    ];
  });
}

function drawClimatePdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ClimateDocumentConfig;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
  users: { id: string; name: string; role: string }[];
}) {
  drawTitle(doc, getClimateDocumentTitle());
  drawClimateMetaTable(doc, params);

  autoTable(doc, {
    startY: 66,
    head: [[
      { content: "Нормы условий", styles: { halign: "center", valign: "middle" } },
      { content: "Температура (T)", styles: { halign: "center", valign: "middle" } },
      { content: "Влажность воздуха (ВВ)", styles: { halign: "center", valign: "middle" } },
    ]],
    body: buildClimateNormsBody(params.config),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 36, right: 36 },
  });

  const normsEndY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 96;

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(14);
  doc.text(params.title.toUpperCase(), doc.internal.pageSize.getWidth() / 2, normsEndY + 12, {
    align: "center",
  });

  autoTable(doc, {
    startY: normsEndY + 18,
    head: buildClimateHead(params.config),
    body: buildClimateBody(params),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 6.5,
      cellPadding: 0.8,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  stampClimatePageNumbers(doc);
}

function drawColdEquipmentPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeColdEquipmentDocumentConfig>;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
}) {
  drawTitle(doc, getColdEquipmentDocumentTitle());
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const equipment = params.config.equipment;
  const head = [[
    { content: "Дата", styles: { halign: "center" as const, valign: "middle" as const } },
    ...equipment.map((item) => ({
      content: `${item.name}\n(${item.min ?? "—"}...${item.max ?? "—"}°C)`,
      styles: { halign: "center" as const, valign: "middle" as const },
    })),
    { content: "Ответственный", styles: { halign: "center" as const, valign: "middle" as const } },
  ]] as RowInput[];

  const body: RowInput[] = params.entries.map((entry) => {
    const data = normalizeColdEquipmentEntryData(entry.data);
    return [
      centerCell(getClimateDateLabel(entry.date)),
      ...equipment.map((item) =>
        centerCell(
          data.temperatures[item.id] != null ? String(data.temperatures[item.id]) : ""
        )
      ),
      centerCell(data.responsibleTitle || ""),
    ];
  });

  autoTable(doc, {
    startY: 66,
    head,
    body: ensurePdfBodyRows(body, equipment.length + 2),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.1,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function drawCleaningPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
}) {
  const config = normalizeCleaningDocumentConfig(params.config);
  void params.entries;

  const dateKeys = buildDateKeys(params.dateFrom, params.dateTo);
  const pageWidth = doc.internal.pageSize.getWidth();
  const monthDate =
    dateKeys[0]
      ? new Date(`${dateKeys[0]}T00:00:00.000Z`)
      : params.dateFrom instanceof Date
        ? params.dateFrom
        : new Date(`${String(params.dateFrom).slice(0, 10)}T00:00:00.000Z`);
  const monthLabel = monthDate.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  }).replace(" г.", " г.");
  const normalizedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const journalTitle = params.title || getCleaningDocumentTitle();

  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: journalTitle,
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text(journalTitle.toUpperCase(), pageWidth / 2, 54, { align: "center" });

  const matrixRows: RowInput[] = [
    ...config.rooms.map((room) => [
      {
        content: room.name,
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      {
        content: room.detergent || "—",
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      ...dateKeys.map((dateKey) => centerCell(config.matrix[room.id]?.[dateKey] || "")),
    ]),
    ...config.cleaningResponsibles.map((responsible) => [
      {
        content: "Ответственный за уборку",
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      {
        content: `${responsible.code} - ${responsible.userName || "—"}`,
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      ...dateKeys.map((dateKey) => centerCell(config.matrix[responsible.id]?.[dateKey] || "")),
    ]),
    ...config.controlResponsibles.map((responsible) => [
      {
        content: "Ответственный за контроль",
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      {
        content: `${responsible.code} - ${responsible.userName || "—"}`,
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      ...dateKeys.map((dateKey) => centerCell(config.matrix[responsible.id]?.[dateKey] || "")),
    ]),
  ];

  if (matrixRows.length === 0) {
    matrixRows.push([
      centerCell("—"),
      centerCell("—"),
      ...dateKeys.map(() => centerCell("")),
    ]);
  }

  const matrixHead: RowInput[] = [
    [
      {
        content: "Наименование помещения",
        rowSpan: 2,
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      {
        content: "Моющие и дезинфицирующие средства",
        rowSpan: 2,
        styles: { halign: "center" as const, valign: "middle" as const },
      },
      {
        content: `Месяц ${normalizedMonthLabel}`,
        colSpan: Math.max(dateKeys.length, 1),
        styles: { halign: "center" as const, valign: "middle" as const },
      },
    ],
    dateKeys.length > 0
      ? dateKeys.map((dateKey) => centerCell(String(Number(dateKey.slice(-2)))))
      : [centerCell("")],
  ];

  const columnStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: 56 },
    1: { cellWidth: 44 },
  };
  const dayWidth = dateKeys.length > 0 ? Math.max(8, Math.min(12, 160 / dateKeys.length)) : 12;
  dateKeys.forEach((_, index) => {
    columnStyles[index + 2] = { cellWidth: dayWidth };
  });

  autoTable(doc, {
    startY: 60,
    head: matrixHead,
    body: matrixRows,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    bodyStyles: {
      lineWidth: 0.2,
    },
    margin: { left: 16, right: 16 },
    columnStyles,
  });

  const afterMatrixY = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 140;
  doc.setFont("JournalUnicode", "italic");
  const legendY = afterMatrixY + 8;
  doc.text("Условные обозначения:", 16, legendY);
  const afterLegendY = renderWrappedTextBlock(
    doc,
    config.legend.length > 0 ? config.legend : ["/ - Уборка не проводилась", "T - Текущая", "G - Генеральная"],
    16,
    legendY + 5,
    pageWidth - 32,
    4.8
  );
  doc.setFont("JournalUnicode", "normal");

  const referenceRows: RowInput[] = config.rooms.map((room) => [
    {
      content: room.name,
      styles: { halign: "left" as const, valign: "middle" as const },
    },
    {
      content: room.currentScope.join(", "),
      styles: { halign: "left" as const, valign: "middle" as const },
    },
    {
      content: room.generalScope.join(", "),
      styles: { halign: "left" as const, valign: "middle" as const },
    },
  ]);

  autoTable(doc, {
    startY: afterLegendY + 6,
    head: [[
      centerCell("Наименование помещения"),
      centerCell("Текущая уборка"),
      centerCell("Генеральная уборка"),
    ]],
    body: referenceRows.length > 0 ? referenceRows : [[centerCell("—"), centerCell("—"), centerCell("—")]],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    bodyStyles: {
      lineWidth: 0.2,
    },
    margin: { left: 16, right: 16, bottom: 18 },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 96 },
      2: { cellWidth: 96 },
    },
  });
}

function drawFinishedProductPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeFinishedProductDocumentConfig>;
}) {
  drawTitle(doc, getFinishedProductDocumentTitle());
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const headRow: RowInput = [
    centerCell("№"),
    centerCell("Дата/время изготовления"),
    centerCell("Время снятия бракеража"),
    centerCell(
      params.config.fieldNameMode === "semi"
        ? "Наименование полуфабриката"
        : "Наименование блюд (изделий)"
    ),
    centerCell("Органолептическая оценка"),
  ];
  if (params.config.showProductTemp) headRow.push(centerCell("T продукта"));
  if (params.config.showCorrectiveAction) headRow.push(centerCell("Корректирующие действия"));
  if (params.config.showOxygenLevel) headRow.push(centerCell("Остаточный кислород, %"));
  headRow.push(centerCell("Разрешение к реализации"));
  if (params.config.showCourierTime) headRow.push(centerCell("Передача курьеру"));
  headRow.push(centerCell("Ответственный"));
  headRow.push(
    centerCell(
      params.config.inspectorMode === "commission_signatures"
        ? "Подписи комиссии"
        : "ФИО лица, проводившего бракераж"
    )
  );
  const head: RowInput[] = [headRow];

  const body: RowInput[] = params.config.rows.map((row, index) => {
    const line: RowInput = [
      centerCell(String(index + 1)),
      centerCell(row.productionDateTime || ""),
      centerCell(row.rejectionTime || ""),
      { content: row.productName || "", styles: { halign: "left", valign: "middle" } },
      centerCell(row.organoleptic || ""),
    ];
    if (params.config.showProductTemp) line.push(centerCell(row.productTemp || ""));
    if (params.config.showCorrectiveAction) {
      line.push({ content: row.correctiveAction || "", styles: { halign: "left", valign: "middle" } });
    }
    if (params.config.showOxygenLevel) line.push(centerCell(row.oxygenLevel || ""));
    line.push(centerCell(row.releasePermissionTime || ""));
    if (params.config.showCourierTime) line.push(centerCell(row.courierTransferTime || ""));
    line.push(centerCell(row.responsiblePerson || ""));
    line.push(centerCell(row.inspectorName || ""));
    return line;
  });

  autoTable(doc, {
    startY: 66,
    head,
    body: ensurePdfBodyRows(body, headRow.length),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.1,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  if (params.config.footerNote) {
    const y = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 66;
    doc.setFont("JournalUnicode", "normal");
    doc.setFontSize(9);
    doc.text(params.config.footerNote, 10, y + 8);
  }
}

type TrackedField = {
  key: string;
  label: string;
  type: string;
  options: { value: string; label: string }[];
};

function getTrackedFields(fields: unknown): TrackedField[] {
  if (!Array.isArray(fields)) return [];

  return fields
    .map((field) => {
      const item = field as Record<string, unknown>;
      return {
        key: typeof item.key === "string" ? item.key : "",
        label: typeof item.label === "string" ? item.label : "",
        type: typeof item.type === "string" ? item.type : "text",
        options: Array.isArray(item.options)
          ? (item.options as Array<Record<string, unknown>>)
              .map((option) => ({
                value: typeof option.value === "string" ? option.value : "",
                label: typeof option.label === "string" ? option.label : "",
              }))
              .filter((option) => option.value !== "")
          : [],
      };
    })
    .filter((field) => field.key !== "");
}

function getTrackedFieldValue(field: TrackedField, value: unknown) {
  if (value == null || value === "") return "";
  if (field.type === "boolean") return value === true ? "Да" : "Нет";

  if (field.type === "select") {
    const stringValue = String(value);
    return field.options.find((option) => option.value === stringValue)?.label || stringValue;
  }

  return String(value);
}

function getRegisterFieldValue(
  field: RegisterField,
  value: string,
  users: { id: string; name: string; role: string }[],
  equipment: { id: string; name: string }[]
) {
  if (!value) return "";

  if (field.type === "employee") {
    return users.find((user) => user.id === value)?.name || value;
  }

  if (field.type === "equipment") {
    return equipment.find((item) => item.id === value)?.name || value;
  }

  if (field.type === "select") {
    return field.options.find((option) => option.value === value)?.label || value;
  }

  return value;
}

function isRegisterFieldVisible(
  field: RegisterField,
  values: Record<string, string>
) {
  if (!field.showIf) return true;
  return values[field.showIf.field] === field.showIf.equals;
}

function getTrackedFilePrefix(templateCode: string) {
  return `journal-${templateCode.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}

function formatAcceptanceDateRu(dateKey: string) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}-${m}-${y}`;
}

function formatTraceabilityDateRu(dateKey: string) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}-${m}-${y}`;
}

function drawAcceptancePdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: ReturnType<typeof normalizeAcceptanceDocumentConfig>;
  users: { id: string; name: string; role: string }[];
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  drawTitle(doc, params.title || getAcceptanceDocumentTitle(ACCEPTANCE_DOCUMENT_TEMPLATE_CODE));
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ЖУРНАЛ ПРИЕМКИ И ВХОДНОГО КОНТРОЛЯ ПРОДУКЦИИ",
    withPeriodicity: false,
  });

  const dateFromStr = params.dateFrom instanceof Date
    ? formatAcceptanceDateRu(params.dateFrom.toISOString().slice(0, 10))
    : formatAcceptanceDateRu(String(params.dateFrom).slice(0, 10));

  // Date info in header right cell
  const headerRight = pageWidth - 24;
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(`Начат  ${dateFromStr}`, headerRight, 32, { align: "right" });
  doc.text("Окончен ________", headerRight, 38, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(11);
  doc.text("ЖУРНАЛ ПРИЕМКИ И ВХОДНОГО КОНТРОЛЯ ПРОДУКЦИИ", centerX, 60, { align: "center" });

  const headRow1: CellDef[] = [
    { content: "Дата, время\nпоступления\nпродукции,\nтовара", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Наименование\nпродукции", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Производитель/\nпоставщик", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Условия\nтранспорти\nровки", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Соответствие\nупаковки,\nмаркировки,\nтоваросопроводи\nтельной\nдокументации", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Результаты\nорганолепти\nческой\nоценки\nдоброка\nчественности", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Предельный\nсрок\nреализации\n(дата, час)", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Примечания", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    { content: "Ответственный", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
  ];

  const head: RowInput[] = [headRow1];

  const userMap = new Map(params.users.map((u) => [u.id, u.name]));

  const rows = cfg.rows;

  const body: RowInput[] = rows.map((row) => {
    const deliveryDateStr = formatAcceptanceDateRu((row as Record<string, string>).deliveryDate || (row as Record<string, string>).dateSupply || "");
    const deliveryTime = (row as Record<string, string>).deliveryHour ? `\n${(row as Record<string, string>).deliveryHour}:${(row as Record<string, string>).deliveryMinute || "00"}` : "";
    const expiryDateStr = formatAcceptanceDateRu(row.expiryDate || "");
    const expiryTime = (row as Record<string, string>).expiryHour ? `\n${(row as Record<string, string>).expiryHour}:${(row as Record<string, string>).expiryMinute || "00"}` : "";

    const transport = (row as Record<string, string>).transportCondition === "unsatisfactory" ? "Не удовл." : "Удовл.";
    const packaging = ((row as Record<string, string>).packagingCompliance === "non_compliant" || (row as Record<string, string>).packagingCompliance === "no") ? "Не соотв." : "Соответствует";
    const organoleptic = ((row as Record<string, string>).organolepticResult === "unsatisfactory" || (row as Record<string, string>).decision === "reject") ? "Не удовл." : "Удовл.";

    const cells: CellDef[] = [
      centerCell(deliveryDateStr + deliveryTime),
      centerCell(row.productName),
      centerCell([row.manufacturer, row.supplier].filter(Boolean).join(" / ")),
      centerCell(transport),
      centerCell(packaging),
      centerCell(organoleptic),
      centerCell(expiryDateStr + expiryTime),
      centerCell((row as Record<string, string>).note || (row as Record<string, string>).correctiveAction || ""),
      centerCell(userMap.get(row.responsibleUserId) || ""),
    ];

    return cells;
  });

  if (body.length === 0) {
    for (let i = 0; i < 3; i++) {
      body.push(Array(9).fill(centerCell("")));
    }
  }

  const baseColCount = 9;
  const monthColWidth = (pageWidth - 28) / baseColCount;

  autoTable(doc, {
    startY: 66,
    margin: { left: 14, right: 14 },
    head,
    body: ensurePdfBodyRows(body, 9),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 6.5,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
      fontSize: 6,
    },
    bodyStyles: {
      lineWidth: 0.2,
    },
  });
}

function drawPpeIssuancePdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: ReturnType<typeof normalizePpeIssuanceConfig>;
  users: { id: string; name: string; role: string }[];
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const dateFromStr =
    params.dateFrom instanceof Date
      ? formatPpeIssuanceDate(params.dateFrom.toISOString().slice(0, 10))
      : formatPpeIssuanceDate(String(params.dateFrom).slice(0, 10));

  drawTitle(doc, params.title || PPE_ISSUANCE_DOCUMENT_TITLE);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ЖУРНАЛ УЧЕТА ВЫДАЧИ СИЗ",
    withPeriodicity: false,
  });

  const headerRight = pageWidth - 24;
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(`Начат  ${dateFromStr}`, headerRight, 32, { align: "right" });
  doc.text("Окончен __________", headerRight, 38, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(11);
  doc.text("ЖУРНАЛ УЧЕТА ВЫДАЧИ СИЗ", centerX, 60, { align: "center" });

  const head: RowInput[] = [[
    { content: "Дата выдачи СИЗ", styles: { halign: "center" as const, valign: "middle" as const } },
    { content: "Количество масок, выданных на 1 рабочую неделю", styles: { halign: "center" as const, valign: "middle" as const } },
    ...(cfg.showGloves ? [{ content: "Количество пар перчаток, выданных на 1 рабочую неделю", styles: { halign: "center" as const, valign: "middle" as const } }] : []),
    ...(cfg.showShoes ? [{ content: "Количество пар обуви, выданных на 1 рабочую неделю", styles: { halign: "center" as const, valign: "middle" as const } }] : []),
    ...(cfg.showClothing ? [{ content: "Количество комплектов одежды, выданных на 1 рабочую неделю", styles: { halign: "center" as const, valign: "middle" as const } }] : []),
    ...(cfg.showCaps ? [{ content: "Количество шапочек, выданных на 1 рабочую неделю", styles: { halign: "center" as const, valign: "middle" as const } }] : []),
    { content: "Должность и ФИО лица, получившего СИЗ", styles: { halign: "center" as const, valign: "middle" as const } },
    { content: "ФИО лица, выдавшего СИЗ", styles: { halign: "center" as const, valign: "middle" as const } },
  ]];

  const body: RowInput[] = cfg.rows.map((row) => [
    centerCell(formatPpeIssuanceDate(row.issueDate)),
    centerCell(String(row.maskCount || "")),
    ...(cfg.showGloves ? [centerCell(String(row.gloveCount || ""))] : []),
    ...(cfg.showShoes ? [centerCell(String(row.shoePairsCount || ""))] : []),
    ...(cfg.showClothing ? [centerCell(String(row.clothingSetsCount || ""))] : []),
    ...(cfg.showCaps ? [centerCell(String(row.capCount || ""))] : []),
    centerCell(getPpeIssuanceRecipientLabel(row, params.users)),
    centerCell(getPpeIssuanceIssuerLabel(row, params.users)),
  ]);

  if (body.length === 0) {
    for (let i = 0; i < 3; i++) {
      body.push(Array(head[0].length).fill(centerCell("")));
    }
  }

  autoTable(doc, {
    startY: 66,
    margin: { left: 14, right: 14 },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 6.5,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
      fontSize: 6,
    },
    bodyStyles: {
      lineWidth: 0.2,
    },
  });
}

function drawProductWriteoffPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date;
  config: ReturnType<typeof normalizeProductWriteoffConfig>;
}) {
  drawTitle(doc, params.title);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: params.config.documentName || params.title,
    withPeriodicity: false,
  });

  const dateLabel = formatProductWriteoffDateLong(params.config.documentDate || params.dateFrom);
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(16);
  doc.text("АКТ", 105, 72, { align: "center" });
  doc.text(`№ ${params.config.actNumber || "1"} от ${dateLabel}`, 105, 80, { align: "center" });

  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(11);
  let cursorY = 92;
  doc.text("Комиссия в составе:", 24, cursorY);
  cursorY += 7;
  if (params.config.commissionMembers.length === 0) {
    doc.text("________________", 30, cursorY);
    cursorY += 7;
  } else {
    params.config.commissionMembers.forEach((member) => {
      doc.text(`${member.role} ${member.employeeName}`, 30, cursorY);
      cursorY += 6;
    });
  }

  const introLines = doc.splitTextToSize(
    `Составила настоящий АКТ о том, что ${dateLabel} на предприятии выявлены ТМЦ с несоответствиями по качеству и (или) безопасности согласно списку ниже.`,
    160
  ) as string[];
  cursorY += 4;
  introLines.forEach((line) => {
    doc.text(line, 24, cursorY);
    cursorY += 5;
  });

  const supplierLines = doc.splitTextToSize(
    `Указанные ТМЦ были выработаны ${params.config.supplierName || "________________"} и поставлены...`,
    160
  ) as string[];
  supplierLines.forEach((line) => {
    doc.text(line, 24, cursorY);
    cursorY += 5;
  });

  cursorY += 3;
  doc.text("Комиссия постановила выполнить в отношении выявленных ТМЦ следующие действия:", 24, cursorY);

  autoTable(doc, {
    startY: cursorY + 5,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 9,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: "middle",
      textColor: [0, 0, 0],
    },
    headStyles: {
      font: "JournalUnicode",
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      halign: "center",
    },
    head: [[
      "№ п/п",
      "Наименование ТМЦ",
      "№ партии, дата выработки",
      "Количество (кг, шт)",
      "Описание несоответствия",
      "Действия с ТМЦ",
    ]],
    body: (params.config.rows.length > 0
      ? params.config.rows
      : [{ productName: "", batchNumber: "", productionDate: "", quantity: "", discrepancyDescription: "", action: "" }]
    ).map((row, index) => [
      String(index + 1),
      row.productName,
      [row.batchNumber, row.productionDate].filter(Boolean).join("\n"),
      row.quantity,
      row.discrepancyDescription,
      row.action,
    ]),
    margin: { left: 24, right: 24 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 34 },
      2: { cellWidth: 30, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 40, halign: "center" },
      5: { cellWidth: 40, halign: "center" },
    },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || cursorY) + 14;
  doc.text("Подписи членов комиссии:", 24, finalY);
  let signY = finalY + 8;
  (params.config.commissionMembers.length > 0 ? params.config.commissionMembers : [{ employeeName: "" }]).forEach((member) => {
    doc.text(member.employeeName || "________________", 30, signY);
    doc.line(62, signY + 1, 112, signY + 1);
    signY += 8;
  });
}

function drawPerishableRejectionPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date;
  config: ReturnType<typeof normalizePerishableRejectionConfig>;
}) {
  drawTitle(doc, params.title);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: params.title,
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(11);
  doc.text(
    `Дата начала: ${params.dateFrom.toLocaleDateString("ru-RU")}`,
    24,
    72
  );

  const rows =
    params.config.rows.length > 0
      ? params.config.rows
      : [
          {
            id: "",
            arrivalDate: "",
            arrivalTime: "",
            productName: "",
            productionDate: "",
            manufacturer: "",
            supplier: "",
            packaging: "",
            quantity: "",
            documentNumber: "",
            organolepticResult: "compliant" as const,
            storageCondition: "2_6" as const,
            expiryDate: "",
            actualSaleDate: "",
            actualSaleTime: "",
            responsiblePerson: "",
            note: "",
          },
        ];

  autoTable(doc, {
    startY: 78,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: "middle",
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      font: "JournalUnicode",
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      halign: "center",
      valign: "middle",
    },
    margin: { left: 10, right: 10 },
    head: [[
      "№",
      "Дата, время поступления",
      "Наименование",
      "Дата выработки",
      "Изготовитель / поставщик",
      "Фасовка / кол-во",
      "Документ",
      "Органолептическая оценка",
      "Условия хранения / срок реализации",
      "Дата, время реализации",
      "Ответственное лицо",
      "Примечание",
    ]],
    body: rows.map((row, index) => [
      String(index + 1),
      [row.arrivalDate, row.arrivalTime].filter(Boolean).join("\n"),
      row.productName,
      row.productionDate,
      [row.manufacturer, row.supplier].filter(Boolean).join("\n"),
      [row.packaging, row.quantity].filter(Boolean).join("\n"),
      row.documentNumber,
      ORGANOLEPTIC_LABELS[row.organolepticResult] || row.organolepticResult,
      [
        STORAGE_CONDITION_LABELS[row.storageCondition] || row.storageCondition,
        row.expiryDate,
      ]
        .filter(Boolean)
        .join("\n"),
      [row.actualSaleDate, row.actualSaleTime].filter(Boolean).join("\n"),
      row.responsiblePerson,
      row.note,
    ]),
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: 17, halign: "center" },
      4: { cellWidth: 25 },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: 18 },
      7: { cellWidth: 20 },
      8: { cellWidth: 24 },
      9: { cellWidth: 20, halign: "center" },
      10: { cellWidth: 24 },
      11: { cellWidth: 24 },
    },
  });
}

function drawGlassListPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date;
  config: ReturnType<typeof normalizeGlassListConfig>;
  responsibleName: string;
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const config = params.config;
  const documentDate = config.documentDate || params.dateFrom.toISOString().slice(0, 10);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(22);
  doc.text(params.title || "Перечень изделий", 14, 18);

  const x = 42;
  const y = 34;
  const width = pageWidth - 84;
  const leftWidth = 38;
  const rightWidth = 22;
  const middleWidth = width - leftWidth - rightWidth;

  doc.setLineWidth(0.2);
  doc.rect(x, y, width, 22);
  doc.line(x + leftWidth, y, x + leftWidth, y + 22);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + 22);
  doc.line(x + leftWidth, y + 11, x + leftWidth + middleWidth, y + 11);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  drawCenteredText(doc, params.organizationName, x, y, leftWidth, 22, leftWidth - 6);

  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(11);
  drawCenteredText(doc, "РЎРРЎРўР•РњРђ РҐРђРЎРЎРџ", x + leftWidth, y, middleWidth, 11, middleWidth - 6);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(
    doc,
    "РџР•Р Р•Р§Р•РќР¬ РР—Р”Р•Р›РР™ РР— РЎРўР•РљР›Рђ Р РҐР РЈРџРљРћР“Рћ РџР›РђРЎРўРРљРђ",
    x + leftWidth,
    y + 11,
    middleWidth,
    11,
    middleWidth - 10
  );
  drawCenteredText(doc, "РЎРўР . 1 РР— 1", x + leftWidth + middleWidth, y, rightWidth, 22, rightWidth - 4);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text("УТВЕРЖДАЮ", pageWidth - 36, 72, { align: "right" });
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(11);
  doc.text(config.responsibleTitle || "Управляющий", pageWidth - 36, 80, { align: "right" });
  doc.text(`____________________ ${params.responsibleName}`, pageWidth - 36, 88, { align: "right" });
  doc.text(`В« ${formatGlassListDateLong(documentDate)} Рі.`, pageWidth - 36, 96, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(14);
  doc.text(
    "РџР•Р Р•Р§Р•РќР¬ РР—Р”Р•Р›РР™ РР— РЎРўР•РљР›Рђ Р РҐР РЈРџРљРћР“Рћ РџР›РђРЎРўРРљРђ",
    pageWidth / 2,
    106,
    { align: "center" }
  );

  autoTable(doc, {
    startY: 114,
    margin: { left: 42, right: 42 },
    head: [[
      "",
      "Место расположения\n(участок)",
      "Наименование объекта контроля (предмета)",
      "РљРѕР»-РІРѕ",
    ]],
    body: (config.rows.length > 0 ? config.rows : [{ id: "empty", location: "", itemName: "", quantity: "" }]).map(
      (row) => ["", row.location || config.location || "", row.itemName || "", row.quantity || ""]
    ),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 10,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [239, 239, 239],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 34, halign: "center" },
      2: { cellWidth: 94, halign: "center" },
      3: { cellWidth: 18, halign: "center" },
    },
  });
}

function formatBreakdownDateRu(dateKey: string) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}-${m}-${y}`;
}

function formatAccidentDateTime(date: string, hour: string, minute: string) {
  return `${formatBreakdownDateRu(date)}\n${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function drawBreakdownHistoryPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: ReturnType<typeof normalizeBreakdownHistoryDocumentConfig>;
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  drawTitle(doc, params.title || BREAKDOWN_HISTORY_HEADING);

  const x = 24;
  const y = 28;
  const width = pageWidth - 48;
  const leftWidth = 56;
  const rightWidth = 32;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;
  const totalHeight = topHeight + secondHeight;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, totalHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + totalHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + totalHeight);
  doc.line(x + leftWidth, y + topHeight, x + leftWidth + middleWidth, y + topHeight);

  doc.setFontSize(10);
  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, params.organizationName, x + 3, y, leftWidth - 6, totalHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(doc, "КАРТОЧКА ИСТОРИИ ПОЛОМОК", x + leftWidth, y + topHeight, middleWidth, secondHeight, middleWidth - 10);

  const dateFromStr = params.dateFrom instanceof Date
    ? formatBreakdownDateRu(params.dateFrom.toISOString().slice(0, 10))
    : formatBreakdownDateRu(String(params.dateFrom).slice(0, 10));

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, `Начат  ${dateFromStr}\nОкончен _________`, x + leftWidth + middleWidth, y, rightWidth, topHeight, rightWidth - 4);
  drawCenteredText(doc, "СТР. 1 ИЗ 1", x + leftWidth + middleWidth, y + topHeight, rightWidth, secondHeight, rightWidth - 4);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text("КАРТОЧКА ИСТОРИИ ПОЛОМОК", centerX, y + totalHeight + 12, { align: "center" });

  const head: RowInput[] = [[
    { content: "Дата и\nвремя\nначала\nработ", styles: { halign: "center", valign: "middle" } },
    { content: "Наименование\nоборудования", styles: { halign: "center", valign: "middle" } },
    { content: "Описание поломки", styles: { halign: "center", valign: "middle" } },
    { content: "Выполненный ремонт", styles: { halign: "center", valign: "middle" } },
    { content: "Замена частей (если\nпроизведена)", styles: { halign: "center", valign: "middle" } },
    { content: "Дата и\nвремя\nокончания\nработ", styles: { halign: "center", valign: "middle" } },
    { content: "Часы\nпрост\nоя", styles: { halign: "center", valign: "middle" } },
    { content: "ФИО лица отв\nетственного\nза ремонт", styles: { halign: "center", valign: "middle" } },
  ]];

  const body: RowInput[] = cfg.rows.map((row) => {
    const startTime = row.startHour && row.startMinute ? `${row.startHour}:${row.startMinute}` : "";
    const endTime = row.endHour && row.endMinute ? `${row.endHour}:${row.endMinute}` : "";
    return [
      centerCell(`${formatBreakdownDateRu(row.startDate)}\n${startTime}`),
      centerCell(row.equipmentName),
      centerCell(row.breakdownDescription),
      centerCell(row.repairPerformed),
      centerCell(row.partsReplaced),
      centerCell(`${formatBreakdownDateRu(row.endDate)}\n${endTime}`),
      centerCell(row.downtimeHours),
      centerCell(row.responsiblePerson),
    ];
  });

  if (body.length === 0) {
    for (let i = 0; i < 3; i++) body.push(Array(8).fill(centerCell("")));
  }

  autoTable(doc, {
    startY: y + totalHeight + 18,
    margin: { left: 24, right: 24 },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: 0.2 },
  });
}

function drawAccidentPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: ReturnType<typeof normalizeAccidentDocumentConfig>;
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  drawTitle(doc, params.title || ACCIDENT_DOCUMENT_HEADING);

  const x = 18;
  const y = 28;
  const width = pageWidth - 36;
  const leftWidth = 48;
  const rightWidth = 40;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;
  const totalHeight = topHeight + secondHeight;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, totalHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + totalHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + totalHeight);
  doc.line(x + leftWidth, y + topHeight, x + leftWidth + middleWidth, y + topHeight);

  doc.setFontSize(10);
  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, params.organizationName, x + 3, y, leftWidth - 6, totalHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(doc, "ЖУРНАЛ УЧЕТА АВАРИЙ", x + leftWidth, y + topHeight, middleWidth, secondHeight, middleWidth - 10);

  const dateFromStr = params.dateFrom instanceof Date
    ? formatBreakdownDateRu(params.dateFrom.toISOString().slice(0, 10))
    : formatBreakdownDateRu(String(params.dateFrom).slice(0, 10));

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, `Начат  ${dateFromStr}\nОкончен __________`, x + leftWidth + middleWidth, y, rightWidth, topHeight, rightWidth - 4);
  drawCenteredText(doc, "СТР. 1 ИЗ 1", x + leftWidth + middleWidth, y + topHeight, rightWidth, secondHeight, rightWidth - 4);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text("ЖУРНАЛ УЧЕТА АВАРИЙ", centerX, y + totalHeight + 12, { align: "center" });

  const head: RowInput[] = [[
    { content: "", styles: { halign: "center", valign: "middle" } },
    { content: "№ п/п", styles: { halign: "center", valign: "middle" } },
    { content: "Дата и время аварии", styles: { halign: "center", valign: "middle" } },
    { content: "Наименование помещения, в котором зафиксирована авария", styles: { halign: "center", valign: "middle" } },
    { content: "Описание аварии (причины, возникновения, предпринятые действия для ликвидации аварии и т.д.)", styles: { halign: "center", valign: "middle" } },
    { content: "Наличие «потенциально небезопасной» пищевой продукции, предпринятые действия с продукцией", styles: { halign: "center", valign: "middle" } },
    { content: "Дата и время ликвидации аварии, допуск к работе", styles: { halign: "center", valign: "middle" } },
    { content: "ФИО лиц, ответственных за ликвидацию аварии и ее последствий", styles: { halign: "center", valign: "middle" } },
    { content: "Мероприятия (корректирующие действия), предпринятые комиссией для исключения возникновения аварии", styles: { halign: "center", valign: "middle" } },
  ]];

  const body: RowInput[] = cfg.rows.map((row, index) => [
    centerCell(""),
    centerCell(String(index + 1)),
    centerCell(formatAccidentDateTime(row.accidentDate, row.accidentHour, row.accidentMinute)),
    centerCell(row.locationName),
    centerCell(row.accidentDescription),
    centerCell(row.affectedProducts),
    centerCell(formatAccidentDateTime(row.resolvedDate, row.resolvedHour, row.resolvedMinute)),
    centerCell(row.responsiblePeople),
    centerCell(row.correctiveActions),
  ]);

  if (body.length === 0) {
    body.push(Array(9).fill(centerCell("")));
  } else {
    body.push([centerCell(""), ...Array(8).fill(centerCell(""))]);
  }

  autoTable(doc, {
    startY: y + totalHeight + 18,
    margin: { left: 10, right: 10 },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 14 },
      2: { cellWidth: 24 },
      3: { cellWidth: 30 },
      4: { cellWidth: 44 },
      5: { cellWidth: 38 },
      6: { cellWidth: 28 },
      7: { cellWidth: 30 },
      8: { cellWidth: 42 },
    },
  });
}

function drawEquipmentCalibrationPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  config: ReturnType<typeof normalizeEquipmentCalibrationConfig>;
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const headerRight = pageWidth - 24;

  drawTitle(doc, params.title || EQUIPMENT_CALIBRATION_DOCUMENT_TITLE);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ГРАФИК ПОВЕРКИ СРЕДСТВ ИЗМЕРЕНИЙ",
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  doc.text("УТВЕРЖДАЮ", headerRight, 60, { align: "right" });
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(cfg.approveRole || "", headerRight, 66, { align: "right" });
  doc.line(headerRight - 52, 70, headerRight, 70);
  doc.text(cfg.approveEmployee || "", headerRight, 74, { align: "right" });
  doc.text(formatCalibrationDateLong(cfg.documentDate), headerRight - 6, 80, {
    align: "center",
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text(`График поверки средств измерений на ${cfg.year} г.`, centerX, 90, {
    align: "center",
  });

  const head: RowInput[] = [
    [
      { content: "№ п/п", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      {
        content:
          "Идентификаторы СИ\n(наименование, тип, заводское обозначение, номер, место расположения)",
        rowSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Метрологические характеристики",
        colSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Межповерочный\nинтервал",
        rowSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Дата\nпоследней\nповерки",
        rowSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Сроки проведения\nочередной\nповерки",
        rowSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      { content: "Примечание", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    ],
    [
      {
        content: "Назначение\n(измеряемые\nпараметры)",
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Предел (диапазон)\nизмерений",
        styles: { halign: "center", valign: "middle" },
      },
    ],
  ];

  const body: RowInput[] = cfg.rows.map((row, index) => {
    const nextDate = calculateNextCalibrationDate(
      row.lastCalibrationDate,
      row.calibrationInterval
    );
    const isOverdue =
      nextDate !== "" && new Date(`${nextDate}T00:00:00.000Z`) < new Date();

    return [
      centerCell(String(index + 1)),
      centerCell(
        [row.equipmentName, row.equipmentNumber, row.location].filter(Boolean).join(", ")
      ),
      centerCell(row.purpose),
      centerCell(row.measurementRange),
      centerCell(`${row.calibrationInterval} мес.`),
      centerCell(formatCalibrationDate(row.lastCalibrationDate)),
      {
        content: formatCalibrationDate(nextDate),
        styles: {
          halign: "center",
          valign: "middle",
          textColor: isOverdue ? [220, 38, 38] : [0, 0, 0],
          fontStyle: isOverdue ? "bold" : "normal",
        },
      },
      centerCell(row.note),
    ];
  });

  if (body.length === 0) {
    body.push(Array(8).fill(centerCell("")));
  }

  autoTable(doc, {
    startY: 96,
    margin: { left: 24, right: 24 },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 48 },
      2: { cellWidth: 28 },
      3: { cellWidth: 30 },
      4: { cellWidth: 26 },
      5: { cellWidth: 22 },
      6: { cellWidth: 22 },
      7: { cellWidth: 34 },
    },
  });
}

function drawTrainingPlanPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  config: ReturnType<typeof normalizeTrainingPlanConfig>;
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const headerRight = pageWidth - 24;

  drawTitle(doc, params.title || "План обучения");
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ПЛАН ОБУЧЕНИЯ ПЕРСОНАЛА",
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  doc.text("УТВЕРЖДАЮ", headerRight, 60, { align: "right" });
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(cfg.approveRole || "", headerRight, 66, { align: "right" });
  doc.line(headerRight - 52, 70, headerRight, 70);
  doc.text(cfg.approveEmployee || "", headerRight, 74, { align: "right" });
  doc.text(
    `« ${cfg.documentDate.slice(8, 10)} » ${new Date(cfg.documentDate).toLocaleDateString("ru-RU", { month: "long" })} ${cfg.year} г.`,
    headerRight - 6,
    80,
    { align: "center" }
  );

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(11);
  doc.text(`ПЛАН ОБУЧЕНИЯ ПЕРСОНАЛА НА ${cfg.year} Г.`, centerX, 90, { align: "center" });

  const topics = cfg.topics;
  const head: RowInput[] = [
    [
      { content: "№ п/п", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      {
        content: "Должностная единица,\nподлежащая обучению",
        rowSpan: 2,
        styles: { halign: "center", valign: "middle" },
      },
      {
        content: "Требуется обучение по теме:",
        colSpan: topics.length,
        styles: { halign: "center", valign: "middle" },
      },
    ],
    topics.map((topic) => ({ content: topic.name, styles: { halign: "center", valign: "middle" } })),
  ];

  const body: RowInput[] = cfg.rows.map((row, index) => [
    centerCell(String(index + 1)),
    centerCell(row.positionName),
    ...topics.map((topic) => {
      const cell = row.cells[topic.id];
      if (!cell || !cell.required) return centerCell("");
      return centerCell(cell.date ? `✓ ${cell.date}` : "✓");
    }),
  ]);

  if (body.length === 0) {
    for (let i = 0; i < 3; i++) {
      body.push(Array(2 + topics.length).fill(centerCell("")));
    }
  }

  autoTable(doc, {
    startY: 96,
    margin: { left: 24, right: 24 },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 46 },
    },
  });
}

function drawSanitationDayPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  config: ReturnType<typeof normalizeSanitationDayConfig>;
}) {
  const cfg = params.config;
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  // --- Margins aligned with header (24mm each side) ---
  const marginLeft = 24;
  const headerRight = pageWidth - 24;

  // --- Title ---
  drawTitle(doc, params.title || SANITATION_DAY_DOCUMENT_TITLE);

  // --- Header table ---
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ГРАФИК И УЧЕТ ГЕНЕРАЛЬНЫХ УБОРОК",
    withPeriodicity: false,
  });

  // --- Approval block (right-aligned to header edge) ---
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  doc.text("УТВЕРЖДАЮ", headerRight, 60, { align: "right" });
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(cfg.approveRole || "", headerRight, 66, { align: "right" });
  doc.line(headerRight - 52, 70, headerRight, 70);
  doc.text(cfg.approveEmployee || "", headerRight, 74, { align: "right" });
  doc.text(
    `« ${cfg.documentDate.slice(8, 10)} » ${new Date(cfg.documentDate).toLocaleDateString("ru-RU", { month: "long" })} ${cfg.year} г.`,
    headerRight - 6,
    80,
    { align: "center" }
  );

  // --- Centered subtitle ---
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(11);
  doc.text(
    `График и учет генеральных уборок на предприятии в ${cfg.year} г.`,
    centerX,
    90,
    { align: "center" }
  );

  // --- Data table (centered on page) ---
  const roomColWidth = 60;
  const typeColWidth = 22;
  const monthColWidth = 13.5;
  const tableWidth = roomColWidth + typeColWidth + 12 * monthColWidth;
  const tableMargin = Math.round((pageWidth - tableWidth) / 2);

  const head: RowInput[] = [
    [
      { content: "Помещение", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      {
        content: "График",
        colSpan: SANITATION_MONTHS.length,
        styles: { halign: "center", valign: "middle" },
      },
    ],
    SANITATION_MONTHS.map((item) => ({ content: item.short, styles: { halign: "center" } })),
  ];

  const body: RowInput[] = [];
  for (const row of cfg.rows) {
    body.push([
      { content: row.roomName || "", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "План", styles: { halign: "center", valign: "middle" } },
      ...SANITATION_MONTHS.map((month) => centerCell(row.plan[month.key] || "")),
    ]);
    body.push([
      { content: "Факт", styles: { halign: "center", valign: "middle" } },
      ...SANITATION_MONTHS.map((month) => centerCell(row.fact[month.key] || "")),
    ]);
  }

  body.push([
    {
      content: `Ответственный: ${cfg.responsibleRole}, ${cfg.responsibleEmployee}`,
      colSpan: 2,
      styles: { halign: "left", valign: "middle" },
    },
    ...SANITATION_MONTHS.map(() => centerCell("")),
  ]);

  autoTable(doc, {
    startY: 96,
    margin: { left: tableMargin, right: tableMargin },
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      fontStyle: "bold",
    },
    bodyStyles: {
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: roomColWidth },
      1: { cellWidth: typeColWidth },
      ...Object.fromEntries(SANITATION_MONTHS.map((_, index) => [index + 2, { cellWidth: monthColWidth }])),
    },
  });
}

function drawTrackedPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  fields: TrackedField[];
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
  users: { id: string; name: string; role: string }[];
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const userMap = Object.fromEntries(params.users.map((user) => [user.id, user.name]));

  const head: RowInput[] = [[
    centerCell("Дата"),
    centerCell("Ответственный"),
    ...params.fields.map((field) => centerCell(field.label)),
  ]];

  const body: RowInput[] = params.entries.map((entry) => [
    centerCell(getClimateDateLabel(entry.date)),
    centerCell(userMap[entry.employeeId] || ""),
    ...params.fields.map((field) =>
      centerCell(getTrackedFieldValue(field, entry.data[field.key]))
    ),
  ]);

  autoTable(doc, {
    startY: 66,
    head,
    body: ensurePdfBodyRows(body, params.fields.length + 2),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.1,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function drawPestControlPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string | null;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
  users: { id: string; name: string; role: string }[];
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const startDate =
    params.dateFrom instanceof Date
      ? params.dateFrom.toISOString().slice(0, 10)
      : String(params.dateFrom).slice(0, 10);
  const endDate =
    params.dateTo instanceof Date
      ? params.dateTo.toISOString().slice(0, 10)
      : typeof params.dateTo === "string"
        ? params.dateTo.slice(0, 10)
        : "";
  const userMap = Object.fromEntries(params.users.map((user) => [user.id, user.name]));

  drawTitle(doc, params.title || PEST_CONTROL_DOCUMENT_TITLE);

  const x = 24;
  const y = 28;
  const width = pageWidth - 48;
  const leftWidth = 56;
  const rightWidth = 32;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, topHeight + secondHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + topHeight + secondHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + topHeight + secondHeight);
  doc.line(x + leftWidth, y + topHeight, x + width, y + topHeight);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  drawCenteredText(doc, params.organizationName, x + 3, y, leftWidth - 6, topHeight + secondHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(doc, (params.title || PEST_CONTROL_DOCUMENT_TITLE).toUpperCase(), x + leftWidth, y + topHeight, middleWidth, secondHeight, middleWidth - 12);

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(9);
  doc.text(`Начат   ${formatPestControlDate(startDate)}`, x + leftWidth + middleWidth + 2, y + 5);
  doc.text("Окончен __________", x + leftWidth + middleWidth + 2, y + 10);
  if (endDate && endDate !== startDate) {
    doc.setFont("JournalUnicode", "normal");
    doc.text(formatPestControlDate(endDate), x + width - 2, y + 10, { align: "right" });
    doc.setFont("JournalUnicode", "bold");
  }
  doc.setFont("JournalUnicode", "normal");
  doc.text("СТР. 1 ИЗ 1", x + width - 2, y + 16, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(14);
  doc.text(
    (params.title || PEST_CONTROL_DOCUMENT_TITLE).toUpperCase(),
    pageWidth / 2,
    58,
    { align: "center" }
  );

  const bodyRows = params.entries
    .map((entry) => {
      const normalized = normalizePestControlEntryData(entry.data, entry.date.toISOString().slice(0, 10), params.users, entry.employeeId);
      const acceptedEmployeeName =
        userMap[normalized.acceptedEmployeeId] ||
        userMap[entry.employeeId] ||
        "";

      return [
        "",
        formatPestControlRowDate(
          normalized.performedDate,
          normalized.performedHour,
          normalized.performedMinute,
          normalized.timeSpecified
        ),
        normalized.event,
        normalized.areaOrVolume,
        normalized.treatmentProduct,
        normalized.note,
        normalized.performedBy,
        [normalized.acceptedRole, acceptedEmployeeName].filter(Boolean).join(", "),
      ];
    });

  if (bodyRows.length === 0) {
    bodyRows.push(...Array.from({ length: 3 }, () => ["", "", "", "", "", "", "", ""]));
  } else {
    bodyRows.push(["", "", "", "", "", "", "", ""]);
  }

  autoTable(doc, {
    startY: 66,
    margin: { left: 24, right: 24 },
    head: [[
      "",
      "Дата и время\nпроведения",
      "Мероприятие\n(вид, место)",
      "Площадь и\n(или) объем",
      "Средство обработки",
      "Примечание",
      "Кем проведено",
      "ФИО принявшего\nработы",
    ]],
    body: bodyRows,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8.6,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    bodyStyles: {
      halign: "center",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 34, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 31, halign: "center" },
      5: { cellWidth: 56, halign: "center" },
      6: { cellWidth: 31, halign: "center" },
      7: { cellWidth: 33, halign: "center" },
    },
  });
}

function drawEquipmentCleaningPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date;
  entries: Array<{
    id: string;
    date: Date;
    data: Record<string, unknown>;
  }>;
  fieldVariant: "rinse_temperature" | "rinse_completeness";
}) {
  const marginX = 14;
  let currentY = 18;
  const currentFont = doc.getFont().fontName || "helvetica";

  doc.setFontSize(11);
  doc.setFont(currentFont, "bold");

  autoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.2,
    styles: {
      font: currentFont,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      cellPadding: 2,
      halign: "center",
      valign: "middle",
      fontSize: 11,
    },
    body: [
      [
        { content: params.organizationName, rowSpan: 2, styles: { fontStyle: "bold" } },
        { content: "СИСТЕМА ХАССП" },
        {
          content: `Начат  ${toDateKey(params.dateFrom).split("-").reverse().join("-")}\nОкончен __________`,
          styles: { halign: "left" },
        },
      ],
      [
        { content: "ЖУРНАЛ МОЙКИ И ДЕЗИНФЕКЦИИ ОБОРУДОВАНИЯ", styles: { fontStyle: "italic" } },
        { content: "СТР. 1 ИЗ 1" },
      ],
    ],
  });

  currentY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 48;
  doc.setFontSize(14);
  doc.text("ЖУРНАЛ МОЙКИ И ДЕЗИНФЕКЦИИ ОБОРУДОВАНИЯ", 105, currentY + 10, {
    align: "center",
  });

  const body = params.entries.map((entry) => {
    const data = normalizeEquipmentCleaningRowData(entry.data);
    return [
      `${formatRuDateDash(data.washDate)}\n${data.washTime}`,
      data.equipmentName,
      data.detergentName,
      data.detergentConcentration,
      data.disinfectantName,
      data.disinfectantConcentration,
      params.fieldVariant === "rinse_temperature"
        ? data.rinseTemperature || "—"
        : getEquipmentCleaningResultLabel(data.rinseResult),
      data.washerName,
      `${data.controllerPosition}, ${data.controllerName}`,
    ];
  });

  autoTable(doc, {
    startY: currentY + 18,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.2,
    styles: {
      font: currentFont,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      cellPadding: 1.8,
      halign: "center",
      valign: "middle",
      fontSize: 9,
    },
    head: [[
      "Дата и время мойки",
      "Наименование оборудования",
      "Наименование моющего раствора",
      "Концентрация моющего раствора, %",
      "Наименование дезинфицирующего раствора",
      "Концентрация дезинфицирующего раствора, %",
      params.fieldVariant === "rinse_temperature"
        ? "Ополаскивание, °C"
        : "Полнота смываемости дез. ср-ва с оборудования и инвентаря",
      "Мойщик (ФИО)",
      "Контролирующее лицо (должность, ФИО)",
    ]],
    body: body.length > 0 ? body : [["", "", "", "", "", "", "", "", ""]],
  });
}

function drawDisinfectantPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeDisinfectantConfig>;
}) {
  const cfg = params.config;
  const currentFont = doc.getFont().fontName || "helvetica";
  const pageWidth = doc.internal.pageSize.getWidth();
  const dateFromLabel = toDateKey(params.dateFrom).split("-").reverse().join(".");
  const dateToLabel = toDateKey(params.dateTo).split("-").reverse().join(".");

  doc.setFont(currentFont, "bold");
  doc.setFontSize(14);
  doc.text(params.organizationName, pageWidth / 2, 16, { align: "center" });
  doc.setFontSize(12);
  doc.text(params.title || DISINFECTANT_DOCUMENT_TITLE, pageWidth / 2, 24, {
    align: "center",
  });
  doc.setFont(currentFont, "normal");
  doc.setFontSize(9);
  doc.text(`Период: ${dateFromLabel} - ${dateToLabel}`, 14, 32);
  doc.text(
    `Ответственный: ${cfg.responsibleRole}${cfg.responsibleEmployee ? `, ${cfg.responsibleEmployee}` : ""}`,
    14,
    38
  );

  autoTable(doc, {
    startY: 46,
    margin: { left: 14, right: 14 },
    theme: "grid",
    styles: {
      font: currentFont,
      fontSize: 8,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    head: [[
      "Подразделение / объект",
      "Площадь / емкость",
      "Вид обработки",
      "Кратность в месяц",
      "Дез. средство",
      "Концентрация, %",
      "Раствор на обработку",
      "Потребность на обработку",
      "Потребность в месяц",
      "Потребность в год",
    ]],
    body:
      cfg.subdivisions.length > 0
        ? cfg.subdivisions.map((row) => [
            row.name || "—",
            row.byCapacity ? "На емкость" : row.area ? formatDisinfectantNumber(row.area, 2) : "—",
            row.treatmentType === "general" ? "Генеральная" : "Текущая",
            String(row.frequencyPerMonth || 0),
            row.disinfectantName || "—",
            formatDisinfectantNumber(row.concentration, 3) || "—",
            formatDisinfectantNumber(row.solutionPerTreatment, 3) || "—",
            formatDisinfectantNumber(computeNeedPerTreatment(row), 3) || "—",
            formatDisinfectantNumber(computeNeedPerMonth(row), 3) || "—",
            formatDisinfectantNumber(computeNeedPerYear(row), 3) || "—",
          ])
        : [["—", "—", "—", "—", "—", "—", "—", "—", "—", "—"]],
  });

  autoTable(doc, {
    startY:
      (((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) || 46) + 8,
    margin: { left: 14, right: 14 },
    theme: "grid",
    styles: {
      font: currentFont,
      fontSize: 8,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    head: [[
      "Дата получения",
      "Наименование дез. средства",
      "Количество",
      "Срок годности",
      "Ответственный",
    ]],
    body:
      cfg.receipts.length > 0
        ? cfg.receipts.map((row) => [
            row.date || "—",
            row.disinfectantName || "—",
            `${formatDisinfectantNumber(row.quantity, 3) || "0"} ${MEASURE_UNIT_LABELS[row.unit]}`,
            row.expiryDate || "—",
            [row.responsibleRole, row.responsibleEmployee].filter(Boolean).join(", ") || "—",
          ])
        : [["—", "—", "—", "—", "—"]],
  });

  autoTable(doc, {
    startY:
      (((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) || 80) + 8,
    margin: { left: 14, right: 14 },
    theme: "grid",
    styles: {
      font: currentFont,
      fontSize: 8,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    head: [[
      "Период",
      "Наименование дез. средства",
      "Получено",
      "Израсходовано",
      "Остаток",
      "Ответственный",
    ]],
    body:
      cfg.consumptions.length > 0
        ? cfg.consumptions.map((row) => [
            [row.periodFrom, row.periodTo].filter(Boolean).join(" - ") || "—",
            row.disinfectantName || "—",
            `${formatDisinfectantNumber(row.totalReceived, 3) || "0"} ${MEASURE_UNIT_LABELS[row.totalReceivedUnit]}`,
            `${formatDisinfectantNumber(row.totalConsumed, 3) || "0"} ${MEASURE_UNIT_LABELS[row.totalConsumedUnit]}`,
            `${formatDisinfectantNumber(row.remainder, 3) || "0"} ${MEASURE_UNIT_LABELS[row.remainderUnit]}`,
            [row.responsibleRole, row.responsibleEmployee].filter(Boolean).join(", ") || "—",
          ])
        : [["—", "—", "—", "—", "—", "—"]],
  });
}

function drawTraceabilityPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: ReturnType<typeof normalizeTraceabilityDocumentConfig>;
}) {
  const cfg = params.config;
  const showShock = cfg.showShockTempField;
  const dateFromStr =
    params.dateFrom instanceof Date
      ? formatTraceabilityDateRu(params.dateFrom.toISOString().slice(0, 10))
      : formatTraceabilityDateRu(String(params.dateFrom).slice(0, 10));

  drawTitle(doc, cfg.documentTitle || params.title);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: "ЖУРНАЛ ПРОСЛЕЖИВАЕМОСТИ ПРОДУКЦИИ",
    withPeriodicity: false,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(`Начат  ${dateFromStr}`, pageWidth - 24, 32, { align: "right" });
  doc.text("Окончен ________", pageWidth - 24, 38, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text("ЖУРНАЛ ПРОСЛЕЖИВАЕМОСТИ ПРОДУКЦИИ", pageWidth / 2, 60, { align: "center" });

  const head: RowInput[] = [
    [
      { content: "Дата", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Поступило в цех сырья", colSpan: 3, styles: { halign: "center", valign: "middle" } },
      { content: "Выпущено цехом", colSpan: showShock ? 3 : 2, styles: { halign: "center", valign: "middle" } },
      { content: "ФИО ответственного", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    ],
    [
      centerCell("Наименование сырья"),
      centerCell("Номер партии ПФ\nДата фасовки"),
      centerCell("Кол-во\nшт./кг."),
      centerCell("Наименование ПФ"),
      centerCell("Кол-во фасовок\nшт./кг."),
      ...(showShock ? [centerCell("T °C продукта\nпосле шоковой\nзаморозки")] : []),
    ],
  ];

  const body: RowInput[] = cfg.rows.map((row) => {
    const incomingQty = [formatTraceabilityQuantity(row.incoming.quantityPieces), formatTraceabilityQuantity(row.incoming.quantityKg)]
      .filter(Boolean)
      .join(" / ");
    const outgoingQty = [formatTraceabilityQuantity(row.outgoing.quantityPacksPieces), formatTraceabilityQuantity(row.outgoing.quantityPacksKg)]
      .filter(Boolean)
      .join(" / ");

    const cells: RowInput = [
      centerCell(formatTraceabilityDateRu(row.date)),
      centerCell(row.incoming.rawMaterialName),
      centerCell(
        [row.incoming.batchNumber, formatTraceabilityDateRu(row.incoming.packagingDate)]
          .filter(Boolean)
          .join("\n")
      ),
      centerCell(incomingQty),
      centerCell(row.outgoing.productName),
      centerCell(outgoingQty),
    ];

    if (showShock) {
      cells.push(centerCell(formatTraceabilityQuantity(row.outgoing.shockTemp)));
    }

    cells.push(centerCell(row.responsibleEmployee || ""));
    return cells;
  });

  autoTable(doc, {
    startY: 66,
    head,
    body: body.length > 0 ? body : [Array(showShock ? 8 : 7).fill(centerCell(""))],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.5,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function drawUvRuntimePdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeUvRuntimeDocumentConfig>;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
  users: { id: string; name: string; role: string }[];
}) {
  drawTitle(doc, "Журнал учета работы");
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  // Specification table
  const spec = params.config.spec;
  const specHead: RowInput[] = [[{
    content: "Спецификация ультрафиолетовой бактерицидной установки",
    colSpan: 4,
    styles: { halign: "center", fontStyle: "bold" },
  }]];
  const specBody: RowInput[] = [
    [
      { content: "Объект обеззараживания", styles: { fontStyle: "bold" } },
      centerCell(getDisinfectionObjectLabel(spec)),
      { content: "Ресурс рабочего времени, часов", styles: { fontStyle: "bold" } },
      centerCell(String(spec.lampLifetimeHours)),
    ],
    [
      { content: "Вид микроорганизма", styles: { fontStyle: "bold" } },
      centerCell(spec.microorganismType),
      { content: "Дата ввода в эксплуатацию", styles: { fontStyle: "bold" } },
      centerCell(spec.commissioningDate ? formatRuDateDash(spec.commissioningDate) : "—"),
    ],
    [
      { content: "Режим облучения", styles: { fontStyle: "bold" } },
      centerCell(getRadiationModeLabel(spec.radiationMode)),
      { content: "Мин. интервал между сеансами", styles: { fontStyle: "bold" } },
      centerCell(spec.minIntervalBetweenSessions || "—"),
    ],
    [
      { content: "Условия обеззараживания", styles: { fontStyle: "bold" } },
      centerCell(getDisinfectionConditionLabel(spec.disinfectionCondition)),
      { content: "Частота контроля", styles: { fontStyle: "bold" } },
      centerCell(spec.controlFrequency),
    ],
  ];

  autoTable(doc, {
    startY: 66,
    head: specHead,
    body: specBody,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  const specEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  const userMap = Object.fromEntries(params.users.map((user) => [user.id, user.name]));
  const rows = [...params.entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  const head: RowInput[] = [[
    centerCell("№"),
    centerCell("Дата"),
    centerCell("Время ВКЛ"),
    centerCell("Время ВЫКЛ"),
    centerCell("Итого продолжительность работы, минут"),
    centerCell("ФИО ответственного лица"),
  ]];

  const body: RowInput[] = rows.map((entry, index) => {
    const data = normalizeUvRuntimeEntryData(entry.data);
    const duration = calculateDurationMinutes(data.startTime, data.endTime);
    return [
      centerCell(String(index + 1)),
      centerCell(formatRuDateDash(entry.date)),
      centerCell(data.startTime || ""),
      centerCell(data.endTime || ""),
      centerCell(duration !== null ? String(duration) : ""),
      centerCell(userMap[entry.employeeId] || ""),
    ];
  });

  body.unshift([
    {
      content: `Бактерицидная установка №${params.config.lampNumber}. ${params.config.areaName}`,
      colSpan: 6,
      styles: { halign: "left", fontStyle: "bold" },
    },
  ]);

  autoTable(doc, {
    startY: specEndY,
    head,
    body: body.length > 1 ? body : [...body, ...ensurePdfBodyRows([], 6, 2)],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 30 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 },
      4: { cellWidth: 42 },
      5: { cellWidth: 90 },
    },
  });
}

function buildVisibleUvRuntimeEntries(
  entries: Array<{ employeeId: string; date: Date | string; data: Record<string, unknown> }>,
  dateFrom: Date,
  dateTo: Date
) {
  const fromKey = toDateKey(dateFrom);
  const toKey = toDateKey(dateTo);
  const byDate = new Map<string, { employeeId: string; date: Date | string; data: Record<string, unknown> }>();

  for (const entry of entries) {
    const dateKey = entry.date instanceof Date ? toDateKey(entry.date) : String(entry.date).slice(0, 10);
    if (dateKey < fromKey || dateKey > toKey) {
      continue;
    }

    byDate.set(dateKey, entry);
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, entry]) => ({
      ...entry,
      date:
        entry.date instanceof Date
          ? entry.date
          : new Date(`${String(entry.date).slice(0, 10)}T00:00:00.000Z`),
    }));
}

function drawRegisterPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  fields: RegisterField[];
  config: ReturnType<typeof normalizeRegisterDocumentConfig>;
  users: { id: string; name: string; role: string }[];
  equipment: { id: string; name: string }[];
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const head: RowInput[] = [[
    centerCell("№"),
    ...params.fields.map((field) => centerCell(field.label)),
  ]];

  const body: RowInput[] = params.config.rows.map((row, index) => [
    centerCell(String(index + 1)),
    ...params.fields.map((field) =>
      centerCell(
        isRegisterFieldVisible(field, row.values)
          ? getRegisterFieldValue(
              field,
              row.values[field.key] || "",
              params.users,
              params.equipment
            )
          : ""
      )
    ),
  ]);

  autoTable(doc, {
    startY: 66,
    head,
    body: ensurePdfBodyRows(body, params.fields.length + 1),
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.1,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function drawAuditPlanPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeAuditPlanConfig>;
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const head: RowInput[] = [[
    centerCell("№"),
    centerCell("Требование"),
    centerCell("Контроль"),
    ...params.config.columns.map((column) => centerCell(`${column.title}\n${column.auditorName}`)),
  ]];

  const body: RowInput[] = [];
  params.config.sections.forEach((section) => {
    body.push([
      {
        content: section.title,
        colSpan: 3 + Math.max(params.config.columns.length, 1),
        styles: { fontStyle: "bold", halign: "left", fillColor: [245, 245, 245] },
      },
    ]);

    params.config.rows
      .filter((row) => row.sectionId === section.id)
      .forEach((row, index) => {
        body.push([
          centerCell(String(index + 1)),
          centerCell(row.text),
          centerCell(row.checked ? "Да" : ""),
          ...params.config.columns.map((column) => centerCell(row.values[column.id] || "")),
        ]);
      });
  });

  autoTable(doc, {
    startY: 66,
    head,
    body: body.length > 0 ? body : [[{ content: "", colSpan: 3 + Math.max(params.config.columns.length, 1) }]],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.5,
      cellPadding: 1.3,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function drawAuditProtocolPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeAuditProtocolConfig>;
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const body: RowInput[] = [];
  params.config.sections.forEach((section) => {
    body.push([
      { content: section.title, colSpan: 5, styles: { fontStyle: "bold", halign: "left", fillColor: [245, 245, 245] } },
    ]);
    params.config.rows
      .filter((row) => row.sectionId === section.id)
      .forEach((row, index) => {
        body.push([
          centerCell(String(index + 1)),
          centerCell(row.text),
          centerCell(row.result === "yes" ? "Да" : ""),
          centerCell(row.result === "no" ? "Нет" : ""),
          centerCell(row.note || ""),
        ]);
      });
  });

  autoTable(doc, {
    startY: 66,
    head: [[centerCell("№"), centerCell("Требование"), centerCell("Да"), centerCell("Нет"), centerCell("Примечание")]],
    body: body.length > 0 ? body : [[{ content: "", colSpan: 5 }]],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 120 },
      2: { cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { cellWidth: 100 },
    },
  });

  const finalY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 66) + 10;
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  let cursorY = finalY;
  params.config.signatures.forEach((signature) => {
    doc.text(
      `${signature.role || "Подпись"}: ${signature.name}${signature.signedAt ? `, ${formatRuDateDash(signature.signedAt)}` : ""}`,
      12,
      cursorY
    );
    cursorY += 6;
  });
}

function drawAuditReportPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeAuditReportConfig>;
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  doc.setFont("JournalUnicode", "normal");
  let cursorY = 64;
  cursorY = renderWrappedTextBlock(
    doc,
    [
      `Основание: ${params.config.basisTitle || "—"}`,
      `Объект аудита: ${params.config.auditedObject || "—"}`,
      `Аудиторы: ${(params.config.auditors || []).join(", ") || "—"}`,
      `Итог: ${params.config.summary || "—"}`,
      `Рекомендации: ${params.config.recommendations || "—"}`,
    ],
    12,
    cursorY,
    270,
    5
  ) + 4;

  autoTable(doc, {
    startY: cursorY,
    head: [[
      centerCell("№"),
      centerCell("Несоответствие"),
      centerCell("Исправление"),
      centerCell("Корректирующие действия"),
      centerCell("Ответственный"),
      centerCell("Срок план"),
      centerCell("Срок факт"),
    ]],
    body:
      params.config.findings.map((finding, index) => [
        centerCell(String(index + 1)),
        centerCell(finding.nonConformity || ""),
        centerCell(finding.correctionActions || ""),
        centerCell(finding.correctiveActions || ""),
        centerCell([finding.responsiblePosition, finding.responsibleName].filter(Boolean).join(", ")),
        centerCell(finding.dueDatePlan ? formatRuDateDash(finding.dueDatePlan) : ""),
        centerCell(finding.dueDateFact ? formatRuDateDash(finding.dueDateFact) : ""),
      ]) || [[{ content: "", colSpan: 7 }]],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.5,
      cellPadding: 1.3,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  cursorY = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || cursorY) + 10;
  params.config.signatures.forEach((signature) => {
    doc.text(
      `${signature.role || "Подпись"}: ${[signature.position, signature.name].filter(Boolean).join(", ")}${signature.signedAt ? `, ${formatRuDateDash(signature.signedAt)}` : ""}`,
      12,
      cursorY
    );
    cursorY += 6;
  });
}

function drawMetalImpurityPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: ReturnType<typeof normalizeMetalImpurityConfig>;
}) {
  drawTitle(doc, params.title);
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  autoTable(doc, {
    startY: 66,
    body: [[
      { content: "Ответственный", styles: { fontStyle: "bold" } },
      { content: `${params.config.responsiblePosition}: ${params.config.responsibleEmployee}`, colSpan: 8 },
    ]],
    theme: "grid",
    styles: { font: "JournalUnicode", fontSize: 9, lineColor: [0, 0, 0], textColor: [0, 0, 0] },
    margin: { left: 10, right: 10 },
  });

  autoTable(doc, {
    startY: (((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY) || 66) + 4,
    head: [[
      centerCell("№"),
      centerCell("Дата"),
      centerCell("Материал"),
      centerCell("Поставщик"),
      centerCell("Количество, кг"),
      centerCell("Металлопримеси, г"),
      centerCell("г/т"),
      centerCell("Характеристика"),
      centerCell("Ответственный"),
    ]],
    body:
      params.config.rows.map((row, index) => [
        centerCell(String(index + 1)),
        centerCell(row.date ? formatRuDateDash(row.date) : ""),
        centerCell(getMetalImpurityOptionName(params.config.materials, row.materialId)),
        centerCell(getMetalImpurityOptionName(params.config.suppliers, row.supplierId)),
        centerCell(row.consumedQuantityKg || ""),
        centerCell(row.impurityQuantityG || ""),
        centerCell(getMetalImpurityValuePerKg(row.impurityQuantityG, row.consumedQuantityKg) || ""),
        centerCell(row.impurityCharacteristic || ""),
        centerCell([row.responsibleRole, row.responsibleName].filter(Boolean).join(", ")),
      ]) || [[{ content: "", colSpan: 9 }]],
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.5,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });
}

function renderWrappedTextBlock(
  doc: jsPDF,
  lines: string[],
  x: number,
  y: number,
  width: number,
  lineHeight: number
) {
  let cursorY = y;
  doc.setFontSize(9);

  lines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, width) as string[];
    wrapped.forEach((chunk) => {
      doc.text(chunk, x, cursorY);
      cursorY += lineHeight;
    });
  });

  return cursorY;
}

function drawIntensiveCoolingPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  config: IntensiveCoolingConfig;
  users: { id: string; name: string; role: string }[];
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 24;
  const y = 28;
  const width = pageWidth - 48;
  const leftWidth = 56;
  const rightWidth = 36;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;
  const totalHeight = topHeight + secondHeight;

  drawTitle(doc, params.title);

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, totalHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + totalHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + totalHeight);
  doc.line(x + leftWidth, y + topHeight, x + leftWidth + middleWidth, y + topHeight);

  doc.setFontSize(10);
  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, params.organizationName, x + 3, y, leftWidth - 6, totalHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(
    doc,
    INTENSIVE_COOLING_DOCUMENT_TITLE.toUpperCase(),
    x + leftWidth,
    y + topHeight,
    middleWidth,
    secondHeight,
    middleWidth - 10
  );

  const startedAt =
    params.dateFrom instanceof Date
      ? params.dateFrom.toISOString().slice(0, 10)
      : String(params.dateFrom).slice(0, 10);

  doc.setFont("JournalUnicode", "bold");
  doc.text(`Начат  ${formatIntensiveCoolingDate(startedAt)}`, x + leftWidth + middleWidth + 2, y + 6);
  doc.text(`Окончен __________`, x + leftWidth + middleWidth + 2, y + 13);
  doc.setFont("JournalUnicode", "normal");
  doc.text("СТР. 1 ИЗ 1", x + width - 20, y + 18, { align: "right" });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(13);
  doc.text(INTENSIVE_COOLING_DOCUMENT_TITLE.toUpperCase(), pageWidth / 2, y + totalHeight + 12, {
    align: "center",
  });

  const head: RowInput[] = [[
    centerCell(""),
    centerCell("Дата и время изготовления блюда"),
    centerCell("Наименование блюда"),
    centerCell("Температура в начале процесса охлаждения"),
    centerCell("Температура через 1 час"),
    centerCell("Корректирующие действия"),
    centerCell("Комментарий"),
    centerCell("Лицо, проводившее контроль интенсивного охлаждения (должность, ФИО)"),
  ]];

  const body: RowInput[] =
    params.config.rows.length > 0
      ? params.config.rows.map((row) => {
          const user = params.users.find((item) => item.id === row.responsibleUserId);
          const responsibleLabel = [row.responsibleTitle, user?.name]
            .filter(Boolean)
            .join(", ");

          return [
            centerCell(""),
            centerCell(
              `${formatIntensiveCoolingDate(row.productionDate)}\n${row.productionHour || "00"}:${row.productionMinute || "00"}`
            ),
            centerCell(row.dishName || "—"),
            centerCell(formatIntensiveCoolingTemperatureLabel(row.startTemperature)),
            centerCell(formatIntensiveCoolingTemperatureLabel(row.endTemperature)),
            centerCell(row.correctiveAction || "—"),
            centerCell(row.comment || "—"),
            centerCell(responsibleLabel || "—"),
          ];
        })
      : [[centerCell(""), centerCell(""), centerCell(""), centerCell(""), centerCell(""), centerCell(""), centerCell(""), centerCell("")]];

  autoTable(doc, {
    startY: y + totalHeight + 18,
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7.2,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
      halign: "center",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 34 },
      2: { cellWidth: 34 },
      3: { cellWidth: 28 },
      4: { cellWidth: 24 },
      5: { cellWidth: 62 },
      6: { cellWidth: 28 },
      7: { cellWidth: 42 },
    },
  });
}

function drawFryerOilPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date | string;
  dateTo: Date | string;
  config: FryerOilDocumentConfig;
  entries: { employeeId: string; date: Date | string; data: Record<string, unknown> }[];
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  drawTitle(doc, getFryerOilDocumentTitle());

  // Header table
  const x = 24;
  const y = 28;
  const width = pageWidth - 48;
  const leftWidth = 56;
  const rightWidth = 32;
  const middleWidth = width - leftWidth - rightWidth;
  const topHeight = 10;
  const secondHeight = 10;
  const totalHeight = topHeight + secondHeight;

  doc.setLineWidth(0.25);
  doc.rect(x, y, width, totalHeight);
  doc.line(x + leftWidth, y, x + leftWidth, y + totalHeight);
  doc.line(x + leftWidth + middleWidth, y, x + leftWidth + middleWidth, y + totalHeight);
  doc.line(x + leftWidth, y + topHeight, x + leftWidth + middleWidth, y + topHeight);

  doc.setFontSize(10);
  doc.setFont("JournalUnicode", "bold");
  drawCenteredText(doc, params.organizationName, x + 3, y, leftWidth - 6, totalHeight, leftWidth - 10);

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(doc, "СИСТЕМА ХАССП", x + leftWidth, y, middleWidth, topHeight, middleWidth - 10);

  doc.setFont("JournalUnicode", "italic");
  drawCenteredText(doc, params.title.toUpperCase(), x + leftWidth, y + topHeight, middleWidth, secondHeight, middleWidth - 10);

  const dateFromStr = params.dateFrom instanceof Date
    ? formatFryerDateRu(params.dateFrom.toISOString().slice(0, 10))
    : formatFryerDateRu(String(params.dateFrom).slice(0, 10));
  const dateToStr = params.dateTo instanceof Date
    ? formatFryerDateRu(params.dateTo.toISOString().slice(0, 10))
    : formatFryerDateRu(String(params.dateTo).slice(0, 10));

  doc.setFont("JournalUnicode", "normal");
  drawCenteredText(
    doc,
    `${dateFromStr} –\n${dateToStr}\nСтр. 1`,
    x + leftWidth + middleWidth,
    y,
    rightWidth,
    totalHeight,
    rightWidth - 4
  );

  // Centered title below header
  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(12);
  doc.text(params.title.toUpperCase(), pageWidth / 2, y + totalHeight + 10, { align: "center" });

  // Main data table
  // Head: row 1 has all columns, but columns 8-9 span under a merged "Использование оставшегося жира" header
  const head: RowInput[] = [
    [
      { content: "Дата, время начала использования фритюрного жира", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Вид фритюрного жира", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Органолептическая оценка качества жира на начало жарки", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Тип жарочного оборудования", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Вид продукции", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Время окончания фритюрной жарки", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Органолептическая оценка качества жира по окончании жарки", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Использование оставшегося жира", colSpan: 2, styles: { halign: "center", valign: "middle" } },
      { content: "Должность, ФИО контролера", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
    ],
    [
      { content: "Переходящий остаток, кг", styles: { halign: "center", valign: "middle" } },
      { content: "Утилизированный, кг", styles: { halign: "center", valign: "middle" } },
    ],
  ];

  const body: RowInput[] = params.entries.map((entry) => {
    const data = normalizeFryerOilEntryData(entry.data);
    const startDateStr = data.startDate
      ? formatFryerDateRu(data.startDate)
      : (entry.date instanceof Date
          ? formatFryerDateRu(entry.date.toISOString().slice(0, 10))
          : formatFryerDateRu(String(entry.date).slice(0, 10)));
    const startTimeStr = formatFryerTime(data.startHour, data.startMinute);
    const endTimeStr = formatFryerTime(data.endHour, data.endMinute);
    const qualityStartLabel = QUALITY_LABELS[data.qualityStart] || String(data.qualityStart);
    const qualityEndLabel = QUALITY_LABELS[data.qualityEnd] || String(data.qualityEnd);

    return [
      centerCell(`${startDateStr}\n${startTimeStr}`),
      centerCell(data.fatType),
      centerCell(qualityStartLabel),
      centerCell(data.equipmentType),
      centerCell(data.productType),
      centerCell(endTimeStr),
      centerCell(qualityEndLabel),
      centerCell(data.carryoverKg > 0 ? String(data.carryoverKg) : ""),
      centerCell(data.disposedKg > 0 ? String(data.disposedKg) : ""),
      centerCell(data.controllerName),
    ];
  });

  // Add empty rows if no entries
  if (body.length === 0) {
    for (let i = 0; i < 5; i++) {
      body.push(Array(10).fill(centerCell("")));
    }
  }

  autoTable(doc, {
    startY: y + totalHeight + 16,
    head,
    body,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  const dataTableEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Appendix — quality assessment methodology
  const appendixStartY = dataTableEndY + 10;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Check if we need a new page for the appendix
  const appendixY = appendixStartY + 8 > pageHeight - 20 ? (() => { doc.addPage(); return 20; })() : appendixStartY;

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  doc.text("Приложение. Методика определения качества фритюрного жира.", 10, appendixY);

  // Quality indicators table
  const indicatorHead: RowInput[] = [[
    { content: "Показатель качества", styles: { halign: "center", valign: "middle" } },
    { content: "Оценка 5", styles: { halign: "center", valign: "middle" } },
    { content: "Оценка 4", styles: { halign: "center", valign: "middle" } },
    { content: "Оценка 3", styles: { halign: "center", valign: "middle" } },
    { content: "Оценка 2 и 1", styles: { halign: "center", valign: "middle" } },
    { content: "Коэффициент значимости", styles: { halign: "center", valign: "middle" } },
  ]];

  const indicatorBody: RowInput[] = QUALITY_ASSESSMENT_TABLE.indicators.map((ind) => [
    { content: ind.name, styles: { halign: "left", valign: "middle" } },
    centerCell(ind.scores[5]),
    centerCell(ind.scores[4]),
    centerCell(ind.scores[3]),
    centerCell(ind.scores[2]),
    centerCell(String(ind.coefficient)),
  ]);

  autoTable(doc, {
    startY: appendixY + 5,
    head: indicatorHead,
    body: indicatorBody,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 10 },
  });

  const indicatorsEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Grading table
  const gradingHead: RowInput[] = [[
    { content: "Итоговая оценка качества", styles: { halign: "center", valign: "middle" } },
    { content: "Балл", styles: { halign: "center", valign: "middle" } },
  ]];
  const gradingBody: RowInput[] = QUALITY_ASSESSMENT_TABLE.gradingTable.map((row) => [
    centerCell(row.label),
    centerCell(String(row.score)),
  ]);

  autoTable(doc, {
    startY: indicatorsEndY + 5,
    head: gradingHead,
    body: gradingBody,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 10, right: 200 },
  });

  const gradingEndY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Formula example
  doc.setFont("JournalUnicode", "normal");
  doc.setFontSize(9);
  doc.text(
    `Пример расчёта средневзвешенной оценки: ${QUALITY_ASSESSMENT_TABLE.formulaExample}`,
    10,
    gradingEndY + 7
  );
}

function drawGlassControlPdf(doc: jsPDF, params: {
  organizationName: string;
  title: string;
  dateFrom: Date;
  dateTo: Date;
  status: string;
  responsibleName: string;
  config: ReturnType<typeof normalizeGlassControlConfig>;
  entries: Array<{ date: Date; employeeId: string; data: Record<string, unknown> }>;
  users: Array<{ id: string; name: string; role: string }>;
}) {
  const pageWidth = doc.internal.pageSize.getWidth();

  drawTitle(doc, params.title);
  drawJournalHeader(doc, {
    organizationName: params.organizationName,
    pageLabel: "СТР. 1 ИЗ 1",
    journalLabel: GLASS_CONTROL_PAGE_TITLE,
    withPeriodicity: false,
  });

  doc.setFont("JournalUnicode", "bold");
  doc.setFontSize(10);
  doc.text(`Начат: ${formatGlassRuDateDash(params.dateFrom)}`, pageWidth - 72, 36);
  doc.text(
    `Окончен: ${
      params.status === "closed" ? formatGlassRuDateDash(params.dateTo) : "__________"
    }`,
    pageWidth - 72,
    43
  );

  autoTable(doc, {
    startY: 50,
    body: [[
      { content: "Частота контроля", styles: { fontStyle: "bold" } },
      { content: params.config.controlFrequency, colSpan: 3, styles: { halign: "center", fontStyle: "bold" } },
    ]],
    theme: "grid",
    styles: { font: "JournalUnicode", fontSize: 10, lineColor: [0, 0, 0], textColor: [0, 0, 0] },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } },
  });

  const bodyRows = params.entries.map((entry) => {
    const data = normalizeGlassControlEntryData(entry.data);
    const userName = params.users.find((user) => user.id === entry.employeeId)?.name || params.responsibleName;
    return [
      formatGlassRuDateDash(entry.date),
      data.damagesDetected ? "V" : "",
      data.damagesDetected ? "" : "V",
      data.itemName,
      data.quantity,
      data.damageInfo,
      userName,
    ];
  });

  bodyRows.push(["", "", "", "", "", "", ""]);

  autoTable(doc, {
    startY: ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 60) + 8,
    head: [[
      "Дата",
      "Да",
      "Нет",
      "Наименование",
      "Кол-во",
      "Информация о повреждениях / замены",
      "Фамилия ответственного лица",
    ]],
    body: bodyRows,
    theme: "grid",
    styles: {
      font: "JournalUnicode",
      fontSize: 8.5,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
    },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 24, halign: "center" },
      1: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 42 },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 58 },
      6: { cellWidth: 28, halign: "center" },
    },
  });
}

export async function generateJournalDocumentPdf(params: {
  documentId: string;
  organizationId: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { documentId, organizationId } = params;

  const document = await db.journalDocument.findUnique({
    where: { id: documentId },
    include: {
      template: true,
      organization: { select: { name: true } },
      entries: { orderBy: [{ employeeId: "asc" }, { date: "asc" }] },
    },
  });

  if (!document || document.organizationId !== organizationId) {
    throw new Error("Документ не найден");
  }

  const users = await db.user.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const equipment = await db.equipment.findMany({
    where: {
      area: {
        organizationId,
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const fontName = loadUnicodeFont(doc);
  doc.setFont(fontName, "normal");

  const templateCode = document.template.code;
  const dateKeys = buildDateKeys(document.dateFrom, document.dateTo);
  const organizationName = document.organization?.name || 'ООО "Тест"';
  const monthLabel = formatMonthLabel(document.dateFrom, document.dateTo);
  const employeeIds = document.entries.map((entry) => entry.employeeId);
  const entryMap: Record<string, Record<string, unknown>> = {};
  const reconciledConfig = normalizeJournalStaffBoundConfig(templateCode, document.config, users);
  const climateConfig = normalizeClimateDocumentConfig(reconciledConfig);
  const coldConfig = normalizeColdEquipmentDocumentConfig(reconciledConfig);
  const cleaningConfig = normalizeCleaningDocumentConfig(reconciledConfig);
  const finishedConfig = normalizeFinishedProductDocumentConfig(reconciledConfig);
  const perishableRejectionConfig = normalizePerishableRejectionConfig(reconciledConfig);
  const uvRuntimeConfig = normalizeUvRuntimeDocumentConfig(reconciledConfig);
  const equipmentCalibrationConfig = normalizeEquipmentCalibrationConfig(reconciledConfig);
  const trackedFields = getTrackedFields(document.template.fields);
  const registerFields = parseRegisterFields(document.template.fields);
  const registerConfig = normalizeRegisterDocumentConfig(reconciledConfig, registerFields);
  const traceabilityConfig = normalizeTraceabilityDocumentConfig(reconciledConfig);
  const equipmentCleaningConfig = normalizeEquipmentCleaningConfig(reconciledConfig);
  const intensiveCoolingConfig = normalizeIntensiveCoolingConfig(reconciledConfig, users);
  const medBookConfig = normalizeMedBookConfig(reconciledConfig);
  const auditPlanConfig = normalizeAuditPlanConfig(reconciledConfig);
  const auditProtocolConfig = normalizeAuditProtocolConfig(reconciledConfig);
  const auditReportConfig = normalizeAuditReportConfig(reconciledConfig);
  const metalImpurityConfig = normalizeMetalImpurityConfig(reconciledConfig);
  const disinfectantConfig = normalizeDisinfectantConfig(reconciledConfig);

  document.entries.forEach((entry) => {
    entryMap[makeCellKey(entry.employeeId, toDateKey(entry.date))] =
      (entry.data as Record<string, unknown>) || {};
  });

  if (templateCode === "hygiene") {
    drawHygienePdf(doc, {
      organizationName,
      title: document.title || getHygieneDocumentTitle(),
      monthLabel,
      dateKeys,
      users,
      employeeIds,
      responsibleTitle: document.responsibleTitle,
      entryMap,
    });
  } else if (templateCode === "health_check") {
    drawHealthPdf(doc, {
      organizationName,
      title: document.title || getHealthDocumentTitle(),
      monthLabel,
      dateKeys,
      users,
      employeeIds,
      entryMap,
      printEmptyRows:
        document.config &&
        typeof document.config === "object" &&
        !Array.isArray(document.config) &&
        typeof (document.config as { printEmptyRows?: unknown }).printEmptyRows === "number"
          ? Math.max(0, (document.config as { printEmptyRows: number }).printEmptyRows)
          : 0,
    });
  } else if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    drawClimatePdf(doc, {
      organizationName,
      title: document.title || getClimateDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: climateConfig,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
      users,
    });
  } else if (templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
    drawColdEquipmentPdf(doc, {
      organizationName,
      title: document.title || getColdEquipmentDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: coldConfig,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
    });
  } else if (templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
    drawCleaningPdf(doc, {
      organizationName,
      title: document.title || getCleaningDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: cleaningConfig,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
    });
  } else if (templateCode === MED_BOOK_TEMPLATE_CODE) {
    drawMedBookPdf(doc, {
      organizationName,
      title: document.title || MED_BOOK_DOCUMENT_TITLE,
      config: medBookConfig,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: entry.data,
      })),
      users,
    });
  } else if (templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
    drawFinishedProductPdf(doc, {
      organizationName,
      title: document.title || getFinishedProductDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: finishedConfig,
    });
  } else if (templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE) {
    drawPerishableRejectionPdf(doc, {
      organizationName,
      title: document.title || getPerishableRejectionDocumentTitle(),
      dateFrom: document.dateFrom,
      config: perishableRejectionConfig,
    });
  } else if (templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE) {
    drawProductWriteoffPdf(doc, {
      organizationName,
      title: document.title || "Акт забраковки",
      dateFrom: document.dateFrom,
      config: normalizeProductWriteoffConfig(reconciledConfig),
    });
  } else if (templateCode === GLASS_LIST_TEMPLATE_CODE) {
    const glassListConfig = normalizeGlassListConfig(reconciledConfig);
    drawGlassListPdf(doc, {
      organizationName,
      title: document.title || "Перечень изделий",
      dateFrom: document.dateFrom,
      config: glassListConfig,
      responsibleName:
        users.find((user) => user.id === (document.responsibleUserId || glassListConfig.responsibleUserId))
          ?.name || "РРІР°РЅРѕРІ Р.Р.",
    });
  } else if (templateCode === GLASS_CONTROL_TEMPLATE_CODE) {
    drawGlassControlPdf(doc, {
      organizationName,
      title: document.title || GLASS_CONTROL_PAGE_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      status: document.status,
      responsibleName:
        users.find((user) => user.id === document.responsibleUserId)?.name || "",
      config: normalizeGlassControlConfig(reconciledConfig),
      entries: document.entries.map((entry) => ({
        date: entry.date,
        employeeId: entry.employeeId,
        data: (entry.data as Record<string, unknown>) || {},
      })),
      users,
    });
  } else if (templateCode === SANITATION_DAY_TEMPLATE_CODE) {
    drawSanitationDayPdf(doc, {
      organizationName,
      title: document.title || SANITATION_DAY_DOCUMENT_TITLE,
      config: normalizeSanitationDayConfig(reconciledConfig),
    });
  } else if (templateCode === TRAINING_PLAN_TEMPLATE_CODE) {
    drawTrainingPlanPdf(doc, {
      organizationName,
      title: document.title || TRAINING_PLAN_HEADING,
      config: normalizeTrainingPlanConfig(reconciledConfig),
    });
  } else if (templateCode === AUDIT_PLAN_TEMPLATE_CODE) {
    drawAuditPlanPdf(doc, {
      organizationName,
      title: document.title || AUDIT_PLAN_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: auditPlanConfig,
    });
  } else if (templateCode === AUDIT_PROTOCOL_TEMPLATE_CODE) {
    drawAuditProtocolPdf(doc, {
      organizationName,
      title: document.title || AUDIT_PROTOCOL_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: auditProtocolConfig,
    });
  } else if (templateCode === AUDIT_REPORT_TEMPLATE_CODE) {
    drawAuditReportPdf(doc, {
      organizationName,
      title: document.title || AUDIT_REPORT_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: auditReportConfig,
    });
  } else if (templateCode === METAL_IMPURITY_TEMPLATE_CODE) {
    drawMetalImpurityPdf(doc, {
      organizationName,
      title: document.title || METAL_IMPURITY_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: metalImpurityConfig,
    });
  } else if (templateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE) {
    drawBreakdownHistoryPdf(doc, {
      organizationName,
      title: document.title || BREAKDOWN_HISTORY_HEADING,
      dateFrom: document.dateFrom,
      config: normalizeBreakdownHistoryDocumentConfig(reconciledConfig),
    });
  } else if (templateCode === ACCIDENT_DOCUMENT_TEMPLATE_CODE) {
    drawAccidentPdf(doc, {
      organizationName,
      title: document.title || ACCIDENT_DOCUMENT_HEADING,
      dateFrom: document.dateFrom,
      config: normalizeAccidentDocumentConfig(reconciledConfig),
    });
  } else if (templateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE) {
    drawEquipmentCalibrationPdf(doc, {
      organizationName,
      title: document.title || EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
      config: equipmentCalibrationConfig,
    });
  } else if (templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    drawAcceptancePdf(doc, {
      organizationName,
      title: document.title || getAcceptanceDocumentTitle(templateCode),
      dateFrom: document.dateFrom,
      config: normalizeAcceptanceDocumentConfig(reconciledConfig, users),
      users,
    });
  } else if (templateCode === PPE_ISSUANCE_TEMPLATE_CODE) {
    drawPpeIssuancePdf(doc, {
      organizationName,
      title: document.title || PPE_ISSUANCE_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      config: normalizePpeIssuanceConfig(reconciledConfig, users),
      users,
    });
  } else if (templateCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
    drawTraceabilityPdf(doc, {
      organizationName,
      title: document.title || "Журнал прослеживаемости продукции",
      dateFrom: document.dateFrom,
      config: traceabilityConfig,
    });
  } else if (templateCode === EQUIPMENT_CLEANING_TEMPLATE_CODE) {
    drawEquipmentCleaningPdf(doc, {
      organizationName,
      title: document.title || "Журнал мойки и дезинфекции оборудования",
      dateFrom: document.dateFrom,
      fieldVariant: equipmentCleaningConfig.fieldVariant,
      entries: document.entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
    });
  } else if (templateCode === DISINFECTANT_TEMPLATE_CODE) {
    drawDisinfectantPdf(doc, {
      organizationName,
      title: document.title || DISINFECTANT_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: disinfectantConfig,
    });
  } else if (templateCode === INTENSIVE_COOLING_TEMPLATE_CODE) {
    drawIntensiveCoolingPdf(doc, {
      organizationName,
      title: document.title || INTENSIVE_COOLING_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      config: intensiveCoolingConfig,
      users,
    });
  } else if (isRegisterDocumentTemplate(templateCode)) {
    drawRegisterPdf(doc, {
      organizationName,
      title: document.title || getRegisterDocumentTitle(templateCode),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      fields: registerFields,
      config: registerConfig,
      users,
      equipment,
    });
  } else if (templateCode === FRYER_OIL_TEMPLATE_CODE) {
    drawFryerOilPdf(doc, {
      organizationName,
      title: document.title || getFryerOilDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: normalizeFryerOilDocumentConfig(reconciledConfig),
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
    });
  } else if (templateCode === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
    const uvVisibleEntries = buildVisibleUvRuntimeEntries(
      document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
      document.dateFrom,
      document.dateTo
    );

    drawUvRuntimePdf(doc, {
      organizationName,
      title: document.title || getTrackedDocumentTitle(templateCode),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: uvRuntimeConfig,
      entries: uvVisibleEntries,
      users,
    });
  } else if (templateCode === PEST_CONTROL_TEMPLATE_CODE) {
    drawPestControlPdf(doc, {
      organizationName,
      title: document.title || PEST_CONTROL_DOCUMENT_TITLE,
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
      users,
    });
  } else if (templateCode === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE) {
    drawCleaningVentilationChecklistPdf(doc, {
      organizationName,
      title: document.title || CLEANING_VENTILATION_CHECKLIST_TITLE,
      dateFrom: document.dateFrom,
      config: document.config,
      entries: document.entries.map((entry) => ({
        date: entry.date,
        data: entry.data,
      })),
      users,
    });
  } else if (isTrackedDocumentTemplate(templateCode)) {
    drawTrackedPdf(doc, {
      organizationName,
      title:
        document.title ||
        getTrackedDocumentTitle(templateCode as TrackedDocumentTemplateCode),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      fields: trackedFields,
      entries: document.entries.map((entry) => ({
        employeeId: entry.employeeId,
        date: entry.date,
        data: (entry.data as Record<string, unknown>) || {},
      })),
      users,
    });
  } else {
    throw new Error(`PDF шаблон не поддерживается для кода: ${templateCode}`);
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const prefix =
    templateCode === "hygiene"
      ? "hygiene-journal"
      : templateCode === "health_check"
      ? "health-journal"
      : templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
        ? getClimateFilePrefix()
        : templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
          ? getColdEquipmentFilePrefix()
          : templateCode === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE
            ? getCleaningVentilationFilePrefix()
            : templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
              ? getCleaningFilePrefix()
            : templateCode === MED_BOOK_TEMPLATE_CODE
              ? "med-books"
            : templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE
              ? getPerishableRejectionFilePrefix()
          : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
            ? getFinishedProductFilePrefix()
            : templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
              ? getProductWriteoffFilePrefix()
            : templateCode === PEST_CONTROL_TEMPLATE_CODE
              ? "pest-control-journal"
            : templateCode === GLASS_LIST_TEMPLATE_CODE
              ? getGlassListFilePrefix()
            : templateCode === GLASS_CONTROL_TEMPLATE_CODE
              ? getGlassControlFilePrefix()
            : templateCode === SANITATION_DAY_TEMPLATE_CODE
              ? "general-cleaning-schedule"
            : templateCode === AUDIT_PLAN_TEMPLATE_CODE
              ? "audit-plan"
            : templateCode === AUDIT_PROTOCOL_TEMPLATE_CODE
              ? "audit-protocol"
            : templateCode === AUDIT_REPORT_TEMPLATE_CODE
              ? "audit-report"
            : templateCode === METAL_IMPURITY_TEMPLATE_CODE
              ? "metal-impurity"
            : templateCode === TRAINING_PLAN_TEMPLATE_CODE
              ? "training-plan"
            : templateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE
              ? "breakdown-history"
            : templateCode === ACCIDENT_DOCUMENT_TEMPLATE_CODE
              ? "accident-journal"
            : templateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
              ? "equipment-calibration"
            : templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE
              ? "acceptance-journal"
            : templateCode === PPE_ISSUANCE_TEMPLATE_CODE
              ? "ppe-issuance-journal"
            : templateCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE
              ? "traceability-journal"
            : templateCode === EQUIPMENT_CLEANING_TEMPLATE_CODE
              ? "equipment-cleaning-journal"
            : templateCode === DISINFECTANT_TEMPLATE_CODE
              ? "disinfectant-journal"
            : templateCode === INTENSIVE_COOLING_TEMPLATE_CODE
              ? getIntensiveCoolingFilePrefix()
            : templateCode === FRYER_OIL_TEMPLATE_CODE
              ? getFryerOilFilePrefix()
            : isRegisterDocumentTemplate(templateCode)
              ? getRegisterDocumentFilePrefix(templateCode)
              : isTrackedDocumentTemplate(templateCode)
                ? getTrackedFilePrefix(templateCode)
              : (() => {
                  throw new Error(`Не удалось определить префикс PDF для кода: ${templateCode}`);
                })();

  return {
    buffer,
    fileName: `${prefix}-${toDateKey(document.dateFrom)}-${toDateKey(document.dateTo)}.pdf`,
  };
}
