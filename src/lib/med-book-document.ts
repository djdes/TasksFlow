export const MED_BOOK_TEMPLATE_CODE = "med_books";
export const MED_BOOK_DOCUMENT_TITLE = "Мед. книжки";

export const DEFAULT_EXAMINATIONS = [
  "Гинеколог",
  "Стоматолог",
  "Психиатр",
  "Оториноларинголог",
  "Терапевт",
  "Невролог",
  "Нарколог",
  "Дерматовенеролог",
  "Флюорография",
  "Маммография",
];

export const DEFAULT_VACCINATIONS = [
  "Дифтерия",
  "Корь",
  "Дизентерия Зонне",
  "Краснуха",
  "Гепатит B",
  "Гепатит A",
  "Грипп",
  "Коронавирус",
];

export type MedBookExamination = {
  date: string | null;
  expiryDate: string | null;
};

export type MedBookVaccinationType = "done" | "refusal" | "exemption";

export type MedBookVaccination = {
  type: MedBookVaccinationType;
  dose?: string | null;
  date?: string | null;
  expiryDate?: string | null;
};

export type MedBookEntryData = {
  positionTitle: string;
  birthDate: string | null;
  gender: "male" | "female" | null;
  hireDate: string | null;
  medBookNumber: string | null;
  photoUrl: string | null;
  examinations: Record<string, MedBookExamination>;
  vaccinations: Record<string, MedBookVaccination>;
  note: string | null;
};

export type MedBookDocumentConfig = {
  examinations: string[];
  vaccinations: string[];
  includeVaccinations: boolean;
};

export type MedBookReferenceRow = {
  name: string;
  periodicity: string;
  note: string;
};

export type MedBookComparisonRow = {
  preliminary: string;
  periodic: string;
};

export function getDefaultMedBookConfig(): MedBookDocumentConfig {
  return {
    examinations: [...DEFAULT_EXAMINATIONS],
    vaccinations: [...DEFAULT_VACCINATIONS],
    includeVaccinations: true,
  };
}

export function normalizeMedBookConfig(raw: unknown): MedBookDocumentConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return getDefaultMedBookConfig();
  }

  const obj = raw as Record<string, unknown>;

  return {
    examinations: Array.isArray(obj.examinations)
      ? (obj.examinations as string[]).filter((value) => typeof value === "string" && value.trim())
      : [...DEFAULT_EXAMINATIONS],
    vaccinations: Array.isArray(obj.vaccinations)
      ? (obj.vaccinations as string[]).filter((value) => typeof value === "string" && value.trim())
      : [...DEFAULT_VACCINATIONS],
    includeVaccinations:
      typeof obj.includeVaccinations === "boolean" ? obj.includeVaccinations : true,
  };
}

export function normalizeMedBookEntryData(raw: unknown): MedBookEntryData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyMedBookEntry("");
  }

  const obj = raw as Record<string, unknown>;

  return {
    positionTitle: typeof obj.positionTitle === "string" ? obj.positionTitle : "",
    birthDate: typeof obj.birthDate === "string" ? obj.birthDate : null,
    gender: obj.gender === "male" || obj.gender === "female" ? obj.gender : null,
    hireDate: typeof obj.hireDate === "string" ? obj.hireDate : null,
    medBookNumber: typeof obj.medBookNumber === "string" ? obj.medBookNumber : null,
    photoUrl: typeof obj.photoUrl === "string" ? obj.photoUrl : null,
    examinations: normalizeExaminationsMap(obj.examinations),
    vaccinations: normalizeVaccinationsMap(obj.vaccinations),
    note: typeof obj.note === "string" ? obj.note : null,
  };
}

function normalizeExaminationsMap(raw: unknown): Record<string, MedBookExamination> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Record<string, MedBookExamination> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const item = value as Record<string, unknown>;
    result[key] = {
      date: typeof item.date === "string" ? item.date : null,
      expiryDate: typeof item.expiryDate === "string" ? item.expiryDate : null,
    };
  }

  return result;
}

