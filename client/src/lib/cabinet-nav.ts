import {
  BarChart3,
  Building2,
  CreditCard,
  HelpCircle,
  ListTodo,
  Megaphone,
  QrCode,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Разделы кабинета — одна модель на всех: меню слева на ПК, меню-шторка на
 * телефоне и быстрый переход (Ctrl+K). Кто что видит — по ролям, как и
 * раньше: сотрудник — задачи, историю, аккаунт и помощь; руководитель —
 * ещё проверку; админ — управление компанией; root — свои разделы.
 */
export type CabinetRole = { isAdmin: boolean; isRoot: boolean; canManageTasks: boolean };

export type NavGroup = "main" | "company" | "root" | "help";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Дополнительные пути, на которых пункт подсвечен (подстраницы раздела). */
  also?: readonly string[];
  /** Счётчик рядом с пунктом. */
  badge?: "verification";
  testId?: string;
  /** Слова для поиска в быстром переходе. */
  keywords?: string;
};

export const NAV_GROUP_LABEL: Record<NavGroup, string | null> = {
  main: null,
  company: "Компания",
  root: "Root",
  help: null,
};

export function cabinetNav(role: CabinetRole): NavItem[] {
  const items: NavItem[] = [
    { key: "tasks", label: "Задачи", href: "/dashboard", icon: ListTodo, group: "main", also: ["/tasks/"], keywords: "главная сегодня список" },
  ];
  if (role.canManageTasks) {
    items.push({ key: "verification", label: "На проверке", href: "/admin/verification", icon: ShieldCheck, group: "main", badge: "verification", keywords: "проверка фото принять вернуть" });
  }
  items.push({
    key: "reports",
    label: role.isAdmin ? "История и отчёты" : "История",
    href: "/reports",
    icon: BarChart3,
    group: "main",
    testId: "menu-reports",
    keywords: "журнал сводка csv премии",
  });
  if (role.isAdmin) {
    items.push(
      { key: "users", label: "Сотрудники", href: "/admin/users", icon: Users, group: "company", keywords: "люди персонал пин" },
      { key: "invitations", label: "Приглашения", href: "/admin/invitations", icon: QrCode, group: "company", keywords: "qr ссылка пригласить" },
      {
        key: "settings",
        label: "Настройки",
        href: "/admin/settings",
        icon: Settings,
        group: "company",
        also: ["/admin/api-keys", "/admin/integrations"],
        keywords: "компания точки фото напоминания wesetup интеграции ключи api",
      },
      { key: "billing", label: "Тариф и оплата", href: "/admin/billing", icon: CreditCard, group: "company", also: ["/billing/"], testId: "menu-billing", keywords: "оплата счёт баланс баллы промокод упд" },
    );
  }
  if (role.isRoot) {
    items.push(
      { key: "companies", label: "Компании и тарифы", href: "/admin/companies", icon: Building2, group: "root", keywords: "root касса цены акции промокоды" },
      { key: "banners", label: "Промо-баннеры", href: "/admin/banners", icon: Megaphone, group: "root", keywords: "root баннер" },
    );
  }
  items.push(
    { key: "account", label: "Мой аккаунт", href: "/account", icon: UserCog, group: "help", testId: "menu-account", keywords: "профиль пин тема телеграм уведомления" },
    { key: "help", label: "Помощь", href: "/help", icon: HelpCircle, group: "help", also: ["/instructions"], keywords: "инструкция вопросы поддержка" },
  );
  return items;
}

/** Пункт, который подсвечен на этом пути: точное совпадение или подстраница раздела. */
export function activeNavKey(items: readonly NavItem[], path: string): string | null {
  const exact = items.find((item) => path === item.href || path.startsWith(`${item.href}/`));
  if (exact) return exact.key;
  return items.find((item) => item.also?.some((prefix) => path.startsWith(prefix)))?.key ?? null;
}

/** Страницы вне меню, у которых свой заголовок вкладки. */
const OWN_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/tasks\/new$/, "Новая задача"],
  [/^\/tasks\/\d+\/edit$/, "Задача"],
  [/^\/account$/, "Мой аккаунт"],
  [/^\/billing\/(success|fail)$/, "Оплата"],
  [/^\/admin\/api-keys$/, "API-ключи"],
  [/^\/admin\/integrations$/, "Интеграции"],
];

/**
 * Заголовок вкладки: «Раздел · TasksFlow», с числом ждущих проверки
 * впереди — его видно и на фоновой вкладке.
 */
export function pageTitle(items: readonly NavItem[], path: string, pending = 0): string {
  const own = OWN_TITLES.find(([re]) => re.test(path))?.[1];
  const key = own ? null : activeNavKey(items, path);
  const section = own ?? items.find((item) => item.key === key)?.label;
  const base = section ? `${section} · TasksFlow` : "TasksFlow";
  return pending > 0 ? `(${pending > 99 ? "99+" : pending}) ${base}` : base;
}

/** Страницы без меню кабинета: вход, регистрация, приглашение. */
export function isCabinetPath(path: string): boolean {
  if (path === "/" || path === "/login") return false;
  return !/^\/(register|join)(\/|$)/.test(path);
}

/** Строка для поиска: нижний регистр, ё → е. */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Все слова запроса встречаются в тексте (название и ключевые слова). */
export function matchesQuery(query: string, text: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hay = norm(text);
  return words.every((w) => hay.includes(w));
}
