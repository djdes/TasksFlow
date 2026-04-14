import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

type Employee = {
  id: string;
  name: string;
  role: string | null;
  positionTitle: string | null;
};

type Area = { id: string; name: string };
type Equipment = { id: string; name: string; type: string; area?: { id: string; name: string } | null };

type FillContext = {
  employees: Employee[];
  areas: Area[];
  equipment: Equipment[];
};

type ExternalEntry = {
  employeeId?: string;
  date?: string;
  data: Record<string, unknown>;
};

type FillPayload =
  | {
      mode: "entries";
      date: string;
      entries: ExternalEntry[];
    }
  | {
      mode: "config";
      date: string;
      rows: Record<string, unknown>;
    };

const BASE = process.env.EXTERNAL_API_BASE?.replace(/\/$/, "") || "https://wesetup.ru";
const TOKEN_FILE =
  process.env.EXTERNAL_API_TOKEN_FILE || ".agent/tasks/journals-external-api/.external-token.secret";
const ORG_ID = process.env.EXTERNAL_API_ORG_ID || "cmnm40ikt00002ktseet6fd5y";
const EMAIL = process.env.EXTERNAL_VERIFY_EMAIL || "admin@haccp.local";
const PASSWORD = process.env.EXTERNAL_VERIFY_PASSWORD || "admin1234";
const OUT_DIR = ".agent/tasks/journals-external-api/fill-max";
const DRY_RUN = process.argv.includes("--dry-run");

const CODES = [
  "accident_journal",
  "audit_plan",
  "audit_protocol",
  "audit_report",
  "breakdown_history",
  "cleaning",
  "cleaning_ventilation_checklist",
  "climate_control",
  "cold_equipment_control",
  "complaint_register",
  "disinfectant_usage",
  "equipment_calibration",
  "equipment_cleaning",
  "equipment_maintenance",
  "finished_product",
  "fryer_oil",
  "general_cleaning",
  "glass_control",
  "glass_items_list",
  "health_check",
  "hygiene",
  "incoming_control",
  "incoming_raw_materials_control",
  "intensive_cooling",
  "med_books",
  "metal_impurity",
  "perishable_rejection",
  "pest_control",
  "ppe_issuance",
  "product_writeoff",
  "sanitary_day_control",
  "staff_training",
  "traceability_test",
  "training_plan",
  "uv_lamp_runtime",
] as const;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function lastDayOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function daysForMonth(date: Date) {
  const now = new Date();
  const isCurrentMonth =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth();
  const max = isCurrentMonth ? Math.min(lastDayOfMonth(date), now.getUTCDate() + 1) : lastDayOfMonth(date);
  return [3, 9, 15, 21, 27].filter((day) => day <= max).map((day) => {
    return isoDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day)));
  });
}

function monthFactMap(activeMonth: number, value: string) {
  const keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
  const out: Record<string, string> = {};
  keys.forEach((key, index) => {
    out[key] = index === activeMonth ? value : "-";
  });
  return out;
}

function monthPlanMap(activeMonth: number, value: string) {
  const keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
  const out: Record<string, string> = {};
  keys.forEach((key, index) => {
    out[key] = index === activeMonth ? value : "-";
  });
  return out;
}

function marker(code: string, monthDate: Date, index: number) {
  return `MAX ${code} ${monthKey(monthDate)} R${index + 1}`;
}

function pickEmployee(ctx: FillContext, pattern: RegExp, fallbackIndex = 0) {
  return (
    ctx.employees.find((employee) => pattern.test(employee.positionTitle || employee.name)) ||
    ctx.employees[fallbackIndex] ||
    ctx.employees[0]
  );
}

function pickArea(ctx: FillContext, fallbackIndex = 0) {
  return ctx.areas[fallbackIndex] || ctx.areas[0] || { id: "area-fallback", name: "Area" };
}

function pickEquipment(ctx: FillContext, fallbackIndex = 0) {
  return (
    ctx.equipment[fallbackIndex] ||
    ctx.equipment[0] || {
      id: "equipment-fallback",
      name: "Equipment",
      type: "generic",
      area: { id: "area-fallback", name: "Area" },
    }
  );
}