function normalizeVaccinationsMap(raw: unknown): Record<string, MedBookVaccination> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: Record<string, MedBookVaccination> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const item = value as Record<string, unknown>;
    if (
      item.type !== "done" &&
      item.type !== "refusal" &&
      item.type !== "exemption"
    ) {
      continue;
    }

    result[key] = {
      type: item.type,
      dose: typeof item.dose === "string" ? item.dose : null,
      date: typeof item.date === "string" ? item.date : null,
      expiryDate: typeof item.expiryDate === "string" ? item.expiryDate : null,
    };
  }

  return result;
}

export function emptyMedBookEntry(positionTitle: string): MedBookEntryData {
  return {
    positionTitle,
    birthDate: null,
    gender: null,
    hireDate: null,
    medBookNumber: null,
    photoUrl: null,
    examinations: {},
    vaccinations: {},
    note: null,
  };
}

export function isExaminationExpired(exam: MedBookExamination): boolean {
  if (!exam.expiryDate) return false;
  return exam.expiryDate < new Date().toISOString().slice(0, 10);
}

export function isExaminationExpiringSoon(
  exam: MedBookExamination,
  daysThreshold = 30
): boolean {
  if (!exam.expiryDate) return false;

  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + daysThreshold);

  const todayKey = today.toISOString().slice(0, 10);
  const thresholdKey = threshold.toISOString().slice(0, 10);

  return exam.expiryDate >= todayKey && exam.expiryDate <= thresholdKey;
}

export function isVaccinationExpired(vaccination: MedBookVaccination): boolean {
  return Boolean(vaccination.expiryDate && vaccination.expiryDate < new Date().toISOString().slice(0, 10));
}

