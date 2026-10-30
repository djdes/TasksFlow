import { Link, useLocation } from "wouter";
import { LogOut, Plus, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/BrandMark";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { usePermissions } from "@/hooks/use-permissions";
import { useAwaitingVerification } from "@/hooks/use-verification-queue";
import { useWesetupConfiguration } from "@/hooks/use-wesetup";
import { activeNavKey, cabinetNav, NAV_GROUP_LABEL, type NavGroup, type NavItem } from "@/lib/cabinet-nav";
import { signedOutPath } from "@/lib/pwa";
import { formatPhoneDisplay, getUserInitials } from "@/lib/user-display";

const DAY = 86400;
const GROUPS: readonly NavGroup[] = ["main", "company", "root", "help"];

const untilText = (sec: number) => new Date(sec * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/**
 * Меню кабинета слева на ПК (от 1024px), как в WeSetup: компания и тариф
 * сверху, разделы с иконками (текущий подсвечен, у «На проверке» — счётчик),
 * «Создать задачу» прижата к низу — это действие, а не раздел; ниже — кто
 * вошёл, тема и выход. На телефоне меню остаётся шторкой из шапки.
 */
export function AppSidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const role = usePermissions();
  const company = useWesetupConfiguration().data;
  const { data: pending = [] } = useAwaitingVerification(role.canVerify);
  if (!user) return null;

  // «Мой аккаунт» здесь — блок с именем внизу, отдельный пункт был бы дублем.
  const items = cabinetNav(role).filter((item) => item.key !== "account");
  const creating = role.canManageTasks && location === "/tasks/new";
  // На «Создать задачу» подсвечена кнопка внизу, а не раздел «Задачи».
  const active = creating ? null : activeNavKey(items, location);
  const plan = company?.planInfo;
  const now = Math.floor(Date.now() / 1000);
  const ending = plan && plan.id !== "start" && plan.until !== null && plan.until - now < 7 * DAY;
  // Название роли из прав сервера: «Администратор», своя роль компании, «Сотрудник».
  const roleLabel = role.roleName;
  const initials = getUserInitials(user);

  return (
    <aside className="app-sidebar" aria-label="Меню кабинета" data-app-sidebar>
      <Link href="/dashboard" className="app-sidebar-brand" aria-label={`${company?.name ?? "TasksFlow"} — задачи`}>
        <BrandMark className="app-sidebar-brand-mark" />
        <span className="min-w-0">
          <span className="app-sidebar-company">{company?.name || "TasksFlow"}</span>
          {role.isAdmin && plan ? (
            <span className={`app-sidebar-plan ${ending ? "is-warn" : ""}`}>
              {plan.id === "start" ? "Тариф «Старт»" : plan.until ? `«${plan.name}» до ${untilText(plan.until)}` : `«${plan.name}» бессрочно`}
            </span>
          ) : (
            <span className="app-sidebar-plan">{roleLabel}</span>
          )}
        </span>
      </Link>

      <button type="button" className="app-sidebar-search" onClick={onOpenPalette} aria-keyshortcuts="Control+K Meta+K">
        <Search aria-hidden />
        <span>Быстрый переход</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav className="app-sidebar-nav" aria-label="Разделы">
        {GROUPS.map((group) => {
          const list = items.filter((item) => item.group === group);
          if (!list.length) return null;
          return (
            <div key={group} className="app-sidebar-group">
              {NAV_GROUP_LABEL[group] && <p className="app-sidebar-group-label">{NAV_GROUP_LABEL[group]}</p>}
              {list.map((item) => (
                <SidebarLink key={item.key} item={item} active={active === item.key} count={item.badge === "verification" ? pending.length : 0} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="app-sidebar-bottom">
        {role.canManageTasks && (
          <Link href="/tasks/new" className="app-sidebar-action" aria-current={creating ? "page" : undefined}>
            <Plus aria-hidden />
            Создать задачу
            <kbd aria-hidden>N</kbd>
          </Link>
        )}
        <div className="app-sidebar-user">
          <Link
            href="/account"
            className="app-sidebar-me"
            aria-label={`Мой аккаунт: ${user.name || formatPhoneDisplay(user.phone)}`}
            aria-current={location === "/account" ? "page" : undefined}
          >
            <span className="app-sidebar-avatar" aria-hidden>
              {initials}
            </span>
            <span className="min-w-0">
              <span className="app-sidebar-me-name">{user.name || formatPhoneDisplay(user.phone) || user.email}</span>
              <span className="app-sidebar-me-role">{roleLabel}</span>
            </span>
          </Link>
          <button
            type="button"
            className="app-sidebar-icon"
            aria-label="Выйти"
            title="Выйти"
            onClick={async () => {
              await logout();
              // Жёсткий переход на SSR-лендинг (а не SPA-роут "/"), из приложения — на вход.
              window.location.href = signedOutPath();
            }}
          >
            <LogOut aria-hidden />
          </button>
        </div>
        <div className="app-sidebar-foot">
          <ThemeSwitcher compact />
          <p className="app-sidebar-wordmark" aria-hidden>
            <BrandMark onColor className="app-sidebar-wordmark-mark" />
            TasksFlow
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item, active, count }: { item: NavItem; active: boolean; count: number }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="app-sidebar-link" aria-current={active ? "page" : undefined} data-nav-key={item.key}>
      <Icon aria-hidden />
      <span className="app-sidebar-link-label">{item.label}</span>
      {count > 0 && (
        <span className="app-sidebar-count" aria-label={`${count} ждут проверки`}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