function buildEntryPayloads(code: string, monthDate: Date, ctx: FillContext): FillPayload {
  const days = daysForMonth(monthDate);
  const qa = pickEmployee(ctx, /(qa|tech|qual|кач|техн)/i, 0);
  const manager = pickEmployee(ctx, /(управ|manager|chef|шеф)/i, 1);
  const worker = pickEmployee(ctx, /(повар|cook|клад|warehouse|официант|зал)/i, 2);
  const area = pickArea(ctx, 0);
  const secondArea = pickArea(ctx, 1);
  const equipment = pickEquipment(ctx, 0);
  const secondEquipment = pickEquipment(ctx, 1);

  switch (code) {
    case "hygiene":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: [worker, manager, qa, worker][index % 4]?.id,
          date: day,
          data: { status: "healthy", temperatureAbove37: false },
        })),
      };
    case "health_check":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: [worker, manager, qa, worker][index % 4]?.id,
          date: day,
          data: { signed: true, measures: `checked ${day}` },
        })),
      };
    case "climate_control":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: qa.id,
          date: day,
          data: {
            readings: [
              { roomName: area.name, time: "09:00", temperature: 19 + index, humidity: 43 + index },
              { roomName: area.name, time: "14:00", temperature: 20 + index, humidity: 45 + index },
              { roomName: area.name, time: "19:00", temperature: 21 + index, humidity: 47 + index },
              { roomName: secondArea.name, time: "09:00", temperature: 18 + index, humidity: 41 + index },
              { roomName: secondArea.name, time: "14:00", temperature: 19 + index, humidity: 43 + index },
              { roomName: secondArea.name, time: "19:00", temperature: 20 + index, humidity: 45 + index },
            ],
            responsibleTitle: qa.positionTitle || "QA",
          },
        })),
      };
    case "cold_equipment_control":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: qa.id,
          date: day,
          data: {
            readings: [
              { equipmentName: equipment.name, temp: 2.1 + index * 0.2 },
              { equipmentName: secondEquipment.name, temp: -18 + index * 0.3 },
            ],
            responsibleTitle: qa.positionTitle || "QA",
          },
        })),
      };
    case "cleaning":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 5).map((day, index) => ({
          employeeId: worker.id,
          date: day,
          data: {
            activityType: index % 2 === 0 ? "wetCleaning" : "disinfection",
            times: ["06:40", "14:20", "19:00"],
            responsibleName: worker.name,
          },
        })),
      };
    case "cleaning_ventilation_checklist":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 5).map((day) => ({
          employeeId: worker.id,
          date: day,
          data: {
            procedures: {
              disinfection: ["06:41", "18:19"],
              ventilation: ["09:02", "14:21"],
            },
            responsibleUserId: worker.id,
          },
        })),
      };
    case "equipment_cleaning":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 5).map((day, index) => ({
          employeeId: worker.id,
          date: day,
          data: {
            washDate: day,
            washTime: `${String(7 + index).padStart(2, "0")}:15`,
            equipmentName: index % 2 === 0 ? equipment.name : secondEquipment.name,
            detergentName: `Cleaner-${index + 1}`,
            detergentConcentration: `${1 + index}%`,
            disinfectantName: `Disinfect-${index + 1}`,
            disinfectantConcentration: `${0.4 + index / 10}%`,
            rinseTemperature: String(76 + index),
            rinseResult: "compliant",
            washerPosition: worker.positionTitle || "Operator",
            washerName: worker.name,
            controllerPosition: qa.positionTitle || "QA",
            controllerName: qa.name,
          },
        })),
      };
    case "fryer_oil":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: worker.id,
          date: day,
          data: {
            startDate: day,
            startHour: 8,
            startMinute: 10,
            fatType: `Oil-${index + 1}`,
            qualityStart: 5,
            equipmentType: `Fryer-${index + 1}`,
            productType: `Snack-${index + 1}`,
            endHour: 12,
            endMinute: 20,
            qualityEnd: 4,
            carryoverKg: 1.2 + index * 0.1,
            disposedKg: 0.4 + index * 0.1,
            controllerName: qa.name,
          },
        })),
      };
    case "glass_control":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: qa.id,
          date: day,
          data: {
            damagesDetected: true,
            itemName: `glass-item-${index + 1}`,
            quantity: String(index + 2),
            damageInfo: `chip on shelf ${index + 1}`,
          },
        })),
      };
    case "med_books":
      return {
        mode: "entries",
        date: days[0],
        entries: [worker, manager, qa].map((employee, index) => ({
          employeeId: employee.id,
          date: days[index] || days[0],
          data: {
            birthDate: `199${index}-0${index + 1}-15`,
            gender: index % 2 === 0 ? "female" : "male",
            hireDate: days[index] || days[0],
            medBookNumber: `MB-${monthKey(monthDate)}-${index + 1}`,
            note: `medical control ${index + 1}`,
            examinations: {
              Therapist: { date: days[index] || days[0], expiryDate: days[index + 1] || days[index] || days[0] },
              XRay: { date: days[index] || days[0], expiryDate: days[index + 1] || days[index] || days[0] },
            },
          },
        })),
      };
    case "pest_control":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 4).map((day, index) => ({
          employeeId: qa.id,
          date: day,
          data: {
            performedDate: day,
            performedHour: "13",
            performedMinute: "05",
            timeSpecified: true,
            event: `inspection-${index + 1}`,
            areaOrVolume: index % 2 === 0 ? area.name : secondArea.name,
            treatmentProduct: `pest-kit-${index + 1}`,
            note: `trap check ${index + 1}`,
            performedBy: qa.name,
            acceptedRole: qa.positionTitle || "QA",
          },
        })),
      };
    case "uv_lamp_runtime":
      return {
        mode: "entries",
        date: days[0],
        entries: days.slice(0, 5).map((day, index) => ({
          employeeId: worker.id,
          date: day,
          data: {
            startTime: `${String(8 + index).padStart(2, "0")}:00`,
            endTime: `${String(8 + index).padStart(2, "0")}:45`,
          },
        })),
      };
    default:
      throw new Error(`Unsupported entry journal: ${code}`);
  }
}

