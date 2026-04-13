import "dotenv/config";
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import {
  buildDateKeys,
  buildExampleHygieneEntryMap,
  getHealthDocumentTitle,
  getHygieneDefaultResponsibleTitle,
  getHygieneDocumentTitle,
} from "../src/lib/hygiene-document";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  normalizeClimateDocumentConfig,
} from "../src/lib/climate-document";
import {
  buildColdEquipmentConfigFromEquipment,
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
} from "../src/lib/cold-equipment-document";
import {
  applyCleaningAutoFillToConfig,
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  defaultCleaningDocumentConfig,
} from "../src/lib/cleaning-document";
import {
  buildUvRuntimeDocumentTitle,
  defaultUvSpecification,
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
} from "../src/lib/uv-lamp-runtime-document";
import {
  buildFinishedProductConfigFromUsers,
  createFinishedProductRow,
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  FINISHED_PRODUCT_DOCUMENT_TITLE,
} from "../src/lib/finished-product-document";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  buildAcceptanceDocumentConfigFromData,
  getAcceptanceDocumentTitle,
  RAW_MATERIAL_ACCEPTANCE_TEMPLATE_CODE,
} from "../src/lib/acceptance-document";
import {
  defaultFryerOilDocumentConfig,
  FRYER_OIL_TEMPLATE_CODE,
} from "../src/lib/fryer-oil-document";
import {
  emptyMedBookEntry,
  getDefaultMedBookConfig,
  MED_BOOK_DOCUMENT_TITLE,
  MED_BOOK_TEMPLATE_CODE,
} from "../src/lib/med-book-document";
import {
  getTrainingPlanDefaultConfig,
  TRAINING_PLAN_DOCUMENT_TITLE,
  TRAINING_PLAN_TEMPLATE_CODE,
} from "../src/lib/training-plan-document";
import {
  buildStaffTrainingSeedRows,
  getDefaultStaffTrainingConfig,
  STAFF_TRAINING_DOCUMENT_TITLE,
  STAFF_TRAINING_TEMPLATE_CODE,
} from "../src/lib/staff-training-document";
import {
  DISINFECTANT_DOCUMENT_TITLE,
  getDisinfectantDefaultConfig,
} from "../src/lib/disinfectant-document";
import {
  getSanitationDayDefaultConfig,
  SANITATION_DAY_DOCUMENT_TITLE,
  SANITATION_DAY_TEMPLATE_CODE,
} from "../src/lib/sanitation-day-document";
import {
  EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
  getDefaultEquipmentMaintenanceConfig,
} from "../src/lib/equipment-maintenance-document";
import {
  buildEquipmentCalibrationConfigFromEquipment,
  EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
} from "../src/lib/equipment-calibration-document";
import {
  ACCIDENT_DOCUMENT_TITLE,
  buildAccidentDocumentDemoConfig,
} from "../src/lib/accident-document";
import {
  BREAKDOWN_HISTORY_DOCUMENT_TITLE,
  getBreakdownHistoryDefaultConfig,
} from "../src/lib/breakdown-history-document";
import {
  buildPpeIssuanceDemoConfig,
  PPE_ISSUANCE_DOCUMENT_TITLE,
  PPE_ISSUANCE_TEMPLATE_CODE,
} from "../src/lib/ppe-issuance-document";
import {
  buildComplaintRow,
  COMPLAINT_REGISTER_TEMPLATE_CODE,
  COMPLAINT_REGISTER_TITLE,
} from "../src/lib/complaint-document";
import {
  buildProductWriteoffConfigFromData,
  PRODUCT_WRITEOFF_DOCUMENT_TITLE,
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
} from "../src/lib/product-writeoff-document";
import {
  AUDIT_PLAN_DOCUMENT_TITLE,
  getAuditPlanDefaultConfig,
  AUDIT_PLAN_TEMPLATE_CODE,
} from "../src/lib/audit-plan-document";
import {
  AUDIT_PROTOCOL_DOCUMENT_TITLE,
  AUDIT_PROTOCOL_TEMPLATE_CODE,
  getDefaultAuditProtocolConfig,
} from "../src/lib/audit-protocol-document";
import {
  AUDIT_REPORT_DOCUMENT_TITLE,
  AUDIT_REPORT_TEMPLATE_CODE,
  getDefaultAuditReportConfig,
} from "../src/lib/audit-report-document";
import {
  createTraceabilityRow,
  getDefaultTraceabilityDocumentConfig,
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  TRACEABILITY_DOCUMENT_TITLE,
} from "../src/lib/traceability-document";
import {
  getDefaultMetalImpurityConfig,
  METAL_IMPURITY_TEMPLATE_CODE,
  METAL_IMPURITY_DOCUMENT_TITLE,
} from "../src/lib/metal-impurity-document";
import {
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_TEMPLATE_CODE,
} from "../src/lib/pest-control-document";
import {
  emptyEquipmentCleaningRow,
  EQUIPMENT_CLEANING_DOCUMENT_TITLE,
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  getDefaultEquipmentCleaningConfig,
} from "../src/lib/equipment-cleaning-document";
import {
  createIntensiveCoolingRow,
  getDefaultIntensiveCoolingConfig,
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_TEMPLATE_CODE,
} from "../src/lib/intensive-cooling-document";
import {
  buildGlassListConfigFromData,
  GLASS_LIST_DOCUMENT_TITLE,
  GLASS_LIST_TEMPLATE_CODE,
} from "../src/lib/glass-list-document";
import {
  getDefaultGlassControlConfig,
  GLASS_CONTROL_DOCUMENT_TITLE,
  GLASS_CONTROL_TEMPLATE_CODE,
} from "../src/lib/glass-control-document";
import {
  getDefaultCleaningVentilationConfig,
  CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE,
  CLEANING_VENTILATION_CHECKLIST_TITLE,
} from "../src/lib/cleaning-ventilation-checklist-document";
import {
  defaultSdcConfig,
  SANITARY_DAY_CHECKLIST_TEMPLATE_CODE,
  SANITARY_DAY_CHECKLIST_TITLE,
} from "../src/lib/sanitary-day-checklist-document";
import {
  createPerishableRejectionRow,
  getDefaultPerishableRejectionConfig,
  PERISHABLE_REJECTION_DOCUMENT_TITLE,
  PERISHABLE_REJECTION_TEMPLATE_CODE,
} from "../src/lib/perishable-rejection-document";
import { getTrackedDocumentTitle } from "../src/lib/tracked-document";
import { getUserRoleLabel } from "../src/lib/user-roles";

