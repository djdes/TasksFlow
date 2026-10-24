import type { ChecklistItem, Task, TaskHistoryRow } from "@shared/schema";
import { dayInZone, shiftDay, startOfDayInZone } from "@shared/day";
import { isTaskVisibleOn } from "@shared/task-visibility";

/**
 * Данные демо-кабинета «Кофейня на Ленина»: 5 человек, 2 точки, задачи на
 * сегодня и две недели истории. Генерация детерминированная (своё зерно),
 * поэтому скриншоты и проверки стабильны, а «фото» — нарисованные SVG без
 * сетевых запросов.
 */
export const DEMO_TZ = "Europe/Moscow";

export type DemoUser = {
  id: number;
  name: string;
  phone: string;
  isAdmin: boolean;
  isRoot: boolean;
  companyId: number;
  createdAt: number;
  bonusBalance: number;
  managedWorkerIds: string | null;
  position: string | null;
  locationId: number | null;
  hasPin: boolean;
  pinLocked: boolean;
  email: string | null;
};

export type DemoState = {
  meId: number;
  users: DemoUser[];
  tasks: Task[];
  history: TaskHistoryRow[];
  locations: Array<{ id: number; companyId: number; name: string; address: string | null; createdAt: number; archivedAt: number | null }>;
  nextId: number;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SCENES: Record<string, { hue: number; label: string }> = {
  coffee: { hue: 28, label: "кофемашина" },
  showcase: { hue: 200, label: "витрина" },
  floor: { hue: 160, label: "зал" },
  kitchen: { hue: 12, label: "кухня" },
  cash: { hue: 265, label: "касса" },
  storage: { hue: 45, label: "склад" },
};

/** «Фото» для демо: SVG с цветной сценой и подписью — без сети. */
export function demoPhoto(scene: keyof typeof SCENES, variant = 0): string {
  const { hue, label } = SCENES[scene];
  const h2 = (hue + 25 + variant * 17) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 78%)"/><stop offset="1" stop-color="hsl(${h2} 50% 52%)"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#g)"/>
<rect x="${120 + variant * 30}" y="190" width="420" height="260" rx="28" fill="hsl(${hue} 45% 32% / .55)"/>
<circle cx="${590 - variant * 20}" cy="200" r="86" fill="hsl(${h2} 70% 88% / .7)"/>
<rect x="0" y="520" width="800" height="80" fill="rgb(0 0 0 / .35)"/>
<text x="32" y="570" font-family="system-ui, sans-serif" font-size="34" font-weight="600" fill="#fff">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type TaskSeed = {
  title: string;
  workerId: number;
  category: string;
  photo?: keyof typeof SCENES;
  price?: number;
  weekDays?: number[] | null;
  checklist?: string[];
  verifier?: number;
  /** Насколько часто человек это делает (для истории). */
  reliability: number;
  /** Обычное время выполнения, часы. */
  at: number;
};

const SEEDS: TaskSeed[] = [
  { title: "Открыть смену: включить кофемашину и проверить помол", workerId: 2, category: "Открытие смены", photo: "coffee", reliability: 0.97, at: 7.8 },
  { title: "Выложить витрину и проверить ценники", workerId: 2, category: "Открытие смены", photo: "showcase", price: 100, reliability: 0.93, at: 8.3 },
  { title: "Уборка зала по чек-листу", workerId: 4, category: "Уборка", photo: "floor", checklist: ["Столы и стулья", "Пол", "Окна у входа", "Санузел"], reliability: 0.82, at: 11.5 },
  { title: "Санобработка поверхностей на кухне", workerId: 3, category: "Кухня", photo: "kitchen", verifier: 1, reliability: 0.88, at: 10.2 },
  { title: "Проверить сроки годности в холодильнике", workerId: 3, category: "Кухня", photo: "storage", price: 150, verifier: 1, reliability: 0.9, at: 9.1 },
  { title: "Принять поставку молока и выпечки", workerId: 5, category: "Склад", photo: "storage", weekDays: [1, 3, 5], reliability: 0.95, at: 9.6 },
  { title: "Сверить кассу в середине дня", workerId: 5, category: "Касса", photo: "cash", reliability: 0.91, at: 14.1 },
  { title: "Вынести мусор и заменить пакеты", workerId: 4, category: "Уборка", reliability: 0.78, at: 16.4 },
  { title: "Почистить кофемашину и капучинатор", workerId: 2, category: "Закрытие смены", photo: "coffee", price: 100, reliability: 0.9, at: 21.2 },
  { title: "Закрыть кассу и сдать выручку", workerId: 5, category: "Закрытие смены", photo: "cash", reliability: 0.96, at: 21.6 },
];

export function createDemoState(now: number = Math.floor(Date.now() / 1000)): DemoState {
  const random = rng(20261024);
  const today = dayInZone(now, DEMO_TZ);
  const todayStart = startOfDayInZone(today, DEMO_TZ);
  const created = todayStart - 40 * 86_400;
  const users: DemoUser[] = [
    { id: 1, name: "Мария Соколова", phone: "+79990000001", isAdmin: true, isRoot: false, companyId: 1, createdAt: created, bonusBalance: 0, managedWorkerIds: null, position: "Управляющая", locationId: 1, hasPin: true, pinLocked: false, email: "demo@tasksflow.ru" },
    { id: 2, name: "Анна Петрова", phone: "+79990000002", isAdmin: false, isRoot: false, companyId: 1, createdAt: created, bonusBalance: 1400, managedWorkerIds: null, position: "Бариста", locationId: 1, hasPin: true, pinLocked: false, email: null },
    { id: 3, name: "Илья Кузнецов", phone: "+79990000003", isAdmin: false, isRoot: false, companyId: 1, createdAt: created, bonusBalance: 900, managedWorkerIds: null, position: "Повар", locationId: 1, hasPin: true, pinLocked: false, email: null },
    { id: 4, name: "Ольга Смирнова", phone: "+79990000004", isAdmin: false, isRoot: false, companyId: 1, createdAt: created, bonusBalance: 0, managedWorkerIds: null, position: "Уборка", locationId: 2, hasPin: false, pinLocked: false, email: null },
    { id: 5, name: "Денис Орлов", phone: "+79990000005", isAdmin: false, isRoot: false, companyId: 1, createdAt: created, bonusBalance: 300, managedWorkerIds: null, position: "Кассир", locationId: 2, hasPin: true, pinLocked: false, email: null },
  ];
  const locations = [
    { id: 1, companyId: 1, name: "Кофейня на Ленина", address: "ул. Ленина, 12", createdAt: created, archivedAt: null },
    { id: 2, companyId: 1, name: "Кофейня на Мира", address: "пр. Мира, 40", createdAt: created, archivedAt: null },
  ];
  const nowHour = (now - todayStart) / 3600;

  const tasks: Task[] = SEEDS.map((seed, i) => {
    const checklist: ChecklistItem[] = (seed.checklist ?? []).map((title, j) => ({ id: `c${i}-${j}`, title, done: false, photoUrls: [] }));
    const base = {
      id: i + 1,
      title: seed.title,
      workerId: seed.workerId,
      requiresPhoto: !!seed.photo,
      photoUrl: null,
      photoUrls: [] as string[],
      examplePhotoUrl: null,
      examplePhotoUrls: seed.photo ? [demoPhoto(seed.photo, 3)] : [],
      isCompleted: false,
      weekDays: seed.weekDays ?? null,
      monthDay: null,
      isRecurring: true,
      price: seed.price ?? 0,
      category: seed.category,
      description: null,
      companyId: 1,
      journalLink: null,
      createdAt: created,
      completedAt: null as number | null,
      claimedByWorkerId: null,
      verificationStatus: seed.verifier ? "pending" : null,
      verifierWorkerId: seed.verifier ?? null,
      verifiedByUserId: null,
      verifiedAt: null,
      rejectReason: null,
      submittedValues: null,
      checklist,
      dueDate: null,
    } as Task;
    // Что по расписанию «уже прошло» к текущему часу — сделано (кроме пары
    // пропусков для правдоподобия), уборка по чек-листу — наполовину.
    if (seed.at < nowHour && random() < seed.reliability) {
      const doneAt = todayStart + Math.round((seed.at + random() * 0.4) * 3600);
      if (seed.verifier) {
        return { ...base, verificationStatus: "submitted", photoUrls: seed.photo ? [demoPhoto(seed.photo, 1)] : [] } as Task;
      }
      return {
        ...base,
        isCompleted: true,
        completedAt: doneAt,
        photoUrls: seed.photo ? [demoPhoto(seed.photo, 1)] : [],
        photoUrl: seed.photo ? demoPhoto(seed.photo, 1) : null,
        checklist: checklist.map((c) => ({ ...c, done: true, photoUrls: [demoPhoto("floor", 2)] })),
      } as Task;
    }
    if (checklist.length > 0 && seed.at - 1 < nowHour) {
      return { ...base, checklist: checklist.map((c, j) => (j < 2 ? { ...c, done: true, photoUrls: [demoPhoto("floor", j)] } : c)) } as Task;
    }
    return base;
  });

  // Сверка фото — одна из главных функций: очередь «На проверке» в демо не
  // пустует ни утром, ни ночью — хотя бы одна задача ждёт решения.
  if (!tasks.some((t) => t.verificationStatus === "submitted")) {
    // Самая ранняя по расписанию — правдоподобнее всего, что её уже сдали.
    const candidates = SEEDS.map((seed, j) => ({ seed, j })).filter(({ seed, j }) => seed.verifier && !tasks[j].isCompleted);
    const i = candidates.sort((a, b) => a.seed.at - b.seed.at)[0]?.j ?? -1;
    const photo = i >= 0 ? SEEDS[i].photo : undefined;
    if (i >= 0) tasks[i] = { ...tasks[i], verificationStatus: "submitted", photoUrls: photo ? [demoPhoto(photo, 1)] : [] } as Task;
  }

  // Две недели истории, как её пишет ночной сброс.
  const history: TaskHistoryRow[] = [];
  let hid = 1;
  for (let back = 14; back >= 1; back--) {
    const day = shiftDay(today, -back);
    const dayStart = startOfDayInZone(day, DEMO_TZ);
    const [y, m, d] = day.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    SEEDS.forEach((seed, i) => {
      if (!isTaskVisibleOn({ weekDays: seed.weekDays ?? null, monthDay: null }, dow, d)) return;
      const done = random() < seed.reliability;
      const completedAt = done ? dayStart + Math.round((seed.at + (random() - 0.3) * 0.8) * 3600) : null;
      const checklist = seed.checklist?.map((title, j) => ({ id: `c${i}-${j}`, title, done: done || j < 1, photoUrls: done || j < 1 ? [demoPhoto("floor", j)] : [] }));
      history.push({
        id: hid++,
        taskId: i + 1,
        companyId: 1,
        workerId: seed.workerId,
        day,
        status: done ? "done" : "missed",
        title: seed.title,
        category: seed.category,
        price: done ? seed.price ?? 0 : 0,
        completedAt,
        photoUrls: done && seed.photo ? JSON.stringify([demoPhoto(seed.photo, (back + i) % 3)]) : null,
        checklist: checklist ? JSON.stringify(checklist) : null,
        claimedByWorkerId: null,
        verificationStatus: seed.verifier && done ? "approved" : null,
        verifiedByUserId: seed.verifier && done ? seed.verifier : null,
        verifiedAt: seed.verifier && completedAt ? completedAt + 1800 : null,
        createdAt: dayStart + 86_400,
      });
    });
  }

  return { meId: 1, users, tasks, history, locations, nextId: 1000 };
}