function buildConfigPayload(code: string, monthDate: Date, ctx: FillContext): FillPayload {
  const days = daysForMonth(monthDate);
  const qa = pickEmployee(ctx, /(qa|tech|qual|кач|техн)/i, 0);
  const manager = pickEmployee(ctx, /(управ|manager|chef|шеф)/i, 1);
  const worker = pickEmployee(ctx, /(повар|cook|клад|warehouse|официант|зал)/i, 2);
  const area = pickArea(ctx, 0);
  const secondArea = pickArea(ctx, 1);
  const equipment = pickEquipment(ctx, 0);
  const secondEquipment = pickEquipment(ctx, 1);
  const activeMonth = monthDate.getUTCMonth();
  const year = monthDate.getUTCFullYear();
  const rowMarks = [0, 1, 2].map((index) => marker(code, monthDate, index));

  switch (code) {
    case "accident_journal":
      return {
        mode: "config",
        date: days[0],
        rows: {
          rows: rowMarks.map((mark, index) => ({
            accidentDate: days[index],
            accidentHour: "09",
            accidentMinute: "15",
            locationName: index % 2 === 0 ? area.name : secondArea.name,
            accidentDescription: `${mark} incident`,
            affectedProducts: `${index + 2} kg`,
            resolvedDate: days[index],
            resolvedHour: "10",
            resolvedMinute: "05",
            responsiblePeople: qa.name,
            correctiveActions: `${mark} corrected`,
          })),
        },
      };
    case "audit_plan":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          columns: rowMarks.map((mark, index) => ({
            id: `audit-col-${index + 1}`,
            title: mark,
            auditorName: index % 2 === 0 ? qa.name : manager.name,
          })),
          sections: [
            { id: "general", title: "General" },
            { id: "storage", title: "Storage" },
          ],
          rows: [
            {
              id: "audit-row-1",
              sectionId: "general",
              text: "Sanitation baseline",
              checked: true,
              values: {
                "audit-col-1": days[0],
                "audit-col-2": days[1],
                "audit-col-3": days[2],
              },
            },
            {
              id: "audit-row-2",
              sectionId: "storage",
              text: "Storage conditions",
              checked: true,
              values: {
                "audit-col-1": days[0],
                "audit-col-2": days[1],
                "audit-col-3": days[2],
              },
            },
          ],
        },
      };
    case "audit_protocol":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          basisTitle: `Protocol ${monthKey(monthDate)}`,
          auditedObject: area.name,
          sections: [
            { id: "s1", title: "Process" },
            { id: "s2", title: "Documentation" },
          ],
          rows: rowMarks.map((mark, index) => ({
            id: `proto-row-${index + 1}`,
            sectionId: index % 2 === 0 ? "s1" : "s2",
            text: mark,
            result: "yes",
            note: `${mark} ok`,
          })),
          signatures: [
            { name: qa.name, role: qa.positionTitle || "QA", signedAt: days[0] },
            { name: manager.name, role: manager.positionTitle || "Manager", signedAt: days[1] },
          ],
        },
      };
    case "audit_report":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          auditedObject: area.name,
          summary: `Audit summary ${monthKey(monthDate)}`,
          recommendations: "Keep documenting and calibrating equipment.",
          findings: rowMarks.map((mark, index) => ({
            nonConformity: mark,
            correctionActions: `${mark} immediate correction`,
            correctiveActions: `${mark} preventive action`,
            responsibleName: index % 2 === 0 ? qa.name : manager.name,
            responsiblePosition: index % 2 === 0 ? qa.positionTitle : manager.positionTitle,
            dueDatePlan: days[index],
          })),
          signatures: [
            { role: qa.positionTitle || "QA", name: qa.name, position: qa.positionTitle || "QA", signedAt: days[0] },
            { role: manager.positionTitle || "Manager", name: manager.name, position: manager.positionTitle || "Manager", signedAt: days[1] },
          ],
        },
      };
    case "breakdown_history":
      return {
        mode: "config",
        date: days[0],
        rows: {
          rows: rowMarks.map((mark, index) => ({
            startDate: days[index],
            startHour: "08",
            startMinute: "30",
            equipmentName: index % 2 === 0 ? equipment.name : secondEquipment.name,
            breakdownDescription: `${mark} stopped`,
            repairPerformed: `${mark} repaired`,
            partsReplaced: `part-${index + 1}`,
            endDate: days[index],
            endHour: "09",
            endMinute: "45",
            downtimeHours: `${1 + index}.25`,
            responsiblePerson: worker.name,
          })),
        },
      };
    case "complaint_register":
      return {
        mode: "config",
        date: days[0],
        rows: {
          rows: rowMarks.map((mark, index) => ({
            values: {
              receiptDate: days[index],
              applicantName: `client-${index + 1}`,
              complaintReceiptForm: "phone",
              applicantDetails: `contact-${index + 1}`,
              complaintContent: mark,
              decisionDate: days[index],
              decisionSummary: `${mark} resolved`,
            },
          })),
        },
      };
    case "disinfectant_usage":
      return {
        mode: "config",
        date: days[0],
        rows: {
          responsibleRole: qa.positionTitle || "QA",
          responsibleEmployee: qa.name,
          subdivisions: rowMarks.map((mark, index) => ({
            name: index % 2 === 0 ? area.name : secondArea.name,
            area: 12 + index,
            byCapacity: false,
            treatmentType: index % 2 === 0 ? "current" : "general",
            frequencyPerMonth: 4 + index,
            disinfectantName: `disinfect-${index + 1}`,
            concentration: 0.4 + index / 10,
            solutionConsumptionPerSqm: 0.3 + index / 10,
            solutionPerTreatment: 2 + index,
          })),
          receipts: rowMarks.map((mark, index) => ({
            date: days[index],
            disinfectantName: `disinfect-${index + 1}`,
            quantity: 3 + index,
            unit: "l",
            expiryDate: days[Math.min(index + 1, days.length - 1)],
            responsibleRole: qa.positionTitle || "QA",
            responsibleEmployee: qa.name,
          })),
          consumptions: rowMarks.map((mark, index) => ({
            periodFrom: days[0],
            periodTo: days[index],
            disinfectantName: `disinfect-${index + 1}`,
            totalReceived: 5 + index,
            totalReceivedUnit: "l",
            totalConsumed: 2 + index,
            totalConsumedUnit: "l",
            remainder: 3,
            remainderUnit: "l",
            responsibleRole: qa.positionTitle || "QA",
            responsibleEmployee: qa.name,
          })),
        },
      };
    case "equipment_calibration":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          year,
          approveRole: manager.positionTitle || "Manager",
          approveEmployee: manager.name,
          rows: [equipment, secondEquipment, pickEquipment(ctx, 2)].map((item, index) => ({
            equipmentName: item.name,
            equipmentNumber: `EQ-${activeMonth + 1}-${index + 1}`,
            location: item.area?.name || area.name,
            purpose: `control-${index + 1}`,
            measurementRange: `${index}..${index + 100}`,
            calibrationInterval: 12,
            lastCalibrationDate: days[index],
            note: rowMarks[index],
          })),
        },
      };
    case "equipment_maintenance":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          approveRole: manager.positionTitle || "Manager",
          approveEmployee: manager.name,
          responsibleRole: worker.positionTitle || "Operator",
          responsibleEmployee: worker.name,
          rows: [equipment, secondEquipment, pickEquipment(ctx, 2)].map((item, index) => ({
            equipmentName: item.name,
            workType: `maintenance-${index + 1}`,
            maintenanceType: "A",
            plan: monthPlanMap(activeMonth, String(3 + index).padStart(2, "0")),
            fact: monthFactMap(activeMonth, String(4 + index).padStart(2, "0")),
          })),
        },
      };
    case "finished_product":
      return {
        mode: "config",
        date: days[0],
        rows: {
          itemsCatalog: rowMarks.map((mark) => `product-${mark}`),
          rows: rowMarks.map((mark, index) => ({
            productionDateTime: `${days[index]} ${10 + index}:15`,
            rejectionTime: `${11 + index}:00`,
            productName: `product-${index + 1}`,
            organoleptic: `check-${index + 1}`,
            productTemp: String(70 + index),
            correctiveAction: `${mark} action`,
            releasePermissionTime: `${12 + index}:00`,
            courierTransferTime: `${12 + index}:30`,
            oxygenLevel: `${97 + index}`,
            responsiblePerson: worker.name,
            inspectorName: qa.name,
            organolepticValue: `${mark} value`,
            organolepticResult: "pass",
            releaseAllowed: "yes",
          })),
        },
      };
    case "general_cleaning":
      return {
        mode: "config",
        date: days[0],
        rows: {
          year,
          documentDate: `${year}-01-01`,
          approveRole: manager.positionTitle || "Manager",
          approveEmployee: manager.name,
          responsibleRole: qa.positionTitle || "QA",
          responsibleEmployee: qa.name,
          rows: [area, secondArea, pickArea(ctx, 2)].map((item, index) => ({
            id: `gc-${activeMonth}-${index + 1}`,
            roomName: item.name,
            plan: monthPlanMap(activeMonth, String(5 + index).padStart(2, "0")),
            fact: monthFactMap(activeMonth, String(6 + index).padStart(2, "0")),
          })),
        },
      };
    case "glass_items_list":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          location: area.name,
          responsibleTitle: qa.positionTitle || "QA",
          rows: rowMarks.map((mark, index) => ({
            location: index % 2 === 0 ? area.name : secondArea.name,
            itemName: `glassware-${index + 1}`,
            quantity: String(index + 2),
          })),
        },
      };
    case "incoming_control":
    case "incoming_raw_materials_control":
      return {
        mode: "config",
        date: days[0],
        rows: {
          products: ["chicken", "fish", "greens"],
          manufacturers: ["supplier-a", "supplier-b", "supplier-c"],
          suppliers: ["vendor-a", "vendor-b", "vendor-c"],
          rows: rowMarks.map((mark, index) => ({
            deliveryDate: days[index],
            deliveryHour: "08",
            deliveryMinute: "40",
            productName: ["chicken", "fish", "greens"][index],
            manufacturer: ["supplier-a", "supplier-b", "supplier-c"][index],
            supplier: ["vendor-a", "vendor-b", "vendor-c"][index],
            transportCondition: "satisfactory",
            packagingCompliance: "compliant",
            organolepticResult: "satisfactory",
            expiryDate: days[Math.min(index + 1, days.length - 1)],
            expiryHour: "18",
            expiryMinute: "00",
            note: mark,
            responsibleTitle: qa.positionTitle || "QA",
          })),
        },
      };
    case "intensive_cooling":
      return {
        mode: "config",
        date: days[0],
        rows: {
          dishSuggestions: ["soup", "sauce", "dessert"],
          rows: rowMarks.map((mark, index) => ({
            productionDate: days[index],
            productionHour: "14",
            productionMinute: "00",
            dishName: ["soup", "sauce", "dessert"][index],
            startTemperature: String(85 - index),
            endTemperature: String(4 + index),
            correctiveAction: `${mark} verified`,
            comment: `${mark} ok`,
            responsibleTitle: qa.positionTitle || "QA",
          })),
        },
      };
    case "metal_impurity":
      return {
        mode: "config",
        date: days[0],
        rows: {
          startDate: days[0],
          responsiblePosition: qa.positionTitle || "QA",
          responsibleEmployee: qa.name,
          materials: rowMarks.map((_, index) => ({ id: `mat-${index + 1}`, name: `material-${index + 1}` })),
          suppliers: rowMarks.map((_, index) => ({ id: `sup-${index + 1}`, name: `supplier-${index + 1}` })),
          rows: rowMarks.map((mark, index) => ({
            date: days[index],
            materialId: `mat-${index + 1}`,
            supplierId: `sup-${index + 1}`,
            consumedQuantityKg: String(100 + index * 10),
            impurityQuantityG: String(1 + index),
            impurityCharacteristic: mark,
            responsibleRole: qa.positionTitle || "QA",
            responsibleName: qa.name,
          })),
        },
      };
    case "perishable_rejection":
      return {
        mode: "config",
        date: days[0],
        rows: {
          manufacturers: ["maker-a", "maker-b", "maker-c"],
          suppliers: ["vendor-a", "vendor-b", "vendor-c"],
          productLists: [{ id: "list-1", name: "products", items: ["milk", "cream", "salad"] }],
          rows: rowMarks.map((mark, index) => ({
            arrivalDate: days[index],
            arrivalTime: "09:20",
            productName: ["milk", "cream", "salad"][index],
            productionDate: days[index],
            manufacturer: ["maker-a", "maker-b", "maker-c"][index],
            supplier: ["vendor-a", "vendor-b", "vendor-c"][index],
            packaging: `sealed-${index + 1}`,
            quantity: `${5 + index} kg`,
            documentNumber: `DOC-${index + 1}`,
            organolepticResult: "compliant",
            storageCondition: "2_6",
            expiryDate: days[Math.min(index + 1, days.length - 1)],
            actualSaleDate: days[index],
            actualSaleTime: "16:00",
            responsiblePerson: worker.name,
            note: mark,
          })),
        },
      };
    case "ppe_issuance":
      return {
        mode: "config",
        date: days[0],
        rows: {
          showGloves: true,
          showShoes: true,
          rows: [worker, manager, qa].map((employee, index) => ({
            issueDate: days[index],
            maskCount: 1 + index,
            gloveCount: 2 + index,
            shoePairsCount: 1,
            clothingSetsCount: 1,
            capCount: 1,
            recipientTitle: employee.positionTitle || employee.name,
            issuerTitle: qa.positionTitle || "QA",
          })),
        },
      };
    case "product_writeoff":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          supplierName: "supplier-main",
          commissionMembers: [
            { role: manager.positionTitle || "Manager", employeeName: manager.name },
            { role: qa.positionTitle || "QA", employeeName: qa.name },
          ],
          productLists: [{ id: "list-1", name: "written-off", items: ["soup", "sauce", "dessert"] }],
          rows: rowMarks.map((mark, index) => ({
            productName: ["soup", "sauce", "dessert"][index],
            batchNumber: `BATCH-${index + 1}`,
            productionDate: days[index],
            quantity: `${6 + index} kg`,
            discrepancyDescription: `${mark} discrepancy`,
            action: `${mark} disposed`,
          })),
        },
      };
    case "sanitary_day_control":
      return {
        mode: "config",
        date: days[0],
        rows: {
          responsibleName: worker.name,
          checkerName: qa.name,
          zones: [
            { id: "zone-1", name: area.name },
            { id: "zone-2", name: secondArea.name },
          ],
          items: [
            { id: "item-1", zoneId: "zone-1", name: "surface cleaning", periodicity: "daily" },
            { id: "item-2", zoneId: "zone-2", name: "inventory wash", periodicity: "daily" },
          ],
        },
      };
    case "staff_training":
      return {
        mode: "config",
        date: days[0],
        rows: {
          rows: [worker, manager, qa].map((employee, index) => ({
            date: days[index],
            employeeName: employee.name,
            employeePosition: employee.positionTitle || employee.name,
            topic: `topic-${index + 1}`,
            trainingType: index === 2 ? "repeat" : "primary",
            instructorName: qa.name,
            attestationResult: "passed",
          })),
        },
      };
    case "traceability_test":
      return {
        mode: "config",
        date: days[0],
        rows: {
          dateFrom: days[0],
          rawMaterialList: ["chicken", "fish", "greens"],
          productList: ["soup", "cutlet", "salad"],
          defaultResponsibleRole: qa.positionTitle || "QA",
          defaultResponsibleEmployee: qa.name,
          rows: rowMarks.map((mark, index) => ({
            date: days[index],
            incoming: {
              rawMaterialName: ["chicken", "fish", "greens"][index],
              batchNumber: `INC-${index + 1}`,
              packagingDate: days[index],
              quantityPieces: 10 + index,
              quantityKg: 4.2 + index,
            },
            outgoing: {
              productName: ["soup", "cutlet", "salad"][index],
              quantityPacksPieces: 2 + index,
              quantityPacksKg: 1.2 + index,
              shockTemp: -18 + index,
            },
            responsibleRole: qa.positionTitle || "QA",
            responsibleEmployee: qa.name,
          })),
        },
      };
    case "training_plan":
      return {
        mode: "config",
        date: days[0],
        rows: {
          documentDate: days[0],
          approveRole: manager.positionTitle || "Manager",
          approveEmployee: manager.name,
          topics: rowMarks.map((_, index) => ({ id: `topic-${index + 1}`, name: `topic-${index + 1}` })),
          rows: [worker, manager, qa].map((employee, index) => ({
            id: `train-row-${index + 1}`,
            positionName: employee.positionTitle || employee.name,
            cells: {
              "topic-1": { required: true, date: `${String(activeMonth + 1).padStart(2, "0")}.${String(year).slice(-2)}` },
              "topic-2": { required: index !== 0, date: `${String(activeMonth + 1).padStart(2, "0")}.${String(year).slice(-2)}` },
              "topic-3": { required: index === 2, date: `${String(activeMonth + 1).padStart(2, "0")}.${String(year).slice(-2)}` },
            },
          })),
        },
      };
    default:
      throw new Error(`Unsupported config journal: ${code}`);
  }
}

