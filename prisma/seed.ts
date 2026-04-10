import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { SCAN_JOURNALS } from "../src/lib/scan-journal-config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const journalTemplates = [
  {
    code: "temp_control",
    name: "Температурный режим",
    description: "Журнал учёта температурного режима холодильного и морозильного оборудования",
    sortOrder: 1,
    isMandatorySanpin: true,
    isMandatoryHaccp: true,
    fields: [
      { key: "equipmentId", label: "Оборудование", type: "equipment", required: true },
      { key: "temperature", label: "Температура (°C)", type: "number", required: true, step: 0.1 },
      { key: "isWithinNorm", label: "В пределах нормы", type: "boolean", auto: true },
      { key: "correctiveAction", label: "Корректирующее действие", type: "text", required: false, showIf: { field: "isWithinNorm", equals: false } },
    ],
  },
  {
    code: "incoming_control",
    name: "Журнал приемки и входного контроля продукции",
    description: "Журнал приемки и входного контроля поступающего сырья и продуктов",
    sortOrder: 2,
    isMandatorySanpin: true,
    isMandatoryHaccp: true,
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
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
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
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
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
    isMandatorySanpin: false,
    isMandatoryHaccp: true,
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
    name: "Чек-лист уборки и проветривания помещений",
    description: "Журнал уборки и санитарной обработки помещений и оборудования",
    sortOrder: 6,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [],
  },
  {
    code: "pest_control",
    name: "Журнал учета дезинфекции, дезинсекции и дератизации",
    description: "Журнал учета мероприятий по дезинфекции, дезинсекции и дератизации",
    sortOrder: 7,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "performedDate", label: "Дата проведения", type: "date", required: true },
      { key: "performedHour", label: "Часы", type: "text", required: false },
      { key: "performedMinute", label: "Минуты", type: "text", required: false },
      { key: "event", label: "Мероприятие (вид, место)", type: "text", required: true },
      { key: "areaOrVolume", label: "Площадь и (или) объем", type: "text", required: false },
      { key: "treatmentProduct", label: "Средство обработки", type: "text", required: false },
      { key: "note", label: "Примечание", type: "text", required: false },
      { key: "performedBy", label: "Кем проведено", type: "text", required: false },
      { key: "acceptedRole", label: "Должность принявшего работы", type: "select", required: true, options: [
        { value: "Управляющий", label: "Управляющий" },
        { value: "Технолог", label: "Технолог" },
        { value: "Сотрудник", label: "Сотрудник" },
      ]},
      { key: "acceptedEmployeeId", label: "Сотрудник", type: "employee", required: true },
    ],
  },
  {
    code: "equipment_calibration",
    name: "Поверка оборудования",
    description: "Журнал метрологической поверки и калибровки измерительного оборудования",
    sortOrder: 8,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
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
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
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
    isMandatorySanpin: true,
    isMandatoryHaccp: true,
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
    isMandatorySanpin: false,
    isMandatoryHaccp: false,
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

  // === Журнал здоровья персонала (СанПиН 2.3/2.4.3590-20, п. 2.3) ===
  // Отдельно от гигиенического: фиксирует мед. книжку, ежедневный осмотр
  // и температуру тела. Обязателен при приёме смены.
  {
    code: "health_check",
    name: "Журнал здоровья персонала",
    description: "Ежедневный контроль состояния здоровья сотрудников перед допуском к работе",
    sortOrder: 12,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "employeeName", label: "Сотрудник", type: "employee", required: true },
      { key: "bodyTemperature", label: "Температура тела (°C)", type: "number", required: true, step: 0.1 },
      { key: "noFever", label: "Нет повышенной температуры", type: "boolean", required: true },
      { key: "noCoughThroat", label: "Нет кашля / боли в горле", type: "boolean", required: true },
      { key: "noRash", label: "Нет сыпи / гнойничковых поражений", type: "boolean", required: true },
      { key: "medBookValid", label: "Мед. книжка действующая", type: "boolean", required: true },
      { key: "medBookExpiry", label: "Срок действия мед. книжки", type: "date", required: false },
      { key: "admittedToWork", label: "Допуск к работе", type: "select", required: true, options: [
        { value: "admitted", label: "Допущен" },
        { value: "suspended", label: "Отстранён" },
      ]},
      { key: "suspensionReason", label: "Причина отстранения", type: "text", required: false, showIf: { field: "admittedToWork", equals: "suspended" } },
    ],
  },
  {
    code: "climate_control",
    name: "Бланк контроля температуры и влажности",
    description: "Документный журнал контроля температуры и влажности воздуха по помещениям",
    sortOrder: 19,
    isMandatorySanpin: false,
    isMandatoryHaccp: false,
    fields: [],
  },
  {
    code: "cold_equipment_control",
    name: "Журнал контроля температурного режима холодильного и морозильного оборудования",
    description: "Документный журнал контроля температурного режима холодильного и морозильного оборудования по дням месяца",
    sortOrder: 20,
    isMandatorySanpin: true,
    isMandatoryHaccp: true,
    fields: [],
  },

  // === Контроль бактерицидной УФ-установки (СанПиН 3.3686-21) ===
  // Часы наработки лампы, замена по ресурсу (обычно 8000 ч).
  {
    code: "uv_lamp_control",
    name: "Контроль бактерицидной установки",
    description: "Журнал учёта работы и замены бактерицидных УФ-ламп (рециркуляторов, облучателей)",
    sortOrder: 13,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "lampLocation", label: "Помещение / объект", type: "text", required: true },
      { key: "lampModel", label: "Модель установки", type: "text", required: false },
      { key: "operatingHoursStart", label: "Показания счётчика на начало смены (ч)", type: "number", required: true, step: 1 },
      { key: "operatingHoursEnd", label: "Показания счётчика на конец смены (ч)", type: "number", required: true, step: 1 },
      { key: "maxHours", label: "Ресурс лампы (ч)", type: "number", required: false, step: 1 },
      { key: "lampReplaced", label: "Лампа заменена", type: "boolean", required: true },
      { key: "replacementDate", label: "Дата замены", type: "date", required: false, showIf: { field: "lampReplaced", equals: true } },
      { key: "newLampSerial", label: "Серийный номер новой лампы", type: "text", required: false, showIf: { field: "lampReplaced", equals: true } },
      { key: "responsiblePerson", label: "Ответственный", type: "employee", required: true },
    ],
  },

  // === Контроль фритюрных жиров (СанПиН 2.3/2.4.3590-20, п. 8.6.6) ===
  // Органолептика + кислотное число; при превышении норм масло подлежит замене.
  // Кислотное число > 1.0 мг KOH/г или изменение цвета/запаха → обязательная замена.
  {
    code: "fryer_oil",
    name: "Журнал учета использования фритюрных жиров",
    description: "Контроль качества фритюрных жиров: органолептика, кислотное число, замена",
    sortOrder: 14,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [],
  },

  // === График генеральных уборок (СанПиН 2.3/2.4.3590-20, п. 2.12) ===
  // Не реже 1 раза в месяц; фиксирует плановую и фактическую даты.
  {
    code: "general_cleaning",
    name: "График генеральных уборок",
    description: "Планирование и учёт генеральных уборок производственных помещений",
    sortOrder: 15,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "location", label: "Помещение", type: "text", required: true },
      { key: "scheduledDate", label: "Плановая дата", type: "date", required: true },
      { key: "actualDate", label: "Фактическая дата", type: "date", required: false },
      { key: "scopeOfWork", label: "Объём работ", type: "text", required: true },
      { key: "detergent", label: "Моющее средство", type: "text", required: true },
      { key: "disinfectant", label: "Дезинфицирующее средство", type: "text", required: false },
      { key: "concentration", label: "Концентрация раствора (%)", type: "number", required: false, step: 0.1 },
      { key: "result", label: "Результат", type: "select", required: true, options: [
        { value: "completed", label: "Выполнено" },
        { value: "postponed", label: "Перенесено" },
        { value: "partial", label: "Выполнено частично" },
      ]},
      { key: "postponedReason", label: "Причина переноса / замечания", type: "text", required: false, showIf: { field: "result", equals: "postponed" } },
      { key: "nextScheduledDate", label: "Следующая плановая уборка", type: "date", required: false },
      { key: "performedBy", label: "Ответственный за выполнение", type: "employee", required: true },
      { key: "inspectedBy", label: "Проверил", type: "employee", required: false },
    ],
  },

  // === План обучения персонала ===
  {
    code: "training_plan",
    name: "План обучения персонала",
    description: "План обучения персонала по темам: ККТ, санитария и гигиена, охрана труда и др.",
    sortOrder: 30,
    isMandatorySanpin: true,
    isMandatoryHaccp: true,
    fields: [],
  },

  // === Карточка истории поломок ===
  {
    code: "breakdown_history",
    name: "Карточка истории поломок",
    description: "Учёт поломок оборудования, выполненных ремонтов и простоев",
    sortOrder: 31,
    isMandatorySanpin: false,
    isMandatoryHaccp: true,
    fields: [],
  },

  // === Учёт дезинфицирующих средств (СанПиН 2.3/2.4.3590-20, п. 2.13) ===
  // Приход / расход / утилизация дез. средств, остатки на складе.
  {
    code: "disinfectant_usage",
    name: "Журнал учета получения, расхода дезинфицирующих средств и проведения дезинфекционных работ на объекте",
    description: "Приход, расход и утилизация моющих и дезинфицирующих средств",
    sortOrder: 16,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "productName", label: "Наименование средства", type: "text", required: true },
      { key: "operation", label: "Операция", type: "select", required: true, options: [
        { value: "receipt", label: "Приход" },
        { value: "issue", label: "Расход" },
        { value: "disposal", label: "Утилизация" },
      ]},
      { key: "quantity", label: "Количество", type: "number", required: true, step: 0.01 },
      { key: "unit", label: "Единица измерения", type: "select", required: true, options: [
        { value: "l", label: "л" },
        { value: "ml", label: "мл" },
        { value: "kg", label: "кг" },
        { value: "g", label: "г" },
        { value: "pcs", label: "шт" },
      ]},
      { key: "supplier", label: "Поставщик", type: "text", required: false, showIf: { field: "operation", equals: "receipt" } },
      { key: "batchNumber", label: "Номер партии", type: "text", required: false },
      { key: "expiryDate", label: "Срок годности", type: "date", required: false },
      { key: "purpose", label: "Куда / для чего", type: "text", required: false, showIf: { field: "operation", equals: "issue" } },
      { key: "disposalReason", label: "Причина утилизации", type: "text", required: false, showIf: { field: "operation", equals: "disposal" } },
      { key: "balanceAfter", label: "Остаток после операции", type: "number", required: false, step: 0.01 },
      { key: "responsiblePerson", label: "Ответственный", type: "employee", required: true },
    ],
  },

  // === График ППО оборудования ===
  // Профилактическое обслуживание, отличается от поверки (equipment_calibration).
  {
    code: "equipment_maintenance",
    name: "График профилактического обслуживания оборудования",
    description: "Планово-предупредительное обслуживание и техническое состояние оборудования",
    sortOrder: 17,
    isMandatorySanpin: false,
    isMandatoryHaccp: false,
    fields: [
      { key: "equipmentId", label: "Оборудование", type: "equipment", required: true },
      { key: "maintenanceType", label: "Вид обслуживания", type: "select", required: true, options: [
        { value: "daily", label: "Ежедневное" },
        { value: "weekly", label: "Еженедельное" },
        { value: "monthly", label: "Ежемесячное" },
        { value: "quarterly", label: "Ежеквартальное" },
        { value: "annual", label: "Годовое" },
        { value: "repair", label: "Ремонт" },
      ]},
      { key: "scheduledDate", label: "Плановая дата", type: "date", required: true },
      { key: "actualDate", label: "Фактическая дата", type: "date", required: false },
      { key: "workPerformed", label: "Выполненные работы", type: "text", required: true },
      { key: "partsReplaced", label: "Заменённые узлы / запчасти", type: "text", required: false },
      { key: "servicedByType", label: "Исполнитель", type: "select", required: true, options: [
        { value: "internal", label: "Собственный персонал" },
        { value: "external", label: "Сервисная организация" },
      ]},
      { key: "servicedByName", label: "ФИО / организация", type: "text", required: true },
      { key: "result", label: "Результат", type: "select", required: true, options: [
        { value: "ok", label: "Исправно" },
        { value: "needs_repair", label: "Требуется ремонт" },
        { value: "out_of_order", label: "Не эксплуатировать" },
      ]},
      { key: "defectsFound", label: "Выявленные дефекты", type: "text", required: false, showIf: { field: "result", equals: "needs_repair" } },
      { key: "nextMaintenanceDate", label: "Следующее обслуживание", type: "date", required: false },
    ],
  },

  // === Журнал инструктажей (охрана труда + санитарные требования) ===
  // СанПиН 2.3/2.4.3590-20 п. 2.2 требует гигиенического обучения.
  {
    code: "staff_training",
    name: "Журнал регистрации инструктажей (обучения) сотрудников",
    description: "Учёт вводных, первичных, повторных и внеплановых инструктажей сотрудников",
    sortOrder: 18,
    isMandatorySanpin: true,
    isMandatoryHaccp: false,
    fields: [
      { key: "employeeName", label: "Сотрудник", type: "employee", required: true },
      { key: "trainingType", label: "Вид инструктажа", type: "select", required: true, options: [
        { value: "introductory", label: "Вводный" },
        { value: "primary", label: "Первичный на рабочем месте" },
        { value: "repeated", label: "Повторный" },
        { value: "unscheduled", label: "Внеплановый" },
        { value: "targeted", label: "Целевой" },
        { value: "hygiene", label: "Гигиеническое обучение" },
      ]},
      { key: "topic", label: "Тема инструктажа", type: "text", required: true },
      { key: "program", label: "Программа / документ", type: "text", required: false },
      { key: "trainerName", label: "Кто провёл инструктаж", type: "text", required: true },
      { key: "durationMinutes", label: "Длительность (мин)", type: "number", required: false, step: 5 },
      { key: "unscheduledReason", label: "Причина внепланового / целевого", type: "text", required: false, showIf: { field: "trainingType", equals: "unscheduled" } },
      { key: "knowledgeCheck", label: "Проверка знаний", type: "select", required: true, options: [
        { value: "passed", label: "Пройдена" },
        { value: "failed", label: "Не пройдена — повторный инструктаж" },
      ]},
      { key: "nextTrainingDate", label: "Дата следующего инструктажа", type: "date", required: false },
    ],
  },
  { code: "ppe_issuance", name: "Журнал учета выдачи СИЗ", description: "Журнал учета выдачи средств индивидуальной защиты сотрудникам", sortOrder: 38, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [] },
];