const DEMO_ADMIN_EMAIL = "admin@haccp.local";
const DEFAULT_PASSWORD = "admin1234";

type SeedUserSpec = {
  email: string;
  name: string;
  role: string;
  positionTitle: string;
};

type ActiveUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  positionTitle: string | null;
};

type ActiveTemplate = {
  id: string;
  code: string;
  name: string;
  fields: Prisma.JsonValue;
};

const SEED_TEAM: SeedUserSpec[] = [
  { email: DEMO_ADMIN_EMAIL, name: "Крылов Денис Сергеевич", role: "owner", positionTitle: "Управляющий" },
  { email: "quality@haccp.local", name: "Белова Елена Андреевна", role: "technologist", positionTitle: "Технолог по качеству" },
  { email: "souschef@haccp.local", name: "Никитин Павел Игоревич", role: "operator", positionTitle: "Су-шеф" },
  { email: "hotcook@haccp.local", name: "Волкова Анна Дмитриевна", role: "operator", positionTitle: "Повар горячего цеха" },
  { email: "coldcook@haccp.local", name: "Орлов Илья Максимович", role: "operator", positionTitle: "Повар холодного цеха" },
  { email: "pastry@haccp.local", name: "Мельникова Софья Романовна", role: "operator", positionTitle: "Кондитер" },
  { email: "storekeeper@haccp.local", name: "Кузьмин Артем Сергеевич", role: "operator", positionTitle: "Кладовщик" },
  { email: "sanitation@haccp.local", name: "Егорова Марина Викторовна", role: "operator", positionTitle: "Санитарный работник" },
];

const LEGACY_DEMO_EMAILS = [
  "quality@haccp.local",
  "souschef@haccp.local",
  "hotcook@haccp.local",
  "coldcook@haccp.local",
  "pastry@haccp.local",
  "storekeeper@haccp.local",
  "sanitation@haccp.local",
] as const;

const ACTIVE_SEED_TEAM: SeedUserSpec[] = [
  { email: DEMO_ADMIN_EMAIL, name: "Крылов Денис Сергеевич", role: "owner", positionTitle: "Управляющий" },
  { email: "qa-chief@haccp.local", name: "Лебедева Марина Олеговна", role: "technologist", positionTitle: "Руководитель качества" },
  { email: "production-lead@haccp.local", name: "Громов Илья Павлович", role: "manager", positionTitle: "Начальник производства" },
  { email: "hot-line@haccp.local", name: "Соколова Анна Викторовна", role: "operator", positionTitle: "Старший повар горячего цеха" },
  { email: "cold-line@haccp.local", name: "Мельников Роман Игоревич", role: "operator", positionTitle: "Повар холодного цеха" },
  { email: "warehouse@haccp.local", name: "Кузнецов Артем Валерьевич", role: "operator", positionTitle: "Кладовщик" },
  { email: "sanitation-master@haccp.local", name: "Ермакова Нина Сергеевна", role: "operator", positionTitle: "Специалист по санитарной обработке" },
  { email: "service-engineer@haccp.local", name: "Титов Максим Андреевич", role: "engineer", positionTitle: "Инженер по оборудованию" },
];

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function midpointOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function makeDocumentDate(base: Date, day = 1) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
}

function makeTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function titleForUser(user: ActiveUser | undefined | null) {
  if (!user) return "";
  return user.positionTitle?.trim() || getUserRoleLabel(user.role);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

async function ensureBaseCatalog(prisma: PrismaClient, organizationId: string) {
  const areaSeeds = ["Горячий цех", "Холодный цех", "Склад", "Упаковка", "Моечная"];
  for (const areaName of areaSeeds) {
    await prisma.area.upsert({
      where: { id: `${organizationId}-${areaName}` },
      update: { name: areaName },
      create: { id: `${organizationId}-${areaName}`, organizationId, name: areaName },
    });
  }

  const areas = await prisma.area.findMany({
    where: { organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const equipmentSeeds = [
    { areaName: "Холодный цех", name: "Холодильная камера 1", type: "refrigerator", tempMin: 2, tempMax: 4 },
    { areaName: "Холодный цех", name: "Морозильный ларь 1", type: "freezer", tempMin: -20, tempMax: -18 },
    { areaName: "Горячий цех", name: "Пароконвектомат Rational", type: "oven", tempMin: null, tempMax: null },
    { areaName: "Горячий цех", name: "Фритюрница 8 л", type: "fryer", tempMin: null, tempMax: null },
    { areaName: "Упаковка", name: "Весы платформенные 012-В", type: "scale", tempMin: null, tempMax: null },
    { areaName: "Склад", name: "Термогигрометр Testo", type: "thermometer", tempMin: 18, tempMax: 25 },
  ];

  for (const seed of equipmentSeeds) {
    const area = areas.find((item) => item.name === seed.areaName);
    if (!area) continue;
    await prisma.equipment.upsert({
      where: { id: `${area.id}-${seed.name}` },
      update: { name: seed.name, type: seed.type, tempMin: seed.tempMin, tempMax: seed.tempMax },
      create: { id: `${area.id}-${seed.name}`, areaId: area.id, name: seed.name, type: seed.type, tempMin: seed.tempMin, tempMax: seed.tempMax },
    });
  }

  const productSeeds = [
    { name: "Куриное филе охлажденное", unit: "kg", supplier: "ООО АгроПоставка", shelfLifeDays: 5, storageTemp: "+2...+4°C" },
    { name: "Лосось охлажденный", unit: "kg", supplier: "ООО Морской берег", shelfLifeDays: 4, storageTemp: "0...+2°C" },
    { name: "Сливки 33%", unit: "l", supplier: "АО МолТорг", shelfLifeDays: 7, storageTemp: "+2...+6°C" },
    { name: "Тесто слоеное", unit: "kg", supplier: "ООО Пекарь", shelfLifeDays: 14, storageTemp: "-18°C" },
    { name: "Картофель фри", unit: "kg", supplier: "ООО ФудСнаб", shelfLifeDays: 180, storageTemp: "-18°C" },
    { name: "Салат Цезарь", unit: "pcs", supplier: null, shelfLifeDays: 1, storageTemp: "+2...+6°C" },
  ];

  for (const product of productSeeds) {
    await prisma.product.upsert({
      where: { id: `${organizationId}-${product.name}` },
      update: product,
      create: { id: `${organizationId}-${product.name}`, organizationId, ...product },
    });
  }

  await prisma.batch.deleteMany({ where: { organizationId } });
  await prisma.batch.createMany({
    data: [
      { code: "BATCH-001", organizationId, productName: "Куриное филе охлажденное", supplier: "ООО АгроПоставка", quantity: 48, unit: "kg", receivedAt: new Date("2026-04-02T08:00:00.000Z"), expiryDate: new Date("2026-04-07T00:00:00.000Z"), status: "received" },
      { code: "BATCH-002", organizationId, productName: "Лосось охлажденный", supplier: "ООО Морской берег", quantity: 18, unit: "kg", receivedAt: new Date("2026-04-04T08:30:00.000Z"), expiryDate: new Date("2026-04-08T00:00:00.000Z"), status: "received" },
      { code: "BATCH-003", organizationId, productName: "Сливки 33%", supplier: "АО МолТорг", quantity: 12, unit: "l", receivedAt: new Date("2026-04-05T09:00:00.000Z"), expiryDate: new Date("2026-04-12T00:00:00.000Z"), status: "received" },
    ],
  });
}

async function resetUsersAndDocuments(prisma: PrismaClient, organizationId: string) {
  await prisma.journalDocumentEntry.deleteMany({ where: { document: { organizationId } } });
  await prisma.journalDocument.deleteMany({ where: { organizationId } });
  await prisma.journalEntry.deleteMany({ where: { organizationId } });
  await prisma.staffCompetency.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId, email: { not: DEMO_ADMIN_EMAIL } } });
}

async function upsertSeedUsers(prisma: PrismaClient, organizationId: string): Promise<ActiveUser[]> {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  for (const spec of ACTIVE_SEED_TEAM) {
    await prisma.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, role: spec.role, positionTitle: spec.positionTitle, organizationId, passwordHash, isActive: true },
      create: { email: spec.email, name: spec.name, role: spec.role, positionTitle: spec.positionTitle, organizationId, passwordHash, isActive: true },
    });
  }

  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, email: true, name: true, role: true, positionTitle: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

