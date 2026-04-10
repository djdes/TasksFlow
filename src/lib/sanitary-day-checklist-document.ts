export const SANITARY_DAY_CHECKLIST_TEMPLATE_CODE = "sanitary_day_control";
export const SANITARY_DAY_CHECKLIST_TITLE =
  "Чек-лист (памятка) проведения санитарного дня";

export type SdcZone = { id: string; name: string };
export type SdcItem = { id: string; zoneId: string; text: string };
export type SdcConfig = {
  zones: SdcZone[];
  items: SdcItem[];
  generalPrinciples: string[];
  responsibleName: string;
  checkerName: string;
};
export type SdcEntryData = { marks: Record<string, string> }; // itemId -> "HH:MM"

function createId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const ZONE_FOOD = createId();
const ZONE_COLD = createId();
const ZONE_HALL = createId();

const DEFAULT_ZONES: SdcZone[] = [
  { id: ZONE_FOOD, name: "Пищевая зона" },
  { id: ZONE_COLD, name: "Холодильники и камеры хранения продуктов" },
  { id: ZONE_HALL, name: "Залы" },
];

const DEFAULT_ITEMS: SdcItem[] = [
  // Zone 1 — Пищевая зона (12 items)
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Удалена пыль, паутина, посторонние предметы во всех производственных цехах, моечных, складских, вспомогательных (подсобных) помещениях (обратить внимание на труднодоступные зоны)",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Тщательно вымыты:\n- оборудование, полки, стеллажи\n- стены\n- окна\n- двери\n- вентиляционные решетки и купола\n- открытые элементы системы отопления, экраны систем отопления светильники\n- сантехнические приборы и оборудование в санузлах\n- емкости для отходов",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Решетки сливных трапов почищены от налета",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Полы и плинтуса пола тщательно промыты, почищены от налета",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Потолки и потолочные конструкции (карнизы) протерты",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Поверхности корпусов бактерицидных ламп протерты от пыли",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Кухонная посуда почищена",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Транспортировочные тележки вымыты",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Обновлена и является читаемой маркировка:\n- разделочных ножей, досок\n- зон хранения чистого и грязного инвентаря\n- зон хранения чистых подносов для посетителей\n- кухонной посуды/тары\n- производственных столов\n- моечных ванн\n- ванн для обработки яйца\n- емкостей для чистого (обработанного) яйца\n- уборочного инвентаря (швабры, ведра, совки, щетки)\n- мест хранения уборочного инвентаря\n- емкостей для отходов",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Хлебные шкафы вымыты и обработаны раствором уксуса",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Раствор уксуса для обработки хлебных шкафов хранится в маркированной емкости",
  },
  {
    id: createId(),
    zoneId: ZONE_FOOD,
    text: "Весь чистый разделочный инвентарь, посуда, приборы размещены на отведенных местах",
  },
  // Zone 2 — Холодильники и камеры хранения продуктов (4 items)
  {
    id: createId(),
    zoneId: ZONE_COLD,
    text: "Соблюдается товарное соседство",
  },
  {
    id: createId(),
    zoneId: ZONE_COLD,
    text: "Имеется надлежащая маркировка полок/секций/камер",
  },
  {
    id: createId(),
    zoneId: ZONE_COLD,
    text: "Все продукты упакованы/укупорены или в закрытой таре (емкостях)",
  },
  {
    id: createId(),
    zoneId: ZONE_COLD,
    text: "Продукты хранятся на подтоварниках/поддонах/стеллажах и не хранятся на полу",
  },
  // Zone 3 — Залы (4 items)
  {
    id: createId(),
    zoneId: ZONE_HALL,
    text: "Удалена пыль, паутина, посторонние предметы в зале, бытовых помещениях для посетителей (обратить внимание на труднодоступные зоны)",
  },
  {
    id: createId(),
    zoneId: ZONE_HALL,
    text: "Тележки официантов вымыты",
  },
  {
    id: createId(),
    zoneId: ZONE_HALL,
    text: "Обновлена и является читаемой маркировка уборочного инвентаря (швабры, ведра и др.)",
  },
  {
    id: createId(),
    zoneId: ZONE_HALL,
    text: "Весь уборочный инвентарь в исправном состоянии",
  },
];

const DEFAULT_GENERAL_PRINCIPLES: string[] = [
  "Санитарная обработка проводится согласно принципу СВЕРХУ ВНИЗ (в начале обрабатываются поверхности выше рабочих зон, в конце обрабатываются полы)",
  "Объекты (оборудование и др.) перед обработкой по возможности отодвинуты от стен и с постоянных мест размещения, после чего проведена обработка поверхностей вокруг отодвинутого объекта и под ним",
];

export function defaultSdcConfig(responsibleName = ""): SdcConfig {
  return {
    zones: DEFAULT_ZONES.map((zone) => ({ ...zone })),
    items: DEFAULT_ITEMS.map((item) => ({ ...item })),
    generalPrinciples: [...DEFAULT_GENERAL_PRINCIPLES],
    responsibleName,
    checkerName: "",
  };
}

export function normalizeSdcConfig(value: unknown): SdcConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultSdcConfig();
  }

  const record = value as Record<string, unknown>;

  const zones: SdcZone[] = Array.isArray(record.zones)
    ? record.zones
        .filter(
          (zone) =>
            zone &&
            typeof zone === "object" &&
            typeof (zone as Record<string, unknown>).id === "string" &&
            typeof (zone as Record<string, unknown>).name === "string"
        )
        .map((zone) => {
          const z = zone as Record<string, unknown>;
          return { id: z.id as string, name: z.name as string };
        })
    : DEFAULT_ZONES.map((zone) => ({ ...zone }));

  const items: SdcItem[] = Array.isArray(record.items)
    ? record.items
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).id === "string" &&
            typeof (item as Record<string, unknown>).zoneId === "string" &&
            typeof (item as Record<string, unknown>).text === "string"
        )
        .map((item) => {
          const it = item as Record<string, unknown>;
          return {
            id: it.id as string,
            zoneId: it.zoneId as string,
            text: it.text as string,
          };
        })
    : DEFAULT_ITEMS.map((item) => ({ ...item }));

  const generalPrinciples: string[] = Array.isArray(record.generalPrinciples)
    ? record.generalPrinciples.filter((p) => typeof p === "string")
    : [...DEFAULT_GENERAL_PRINCIPLES];

  return {
    zones,
    items,
    generalPrinciples,
    responsibleName:
      typeof record.responsibleName === "string" ? record.responsibleName : "",
    checkerName:
      typeof record.checkerName === "string" ? record.checkerName : "",
  };
}

export function normalizeSdcEntryData(value: unknown): SdcEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { marks: {} };
  }

  const record = value as Record<string, unknown>;
  const rawMarks = record.marks;

  if (!rawMarks || typeof rawMarks !== "object" || Array.isArray(rawMarks)) {
    return { marks: {} };
  }

  const marks: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawMarks as Record<string, unknown>)) {
    if (typeof val === "string") {
      marks[key] = val;
    }
  }

  return { marks };
}

export function getItemNumber(config: SdcConfig, item: SdcItem): string {
  const zoneIndex = config.zones.findIndex((zone) => zone.id === item.zoneId);
  if (zoneIndex === -1) return "";

  const zoneItems = config.items.filter((it) => it.zoneId === item.zoneId);
  const itemIndex = zoneItems.findIndex((it) => it.id === item.id);
  if (itemIndex === -1) return "";

  return `${zoneIndex + 1}.${itemIndex + 1}`;
}

export function getSdcFilePrefix(): string {
  return "sanitary-day-checklist";
}
