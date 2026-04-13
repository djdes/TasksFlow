import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const BASE = process.env.EXTERNAL_API_BASE?.replace(/\/$/, "") || "https://wesetup.ru";
const TOKEN_FILE = process.env.EXTERNAL_API_TOKEN_FILE || ".agent/tasks/journals-external-api/.external-token.secret";
const ORG_ID = process.env.EXTERNAL_API_ORG_ID || "cmnm40ikt00002ktseet6fd5y";
const OUT_DIR = process.env.EXTERNAL_VERIFY_OUT_DIR || ".agent/tasks/journals-external-api-part2";
const EMAIL = process.env.EXTERNAL_VERIFY_EMAIL || "admin@haccp.local";
const PASSWORD = process.env.EXTERNAL_VERIFY_PASSWORD || "admin1234";
const CODES = (process.env.EXTERNAL_VERIFY_CODES || "").split(",").map((item) => item.trim()).filter(Boolean);

type PayloadDefinition = {
  mode: "entry" | "config";
  build: (date: string, marker: string) => {
    data: Record<string, unknown>;
    expectedUi: string[];
    expectedPdf: string[];
  };
};

function todayKey() {
  const nextYear = new Date();
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  return nextYear.toISOString().slice(0, 10);
}

function markerFor(code: string) {
  return `EXT2 ${code.replaceAll("_", "-")} ${Date.now().toString(36).toUpperCase()}`;
}

function containsAll(text: string, needles: string[]) {
  const haystack = text.toLowerCase();
  return needles.every((needle) => haystack.includes(needle.toLowerCase()));
}

function toRegisterRow(values: Record<string, string>) {
  return {
    rows: [
      {
        values,
      },
    ],
  };
}