async function assertLegacyUsersRemoved(prisma: PrismaClient, organizationId: string) {
  const legacyUsers = await prisma.user.findMany({
    where: {
      organizationId,
      email: { in: [...LEGACY_DEMO_EMAILS] },
    },
    select: { email: true },
  });

  if (legacyUsers.length > 0) {
    throw new Error(
      `Legacy demo users still exist after reset: ${legacyUsers
        .map((user) => user.email)
        .join(", ")}`
    );
  }
}

async function createDocument(
  prisma: PrismaClient,
  params: {
    templateId: string;
    organizationId: string;
    title: string;
    dateFrom: Date;
    dateTo: Date;
    createdById: string;
    responsibleUserId?: string | null;
    responsibleTitle?: string | null;
    config?: unknown;
  }
) {
  return prisma.journalDocument.create({
    data: {
      templateId: params.templateId,
      organizationId: params.organizationId,
      title: params.title,
      status: "active",
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      createdById: params.createdById,
      responsibleUserId: params.responsibleUserId ?? null,
      responsibleTitle: params.responsibleTitle ?? null,
      config: params.config === undefined ? undefined : toPrismaJsonValue(params.config),
    },
  });
}

async function createEntries(
  prisma: PrismaClient,
  entries: Array<{ documentId: string; employeeId: string; date: Date; data: unknown }>
) {
  if (entries.length === 0) return;
  await prisma.journalDocumentEntry.createMany({
    data: entries.map((entry) => ({
      documentId: entry.documentId,
      employeeId: entry.employeeId,
      date: entry.date,
      data: toPrismaJsonValue(entry.data),
    })),
    skipDuplicates: true,
  });
}

function buildGenericTrackedEntryData(
  template: ActiveTemplate,
  users: ActiveUser[],
  manager: ActiveUser,
  sanitation: ActiveUser,
  referenceDate: string
) {
  const fields = Array.isArray(template.fields)
    ? (template.fields as Array<{ key?: string; type?: string; options?: Array<{ value?: string; label?: string }> }>)
    : [];
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field.key || "";
    if (!key) continue;
    switch (field.type) {
      case "date":
        values[key] = referenceDate;
        break;
      case "number":
        values[key] = 1;
        break;
      case "boolean":
        values[key] = true;
        break;
      case "select":
        values[key] = field.options?.[0]?.value ?? "";
        break;
      case "employee":
        values[key] = key.toLowerCase().includes("inspect") ? manager.name : sanitation.name;
        break;
      default:
        values[key] =
          {
            location: "Горячий цех",
            scopeOfWork: "Мойка стен, зонтов, стеллажей и труднодоступных зон",
            detergent: "Multiclean 1%",
            disinfectant: "Септолит 0,5%",
            performedBy: sanitation.name,
            inspectedBy: manager.name,
            note: "Выполнено без замечаний",
          }[key] ?? `${template.name} - пример`;
    }
  }
  return values;
}

