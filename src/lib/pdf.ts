import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/db";

interface TemplateField {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}

export async function generateJournalPDF(params: {
  templateCode: string;
  organizationId: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  areaId?: string;
}): Promise<Buffer> {
  const { templateCode, organizationId, organizationName, dateFrom, dateTo, areaId } = params;

  // 1. Find template
  const template = await db.journalTemplate.findUnique({
    where: { code: templateCode },
  });

  if (!template) {
    throw new Error("Шаблон не найден");
  }

  const fields = template.fields as unknown as TemplateField[];

  // 2. Query entries for the period
  const whereClause: Record<string, unknown> = {
    templateId: template.id,
    organizationId,
    createdAt: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo + "T23:59:59.999Z"),
    },
  };

  if (areaId) {
    whereClause.areaId = areaId;
  }

  const entries = await db.journalEntry.findMany({
    where: whereClause,
    include: {
      filledBy: { select: { name: true } },
      area: { select: { name: true } },
      equipment: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 3. Generate PDF
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.text(organizationName, pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(12);
  doc.text(template.name, pageWidth / 2, 23, { align: "center" });

  doc.setFontSize(10);
  const periodText = `Период: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`;
  doc.text(periodText, pageWidth / 2, 30, { align: "center" });

  // Build table columns: #, Date, fields..., Area, Filled by
  const headRow: string[] = ["№", "Дата"];
  for (const field of fields) {
    if (field.type === "equipment") {
      headRow.push("Оборудование");
    } else {
      headRow.push(field.label);
    }
  }
  headRow.push("Цех/участок", "Кто заполнил");

  // Build table body
  const bodyRows: string[][] = entries.map((entry, index) => {
    const data = entry.data as Record<string, unknown>;
    const row: string[] = [
      String(index + 1),
      formatDateTime(entry.createdAt),
    ];

    for (const field of fields) {
      if (field.type === "equipment") {
        row.push(entry.equipment?.name || "—");
      } else if (field.type === "boolean") {
        const val = data[field.key];
        row.push(val === true ? "Да" : val === false ? "Нет" : "—");
      } else if (field.type === "select" && field.options) {
        const val = data[field.key] as string;
        const opt = field.options.find((o) => o.value === val);
        row.push(opt ? opt.label : String(val || "—"));
      } else if (field.type === "date") {
        const val = data[field.key];
        row.push(val ? formatDate(String(val)) : "—");
      } else {
        const val = data[field.key];
        row.push(val != null ? String(val) : "—");
      }
    }

    row.push(entry.area?.name || "—");
    row.push(entry.filledBy?.name || "—");

    return row;
  });

  // Calculate column widths
  const fixedColumns = 4; // #, Date, Area, Filled by
  const fieldColumnCount = Math.max(fields.length, 1);
  const totalColumns = fixedColumns + fieldColumnCount;
  const availableWidth = pageWidth - 28; // 14mm margin each side
  const fixedWidth = 18; // mm for fixed columns
  const fieldWidth = Math.max(
    20,
    (availableWidth - fixedWidth * fixedColumns) / fieldColumnCount
  );

  const columnStyles: Record<number, { cellWidth?: number }> = {
    0: { cellWidth: 10 }, // #
    1: { cellWidth: 24 }, // Date
    [totalColumns - 2]: { cellWidth: 28 }, // Area
    [totalColumns - 1]: { cellWidth: 28 }, // Filled by
  };
  for (let i = 2; i < totalColumns - 2; i++) {
    columnStyles[i] = { cellWidth: fieldWidth };
  }

  // Draw the table
  autoTable(doc, {
    startY: 35,
    head: [headRow],
    body: bodyRows,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
      lineColor: [0, 0, 0],
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles,
    margin: { top: 35, bottom: 25, left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer on every page
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);

      const now = new Date();
      const footerLeft = `Сгенерировано в HACCP-Online | ${formatDateTime(now)}`;
      doc.text(footerLeft, 14, pageHeight - 10);

      const pageNum = `${data.pageNumber}`;
      doc.text(pageNum, pageWidth - 14, pageHeight - 10, { align: "right" });

      // Reset text color for next page content
      doc.setTextColor(0, 0, 0);
    },
  });

  // If no entries, add a note
  if (entries.length === 0) {
    doc.setFontSize(10);
    doc.text("За выбранный период записей не найдено.", pageWidth / 2, 50, { align: "center" });
  }

  // Return as Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

function formatDateTime(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return String(date);
  }
}
