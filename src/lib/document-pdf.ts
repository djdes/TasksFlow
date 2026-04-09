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
  normalizeCleaningEntryData,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  getFinishedProductDocumentTitle,
  getFinishedProductFilePrefix,
  normalizeFinishedProductDocumentConfig,
} from "@/lib/finished-product-document";
import {
  buildHygieneExampleEmployees,
  buildDateKeys,
  formatMonthLabel,
  getDayNumber,
  getHealthDocumentTitle,
  getHygieneDocumentTitle,
  getHygienePositionLabel,
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

function getPrintableUsers(users: { id: string; name: string; role: string }[], employeeIds: string[]) {
  const uniqueIds = [...new Set(employeeIds)];
  return users
    .filter((user) => uniqueIds.includes(user.id))
    .map((user, index) => ({
      id: user.id,
      number: index + 1,
      name: user.name,
      position: getHygienePositionLabel(user.role),
    }));
}

function centerCell(content: string): CellDef {
  return {
    content,
    styles: { halign: "center", valign: "middle" },
  };
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
  doc.text("СТР. 1 ИЗ 1", x + leftWidth + middleWidth + 3, y + 28.5);
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
  const head: RowInput[] = [[
    { content: "Дата", styles: { halign: "center" as const, valign: "middle" as const } },
    ...equipment.map((item) => ({
      content: `${item.name}\n(${item.min ?? "—"}...${item.max ?? "—"}°C)`,
      styles: { halign: "center" as const, valign: "middle" as const },
    })),
    { content: "Ответственный", styles: { halign: "center" as const, valign: "middle" as const } },
  ]];

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
    body,
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
  config: ReturnType<typeof normalizeCleaningDocumentConfig>;
  entries: { employeeId: string; date: Date; data: Record<string, unknown> }[];
}) {
  drawTitle(doc, getCleaningDocumentTitle());
  drawClimateMetaTable(doc, {
    organizationName: params.organizationName,
    title: params.title,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const rows = params.config.rows;
  const dateKeys = buildDateKeys(params.dateFrom, params.dateTo);
  const entryMap = new Map<string, string>();
  params.entries.forEach((entry) => {
    const mark = normalizeCleaningEntryData(entry.data).mark;
    const code = mark === "routine" ? "Т" : mark === "general" ? "Г" : "";
    entryMap.set(`${entry.employeeId}:${toDateKey(entry.date)}`, code);
  });

  const head: RowInput[] = [[
    { content: "Помещение", styles: { halign: "center" as const, valign: "middle" as const } },
    ...dateKeys.map((key) => ({
      content: String(getDayNumber(key)),
      styles: { halign: "center" as const, valign: "middle" as const },
    })),
  ]];

  const body: RowInput[] = rows.map((row) => [
    { content: row.name, styles: { halign: "left", valign: "middle" } },
    ...dateKeys.map((key) => centerCell(entryMap.get(`${row.id}:${key}`) || "")),
  ]);

  autoTable(doc, {
    startY: 66,
    head,
    body,
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
    columnStyles: {
      0: { cellWidth: 75 },
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

  const head: RowInput[] = [[
    centerCell("№"),
    centerCell("Дата/время"),
    centerCell("Продукция"),
    centerCell("Органолептика"),
    centerCell("T продукта"),
    centerCell("Корректирующие действия"),
    centerCell("Ответственный"),
    centerCell("Проверил"),
  ]];

  const body: RowInput[] = params.config.rows.map((row, index) => [
    centerCell(String(index + 1)),
    centerCell(row.productionDateTime || ""),
    { content: row.productName || "", styles: { halign: "left", valign: "middle" } },
    centerCell(row.organoleptic || ""),
    centerCell(row.productTemp || ""),
    { content: row.correctiveAction || "", styles: { halign: "left", valign: "middle" } },
    centerCell(row.responsiblePerson || ""),
    centerCell(row.inspectorName || ""),
  ]);

  autoTable(doc, {
    startY: 66,
    head,
    body,
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
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
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
  const climateConfig = normalizeClimateDocumentConfig(document.config);
  const coldConfig = normalizeColdEquipmentDocumentConfig(document.config);
  const cleaningConfig = normalizeCleaningDocumentConfig(document.config);
  const finishedConfig = normalizeFinishedProductDocumentConfig(document.config);

  document.entries.forEach((entry) => {
    entryMap[makeCellKey(entry.employeeId, toDateKey(entry.date))] =
      (entry.data as Record<string, unknown>) || {};
  });

  if (templateCode === "health_check") {
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
  } else if (templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
    drawFinishedProductPdf(doc, {
      organizationName,
      title: document.title || getFinishedProductDocumentTitle(),
      dateFrom: document.dateFrom,
      dateTo: document.dateTo,
      config: finishedConfig,
    });
  } else {
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
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const prefix =
    templateCode === "health_check"
      ? "health-journal"
      : templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
        ? getClimateFilePrefix()
        : templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
          ? getColdEquipmentFilePrefix()
          : templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
            ? getCleaningFilePrefix()
            : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
              ? getFinishedProductFilePrefix()
              : "hygiene-journal";

  return {
    buffer,
    fileName: `${prefix}-${toDateKey(document.dateFrom)}-${toDateKey(document.dateTo)}.pdf`,
  };
}
