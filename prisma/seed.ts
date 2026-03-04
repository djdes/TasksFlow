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
      { key: "employeeName", label: "ФИО сотрудника", type: "employee", required: true },
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
  // === Новые обязательные журналы по ХАССП / СанПиН ===
  {
    code: "cleaning",
    name: "Уборка и дезинфекция",
    description: "Журнал уборки и санитарной обработки помещений и оборудования",
    sortOrder: 6,
    fields: [
      { key: "areaOrObject", label: "Объект уборки", type: "text", required: true },
      { key: "cleaningType", label: "Вид уборки", type: "select", required: true, options: [
        { value: "routine", label: "Текущая" },
        { value: "general", label: "Генеральная" },
        { value: "emergency", label: "Внеплановая" },
      ]},
      { key: "detergent", label: "Моющее/дезинфицирующее средство", type: "text", required: true },
      { key: "concentration", label: "Концентрация раствора (%)", type: "number", required: false, step: 0.1 },
      { key: "exposureTime", label: "Время экспозиции (мин)", type: "number", required: false, step: 1 },
      { key: "result", label: "Результат", type: "select", required: true, options: [
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "result", equals: "unsatisfactory" } },
      { key: "responsiblePerson", label: "Ответственный", type: "employee", required: true },
    ],
  },
  {
    code: "pest_control",
    name: "Дезинсекция и дератизация",
    description: "Журнал учёта мероприятий по дезинсекции и дератизации",
    sortOrder: 7,
    fields: [
      { key: "eventType", label: "Тип мероприятия", type: "select", required: true, options: [
        { value: "disinsection", label: "Дезинсекция (насекомые)" },
        { value: "deratization", label: "Дератизация (грызуны)" },
        { value: "disinfection", label: "Дезинфекция" },
      ]},
      { key: "method", label: "Метод обработки", type: "select", required: true, options: [
        { value: "chemical", label: "Химический" },
        { value: "mechanical", label: "Механический" },
        { value: "biological", label: "Биологический" },
        { value: "combined", label: "Комбинированный" },
      ]},
      { key: "product", label: "Используемый препарат", type: "text", required: true },
      { key: "treatedAreas", label: "Обработанные зоны", type: "text", required: true },
      { key: "contractor", label: "Исполнитель (организация/ФИО)", type: "text", required: true },
      { key: "contractNumber", label: "Номер договора", type: "text", required: false },
      { key: "nextScheduledDate", label: "Следующая плановая обработка", type: "date", required: false },
      { key: "result", label: "Результат", type: "select", required: true, options: [
        { value: "effective", label: "Эффективно" },
        { value: "repeat_needed", label: "Требуется повторная" },
      ]},
    ],
  },
  {
    code: "equipment_calibration",
    name: "Поверка оборудования",
    description: "Журнал метрологической поверки и калибровки измерительного оборудования",
    sortOrder: 8,
    fields: [
      { key: "equipmentId", label: "Оборудование", type: "equipment", required: true },
      { key: "calibrationType", label: "Тип", type: "select", required: true, options: [
        { value: "verification", label: "Поверка" },
        { value: "calibration", label: "Калибровка" },
      ]},
      { key: "certificateNumber", label: "Номер свидетельства/протокола", type: "text", required: true },
      { key: "calibrationDate", label: "Дата поверки", type: "date", required: true },
      { key: "nextCalibrationDate", label: "Дата следующей поверки", type: "date", required: true },
      { key: "performedBy", label: "Кем проведена", type: "text", required: true },
      { key: "result", label: "Результат", type: "select", required: true, options: [
        { value: "passed", label: "Годен" },
        { value: "failed", label: "Не годен" },
        { value: "limited", label: "Ограниченно годен" },
      ]},
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "result", equals: "failed" } },
    ],
  },
  {
    code: "product_writeoff",
    name: "Списание продукции",
    description: "Журнал учёта списания продукции с истёкшим сроком годности или несоответствующего качества",
    sortOrder: 9,
    fields: [
      { key: "productName", label: "Наименование продукции", type: "text", required: true },
      { key: "batchNumber", label: "Номер партии", type: "text", required: false },
      { key: "quantity", label: "Количество", type: "number", required: true, step: 0.01 },
      { key: "unit", label: "Единица измерения", type: "select", required: true, options: [
        { value: "kg", label: "кг" },
        { value: "l", label: "л" },
        { value: "pcs", label: "шт" },
      ]},
      { key: "reason", label: "Причина списания", type: "select", required: true, options: [
        { value: "expired", label: "Истёк срок годности" },
        { value: "quality", label: "Несоответствие качества" },
        { value: "damaged", label: "Механическое повреждение" },
        { value: "temperature", label: "Нарушение температурного режима" },
        { value: "other", label: "Другое" },
      ]},
      { key: "disposalMethod", label: "Способ утилизации", type: "select", required: true, options: [
        { value: "disposal", label: "Утилизация" },
        { value: "return", label: "Возврат поставщику" },
        { value: "processing", label: "Переработка" },
      ]},
      { key: "approvedBy", label: "Утвердил списание", type: "employee", required: true },
      { key: "notes", label: "Примечание", type: "text", required: false },
    ],
  },
  {
    code: "cooking_temp",
    name: "Термическая обработка",
    description: "Журнал контроля температуры термической обработки (варка, пастеризация, жарка, запекание)",
    sortOrder: 10,
    fields: [
      { key: "productName", label: "Наименование продукции", type: "text", required: true },
      { key: "processType", label: "Вид обработки", type: "select", required: true, options: [
        { value: "boiling", label: "Варка" },
        { value: "frying", label: "Жарка" },
        { value: "baking", label: "Запекание" },
        { value: "pasteurization", label: "Пастеризация" },
        { value: "sterilization", label: "Стерилизация" },
        { value: "smoking", label: "Копчение" },
      ]},
      { key: "equipmentId", label: "Оборудование", type: "equipment", required: false },
      { key: "targetTemp", label: "Требуемая температура (°C)", type: "number", required: true, step: 1 },
      { key: "actualTemp", label: "Фактическая температура (°C)", type: "number", required: true, step: 0.1 },
      { key: "duration", label: "Время обработки (мин)", type: "number", required: true, step: 1 },
      { key: "coreTemp", label: "Температура в толще продукта (°C)", type: "number", required: false, step: 0.1 },
      { key: "withinNorm", label: "Соответствует нормам", type: "boolean", required: true },
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "withinNorm", equals: false } },
    ],
  },
  {
    code: "shipment",
    name: "Отгрузка продукции",
    description: "Журнал учёта отгрузки готовой продукции",
    sortOrder: 11,
    fields: [
      { key: "productName", label: "Наименование продукции", type: "text", required: true },
      { key: "batchNumber", label: "Номер партии", type: "text", required: false },
      { key: "quantity", label: "Количество", type: "number", required: true, step: 0.01 },
      { key: "unit", label: "Единица измерения", type: "select", required: true, options: [
        { value: "kg", label: "кг" },
        { value: "l", label: "л" },
        { value: "pcs", label: "шт" },
      ]},
      { key: "recipient", label: "Получатель", type: "text", required: true },
      { key: "vehicleTemp", label: "Температура в транспорте (°C)", type: "number", required: false, step: 0.1 },
      { key: "vehiclePlate", label: "Номер транспортного средства", type: "text", required: false },
      { key: "documentNumber", label: "Номер ТТН / накладной", type: "text", required: false },
      { key: "vehicleCondition", label: "Санитарное состояние транспорта", type: "select", required: true, options: [
        { value: "satisfactory", label: "Удовлетворительно" },
        { value: "unsatisfactory", label: "Неудовлетворительно" },
      ]},
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "vehicleCondition", equals: "unsatisfactory" } },
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