export function formatMedBookDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}-${month}-${year}`;
}

export const VACCINATION_TYPE_LABELS: Record<MedBookVaccinationType, string> = {
  done: "Вакцинация",
  refusal: "Отказ сотрудника",
  exemption: "Мед. отвод",
};

export const MED_BOOK_PRELIMINARY_PERIODIC_ROWS: MedBookComparisonRow[] = [
  {
    preliminary:
      "расчет на основании антропометрии (измерение роста, массы тела, окружности талии) индекса массы тела, который проходят граждане в возрасте от 18 лет и старше;",
    periodic:
      "расчет на основании антропометрии (измерение роста, массы тела, окружности талии) индекса массы тела, проводится для граждан в возрасте 18 лет и старше;",
  },
  {
    preliminary:
      "общий анализ крови (гемоглобин, цветной показатель, эритроциты, тромбоциты, лейкоциты, лейкоцитарная формула, СОЭ);",
    periodic:
      "общий анализ крови (гемоглобин, цветной показатель, эритроциты, тромбоциты, лейкоциты, лейкоцитарная формула, скорость оседания эритроцитов);",
  },
  {
    preliminary:
      "клинический анализ мочи (удельный вес, белок, сахар, микроскопия осадка);",
    periodic:
      "клинический анализ мочи (удельный вес, белок, сахар, микроскопия осадка);",
  },
  {
    preliminary:
      "электрокардиография в покое, которую проходят граждане в возрасте от 18 лет и старше;",
    periodic:
      "электрокардиография в покое проводится для граждан в возрасте 18 лет и старше;",
  },
  {
    preliminary:
      "измерение артериального давления на периферических артериях;",
    periodic:
      "измерение артериального давления на периферических артериях;",
  },
  {
    preliminary:
      "флюорография или рентгенография легких в двух проекциях для граждан в возрасте от 18 лет и старше;",
    periodic:
      "флюорография, рентгенография или компьютерная томография органов грудной клетки для граждан старше 18 лет;",
  },
  {
    preliminary:
      "осмотр врача-терапевта, врача-невролога, врача-психиатра и врача-нарколога;",
    periodic:
      "осмотр врача-терапевта, врача-невролога, врача-психиатра и врача-нарколога;",
  },
  {
    preliminary:
      "женщины проходят осмотр врачом-акушером-гинекологом с бактериологическим и цитологическим исследованием;",
    periodic:
      "женщины проходят осмотр врачом-акушером-гинекологом с бактериологическим и цитологическим исследованием;",
  },
  {
    preliminary:
      "женщины в возрасте старше 40 лет проходят маммографию обеих молочных желез в двух проекциях;",
    periodic:
      "женщины в возрасте старше 40 лет проходят маммографию обеих молочных желез в двух проекциях;",
  },
];

export const EXAMINATION_REFERENCE_DATA: MedBookReferenceRow[] = [
  { name: "Гинеколог", periodicity: "осмотр 1 раз в год", note: "только женщины" },
  { name: "Стоматолог", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Психиатр", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Оториноларинголог", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Терапевт", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Невролог", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Нарколог", periodicity: "осмотр 1 раз в год", note: "" },
  { name: "Дерматовенеролог", periodicity: "осмотр 1 раз в год", note: "" },
  {
    name: "Исследования на гельминтозы",
    periodicity: "при поступлении на работу, затем 1 раз в год",
    note: "",
  },
  {
    name: "Профпатолог",
    periodicity: "осмотр 1 раз в год",
    note: "заключение о прохождении медицинской комиссии",
  },
  { name: "Флюорография", periodicity: "осмотр 1 раз в год", note: "" },
  {
    name: "Исследования на стафилококк",
    periodicity: "при поступлении на работу",
    note: "в дальнейшем по медицинским и эпид. показаниям",
  },
  {
    name: "Бактериологическое исследование на диз. группу",
    periodicity: "при поступлении на работу",
    note: "в дальнейшем по эпид. показаниям",
  },
  {
    name: "Брюшной тиф",
    periodicity: "при поступлении на работу",
    note: "в дальнейшем по эпид. показаниям",
  },
  {
    name: "Гигиеническая подготовка (санминимум)",
    periodicity: "осмотр 1 раз в год / 1 раз в 2 года",
    note:
      "для работников пищевой отрасли, общественного питания и дошкольного питания - 1 раз в год; для остальных категорий - 1 раз в 2 года",
  },
];

export const VACCINATION_REFERENCE_DATA = [
  {
    name: "ДИФТЕРИЯ (АДСМ анатоксин: дифтерийно-столбнячная малотоксичная)",
    periodicity:
      "Привитым лицам ревакцинация проводится каждые 10 лет. Непривитым или без сведений о прививках проводится курс из 3 прививок.",
  },
  {
    name: "КОРЬ (ЖКВ - живая коревая вакцина)",
    periodicity:
      "Необходимо 2 прививки. Интервал между первой и второй прививкой составляет не менее 3 месяцев. В возрасте до 55 лет.",
  },
  { name: "Дизентерия Зонне", periodicity: "Ежегодно" },
  {
    name: "КРАСНУХА",
    periodicity:
      "Необходимо 2 прививки женщинам до 25 лет. Интервал между первой и второй прививкой составляет не менее 3 месяцев.",
  },
  {
    name: "ГЕПАТИТ B",
    periodicity: "Лицам до 55 лет необходимо 3 прививки по схеме 0-1 месяц - 6 месяцев (V1-V2-V3).",
  },
  {
    name: "ГЕПАТИТ A",
    periodicity: "Необходимо 2 прививки с интервалом между прививками 6-12 месяцев (V1-V2).",
  },
  { name: "Вакцинация от гриппа", periodicity: "Взрослые ежегодно, осенне-зимний период." },
  {
    name: "Вакцинация от коронавируса",
    periodicity: "Взрослые от 18 лет и старше, с охватом не менее 80% от общей численности работников.",
  },
];

export const MED_BOOK_VACCINATION_RULES = [
  "В ОДИН ДЕНЬ МОЖНО ДЕЛАТЬ НЕ БОЛЕЕ 4 ПРИВИВОК ПРОТИВ РАЗНЫХ ИНФЕКЦИЙ: 2 ПОД ЛОПАТКУ (ПРАВУЮ И ЛЕВУЮ) И 2 В ПЛЕЧО (ПРАВОЕ И ЛЕВОЕ)",
  "ИНТЕРВАЛ МЕЖДУ ПРИВИВКАМИ РАЗНЫХ ИНФЕКЦИЙ СОСТАВЛЯЕТ НЕ МЕНЕЕ 1 МЕСЯЦА",
];
