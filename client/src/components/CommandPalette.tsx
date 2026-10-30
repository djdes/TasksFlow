import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { CornerDownLeft, LogOut, Monitor, Moon, Plus, QrCode, Search, Sun, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePermissions } from "@/hooks/use-permissions";
import { useUsers } from "@/hooks/use-users";
import { cabinetNav, matchesQuery } from "@/lib/cabinet-nav";
import { signedOutPath } from "@/lib/pwa";
import { personLabel, personSearchText } from "@/lib/user-display";

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Слова для поиска, кроме названия. */
  keywords?: string;
  shortcut?: string;
  run: () => void;
};

const MAX_PEOPLE = 6;

/**
 * Быстрый переход (Ctrl+K / ⌘K): разделы кабинета, действия и сотрудники
 * по имени — с клавиатуры, без мыши. Стрелки выбирают, Enter открывает,
 * Esc закрывает.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="command-palette">
        <DialogTitle className="sr-only">Быстрый переход</DialogTitle>
        <DialogDescription className="sr-only">Разделы, действия и сотрудники. Стрелки — выбрать, Enter — открыть.</DialogDescription>
        {/* Содержимое монтируется при каждом открытии — запрос и выбор
            начинаются с чистого листа, без сброса эффектом. */}
        <PaletteBody close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { setPreference } = useTheme();
  const role = usePermissions();
  const { data: users = [] } = useUsers(role.isAdmin || role.canManageUsers);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => setLocation(href);
    const list: Command[] = cabinetNav(role).map((item) => ({
      id: `nav-${item.key}`,
      label: item.label,
      hint: "Раздел",
      icon: item.icon,
      keywords: item.keywords,
      run: go(item.href),
    }));
    if (role.canManageTasks) list.unshift({ id: "new-task", label: "Создать задачу", hint: "Действие", icon: Plus, keywords: "новая задача добавить", shortcut: "N", run: go("/tasks/new") });
    if (role.isAdmin || role.canManageUsers) {
      list.push({ id: "new-worker", label: "Добавить сотрудника", hint: "Действие", icon: UserPlus, keywords: "новый человек пин", run: go("/admin/users?add=1") });
    }
    if (role.isAdmin) {
      list.push({ id: "invite", label: "Пригласить по QR-коду", hint: "Действие", icon: QrCode, keywords: "приглашение ссылка", run: go("/admin/invitations") });
    }
    list.push(
      { id: "theme-light", label: "Светлая тема", hint: "Оформление", icon: Sun, keywords: "тема день", run: () => setPreference("light") },
      { id: "theme-dark", label: "Тёмная тема", hint: "Оформление", icon: Moon, keywords: "тема ночь", run: () => setPreference("dark") },
      { id: "theme-system", label: "Тема как в системе", hint: "Оформление", icon: Monitor, keywords: "тема авто", run: () => setPreference("system") },
      {
        id: "logout",
        label: "Выйти",
        hint: "Аккаунт",
        icon: LogOut,
        keywords: "выход",
        run: () => {
          void logout().then(() => {
            window.location.href = signedOutPath();
          });
        },
      },
    );
    return list;
  }, [role.canManageTasks, role.canManageUsers, role.canVerify, role.canViewReports, role.isAdmin, role.isRoot, role.isManager, setLocation, setPreference, logout]);

  const results = useMemo(() => {
    const q = query.trim();
    const found = q ? commands.filter((c) => matchesQuery(q, `${c.label} ${c.keywords ?? ""}`)) : commands;
    // Сотрудники — только по запросу: список компании может быть длинным.
    const people: Command[] = q
      ? users
          .filter((u) => matchesQuery(q, personSearchText(u)))
          .slice(0, MAX_PEOPLE)
          .map((u) => ({
            id: `user-${u.id}`,
            label: personLabel(u),
            hint: "Сотрудник",
            icon: UserRound,
            run: () => setLocation(`/admin/users?user=${u.id}`),
          }))
      : [];
    return [...found, ...people];
  }, [query, commands, users, setLocation]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[index]);
    }
  };

  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <>
    <div className="command-palette-input">
      <Search aria-hidden />
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Раздел, действие или сотрудник…"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results.length ? optionId(index) : undefined}
        aria-label="Быстрый переход"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
    {results.length ? (
      <ul className="command-palette-list" role="listbox" id={listId} ref={listRef} aria-label="Результаты">
        {results.map((command, i) => {
          const Icon = command.icon;
          return (
            <li
              key={command.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === index}
              data-index={i}
              className="command-palette-item"
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(command)}
            >
              <Icon aria-hidden />
              <span className="command-palette-label">{command.label}</span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
              <span className="command-palette-hint">{command.hint}</span>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="command-palette-empty" role="status">
        Ничего не нашли. Попробуйте другое слово.
      </p>
    )}
    <p className="command-palette-footer" aria-hidden>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> выбрать
      </span>
      <span>
        <kbd>
          <CornerDownLeft />
        </kbd>{" "}
        открыть
      </span>
      <span>
        <kbd>Esc</kbd> закрыть
      </span>
    </p>
    </>
  );
}