const additionalJournalTemplates = [
  { code: "accident_journal", name: "Журнал учета аварий", description: "Журнал регистрации аварий, их последствий и корректирующих мероприятий", sortOrder: 32, isMandatorySanpin: true, isMandatoryHaccp: true, fields: [] },
  { code: "sanitary_day_control", name: "Чек-лист (памятка) проведения санитарного дня", description: "Чек-лист проведения санитарного дня", sortOrder: 21, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [] },
  { code: "hand_hygiene_control", name: "Контроль гигиены рук", description: "Проверка соблюдения процедур гигиены рук", sortOrder: 22, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "employeeName", label: "Сотрудник", type: "employee", required: true }, { key: "hasViolations", label: "Есть нарушения", type: "boolean", required: true }, { key: "comment", label: "Комментарий", type: "text", required: false }] },
  { code: "waste_disposal_control", name: "Контроль утилизации отходов", description: "Учёт вывоза и утилизации пищевых отходов", sortOrder: 23, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "wasteType", label: "Тип отходов", type: "text", required: true }, { key: "quantity", label: "Количество", type: "number", required: true, step: 0.01 }, { key: "contractor", label: "Подрядчик", type: "text", required: false }] },
  { code: "uv_lamp_runtime", name: "Учёт наработки УФ-ламп", description: "Часы работы и замена УФ-ламп", sortOrder: 24, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "lampName", label: "Установка/лампа", type: "text", required: true }, { key: "hoursBefore", label: "Часы до смены", type: "number", required: true, step: 1 }, { key: "hoursAfter", label: "Часы после смены", type: "number", required: true, step: 1 }] },
  { code: "daily_rejection", name: "Ежедневный бракераж блюд", description: "Оценка качества блюд перед выдачей", sortOrder: 25, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "dish", label: "Блюдо", type: "text", required: true }, { key: "rating", label: "Оценка", type: "select", required: true, options: [{ value: "ok", label: "Годно" }, { value: "reject", label: "Брак" }] }] },
  { code: "raw_storage_control", name: "Контроль хранения сырья", description: "Проверка условий хранения сырья", sortOrder: 26, isMandatorySanpin: true, isMandatoryHaccp: true, fields: [{ key: "productName", label: "Продукт", type: "text", required: true }, { key: "storageArea", label: "Зона хранения", type: "text", required: true }, { key: "temperature", label: "Температура (°C)", type: "number", required: false, step: 0.1 }] },
  { code: "defrosting_control", name: "Контроль размораживания", description: "Учёт процесса размораживания сырья", sortOrder: 27, isMandatorySanpin: true, isMandatoryHaccp: true, fields: [{ key: "productName", label: "Сырьё", type: "text", required: true }, { key: "method", label: "Способ", type: "text", required: true }, { key: "startAt", label: "Начало", type: "date", required: true }] },
  { code: "water_temperature_control", name: "Контроль температуры воды", description: "Контроль горячей/холодной воды", sortOrder: 28, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "pointName", label: "Точка контроля", type: "text", required: true }, { key: "hotWaterTemp", label: "Горячая вода (°C)", type: "number", required: false, step: 0.1 }, { key: "coldWaterTemp", label: "Холодная вода (°C)", type: "number", required: false, step: 0.1 }] },
  { code: "dishwashing_control", name: "Контроль мойки посуды", description: "Параметры мойки и дезинфекции посуды", sortOrder: 29, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "zone", label: "Участок", type: "text", required: true }, { key: "detergent", label: "Средство", type: "text", required: true }, { key: "waterTemp", label: "Температура воды (°C)", type: "number", required: false, step: 0.1 }] },
  { code: "inventory_sanitation", name: "Санобработка инвентаря", description: "Учёт мойки и дезинфекции инвентаря", sortOrder: 30, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [{ key: "inventoryName", label: "Инвентарь", type: "text", required: true }, { key: "method", label: "Метод обработки", type: "text", required: true }, { key: "agent", label: "Средство", type: "text", required: false }] },
  { code: "receiving_temperature_control", name: "Температура при приёмке", description: "Контроль температуры сырья при приёмке", sortOrder: 31, isMandatorySanpin: true, isMandatoryHaccp: true, fields: [{ key: "productName", label: "Продукт", type: "text", required: true }, { key: "supplier", label: "Поставщик", type: "text", required: true }, { key: "temperature", label: "Температура (°C)", type: "number", required: true, step: 0.1 }] },
  { code: "allergen_control", name: "Контроль аллергенов", description: "Маркировка и предотвращение перекрёстного контакта", sortOrder: 32, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [{ key: "productName", label: "Продукт", type: "text", required: true }, { key: "allergen", label: "Аллерген", type: "text", required: true }, { key: "isolated", label: "Изолирован", type: "boolean", required: true }] },
  { code: "critical_limit_check", name: "Проверка критических пределов", description: "Проверки критических пределов ККТ", sortOrder: 33, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [{ key: "ccpName", label: "ККТ", type: "text", required: true }, { key: "limitValue", label: "Критический предел", type: "text", required: true }, { key: "actualValue", label: "Факт", type: "text", required: true }] },
  { code: "intensive_cooling", name: "Журнал контроля интенсивного охлаждения горячих блюд", description: "Контроль интенсивного охлаждения горячих блюд", sortOrder: 34, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [] },
  { code: "supplier_audit", name: "Оценка поставщиков", description: "Результаты оценки и переоценки поставщиков", sortOrder: 34, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [{ key: "supplier", label: "Поставщик", type: "text", required: true }, { key: "criterion", label: "Критерий", type: "text", required: true }, { key: "score", label: "Оценка", type: "number", required: true, step: 1 }] },
  { code: "traceability_test", name: "Журнал прослеживаемости продукции", description: "Проверка прослеживаемости продукции по партиям", sortOrder: 35, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [{ key: "batchNumber", label: "Партия", type: "text", required: true }, { key: "productName", label: "Продукт", type: "text", required: true }, { key: "status", label: "Статус", type: "select", required: true, options: [{ value: "ok", label: "Пройдено" }, { value: "fail", label: "Не пройдено" }] }] },
  { code: "audit_plan", name: "План-программа внутренних аудитов", description: "План-программа внутренних аудитов с таблицей требований и датами аудита по подразделениям", sortOrder: 36, isMandatorySanpin: false, isMandatoryHaccp: true, fields: [] },
  { code: "med_books", name: "Медицинские книжки", description: "Журнал учёта медицинских книжек, осмотров и прививок сотрудников", sortOrder: 36, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [] },
  { code: "perishable_rejection", name: "Бракераж скоропортящейся пищевой продукции", description: "Журнал бракеража скоропортящейся пищевой продукции", sortOrder: 37, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [] },
  { code: "equipment_cleaning", name: "Журнал мойки и дезинфекции оборудования", description: "Учёт мойки и дезинфекции оборудования с контролем смываемости или температуры ополаскивания", sortOrder: 38, isMandatorySanpin: true, isMandatoryHaccp: false, fields: [] },
  { code: "audit_plan_scan", name: "Журнал аудита - План", description: "Шаблон журнала сканирования для плана аудита", sortOrder: 39, isMandatorySanpin: false, isMandatoryHaccp: false, fields: [] },
  { code: "audit_protocol_scan", name: "Журнал аудита - Протокол", description: "Шаблон журнала сканирования для протокола аудита", sortOrder: 40, isMandatorySanpin: false, isMandatoryHaccp: false, fields: [] },
  { code: "audit_report_scan", name: "Журнал аудита - Отчет", description: "Шаблон журнала сканирования для отчета по аудиту", sortOrder: 41, isMandatorySanpin: false, isMandatoryHaccp: false, fields: [] },
];

