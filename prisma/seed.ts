import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const journalTemplates = [
  {
    code: "temp_control",
    name: "Температурный режим",
    description: "Журнал учёта температурного режима холодильного и морозильного оборудования",
    sortOrder: 1,
    fields: [
      { key: "equipmentId", label: "Оборудование", type: "equipment", required: true },
      { key: "temperature", label: "Температура (°C)", type: "number", required: true, step: 0.1 },
      { key: "isWithinNorm", label: "В пределах нормы", type: "boolean", auto: true },
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "isWithinNorm", equals: false } },
    ],
  },
  {
    code: "incoming_control",
    name: "Входной контроль сырья",
    description: "Журнал входного контроля поступающего сырья и продуктов",
    sortOrder: 2,
    fields: [
      { key: "productName", label: "Наименование продукта", type: "text", required: true },
      { key: "supplier", label: "Поставщик", type: "text", required: true },
      { key: "manufactureDate", label: "Дата изготовления", type: "date", required: true },
      { key: "expiryDate", label: "Срок годности", type: "date", required: true },
      { key: "quantity", label: "Количество", type: "number", required: true, step: 0.01 },
      { key: "unit", label: "Единица измерения", type: "select", required: true, options: [
        { value: "kg", label: "кг" },
        { value: "l", label: "л" },
        { value: "pcs", label: "шт" },
      ]},
      { key: "temperatureOnArrival", label: "Температура при приёмке (°C)", type: "number", required: false, step: 0.1 },
      { key: "packagingCondition", label: "Состояние упаковки", type: "select", required: true, options: [
        { value: "intact", label: "Целая" },
        { value: "damaged", label: "Повреждена" },
      ]},
      { key: "decision", label: "Решение", type: "select", required: true, options: [
        { value: "accepted", label: "Принято" },
        { value: "rejected", label: "Отклонено" },
      ]},
      { key: "notes", label: "Примечание", type: "text", required: false },
    ],
  },
  {
    code: "finished_product",
    name: "Бракераж готовой продукции",
    description: "Журнал бракеража готовой продукции",
    sortOrder: 3,
    fields: [
      { key: "productName", label: "Наименование продукта", type: "text", required: true },
      { key: "appearance", label: "Внешний вид", type: "select", required: true, options: [
        { value: "excellent", label: "Отлично" },
        { value: "good", label: "Хорошо" },
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "taste", label: "Вкус", type: "select", required: true, options: [
        { value: "excellent", label: "Отлично" },
        { value: "good", label: "Хорошо" },
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "smell", label: "Запах", type: "select", required: true, options: [
        { value: "excellent", label: "Отлично" },
        { value: "good", label: "Хорошо" },
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "consistency", label: "Консистенция", type: "select", required: true, options: [
        { value: "excellent", label: "Отлично" },
        { value: "good", label: "Хорошо" },
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "servingTemperature", label: "Температура подачи (°C)", type: "number", required: false, step: 0.1 },
      { key: "approvedForRelease", label: "Разрешение к выпуску", type: "boolean", required: true },
      { key: "notes", label: "Примечание", type: "text", required: false },
    ],
  },
  {
    code: "hygiene",
    name: "Гигиенический журнал",
    description: "Журнал осмотра сотрудников на предмет признаков заболеваний",
    sortOrder: 4,
    fields: [
      { key: "employeeName", label: "ФИО сотрудника", type: "text", required: true },
      { key: "noRespiratorySymptoms", label: "Отсутствие признаков ОРЗ", type: "boolean", required: true },
      { key: "noSkinDiseases", label: "Отсутствие кожных заболеваний", type: "boolean", required: true },
      { key: "noGastrointestinalIssues", label: "Отсутствие кишечных расстройств", type: "boolean", required: true },
      { key: "cleanUniform", label: "Чистота спецодежды", type: "boolean", required: true },
      { key: "admittedToWork", label: "Допуск к работе", type: "select", required: true, options: [
        { value: "admitted", label: "Допущен" },
        { value: "not_admitted", label: "Не допущен" },
      ]},
    ],
  },
  {
    code: "ccp_monitoring",
    name: "Мониторинг ККТ",
    description: "Журнал мониторинга критических контрольных точек",
    sortOrder: 5,
    fields: [
      { key: "ccpName", label: "Название ККТ", type: "text", required: true },
      { key: "controlParameter", label: "Параметр контроля", type: "text", required: true },
      { key: "criticalLimit", label: "Критический предел", type: "text", required: true },
      { key: "actualValue", label: "Фактическое значение", type: "text", required: true },
      { key: "withinLimit", label: "В пределах нормы", type: "boolean", required: true },
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "withinLimit", equals: false } },
    ],
  },
];

async function main() {
  console.log("Seeding journal templates...");

  for (const template of journalTemplates) {
    await prisma.journalTemplate.upsert({
      where: { code: template.code },
      update: { name: template.name, description: template.description, fields: template.fields, sortOrder: template.sortOrder },
      create: template,
    });
    console.log(`  Done: ${template.code}: ${template.name}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