async function seedActiveJournalExamples(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    organizationName: string;
    createdById: string;
    templates: ActiveTemplate[];
    users: ActiveUser[];
  }
) {
  const { organizationId, organizationName, createdById, templates, users } = params;
  const manager = users.find((user) => user.role === "owner") ?? users[0]!;
  const technologist = users.find((user) => user.role === "technologist") ?? manager;
  const productionLead =
    users.find((user) => user.email === "production-lead@haccp.local") ?? users[2]!;
  const hotCook = users.find((user) => user.email === "hot-line@haccp.local") ?? productionLead;
  const sanitation =
    users.find((user) => user.email === "sanitation-master@haccp.local") ?? hotCook;
  const storekeeper =
    users.find((user) => user.email === "warehouse@haccp.local") ?? productionLead;
  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());
  const halfMonthEnd = midpointOfMonth(new Date());
  const today = new Date();
  const monthStartKey = isoDate(monthStart);
  const monthEndKey = isoDate(monthEnd);
  const halfMonthEndKey = isoDate(halfMonthEnd);

  const [areas, equipment, products, batches] = await Promise.all([
    prisma.area.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.equipment.findMany({
      where: { area: { organizationId } },
      select: {
        id: true,
        name: true,
        type: true,
        tempMin: true,
        tempMax: true,
        serialNumber: true,
        area: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, supplier: true, unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.batch.findMany({
      where: { organizationId },
      select: {
        code: true,
        productName: true,
        supplier: true,
        quantity: true,
        unit: true,
        receivedAt: true,
      },
      orderBy: [{ receivedAt: "desc" }],
    }),
  ]);

  const supplierNames = uniqueStrings([
    ...products.map((product) => product.supplier),
    ...batches.map((batch) => batch.supplier),
  ]);

  for (const template of templates) {
    switch (template.code) {
      case "hygiene": {
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: getHygieneDocumentTitle(),
          dateFrom: monthStart,
          dateTo: halfMonthEnd,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: getHygieneDefaultResponsibleTitle(users),
        });
        const dateKeys = buildDateKeys(monthStartKey, halfMonthEndKey);
        const entryMap = buildExampleHygieneEntryMap(users.map((user) => user.id), dateKeys);
        for (const user of users) {
          for (const dateKey of dateKeys) {
            const compoundKey = `${user.id}:${dateKey}`;
            if (!entryMap[compoundKey]) {
              entryMap[compoundKey] = {
                status: "healthy",
                temperatureAbove37: false,
              };
            }
          }
        }
        await createEntries(
          prisma,
          Object.entries(entryMap).map(([compoundKey, data]) => {
            const separatorIndex = compoundKey.lastIndexOf(":");
            return {
              documentId: document.id,
              employeeId: compoundKey.slice(0, separatorIndex),
              date: new Date(`${compoundKey.slice(separatorIndex + 1)}T00:00:00.000Z`),
              data,
            };
          })
        );
        break;
      }

      case "health_check": {
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: getHealthDocumentTitle(),
          dateFrom: monthStart,
          dateTo: halfMonthEnd,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config: { printEmptyRows: 0 },
        });
        const dateKeys = buildDateKeys(monthStartKey, halfMonthEndKey);
        await createEntries(
          prisma,
          users.flatMap((user) =>
            dateKeys.map((dateKey) => ({
              documentId: document.id,
              employeeId: user.id,
              date: new Date(`${dateKey}T00:00:00.000Z`),
              data: { signed: true, measures: dateKey === monthStartKey ? "Осмотр проведен, жалоб нет" : "" },
            }))
          )
        );
        break;
      }

      case CLIMATE_DOCUMENT_TEMPLATE_CODE: {
        const climateConfig = normalizeClimateDocumentConfig({
          rooms: areas.slice(0, 4).map((area, index) => ({
            id: area.id,
            name: area.name,
            temperature: { enabled: true, min: index === 2 ? 14 : 18, max: index === 2 ? 18 : 24 },
            humidity: { enabled: true, min: 35, max: 60 },
          })),
          controlTimes: ["09:00", "14:00", "19:00"],
          skipWeekends: false,
        });
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: template.name,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config: climateConfig,
        });
        const climateDates = [monthStart, addDays(monthStart, 1), addDays(monthStart, 2)];
        await createEntries(
          prisma,
          climateDates.map((entryDate, dateIndex) => ({
            documentId: document.id,
            employeeId: technologist.id,
            date: entryDate,
            data: {
              responsibleTitle: titleForUser(technologist),
              measurements: Object.fromEntries(
                climateConfig.rooms.map((room, roomIndex) => [
                  room.id,
                  Object.fromEntries(
                    climateConfig.controlTimes.map((time, timeIndex) => [
                      time,
                      {
                        temperature: (room.temperature.min ?? 18) + roomIndex + timeIndex * 0.5,
                        humidity: 42 + dateIndex + roomIndex + timeIndex,
                      },
                    ])
                  ),
                ])
              ),
            },
          }))
        );
        break;
      }

      case COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE: {
        const coldConfig = buildColdEquipmentConfigFromEquipment(equipment);
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: template.name,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config: coldConfig,
        });
        const coldDates = [monthStart, addDays(monthStart, 1), addDays(monthStart, 2)];
        await createEntries(
          prisma,
          coldDates.map((entryDate, index) => ({
            documentId: document.id,
            employeeId: technologist.id,
            date: entryDate,
            data: {
              responsibleTitle: titleForUser(technologist),
              temperatures: Object.fromEntries(
                coldConfig.equipment.map((item, itemIndex) => [
                  item.id,
                  item.min != null && item.max != null
                    ? Number((((item.min + item.max) / 2) + itemIndex * 0.2 + index * 0.1).toFixed(1))
                    : item.min ?? item.max ?? null,
                ])
              ),
            },
          }))
        );
        break;
      }

      case CLEANING_DOCUMENT_TEMPLATE_CODE: {
        const cleaningConfig = applyCleaningAutoFillToConfig({
          config: defaultCleaningDocumentConfig(users, areas),
          dateFrom: monthStartKey,
          dateTo: monthEndKey,
        });
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: template.name,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config: cleaningConfig,
        });
        await createEntries(
          prisma,
          [monthStart, addDays(monthStart, 2), addDays(monthStart, 4)].map((entryDate) => ({
            documentId: document.id,
            employeeId: sanitation.id,
            date: entryDate,
            data: {
              activities: [
                { type: "disinfection", times: ["09:00", "15:00", "21:00"], responsibleName: sanitation.name },
                { type: "ventilation", times: ["10:00", "16:00", "22:00"], responsibleName: sanitation.name },
                { type: "wetCleaning", times: ["12:00", "18:00"], responsibleName: sanitation.name },
              ],
            },
          }))
        );
        break;
      }

      case UV_LAMP_RUNTIME_TEMPLATE_CODE: {
        const uvConfig = {
          lampNumber: "2",
          areaName: "Упаковка",
          spec: { ...defaultUvSpecification(), commissioningDate: `${today.getUTCFullYear() - 1}-09-01`, controlFrequency: "2 раза в смену" },
        };
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: buildUvRuntimeDocumentTitle(uvConfig),
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config: uvConfig,
        });
        await createEntries(
          prisma,
          [0, 1, 2, 3, 4].map((offset) => ({
            documentId: document.id,
            employeeId: technologist.id,
            date: addDays(monthStart, offset),
            data: { startTime: makeTime(9 + offset, 0), endTime: makeTime(10 + offset, 30) },
          }))
        );
        break;
      }

      case FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE: {
        const config = buildFinishedProductConfigFromUsers(users, products.map((item) => item.name));
        config.rows = [
          createFinishedProductRow({
            productionDateTime: `${monthStartKey} 09:00`,
            rejectionTime: "10:00",
            productName: products[0]?.name || "Салат Цезарь",
            organoleptic: "Внешний вид, вкус и запах соответствуют рецептуре",
            productTemp: "+72",
            correctiveAction: "",
            releasePermissionTime: "10:15",
            courierTransferTime: "11:00",
            oxygenLevel: "19,8",
            responsiblePerson: hotCook.name,
            inspectorName: technologist.name,
            organolepticValue: "Отлично",
            organolepticResult: "Соответствует",
            releaseAllowed: "yes",
          }),
        ];
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: FINISHED_PRODUCT_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          config,
        });
        break;
      }

      case PERISHABLE_REJECTION_TEMPLATE_CODE: {
        const config = getDefaultPerishableRejectionConfig();
        config.productLists[0].items = products.slice(0, 3).map((item) => item.name);
        config.manufacturers = supplierNames;
        config.suppliers = supplierNames;
        config.rows = [
          createPerishableRejectionRow({
            arrivalDate: monthStartKey,
            arrivalTime: "08:30",
            productName: products[0]?.name || "Куриное филе охлажденное",
            productionDate: monthStartKey,
            manufacturer: supplierNames[0] || "ООО АгроПоставка",
            supplier: supplierNames[0] || "ООО АгроПоставка",
            packaging: "Вакуумная упаковка, целая",
            quantity: "18 кг",
            documentNumber: "ТТН-1045",
            organolepticResult: "compliant",
            storageCondition: "2_6",
            expiryDate: isoDate(addDays(monthStart, 4)),
            actualSaleDate: isoDate(addDays(monthStart, 3)),
            actualSaleTime: "18:00",
            responsiblePerson: technologist.name,
            note: "Температурный режим соблюден, к реализации допущено",
          }),
        ];
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: PERISHABLE_REJECTION_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          config,
        });
        break;
      }

      case ACCEPTANCE_DOCUMENT_TEMPLATE_CODE:
      case RAW_MATERIAL_ACCEPTANCE_TEMPLATE_CODE: {
        const config = buildAcceptanceDocumentConfigFromData({
          users,
          products: products.map((item) => item.name),
          manufacturers: supplierNames,
          suppliers: supplierNames,
          date: monthStartKey,
          responsibleTitle: titleForUser(manager),
          responsibleUserId: manager.id,
          includeSampleRows: true,
        });
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: getAcceptanceDocumentTitle(template.code),
          dateFrom: monthStart,
          dateTo: monthStart,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        break;
      }

      case FRYER_OIL_TEMPLATE_CODE: {
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: getTrackedDocumentTitle(template.code),
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config: defaultFryerOilDocumentConfig(),
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: hotCook.id,
            date: monthStart,
            data: {
              startDate: monthStartKey,
              startHour: 9,
              startMinute: 0,
              fatType: "Подсолнечное масло",
              qualityStart: 5,
              equipmentType: "Фритюрница №1",
              productType: "Картофель фри",
              endHour: 12,
              endMinute: 30,
              qualityEnd: 4,
              carryoverKg: 2.5,
              disposedKg: 0.2,
              controllerName: technologist.name,
            },
          },
        ]);
        break;
      }

      case MED_BOOK_TEMPLATE_CODE: {
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: MED_BOOK_DOCUMENT_TITLE,
          dateFrom: today,
          dateTo: today,
          createdById,
          config: getDefaultMedBookConfig(),
        });
        await createEntries(
          prisma,
          users.map((user, index) => ({
            documentId: document.id,
            employeeId: user.id,
            date: today,
            data: {
              ...emptyMedBookEntry(titleForUser(user)),
              birthDate: `199${index}-0${(index % 8) + 1}-15`,
              gender: index % 2 === 0 ? "male" : "female",
              hireDate: `2025-0${(index % 6) + 1}-10`,
              medBookNumber: `МК-${1000 + index}`,
              examinations: {
                Терапевт: { date: "2026-03-10", expiryDate: "2027-03-10" },
                Флюорография: { date: "2026-02-12", expiryDate: "2027-02-12" },
              },
              vaccinations: {
                Грипп: { type: "done", date: "2025-10-01", expiryDate: "2026-10-01", dose: "V1" },
              },
              note: "Допущен к работе",
            },
          }))
        );
        break;
      }

      case TRAINING_PLAN_TEMPLATE_CODE: {
        const config = getTrainingPlanDefaultConfig(monthStart);
        config.approveEmployeeId = manager.id;
        config.approveEmployee = manager.name;
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: `${TRAINING_PLAN_DOCUMENT_TITLE} ${monthStart.getUTCFullYear()}`,
          dateFrom: makeDocumentDate(monthStart, 11),
          dateTo: makeDocumentDate(monthStart, 11),
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: config.approveRole,
          config,
        });
        break;
      }

      case STAFF_TRAINING_TEMPLATE_CODE: {
        const config = {
          ...getDefaultStaffTrainingConfig(),
          rows: buildStaffTrainingSeedRows(users, `${monthStart.getUTCFullYear()}-01-01`),
        };
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: STAFF_TRAINING_DOCUMENT_TITLE,
          dateFrom: new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1)),
          dateTo: new Date(Date.UTC(monthStart.getUTCFullYear(), 11, 31)),
          createdById,
          config,
        });
        break;
      }

      case "disinfectant_usage": {
        const config = getDisinfectantDefaultConfig();
        config.responsibleEmployeeId = manager.id;
        config.responsibleEmployee = manager.name;
        config.receipts = config.receipts.map((row) => ({ ...row, responsibleEmployeeId: manager.id, responsibleEmployee: manager.name }));
        config.consumptions = config.consumptions.map((row) => ({ ...row, responsibleEmployeeId: manager.id, responsibleEmployee: manager.name }));
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: DISINFECTANT_DOCUMENT_TITLE,
          dateFrom: today,
          dateTo: today,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: config.responsibleRole,
          config,
        });
        break;
      }

      case SANITATION_DAY_TEMPLATE_CODE: {
        const config = getSanitationDayDefaultConfig(today);
        config.approveEmployeeId = manager.id;
        config.approveEmployee = manager.name;
        config.responsibleEmployeeId = sanitation.id;
        config.responsibleEmployee = sanitation.name;
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: SANITATION_DAY_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 20),
          dateTo: makeDocumentDate(monthStart, 20),
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: config.responsibleRole,
          config,
        });
        break;
      }

      case "equipment_maintenance": {
        const config = getDefaultEquipmentMaintenanceConfig(monthStart.getUTCFullYear());
        config.approveEmployeeId = manager.id;
        config.approveEmployee = manager.name;
        config.responsibleEmployeeId = technologist.id;
        config.responsibleEmployee = technologist.name;
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
          dateFrom: new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1)),
          dateTo: new Date(Date.UTC(monthStart.getUTCFullYear(), 11, 31)),
          createdById,
          config,
        });
        break;
      }

      case "breakdown_history": {
        const config = getBreakdownHistoryDefaultConfig();
        if (config.rows[0]) {
          config.rows[0].equipmentName = equipment[0]?.name || config.rows[0].equipmentName;
          config.rows[0].responsiblePerson = `${technologist.name}, ${storekeeper.name}`;
        }
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: BREAKDOWN_HISTORY_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 12),
          dateTo: makeDocumentDate(monthStart, 12),
          createdById,
          config,
        });
        break;
      }

      case "equipment_calibration": {
        const config = buildEquipmentCalibrationConfigFromEquipment(equipment, { year: monthStart.getUTCFullYear() });
        config.approveEmployeeId = manager.id;
        config.approveEmployee = manager.name;
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
          dateFrom: new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1)),
          dateTo: new Date(Date.UTC(monthStart.getUTCFullYear(), 11, 31)),
          createdById,
          config,
        });
        break;
      }

      case PPE_ISSUANCE_TEMPLATE_CODE: {
        const config = buildPpeIssuanceDemoConfig(users, today);
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: PPE_ISSUANCE_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          config,
        });
        break;
      }

      case "accident_journal": {
        const config = buildAccidentDocumentDemoConfig({ areaNames: areas.map((area) => area.name), userNames: users.map((user) => user.name) });
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: ACCIDENT_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 8),
          dateTo: makeDocumentDate(monthStart, 8),
          createdById,
          config,
        });
        break;
      }

      case COMPLAINT_REGISTER_TEMPLATE_CODE: {
        const config = {
          rows: [
            buildComplaintRow({
              receiptDate: monthStartKey,
              applicantName: "Соколова Мария",
              complaintReceiptForm: "по телефону",
              applicantDetails: "+7 900 555-44-33",
              complaintContent: "Курьер привез заказ на 20 минут позже обещанного времени.",
              decisionDate: isoDate(addDays(monthStart, 1)),
              decisionSummary: "Проведен разбор с логистом, клиенту предоставлен промокод.",
            }),
          ],
          defaultResponsibleUserId: manager.id,
          defaultResponsibleTitle: titleForUser(manager),
          finishedAt: isoDate(addDays(monthStart, 1)),
        };
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: COMPLAINT_REGISTER_TITLE,
          dateFrom: monthStart,
          dateTo: monthStart,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        break;
      }

      case PRODUCT_WRITEOFF_TEMPLATE_CODE: {
        const config = buildProductWriteoffConfigFromData({
          users,
          products: products.map((item) => ({ name: item.name })),
          batches,
          referenceDate: today,
        });
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: PRODUCT_WRITEOFF_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 18),
          dateTo: makeDocumentDate(monthStart, 18),
          createdById,
          config,
        });
        break;
      }

      case AUDIT_PLAN_TEMPLATE_CODE: {
        const config = getAuditPlanDefaultConfig({ organizationName, users, date: today });
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: AUDIT_PLAN_DOCUMENT_TITLE,
          dateFrom: new Date(`${config.documentDate}T00:00:00.000Z`),
          dateTo: new Date(`${config.documentDate}T00:00:00.000Z`),
          createdById,
          config,
        });
        break;
      }

      case AUDIT_PROTOCOL_TEMPLATE_CODE: {
        const config = getDefaultAuditProtocolConfig();
        config.documentDate = monthStartKey;
        config.basisTitle = `План внутренних аудитов ${monthStart.getUTCFullYear()} года`;
        config.auditedObject = `${organizationName}, производственный блок`;
        config.signatures = [
          {
            id: "sign-1",
            name: manager.name,
            role: "Главный аудитор",
            signedAt: monthStartKey,
          },
          {
            id: "sign-2",
            name: technologist.name,
            role: "Аудитор",
            signedAt: monthStartKey,
          },
        ];
        if (config.rows[0]) {
          config.rows[0].result = "yes";
          config.rows[0].note = "Ключевые процедуры внедрены и соблюдаются.";
        }
        if (config.rows[1]) {
          config.rows[1].result = "yes";
          config.rows[1].note = "Журналы актуализированы и доступны персоналу.";
        }
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: AUDIT_PROTOCOL_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 22),
          dateTo: makeDocumentDate(monthStart, 22),
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        break;
      }

      case AUDIT_REPORT_TEMPLATE_CODE: {
        const config = getDefaultAuditReportConfig();
        config.documentDate = isoDate(makeDocumentDate(monthStart, 23));
        config.auditedObject = `${organizationName}, производство и склад`;
        config.auditors = [manager.name, technologist.name];
        config.summary =
          "Проверка выполнена по плану. Критичных несоответствий не выявлено, замечания устранены в рабочем порядке.";
        config.recommendations =
          "Продолжить ежедневный контроль записей, еженедельно проверять закрытие корректирующих действий.";
        config.findings = [
          {
            id: "finding-1",
            nonConformity:
              "В начале месяца часть записей по входному контролю была заполнена с опозданием.",
            correctionActions:
              "Ответственным сотрудникам проведен внеплановый инструктаж и восстановлен контроль сроков.",
            correctiveActions:
              "Назначен ежедневный контроль закрытия журналов со стороны технолога.",
            responsibleName: technologist.name,
            responsiblePosition: titleForUser(technologist),
            dueDatePlan: isoDate(addDays(monthStart, 3)),
            dueDateFact: isoDate(addDays(monthStart, 2)),
          },
        ];
        config.signatures = [
          {
            id: "signature-1",
            role: "Аудитор",
            name: manager.name,
            position: titleForUser(manager),
            signedAt: config.documentDate,
          },
          {
            id: "signature-2",
            role: "Проверяемое подразделение",
            name: technologist.name,
            position: titleForUser(technologist),
            signedAt: config.documentDate,
          },
        ];
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: AUDIT_REPORT_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 23),
          dateTo: makeDocumentDate(monthStart, 23),
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        break;
      }

      case TRACEABILITY_DOCUMENT_TEMPLATE_CODE: {
        const rawMaterialList = products.slice(0, 5).map((item) => item.name);
        const productList = products.slice(0, 5).map((item) => item.name);
        const config = getDefaultTraceabilityDocumentConfig();
        config.documentTitle = TRACEABILITY_DOCUMENT_TITLE;
        config.dateFrom = monthStartKey;
        config.showShockTempField = true;
        config.showShipmentBlock = false;
        config.rawMaterialList = rawMaterialList.length > 0 ? rawMaterialList : config.rawMaterialList;
        config.productList = productList.length > 0 ? productList : config.productList;
        config.defaultResponsibleRole = titleForUser(technologist);
        config.defaultResponsibleEmployeeId = technologist.id;
        config.defaultResponsibleEmployee = technologist.name;
        config.rows = [
          createTraceabilityRow({
            date: monthStartKey,
            incoming: {
              rawMaterialName: rawMaterialList[0] || "Куриное филе охлажденное",
              batchNumber: batches[0]?.code || "BATCH-001",
              packagingDate: monthStartKey,
              quantityPieces: null,
              quantityKg: 18.5,
            },
            outgoing: {
              productName: productList[0] || "Салат Цезарь",
              quantityPacksPieces: 24,
              quantityPacksKg: null,
              shockTemp: 3.2,
            },
            responsibleRole: titleForUser(technologist),
            responsibleEmployeeId: technologist.id,
            responsibleEmployee: technologist.name,
          }),
        ];
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: TRACEABILITY_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthStart,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config,
        });
        break;
      }

      case METAL_IMPURITY_TEMPLATE_CODE: {
        const config = getDefaultMetalImpurityConfig({
          users,
          materials: products.map((item) => item.name),
          suppliers: supplierNames,
          responsibleEmployeeId: technologist.id,
          responsibleName: technologist.name,
          responsiblePosition: titleForUser(technologist),
          date: monthStartKey,
        });
        config.endDate = monthEndKey;
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: METAL_IMPURITY_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config,
        });
        break;
      }

      case EQUIPMENT_CLEANING_TEMPLATE_CODE: {
        const config = getDefaultEquipmentCleaningConfig();
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: EQUIPMENT_CLEANING_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config,
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: hotCook.id,
            date: new Date(`${monthStartKey}T11:30:00.000Z`),
            data: emptyEquipmentCleaningRow({
              washDate: monthStartKey,
              washTime: "11:30",
              equipmentName: equipment[0]?.name || "Пароконвектомат Rational",
              detergentName: "Щелочной моющий раствор",
              detergentConcentration: "2%",
              disinfectantName: "Септолит",
              disinfectantConcentration: "0,5%",
              rinseTemperature: "65",
              rinseResult: "compliant",
              washerPosition: titleForUser(hotCook),
              washerName: hotCook.name,
              washerUserId: hotCook.id,
              controllerPosition: titleForUser(technologist),
              controllerName: technologist.name,
              controllerUserId: technologist.id,
            }),
          },
        ]);
        break;
      }

      case INTENSIVE_COOLING_TEMPLATE_CODE: {
        const config = getDefaultIntensiveCoolingConfig(
          users,
          products.map((item) => item.name)
        );
        config.defaultResponsibleTitle = titleForUser(technologist);
        config.defaultResponsibleUserId = technologist.id;
        config.rows = [
          createIntensiveCoolingRow({
            productionDate: monthStartKey,
            productionHour: "09",
            productionMinute: "20",
            dishName: products[0]?.name || "Салат Цезарь",
            startTemperature: "86",
            endTemperature: "4",
            correctiveAction: "Не требуется",
            comment: "Охлаждение выполнено в нормативный срок",
            responsibleTitle: titleForUser(technologist),
            responsibleUserId: technologist.id,
          }),
        ];
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
          dateFrom: monthStart,
          dateTo: monthStart,
          createdById,
          responsibleUserId: technologist.id,
          responsibleTitle: titleForUser(technologist),
          config,
        });
        break;
      }

      case GLASS_LIST_TEMPLATE_CODE: {
        const config = buildGlassListConfigFromData({
          users,
          areas,
          equipment: equipment.map((item) => ({ name: item.name })),
          products: products.map((item) => ({ name: item.name })),
          referenceDate: today,
        });
        await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: GLASS_LIST_DOCUMENT_TITLE,
          dateFrom: today,
          dateTo: today,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        break;
      }

      case GLASS_CONTROL_TEMPLATE_CODE: {
        const config = getDefaultGlassControlConfig();
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: GLASS_CONTROL_DOCUMENT_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
          config,
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: manager.id,
            date: monthStart,
            data: {
              damagesDetected: false,
              itemName: equipment[0]?.name || "Светильники производственного цеха",
              quantity: "12",
              damageInfo: "",
            },
          },
        ]);
        break;
      }

      case PEST_CONTROL_TEMPLATE_CODE: {
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: PEST_CONTROL_DOCUMENT_TITLE,
          dateFrom: makeDocumentDate(monthStart, 6),
          dateTo: makeDocumentDate(monthStart, 6),
          createdById,
          responsibleUserId: manager.id,
          responsibleTitle: titleForUser(manager),
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: manager.id,
            date: new Date(`${isoDate(makeDocumentDate(monthStart, 6))}T18:00:17.000Z`),
            data: {
              performedDate: isoDate(makeDocumentDate(monthStart, 6)),
              performedHour: "18",
              performedMinute: "00",
              timeSpecified: true,
              event: "Дезинсекция",
              areaOrVolume: "200 м2",
              treatmentProduct: "Агита",
              note: "После обработки повторная влажная уборка не требуется, ловушки обновлены.",
              performedBy: 'ООО "ДезКонтроль"',
              acceptedRole: titleForUser(manager),
              acceptedEmployeeId: manager.id,
            },
          },
        ]);
        break;
      }

      case SANITARY_DAY_CHECKLIST_TEMPLATE_CODE: {
        const config = defaultSdcConfig(sanitation.name);
        config.checkerName = manager.name;
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: SANITARY_DAY_CHECKLIST_TITLE,
          dateFrom: makeDocumentDate(monthStart, 21),
          dateTo: makeDocumentDate(monthStart, 21),
          createdById,
          responsibleUserId: sanitation.id,
          responsibleTitle: titleForUser(sanitation),
          config,
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: sanitation.id,
            date: makeDocumentDate(monthStart, 21),
            data: {
              marks: Object.fromEntries(
                config.items.slice(0, 4).map((item, index) => [
                  item.id,
                  ["08:30", "08:50", "09:20", "09:40"][index] || "09:00",
                ])
              ),
            },
          },
        ]);
        break;
      }

      case CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE: {
        const config = getDefaultCleaningVentilationConfig(users);
        config.mainResponsibleTitle = titleForUser(sanitation);
        config.mainResponsibleUserId = sanitation.id;
        config.responsibles = [
          { id: "resp-1", title: titleForUser(sanitation), userId: sanitation.id },
          { id: "resp-2", title: titleForUser(manager), userId: manager.id },
          { id: "resp-3", title: titleForUser(storekeeper), userId: storekeeper.id },
        ];
        config.procedures = config.procedures.map((procedure) => ({
          ...procedure,
          responsibleUserId: sanitation.id,
        }));
        const document = await createDocument(prisma, {
          templateId: template.id,
          organizationId,
          title: CLEANING_VENTILATION_CHECKLIST_TITLE,
          dateFrom: monthStart,
          dateTo: monthEnd,
          createdById,
          responsibleUserId: sanitation.id,
          responsibleTitle: titleForUser(sanitation),
          config,
        });
        await createEntries(prisma, [
          {
            documentId: document.id,
            employeeId: sanitation.id,
            date: monthStart,
            data: {
              responsibleUserId: sanitation.id,
              procedures: {
                disinfection: ["09:00", "15:00", "21:00"],
                ventilation: ["10:00", "16:00", "22:00"],
                wet_cleaning: ["12:00", "18:00"],
              },
            },
          },
        ]);
        break;
      }

      default: {
        if (Array.isArray(template.fields) && template.fields.length > 0) {
          const documentDate = makeDocumentDate(monthStart, 9);
          const document = await createDocument(prisma, {
            templateId: template.id,
            organizationId,
            title: getTrackedDocumentTitle(template.code),
            dateFrom: documentDate,
            dateTo: documentDate,
            createdById,
            responsibleUserId: manager.id,
            responsibleTitle: titleForUser(manager),
          });
          await createEntries(prisma, [
            {
              documentId: document.id,
              employeeId: sanitation.id,
              date: documentDate,
              data: buildGenericTrackedEntryData(
                template,
                users,
                manager,
                sanitation,
                isoDate(documentDate)
              ),
            },
          ]);
          break;
        }

        throw new Error(`Unhandled journal template code: ${template.code}`);
      }
    }
  }
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DATABASE_URL_DIRECT) is not set");
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const adminUser = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: {
        id: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!adminUser) {
      throw new Error(
        `Admin user ${DEMO_ADMIN_EMAIL} not found. Run prisma/seed-admin.ts first.`
      );
    }

    const templates = await prisma.journalTemplate.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        fields: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    if (templates.length !== 35) {
      throw new Error(
        `Expected 35 active journal templates, found ${templates.length}`
      );
    }

    await ensureBaseCatalog(prisma, adminUser.organizationId);
    await resetUsersAndDocuments(prisma, adminUser.organizationId);
    const users = await upsertSeedUsers(prisma, adminUser.organizationId);
    await assertLegacyUsersRemoved(prisma, adminUser.organizationId);
    await seedActiveJournalExamples(prisma, {
      organizationId: adminUser.organizationId,
      organizationName: adminUser.organization.name,
      createdById: adminUser.id,
      templates,
      users,
    });

    const [documentCount, entryCount, userCount] = await Promise.all([
      prisma.journalDocument.count({
        where: { organizationId: adminUser.organizationId },
      }),
      prisma.journalDocumentEntry.count({
        where: { document: { organizationId: adminUser.organizationId } },
      }),
      prisma.user.count({
        where: { organizationId: adminUser.organizationId, isActive: true },
      }),
    ]);

    const perTemplate = await prisma.journalDocument.groupBy({
      by: ["templateId"],
      where: { organizationId: adminUser.organizationId },
      _count: { _all: true },
    });
    const perTemplateMap = new Map(
      perTemplate.map((item) => [item.templateId, item._count._all])
    );

    console.log(
      JSON.stringify(
        {
          organizationId: adminUser.organizationId,
          activeUsers: userCount,
          activeUserEmails: users.map((user) => user.email),
          activeTemplates: templates.length,
          documents: documentCount,
          entries: entryCount,
          templateCoverage: templates.map((template) => ({
            code: template.code,
            count: perTemplateMap.get(template.id) || 0,
          })),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