additionalJournalTemplates.push({
  code: "complaint_register",
  name: "Журнал регистрации жалоб",
  description: "Журнал регистрации и обработки жалоб заявителей",
  sortOrder: 39,
  isMandatorySanpin: false,
  isMandatoryHaccp: false,
  fields: [
    { key: "receiptDate", label: "Дата поступления", type: "date", required: true },
    { key: "applicantName", label: "ФИО заявителя", type: "text", required: true },
    {
      key: "complaintReceiptForm",
      label: "Форма поступления жалобы",
      type: "select",
      required: true,
      options: [
        { value: "по почте", label: "по почте" },
        { value: "по телефону", label: "по телефону" },
        { value: "по факсу", label: "по факсу" },
        { value: "по электронной почте", label: "по электронной почте" },
        {
          value: "в книге отзывов и предложений",
          label: "в книге отзывов и предложений",
        },
      ],
    },
    {
      key: "applicantDetails",
      label: "Реквизиты заявителя, указанные в жалобе заявителя для отправки ответа",
      type: "text",
      required: false,
    },
    { key: "complaintContent", label: "Содержание жалобы", type: "text", required: false },
    { key: "decisionDate", label: "Дата решения", type: "date", required: false },
    {
      key: "decisionSummary",
      label: "Решение, дата, краткое содержание",
      type: "text",
      required: false,
    },
  ],
});