const DEFINITIONS: Record<string, PayloadDefinition> = {
  accident_journal: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            accidentDate: date,
            accidentHour: "09",
            accidentMinute: "15",
            locationName: marker,
            accidentDescription: `${marker} accident`,
            affectedProducts: "5 kg",
            resolvedDate: date,
            resolvedHour: "10",
            resolvedMinute: "05",
            responsiblePeople: marker,
            correctiveActions: `${marker} fixed`,
          },
        ],
      },
      expectedUi: [marker, "accident"],
      expectedPdf: [marker, "fixed"],
    }),
  },
  audit_plan: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        columns: [{ id: "audit-1", title: marker, auditorName: marker }],
        sections: [{ id: "general", title: marker }],
        rows: [{ id: "row-1", sectionId: "general", text: marker, checked: true, values: { "audit-1": date } }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  audit_protocol: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        basisTitle: marker,
        auditedObject: marker,
        sections: [{ id: "s1", title: marker }],
        rows: [{ id: "r1", sectionId: "s1", text: marker, result: "yes", note: marker }],
        signatures: [{ name: marker, role: marker, signedAt: date }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  audit_report: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        auditedObject: marker,
        summary: marker,
        recommendations: marker,
        findings: [{ nonConformity: marker, correctionActions: marker, correctiveActions: marker, responsibleName: marker, responsiblePosition: marker, dueDatePlan: date }],
        signatures: [{ role: marker, name: marker, position: marker, signedAt: date }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  breakdown_history: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            startDate: date,
            startHour: "08",
            startMinute: "30",
            equipmentName: marker,
            breakdownDescription: marker,
            repairPerformed: marker,
            partsReplaced: marker,
            endDate: date,
            endHour: "09",
            endMinute: "45",
            downtimeHours: "1.25",
            responsiblePerson: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  cleaning: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        activityType: "wetCleaning",
        times: ["06:41", "18:19"],
        responsibleName: marker,
      },
      expectedUi: [marker, "06:41"],
      expectedPdf: [marker, "06:41"],
    }),
  },
  cleaning_ventilation_checklist: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        procedures: {
          disinfection: ["06:41"],
          ventilation: ["14:21"],
        },
        responsibleUserId: marker,
      },
      expectedUi: ["06:41", "14:21"],
      expectedPdf: ["06:41", "14:21"],
    }),
  },
  climate_control: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        readings: [
          { roomName: "Склад", time: "10:00", temperature: 22.4, humidity: 51 },
          { roomName: "Склад", time: "17:00", temperature: 23.7, humidity: 55 },
        ],
        responsibleTitle: marker,
      },
      expectedUi: ["22.4", "23.7"],
      expectedPdf: ["22.4", "23.7"],
    }),
  },
  cold_equipment_control: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        readings: [
          { equipmentName: "Холодильная камера", temp: 3.2 },
          { equipmentName: "Морозильный ларь", temp: -18 },
        ],
        responsibleTitle: marker,
      },
      expectedUi: ["3.2", "-18"],
      expectedPdf: ["3.2", "-18"],
    }),
  },
  complaint_register: {
    mode: "config",
    build: (date, marker) => ({
      data: toRegisterRow({
        receiptDate: date,
        applicantName: marker,
        complaintReceiptForm: "по телефону",
        applicantDetails: marker,
        complaintContent: marker,
        decisionDate: date,
        decisionSummary: marker,
      }),
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  disinfectant_usage: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        responsibleRole: marker,
        responsibleEmployee: marker,
        subdivisions: [
          {
            name: marker,
            area: 10,
            byCapacity: false,
            treatmentType: "current",
            frequencyPerMonth: 5,
            disinfectantName: marker,
            concentration: 0.5,
            solutionConsumptionPerSqm: 0.3,
            solutionPerTreatment: 3,
          },
        ],
        receipts: [
          {
            date,
            disinfectantName: marker,
            quantity: 3,
            unit: "l",
            expiryDate: date,
            responsibleRole: marker,
            responsibleEmployee: marker,
          },
        ],
        consumptions: [
          {
            periodFrom: date,
            periodTo: date,
            disinfectantName: marker,
            totalReceived: 3,
            totalReceivedUnit: "l",
            totalConsumed: 1,
            totalConsumedUnit: "l",
            remainder: 2,
            remainderUnit: "l",
            responsibleRole: marker,
            responsibleEmployee: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  equipment_calibration: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        approveRole: marker,
        approveEmployee: marker,
        rows: [
          {
            equipmentName: marker,
            equipmentNumber: "EQ-42",
            location: marker,
            purpose: marker,
            measurementRange: marker,
            calibrationInterval: 12,
            lastCalibrationDate: date,
            note: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  equipment_cleaning: {
    mode: "entry",
    build: (date, marker) => ({
      data: {
        washDate: date,
        washTime: "07:12",
        equipmentName: marker,
        detergentName: marker,
        detergentConcentration: "1%",
        disinfectantName: marker,
        disinfectantConcentration: "0.5%",
        rinseTemperature: "78",
        rinseResult: "compliant",
        washerPosition: marker,
        washerName: marker,
        controllerPosition: marker,
        controllerName: marker,
      },
      expectedUi: [marker, "78"],
      expectedPdf: [marker, "78"],
    }),
  },
  equipment_maintenance: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        approveRole: marker,
        approveEmployee: marker,
        responsibleRole: marker,
        responsibleEmployee: marker,
        rows: [
          {
            equipmentName: marker,
            workType: marker,
            maintenanceType: "A",
            plan: { jan: "05", feb: "-", mar: "-", apr: "-", may: "-", jun: "-", jul: "-", aug: "-", sep: "-", oct: "-", nov: "-", dec: "-" },
            fact: { jan: "05", feb: "", mar: "", apr: "", may: "", jun: "", jul: "", aug: "", sep: "", oct: "", nov: "", dec: "" },
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  finished_product: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            productionDateTime: `${date} 11:20`,
            rejectionTime: "11:40",
            productName: marker,
            organoleptic: marker,
            productTemp: "72",
            correctiveAction: marker,
            releasePermissionTime: "12:00",
            courierTransferTime: "12:10",
            oxygenLevel: "98",
            responsiblePerson: marker,
            inspectorName: marker,
            organolepticValue: marker,
            organolepticResult: marker,
            releaseAllowed: "yes",
          },
        ],
        itemsCatalog: [marker],
      },
      expectedUi: [marker, "72"],
      expectedPdf: [marker, "72"],
    }),
  },
  fryer_oil: {
    mode: "entry",
    build: (date, marker) => ({
      data: {
        startDate: date,
        startHour: 8,
        startMinute: 15,
        fatType: marker,
        qualityStart: 5,
        equipmentType: marker,
        productType: marker,
        endHour: 9,
        endMinute: 20,
        qualityEnd: 4,
        carryoverKg: 1.2,
        disposedKg: 0.4,
        controllerName: marker,
      },
      expectedUi: [marker, "1.2"],
      expectedPdf: [marker, "1.2"],
    }),
  },
  general_cleaning: {
    mode: "entry",
    build: (date, marker) => ({
      data: {
        location: marker,
        scheduledDate: date,
        actualDate: date,
        scopeOfWork: marker,
        detergent: marker,
        disinfectant: marker,
        concentration: 1,
        result: "completed",
        nextScheduledDate: date,
        performedBy: marker,
        inspectedBy: marker,
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  glass_control: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        damagesDetected: true,
        itemName: marker,
        quantity: "3",
        damageInfo: marker,
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  glass_items_list: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        location: marker,
        responsibleTitle: marker,
        rows: [{ location: marker, itemName: marker, quantity: "4" }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  health_check: {
    mode: "entry",
    build: (_date, marker) => ({
      data: {
        signed: true,
        measures: marker,
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  hygiene: {
    mode: "entry",
    build: () => ({
      data: {
        status: "healthy",
        temperatureAbove37: false,
      },
      expectedUi: ["здоров"],
      expectedPdf: ["здоров"],
    }),
  },
  incoming_control: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            deliveryDate: date,
            deliveryHour: "11",
            deliveryMinute: "20",
            productName: marker,
            manufacturer: marker,
            supplier: marker,
            transportCondition: "satisfactory",
            packagingCompliance: "compliant",
            organolepticResult: "satisfactory",
            expiryDate: date,
            expiryHour: "18",
            expiryMinute: "00",
            note: marker,
            responsibleTitle: marker,
          },
        ],
        products: [marker],
        manufacturers: [marker],
        suppliers: [marker],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  incoming_raw_materials_control: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            deliveryDate: date,
            deliveryHour: "08",
            deliveryMinute: "40",
            productName: marker,
            manufacturer: marker,
            supplier: marker,
            transportCondition: "satisfactory",
            packagingCompliance: "compliant",
            organolepticResult: "satisfactory",
            expiryDate: date,
            note: marker,
            responsibleTitle: marker,
          },
        ],
        products: [marker],
        manufacturers: [marker],
        suppliers: [marker],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  intensive_cooling: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        dishSuggestions: [marker],
        rows: [
          {
            productionDate: date,
            productionHour: "14",
            productionMinute: "00",
            dishName: marker,
            startTemperature: "85",
            endTemperature: "4",
            correctiveAction: marker,
            comment: marker,
            responsibleTitle: marker,
          },
        ],
      },
      expectedUi: [marker, "85", "4"],
      expectedPdf: [marker, "85", "4"],
    }),
  },
  med_books: {
    mode: "entry",
    build: (date, marker) => ({
      data: {
        birthDate: "1990-01-02",
        gender: "female",
        hireDate: date,
        medBookNumber: marker,
        note: marker,
        examinations: {
          Терапевт: { date, expiryDate: date },
        },
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  metal_impurity: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        startDate: date,
        responsiblePosition: marker,
        responsibleEmployee: marker,
        materials: [{ id: "mat-1", name: marker }],
        suppliers: [{ id: "sup-1", name: marker }],
        rows: [
          {
            date,
            materialId: "mat-1",
            supplierId: "sup-1",
            consumedQuantityKg: "100",
            impurityQuantityG: "2",
            impurityCharacteristic: marker,
            responsibleRole: marker,
            responsibleName: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  perishable_rejection: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        manufacturers: [marker],
        suppliers: [marker],
        productLists: [{ id: "list-1", name: marker, items: [marker] }],
        rows: [
          {
            arrivalDate: date,
            arrivalTime: "09:20",
            productName: marker,
            productionDate: date,
            manufacturer: marker,
            supplier: marker,
            packaging: marker,
            quantity: "5 кг",
            documentNumber: marker,
            organolepticResult: "compliant",
            storageCondition: "2_6",
            expiryDate: date,
            actualSaleDate: date,
            actualSaleTime: "16:00",
            responsiblePerson: marker,
            note: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  pest_control: {
    mode: "entry",
    build: (date, marker) => ({
      data: {
        performedDate: date,
        performedHour: "13",
        performedMinute: "05",
        timeSpecified: true,
        event: marker,
        areaOrVolume: marker,
        treatmentProduct: marker,
        note: marker,
        performedBy: marker,
        acceptedRole: marker,
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  ppe_issuance: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        showGloves: true,
        showShoes: true,
        rows: [
          {
            issueDate: date,
            maskCount: 1,
            gloveCount: 2,
            shoePairsCount: 1,
            clothingSetsCount: 1,
            capCount: 1,
            recipientTitle: marker,
            issuerTitle: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  product_writeoff: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        supplierName: marker,
        commissionMembers: [{ role: marker, employeeName: marker }],
        rows: [
          {
            productName: marker,
            batchNumber: marker,
            productionDate: date,
            quantity: "7 кг",
            discrepancyDescription: marker,
            action: marker,
          },
        ],
        productLists: [{ id: "list-1", name: marker, items: [marker] }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  sanitary_day_control: {
    mode: "config",
    build: (_date, marker) => ({
      data: {
        responsibleName: marker,
        checkerName: marker,
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  staff_training: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        rows: [
          {
            date,
            employeeName: marker,
            employeePosition: marker,
            topic: marker,
            trainingType: "primary",
            instructorName: marker,
            attestationResult: "passed",
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  traceability_test: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        dateFrom: date,
        rawMaterialList: [marker],
        productList: [marker],
        defaultResponsibleRole: marker,
        defaultResponsibleEmployee: marker,
        rows: [
          {
            date,
            incoming: {
              rawMaterialName: marker,
              batchNumber: marker,
              packagingDate: date,
              quantityPieces: 5,
              quantityKg: 4.2,
            },
            outgoing: {
              productName: marker,
              quantityPacksPieces: 2,
              quantityPacksKg: 1.2,
              shockTemp: -18,
            },
            responsibleRole: marker,
            responsibleEmployee: marker,
          },
        ],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  training_plan: {
    mode: "config",
    build: (date, marker) => ({
      data: {
        documentDate: date,
        approveRole: marker,
        approveEmployee: marker,
        topics: [{ id: "topic-1", name: marker }],
        rows: [{ id: "row-1", positionName: marker, cells: { "topic-1": { required: true, date: "04.26" } } }],
      },
      expectedUi: [marker],
      expectedPdf: [marker],
    }),
  },
  uv_lamp_runtime: {
    mode: "entry",
    build: (_date, _marker) => ({
      data: {
        startTime: "09:00",
        endTime: "09:37",
      },
      expectedUi: ["09:00", "09:37"],
      expectedPdf: ["09:00", "09:37"],
    }),
  },
};

async function readToken() {
  return (await fs.readFile(TOKEN_FILE, "utf8")).trim();
}

async function ensurePypdfInstalled() {
  try {
    await execFileAsync("python", ["-c", "import pypdf"]);
  } catch {
    await execFileAsync("python", ["-m", "pip", "install", "--user", "pypdf"]);
  }
}

async function login(browserBaseUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 2400 } });
  const page = await context.newPage();

  const response = await context.request.post(new URL("/api/auth/login", browserBaseUrl).toString(), {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()}`);
  }

  await page.goto(new URL("/dashboard", browserBaseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  return { browser, context, page };
}

async function postExternal(token: string, code: string, date: string, data: Record<string, unknown>) {
  const response = await fetch(`${BASE}/api/external/entries`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      organizationId: ORG_ID,
      journalCode: code,
      date,
      source: "external_part2_verify",
      data,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body,
  };
}

async function fetchPdfText(context: Awaited<ReturnType<typeof login>>["context"], documentId: string, outPath: string) {
  const pdfResponse = await context.request.get(`${BASE}/api/journal-documents/${documentId}/pdf`);
  const pdfBuffer = Buffer.from(await pdfResponse.body());
  await fs.writeFile(outPath, pdfBuffer);
  const { stdout } = await execFileAsync("python", ["scripts/extract-pdf-text.py", outPath], { maxBuffer: 16 * 1024 * 1024 });
  return {
    status: pdfResponse.status(),
    contentType: pdfResponse.headers()["content-type"] || "",
    text: stdout,
    bytes: pdfBuffer.length,
  };
}

async function verifyCode(params: {
  code: string;
  token: string;
  page: Awaited<ReturnType<typeof login>>["page"];
  context: Awaited<ReturnType<typeof login>>["context"];
}) {
  const { code, token, page, context } = params;
  const definition = DEFINITIONS[code];
  if (!definition) {
    throw new Error(`No payload definition for ${code}`);
  }

  const date = todayKey();
  const marker = markerFor(code);
  const built = definition.build(date, marker);
  const result = await postExternal(token, code, date, built.data);
  const documentId = typeof result.body.documentId === "string" ? result.body.documentId : "";
  if (!result.body.ok || !documentId) {
    throw new Error(`POST failed for ${code}: ${JSON.stringify(result.body)}`);
  }

  const codeDir = path.join(OUT_DIR, code);
  const rawDir = path.join(codeDir, "raw");
  await fs.mkdir(rawDir, { recursive: true });
  await fs.writeFile(path.join(rawDir, "payload.json"), JSON.stringify({ date, marker, data: built.data }, null, 2));

  const detailUrl = `${BASE}/journals/${code}/documents/${documentId}`;
  await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: path.join(rawDir, "ui.png"), fullPage: true });
  const uiText = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const formValues = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "input, textarea, select"
      )
    )
      .map((node) => ("value" in node ? node.value : ""))
      .filter(Boolean)
      .join("\n");
    return `${bodyText}\n${formValues}`;
  });
  await fs.writeFile(path.join(rawDir, "ui.txt"), uiText, "utf8");

  const pdf = await fetchPdfText(context, documentId, path.join(rawDir, "document.pdf"));
  await fs.writeFile(path.join(rawDir, "pdf.txt"), pdf.text, "utf8");

  const uiPass = containsAll(uiText, built.expectedUi);
  const pdfPass = containsAll(pdf.text, built.expectedPdf);
  const verdict = result.status === 200 && uiPass && pdfPass ? "PASS" : "FAIL";
  const evidenceMd = [
    `# ${code} — end-to-end — ${new Date().toISOString()}`,
    `- POST: ${result.status}, documentId=${documentId}, entriesWritten=${String(result.body.entriesWritten ?? "-")}`,
    `- UI rendering: ${uiPass ? "PASS" : "FAIL"} — expected ${built.expectedUi.join(", ") || "-"}`,
    `- PDF rendering: ${pdfPass ? "PASS" : "FAIL"} — expected ${built.expectedPdf.join(", ") || "-"}`,
    `- Payload shape used: ${definition.mode}`,
    `- Problems: ${verdict === "PASS" ? "-" : "See raw/ui.txt and raw/pdf.txt"}`,
    `- Verdict: ${verdict}`,
    "",
  ].join("\n");

  await fs.writeFile(path.join(codeDir, "evidence.md"), evidenceMd, "utf8");
  await fs.writeFile(
    path.join(codeDir, "evidence.json"),
    JSON.stringify(
      {
        code,
        documentId,
        date,
        marker,
        postStatus: result.status,
        body: result.body,
        expectedUi: built.expectedUi,
        expectedPdf: built.expectedPdf,
        uiPass,
        pdfPass,
        verdict,
        pdfStatus: pdf.status,
        pdfContentType: pdf.contentType,
        pdfBytes: pdf.bytes,
      },
      null,
      2
    ),
    "utf8"
  );

  return { code, verdict, documentId, postStatus: result.status, uiPass, pdfPass };
}

async function main() {
  await ensurePypdfInstalled();
  const token = await readToken();
  const { browser, context, page } = await login(BASE);
  const requestedCodes = CODES.length > 0 ? CODES : Object.keys(DEFINITIONS);
  const results: Array<{ code: string; verdict: string; documentId: string; postStatus: number; uiPass: boolean; pdfPass: boolean }> = [];

  try {
    for (const code of requestedCodes) {
      const result = await verifyCode({ code, token, page, context });
      results.push(result);
      console.log(`[${code}] ${result.verdict} doc=${result.documentId}`);
    }
  } finally {
    await browser.close();
  }

  const lines = [
    `# External API verification — ${new Date().toISOString()}`,
    "",
    "| Code | POST | UI | PDF | Verdict |",
    "|---|---:|---|---|---|",
    ...results.map((item) => `| ${item.code} | ${item.postStatus} | ${item.uiPass ? "PASS" : "FAIL"} | ${item.pdfPass ? "PASS" : "FAIL"} | ${item.verdict} |`),
  ];
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "FINAL.md"), lines.join("\n"), "utf8");
  if (results.some((item) => item.verdict !== "PASS")) {
    const problems = results
      .filter((item) => item.verdict !== "PASS")
      .map((item) => `- ${item.code}: POST=${item.postStatus}, UI=${item.uiPass}, PDF=${item.pdfPass}`)
      .join("\n");
    await fs.writeFile(path.join(OUT_DIR, "problems.md"), `# Problems\n\n${problems}\n`, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