function payloadForCode(code: string, monthDate: Date, ctx: FillContext): FillPayload {
  const entryCodes = new Set([
    "hygiene",
    "health_check",
    "climate_control",
    "cold_equipment_control",
    "cleaning",
    "cleaning_ventilation_checklist",
    "equipment_cleaning",
    "fryer_oil",
    "glass_control",
    "med_books",
    "pest_control",
    "uv_lamp_runtime",
  ]);

  if (entryCodes.has(code)) {
    return buildEntryPayloads(code, monthDate, ctx);
  }

  return buildConfigPayload(code, monthDate, ctx);
}

async function readToken() {
  return (await fs.readFile(TOKEN_FILE, "utf8")).trim();
}

async function login() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const response = await context.request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }
  return { browser, context };
}

async function getJson<T>(
  request: { get: (url: string) => Promise<{ ok(): boolean; status(): number; json(): Promise<T> }> },
  url: string
) {
  const response = await request.get(url);
  if (!response.ok()) {
    throw new Error(`GET ${url} failed: ${response.status()}`);
  }
  return response.json();
}

async function fetchContext(contextRequest: Awaited<ReturnType<typeof login>>["context"]["request"]): Promise<FillContext> {
  const docs = await getJson<{ documents: Array<{ id: string }> }>(
    contextRequest,
    `${BASE}/api/journal-documents?templateCode=hygiene`
  );
  const firstDocId = docs.documents[0]?.id;
  if (!firstDocId) {
    throw new Error("No hygiene document available to resolve employees");
  }

  const doc = await getJson<{ employees: Employee[] }>(
    contextRequest,
    `${BASE}/api/journal-documents/${firstDocId}`
  );
  const areas = await getJson<{ areas: Area[] }>(contextRequest, `${BASE}/api/areas`);
  const equipment = await getJson<{ equipment: Equipment[] }>(contextRequest, `${BASE}/api/equipment`);

  return {
    employees: doc.employees,
    areas: areas.areas,
    equipment: equipment.equipment,
  };
}