const scanJournalTemplates = SCAN_JOURNALS.map((journal) => ({
  code: journal.code,
  name: journal.title,
  description: journal.description,
  sortOrder: journal.sortOrder,
  isMandatorySanpin: false,
  isMandatoryHaccp: false,
  fields: [],
}));

async function main() {
  console.log("Seeding journal templates...");
  const allTemplates = [...journalTemplates, ...additionalJournalTemplates, ...scanJournalTemplates];
  const allowedCodes = new Set(allTemplates.map((template) => template.code));

  for (const template of allTemplates) {
    await prisma.journalTemplate.upsert({
      where: { code: template.code },
      update: { name: template.name, description: template.description, fields: template.fields, sortOrder: template.sortOrder, isMandatorySanpin: template.isMandatorySanpin, isMandatoryHaccp: template.isMandatoryHaccp },
      create: template,
    });
    console.log(`  Done: ${template.code}: ${template.name}`);
  }

  await prisma.journalTemplate.updateMany({
    where: { code: { notIn: [...allowedCodes] } },
    data: { isActive: false },
  });

  console.log("Seeding example areas and equipment...");
  const organizations = await prisma.organization.findMany({ select: { id: true } });

  for (const organization of organizations) {
    const areaNames = ["Холодильный цех", "Горячий цех", "Склад", "Упаковка"];

    for (const areaName of areaNames) {
      const areaId = `${organization.id}-${areaName}`;
      await prisma.area.upsert({
        where: { id: areaId },
        update: { name: areaName },
        create: {
          id: areaId,
          organizationId: organization.id,
          name: areaName,
        },
      });
    }

    const areas = await prisma.area.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
    });

    for (const area of areas) {
      const equipmentSeeds =
        area.name === "Холодильный цех"
          ? [
              { name: "Холодильная камера 1", type: "refrigerator", tempMin: 2, tempMax: 4 },
              { name: "Морозильный ларь 1", type: "freezer", tempMin: -20, tempMax: -18 },
            ]
          : [{ name: `${area.name} - термогигрометр`, type: "sensor", tempMin: 18, tempMax: 25 }];

      for (const equipment of equipmentSeeds) {
        await prisma.equipment.upsert({
          where: { id: `${area.id}-${equipment.name}` },
          update: equipment,
          create: {
            id: `${area.id}-${equipment.name}`,
            areaId: area.id,
            ...equipment,
          },
        });
      }
    }

    const productSeeds = [
      { name: "Куриное филе", unit: "kg", supplier: "ООО АгроПоставка", shelfLifeDays: 5, storageTemp: "+2...+4°C" },
      { name: "Молоко пастеризованное", unit: "l", supplier: "АО МолТорг", shelfLifeDays: 7, storageTemp: "+2...+6°C" },
      { name: "Салат Айсберг", unit: "kg", supplier: "Ферма Грин", shelfLifeDays: 4, storageTemp: "+2...+5°C" },
      { name: "Лосось охлажденный", unit: "kg", supplier: "РыбСнаб", shelfLifeDays: 3, storageTemp: "0...+2°C" },
      { name: "Масло подсолнечное", unit: "l", supplier: "ТД Маслоторг", shelfLifeDays: 180, storageTemp: "+18...+25°C" },
    ];

    for (const product of productSeeds) {
      await prisma.product.upsert({
        where: { id: `${organization.id}-${product.name}` },
        update: product,
        create: {
          id: `${organization.id}-${product.name}`,
          organizationId: organization.id,
          ...product,
        },
      });
    }
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