async function postExternal(token: string, code: string, payload: FillPayload) {
  const body =
    payload.mode === "entries"
      ? {
          organizationId: ORG_ID,
          journalCode: code,
          date: payload.date,
          source: "manual",
          entries: payload.entries,
        }
      : {
          organizationId: ORG_ID,
          journalCode: code,
          date: payload.date,
          source: "manual",
          rows: payload.rows,
        };

  const response = await fetch(`${BASE}/api/external/entries`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: json };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const token = await readToken();
  const session = await login();

  try {
    const ctx = await fetchContext(session.context.request);
    const monthDates = [addMonths(monthStart(new Date()), -1), monthStart(new Date())];
    const plan = CODES.flatMap((code) =>
      monthDates.map((monthDate) => ({
        code,
        month: monthKey(monthDate),
        payload: payloadForCode(code, monthDate, ctx),
      }))
    );

    await fs.writeFile(
      path.join(OUT_DIR, "plan.json"),
      JSON.stringify(
        {
          dryRun: DRY_RUN,
          generatedAt: new Date().toISOString(),
          employees: ctx.employees.map((employee) => ({
            id: employee.id,
            name: employee.name,
            positionTitle: employee.positionTitle,
          })),
          areas: ctx.areas,
          equipment: ctx.equipment.map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            areaName: item.area?.name || null,
          })),
          plan: plan.map((item) => ({
            code: item.code,
            month: item.month,
            mode: item.payload.mode,
            date: item.payload.date,
            count: item.payload.mode === "entries" ? item.payload.entries.length : 1,
          })),
        },
        null,
        2
      ),
      "utf8"
    );

    const markdown = [
      `# Maximal Journal Fill Plan`,
      ``,
      `- Generated: ${new Date().toISOString()}`,
      `- Dry run: ${DRY_RUN}`,
      `- Org: ${ORG_ID}`,
      `- Months: ${monthDates.map(monthKey).join(", ")}`,
      ``,
      `| Code | Month | Mode | Count |`,
      `|---|---|---|---:|`,
      ...plan.map(
        (item) =>
          `| ${item.code} | ${item.month} | ${item.payload.mode} | ${item.payload.mode === "entries" ? item.payload.entries.length : 1} |`
      ),
    ].join("\n");
    await fs.writeFile(path.join(OUT_DIR, "plan.md"), markdown, "utf8");

    if (DRY_RUN) {
      console.log(`Dry run complete. Planned writes: ${plan.length}`);
      return;
    }

    const results: Array<Record<string, unknown>> = [];
    for (const item of plan) {
      const result = await postExternal(token, item.code, item.payload);
      results.push({
        code: item.code,
        month: item.month,
        mode: item.payload.mode,
        date: item.payload.date,
        status: result.status,
        ok: result.body.ok === true,
        documentId: result.body.documentId ?? null,
        entriesWritten: result.body.entriesWritten ?? null,
        error: result.body.error ?? null,
      });
      console.log(
        `[${item.code} ${item.month}] ${result.status} ok=${String(result.body.ok)} doc=${String(
          result.body.documentId ?? "-"
        )} entries=${String(result.body.entriesWritten ?? "-")}`
      );
    }

    await fs.writeFile(
      path.join(OUT_DIR, "results.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
      "utf8"
    );

    const failed = results.filter((item) => item.ok !== true);
    const resultMd = [
      `# Maximal Journal Fill Results`,
      ``,
      `- Generated: ${new Date().toISOString()}`,
      `- Failures: ${failed.length}`,
      ``,
      `| Code | Month | Status | Ok | Document | Entries | Error |`,
      `|---|---|---:|---|---|---:|---|`,
      ...results.map(
        (item) =>
          `| ${String(item.code)} | ${String(item.month)} | ${String(item.status)} | ${String(item.ok)} | ${String(item.documentId ?? "-")} | ${String(item.entriesWritten ?? "-")} | ${String(item.error ?? "-").replace(/\|/g, "/")} |`
      ),
    ].join("\n");
    await fs.writeFile(path.join(OUT_DIR, "results.md"), resultMd, "utf8");

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await session.browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
