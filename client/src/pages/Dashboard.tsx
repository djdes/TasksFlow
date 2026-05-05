import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useUsers } from "@/hooks/use-users";
import { useTasks, useDeleteTask, useCompleteTask, useUncompleteTask } from "@/hooks/use-tasks";
import { useStreak } from "@/hooks/use-streak";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  feedbackTaskComplete,
  isFeedbackEnabled,
  setFeedbackEnabled,
} from "@/lib/feedback";
import { useAuth } from "@/contexts/AuthContext";
import { TaskViewDialog } from "@/components/TaskViewDialog";
import { TaskFormFiller } from "@/components/TaskFormFiller";
import { DuplicateTaskDialog } from "@/components/DuplicateTaskDialog";
import { GroupedTaskList } from "@/components/GroupedTaskList";
import { VerificationQueue } from "@/components/VerificationQueue";
import { GreetingBanner } from "@/components/GreetingBanner";
import { TipOfTheDay } from "@/components/TipOfTheDay";
import { StreakAchievement } from "@/components/StreakAchievement";
import { OnboardingTour } from "@/components/OnboardingTour";
import { StatHero } from "@/components/StatHero";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Input } from "@/components/ui/input";
import { api } from "@shared/routes";
import type { Task } from "@shared/schema";
import {
  CheckCircle2,
  Edit2,
  Trash2,
  Plus,
  Inbox,
  Calendar,
  CalendarDays,
  Copy,
  Coins,
  Tag,
  Home,
  HelpCircle,
  Settings,
  LogOut,
  ChevronRight,
  ChevronDown,
  Camera,
  Check,
  RefreshCw,
  Menu,
  X,
  User,
  Search,
  Palette,
  QrCode
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Gift, CalendarCheck, MessageCircle } from "lucide-react";

const WEEK_DAY_SHORT_NAMES: { [key: number]: string } = {
  0: "Вс",
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, logout, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [] } = useUsers();
  const { data: tasks = [], isLoading: loadingTasks } = useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  // Separate dialog for journal-bound tasks — employee sees the
  // WeSetup-defined form instead of the plain «Выполнено» button.
  const [journalTaskId, setJournalTaskId] = useState<number | null>(null);
  const [filterByUserId, setFilterByUserId] = useState<string>("all");
  const [filterByCategory, setFilterByCategory] = useState<string>("all");
  // Quick-chip фильтры: каждый — boolean toggle. Несколько можно
  // включить одновременно (логика AND). Хранить нечего — стейт
  // живёт пока открыт dashboard.
  const [chipPhoto, setChipPhoto] = useState(false);
  const [chipBonus, setChipBonus] = useState(false);
  const [chipJournal, setChipJournal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Таб «Мои задачи» / «Общие задачи смены» / «Все».
  // - personal: задачи лично сотруднику (закрепленные за ним)
  // - shared:   общие журналы смены (приёмки, бракераж, жалобы) —
  //              можно дописывать N раз за день
  // - all:      по умолчанию показываем всё; если в выборке нет
  //              shared-задач — табы скрываются.
  const [taskTab, setTaskTab] = useState<"all" | "personal" | "shared">("all");
  const [duplicateTask, setDuplicateTask] = useState<Task | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBonusInfoOpen, setIsBonusInfoOpen] = useState(false);
  // Режим группировки списка для админа/руководителя: по дате
  // (default — старое поведение) или по сотруднику. Воркер видит
  // только свои задачи, ему этот тогл не нужен. У управленца дефолт
  // включён, чтобы сразу видно было «у Иванова 3 невыполненных,
  // у Петрова 5».
  const [groupByWorker, setGroupByWorker] = useState(true);
  // Ref на search input для keyboard shortcut «/». Передаётся через
  // ref-callback в Input.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Toggle для звука/вибрации — состояние отражает localStorage. Меняется
  // через переключатель в меню. Ре-синхронизируется при открытии меню
  // на случай если пользователь поменял настройку на другом устройстве.
  const [feedbackOn, setFeedbackOn] = useState(true);
  useEffect(() => {
    if (isMenuOpen) setFeedbackOn(isFeedbackEnabled());
  }, [isMenuOpen]);

  // Tier-3 модель прав:
  //   • admin (isAdmin=true) — полный доступ, видит всё
  //   • manager (managedWorkerIds задан) — видит свои+подчинённых,
  //     может создавать/редактировать задачи в scope
  //   • worker (managedWorkerIds=null) — только свои задачи, ничего
  //     не создаёт/не правит
  // managedWorkerIds лежит в user-record в TasksFlow и пушится с
  // WeSetup из ManagerScope (см. /settings/staff-hierarchy на
  // WeSetup-стороне).
  const hasManagedWorkers = (() => {
    if (!user) return false;
    const raw = (user as { managedWorkerIds?: string | null })
      .managedWorkerIds;
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  })();
  const isManager = Boolean(user && !user.isAdmin && hasManagedWorkers);
  const canManageTasks = Boolean(user?.isAdmin) || isManager;

  // Все хуки должны быть до любых условных операций
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();

  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [tasks, selectedTask]);

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    await queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const categories = Array.from(new Set(
    tasks
      .map(task => (task as any).category)
      .filter((c): c is string => c !== null && c !== undefined && c.trim() !== "")
  )).sort();

  const getUserName = (userId: number | null) => {
    if (!userId) return "Не назначен";
    const foundUser = users.find(u => u.id === userId);
    return foundUser ? (foundUser.name || foundUser.phone) : "Неизвестный";
  };

  /**
   * Короткая форма для бейджа исполнителя на карточке. Запросом
   * руководителя «вижу название задачи и фамилию» — на карточке
   * показываем только фамилию из «Имя Фамилия» (или 1-е слово
   * если ФИО без пробела). Полное имя остаётся в группировке
   * по сотруднику и в админ-таблицах.
   */
  const getUserShortName = (userId: number | null) => {
    if (!userId) return "Не назначен";
    const foundUser = users.find(u => u.id === userId);
    if (!foundUser) return "Неизвестный";
    const full = (foundUser.name || foundUser.phone).trim();
    if (!full) return foundUser.phone;
    const parts = full.split(/\s+/);
    return parts.length >= 2 ? parts[parts.length - 1] : parts[0];
  };

  const getUserPosition = (userId: number | null) => {
    if (!userId) return null;
    const foundUser = users.find(u => u.id === userId);
    return (foundUser as { position?: string | null } | undefined)?.position ?? null;
  };

  const getUserInitials = (userId: number | null) => {
    if (!userId) return "?";
    const foundUser = users.find(u => u.id === userId);
    if (!foundUser) return "?";
    const name = (foundUser.name || foundUser.phone).trim();
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      // Иванов Сергей → ИС вместо ИВ. Корректнее для русских имён.
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const currentDayOfWeek = new Date().getDay();
  const currentDayOfMonth = new Date().getDate();

  const isTaskVisibleToday = (task: typeof tasks[0]) => {
    const weekDays = (task as any).weekDays;
    const monthDay = (task as any).monthDay;

    if (monthDay !== null && monthDay !== undefined) {
      if (monthDay !== currentDayOfMonth) {
        return false;
      }
    }

    if (weekDays && Array.isArray(weekDays) && weekDays.length > 0) {
      if (!weekDays.includes(currentDayOfWeek)) {
        return false;
      }
    }

    return true;
  };

  // Quick-chip filter — применяется поверх категории/исполнителя.
  // AND-семантика: «С премией» + «Журнальные» = только journal-задачи
  // с price > 0.
  const passesChips = (task: typeof tasks[0]): boolean => {
    if (chipPhoto && !task.requiresPhoto) return false;
    if (chipBonus && (!task.price || task.price <= 0)) return false;
    if (chipJournal && !((task as { journalLink?: string | null }).journalLink)) return false;
    return true;
  };

  const baseFilteredTasks = (
    user?.isAdmin
      ? tasks
          .filter(task => {
            if (filterByUserId === "all") return true;
            if (filterByUserId === "unassigned") return !task.workerId;
            return task.workerId === parseInt(filterByUserId);
          })
          .filter(task => {
            if (filterByCategory === "all") return true;
            if (filterByCategory === "uncategorized") return !(task as any).category;
            return (task as any).category === filterByCategory;
          })
      : tasks
          .filter(task => task.workerId === user?.id && isTaskVisibleToday(task))
          .filter(task => {
            if (filterByCategory === "all") return true;
            if (filterByCategory === "uncategorized") return !(task as any).category;
            return (task as any).category === filterByCategory;
          })
  ).filter(passesChips);

  // Подсчёт задач по scope ДО применения фильтра — чтобы табы
  // показывали реальное число (а не отфильтрованное по выбранному
  // табу). Так юзер видит «у меня 5 общих задач, перейду к ним».
  const scopeCounts = baseFilteredTasks.reduce(
    (acc, task) => {
      const scope = getTaskScope(task);
      if (scope === "shared") acc.shared += 1;
      else acc.personal += 1;
      return acc;
    },
    { personal: 0, shared: 0 }
  );
  const hasSharedTasks = scopeCounts.shared > 0;

  // Применяем scope-фильтр (только если табы реально показываются).
  const scopeFilteredTasks =
    hasSharedTasks && taskTab !== "all"
      ? baseFilteredTasks.filter((task) => getTaskScope(task) === taskTab)
      : baseFilteredTasks;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTasks = normalizedSearch
    ? scopeFilteredTasks.filter((task) => {
        const haystack = [
          task.title,
          (task as any).description,
          (task as any).category,
          getUserName(task.workerId),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : scopeFilteredTasks;

  const completedCount = filteredTasks.filter(t => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllCompleted = completedCount === totalCount && totalCount > 0;

  // Streak — для воркера. Считаем по «есть ли хоть одна закрытая лично
  // тобой задача сегодня». Локально в localStorage (см. use-streak.ts).
  // Keyboard shortcuts: /, n, ?, g h. Дёшево — глобальный listener.
  useKeyboardShortcuts({
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onNewTask: () => {
      // Кнопка «новая задача» доступна только админу/руководителю,
      // воркеру эту команду игнорируем (canManageTasks ниже считается
      // от user'а — но переменная в этом scope ещё не объявлена,
      // делаем прямую проверку через user).
      if (user?.isAdmin) {
        setLocation("/tasks/new");
      }
    },
    onHelp: () => setLocation("/help"),
    onDashboard: () => setLocation("/dashboard"),
  });

  const ownCompletedToday =
    !canManageTasks &&
    tasks.some(
      (t) =>
        t.isCompleted &&
        ((t as { claimedByWorkerId?: number | null }).claimedByWorkerId ?? null) === null &&
        (!user?.id || t.workerId === user.id),
    );
  const streakDays = useStreak(user?.id, ownCompletedToday);

  /**
   * Открыть журнальную форму на стороне WeSetup (или fallback inline).
   * Используется и при клике по карточке, и при клике по кружку
   * для journal-задач — UX единообразный, не зависит от того, куда
   * именно ткнул сотрудник.
   */
  const openJournalForm = async (taskId: number) => {
    try {
      const response = await fetch(
        `/api/wesetup/task-fill-url?taskId=${taskId}`,
        { credentials: "include" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        throw new Error(data?.message || `task-fill-url ${response.status}`);
      }
      window.location.href = data.url;
    } catch (err: any) {
      console.error("[dashboard] task-fill-url failed", err);
      // Fallback — inline-форма, чтобы сотрудник всё равно мог
      // выполнить задачу, даже если WeSetup временно недоступен.
      setJournalTaskId(taskId);
    }
  };

  const isJournalTask = (task: typeof tasks[0]): boolean => {
    const category = (task as { category?: string | null }).category ?? "";
    const hasJournalLink = Boolean(
      (task as { journalLink?: string | null }).journalLink
    );
    return hasJournalLink || category.startsWith("WeSetup · ");
  };

  // getTaskScope — function declaration (а не const arrow), потому что
  // используется в `scopeCounts` reduce'е выше по файлу. const-arrow
  // не hoisted и в TDZ давал «can't access lexical declaration … before
  // initialization» при первом рендере (см. ErrorBoundary screenshot
  // 2026-04-28). Function declaration hoisted в начало enclosing scope —
  // безопасно вызывать раньше визуального места объявления.
  function getTaskScope(
    task: typeof tasks[0]
  ): "personal" | "shared" {
    const raw = (task as { journalLink?: string | null }).journalLink;
    if (!raw) return "personal";
    try {
      const parsed = JSON.parse(raw) as { taskScope?: string };
      return parsed.taskScope === "shared" ? "shared" : "personal";
    } catch {
      return "personal";
    }
  }

  /**
   * Клик по самой карточке. Раньше всегда открывал TaskViewDialog —
   * для журнальных задач это была «не та» форма, у воркера сбивалось
   * представление: кружок ведёт на одно, блок на другое. Теперь:
   *   • Журнальная незакрытая задача → журнальная форма (то же что
   *     даёт кружок) — единый контракт «один тап = одно действие».
   *   • Свободная незакрытая задача → диалог (там photo + comment).
   *   • Любая закрытая задача → диалог (просмотр / отмена).
   */
  const handleTaskClick = (task: typeof tasks[0]) => {
    if (!task.isCompleted && isJournalTask(task)) {
      void openJournalForm(task.id);
      return;
    }
    setSelectedTask(task);
    setIsTaskDialogOpen(true);
  };

  const toggleTaskComplete = async (taskId: number, e?: React.MouseEvent, comment?: string) => {
    if (e) {
      e.stopPropagation();
    }
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Для журнальной задачи кружок ВСЕГДА открывает форму:
    //   - active → пустая форма (или с defaults адаптера) → submit complete
    //   - completed → форма prefilled значениями из журнала → submit
    //     перезаписывает данные, задача остаётся выполненной
    // Это убирает рассинхрон uncomplete/complete в WeSetup и даёт юзеру
    // привычное «открыть и посмотреть/поправить что было записано».
    if (isJournalTask(task)) {
      await openJournalForm(taskId);
      return;
    }

    if (task.isCompleted) {
      uncompleteTask.mutate(taskId);
      return;
    }

    if (task.requiresPhoto && !task.photoUrl) {
      handleTaskClick(task);
      return;
    }

    completeTask.mutate({ id: taskId, comment });
    // Тактильный + аудио feedback для воркера — физическое
    // подтверждение «отметка прошла». Срабатывает только если
    // включено в меню (по умолчанию да). Опт-ин чтобы не раздражать
    // на ночной смене / open-space.
    feedbackTaskComplete();
  };

  const handleTaskComplete = (comment?: string) => {
    if (!selectedTask) return;
    // Журнальная задача (active или completed) — всегда открываем форму
    // task-fill. Из выполненных её нельзя вернуть в работу: compliance —
    // запись в журнале не должна стираться обратным toggle'ом, можно
    // только редактировать (или удалить администратором).
    if (isJournalTask(selectedTask)) {
      void openJournalForm(selectedTask.id);
      setIsTaskDialogOpen(false);
      setSelectedTask(null);
      return;
    }
    if (selectedTask.isCompleted) {
      uncompleteTask.mutate(selectedTask.id);
    } else {
      completeTask.mutate({ id: selectedTask.id, comment });
    }
    setIsTaskDialogOpen(false);
    setSelectedTask(null);
  };

  const handleTaskUpdate = (updatedTask: typeof tasks[0]) => {
    queryClient.setQueryData([api.tasks.list.path], (oldTasks: typeof tasks | undefined) => {
      if (!oldTasks) return [];
      return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
    });
    setSelectedTask(updatedTask);
    queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
  };

  // Loading state
  if (authLoading || loadingTasks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-base text-muted-foreground">
            {authLoading ? "Загрузка..." : "Загрузка задач..."}
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header relative">
        <div className="app-header-content">
          <div className="flex items-center gap-3">
            {/* Menu button */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="header-button"
                aria-label="Меню"
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="header-button"
              aria-label="Обновить"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Title */}
            <div className="min-w-0">
              <h1 className="header-title">Задачи</h1>
              <p className="header-subtitle truncate">
                {user.name || user.phone}
                {user.isAdmin && " (Админ)"}
              </p>
            </div>
          </div>

          {/* Bonus balance for workers */}
          {!user.isAdmin && (user as any).bonusBalance > 0 && (
            <div
              className="bonus-badge cursor-pointer"
              onClick={() => setIsBonusInfoOpen(true)}
            >
              <Coins className="w-5 h-5 text-yellow-300" />
              <span className="bonus-badge-text">{(user as any).bonusBalance} ₽</span>
            </div>
          )}
        </div>

        {/* Dropdown menu — простой conditional render. Раньше был
            обёрнут в AnimatePresence+motion.div, но motion'овский
            inline-style.opacity/transform конфликтовал с CSS-keyframe
            `dropdown-in` так, что меню вообще не появлялось. Эту
            обёртку дважды чинил, не помогало — целиком убрал. CSS
            анимирует вход (180ms fade+slide), exit мгновенный — UX
            небольшая потеря ради надёжности. */}
        {isMenuOpen && (
          <div className="dropdown-menu">
            <button
              type="button"
              className="dropdown-item w-full"
              onClick={() => {
                setIsMenuOpen(false);
                setLocation("/dashboard");
              }}
            >
              <Home className="w-5 h-5 text-primary" />
              <span className="font-medium">Главная</span>
            </button>
            {/* «Создать задачу» — admin + manager (руководитель
                может создавать задачи своим подчинённым). Серверный
                scope-check валидирует workerId на POST. */}
            {canManageTasks && (
              <button
                type="button"
                className="dropdown-item w-full"
                onClick={() => {
                  setIsMenuOpen(false);
                  setLocation("/tasks/new");
                }}
              >
                <Plus className="w-5 h-5 text-primary" />
                <span className="font-medium">Создать задачу</span>
              </button>
            )}
            {/* «Сотрудники» и «Настройки компании» — только админ.
                Руководителю эти страницы не нужны: списком своих
                подчинённых он управляет на стороне WeSetup
                (/settings/staff-hierarchy). */}
            {user.isAdmin && (
              <>
                <button
                  type="button"
                  className="dropdown-item w-full"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setLocation("/admin/users");
                  }}
                >
                  <User className="w-5 h-5 text-primary" />
                  <span className="font-medium">Сотрудники</span>
                </button>
                <button
                  type="button"
                  className="dropdown-item w-full"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setLocation("/admin/invitations");
                  }}
                >
                  <QrCode className="w-5 h-5 text-primary" />
                  <span className="font-medium">Приглашения</span>
                </button>
                <button
                  type="button"
                  className="dropdown-item w-full"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setLocation("/admin/settings");
                  }}
                >
                  <Settings className="w-5 h-5 text-primary" />
                  <span className="font-medium">Настройки</span>
                </button>
              </>
            )}
            {/* Помощь — доступна ВСЕМ. Особенно нужна сотрудникам в
                возрасте: понятные пошаговые инструкции и FAQ. */}
            <button
              type="button"
              className="dropdown-item w-full"
              onClick={() => {
                setIsMenuOpen(false);
                setLocation("/help");
              }}
            >
              <HelpCircle className="w-5 h-5 text-primary" />
              <span className="font-medium">Помощь</span>
            </button>
            <div className="dropdown-divider" />
            {/* Звук+вибро при «Готово». Дефолт — вкл, чтобы воркер
                сразу получил physical-confirmation. Можно выключить
                на ночной смене / open-space если раздражает. */}
            <button
              type="button"
              className="dropdown-item w-full"
              onClick={(e) => {
                e.stopPropagation();
                const next = !feedbackOn;
                setFeedbackEnabled(next);
                setFeedbackOn(next);
              }}
            >
              <span className="w-5 h-5 text-primary">
                {feedbackOn ? "🔔" : "🔕"}
              </span>
              <span className="font-medium flex-1 text-left">
                Звук + вибро
              </span>
              <span
                className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                  feedbackOn
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {feedbackOn ? "вкл" : "выкл"}
              </span>
            </button>
            {/* Тема — доступно ВСЕМ сотрудникам, не только админу.
                Лежит между общим разделом и Выходом, чтобы любой
                воркер мог переключить под себя. */}
            <div className="dropdown-theme-row">
              <Palette className="w-5 h-5 text-primary" />
              <span className="dropdown-theme-label">Тема</span>
              <ThemeSwitcher compact />
            </div>
            <div className="dropdown-divider" />
            <button
              type="button"
              className="dropdown-item danger w-full"
              onClick={async () => {
                setIsMenuOpen(false);
                await logout();
                setLocation("/");
              }}
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Выход</span>
            </button>
            <button
              type="button"
              className="dropdown-item danger w-full"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Удалить аккаунт безвозвратно? Все ваши данные пропадут. " +
                      "Это действие нельзя отменить."
                  )
                ) {
                  return;
                }
                try {
                  const r = await fetch("/api/auth/me", { method: "DELETE" });
                  const d = await r.json().catch(() => ({}));
                  if (!r.ok) {
                    alert(d?.message || "Не удалось удалить аккаунт");
                    return;
                  }
                  setIsMenuOpen(false);
                  setLocation("/");
                  // Hard reload чтобы сбросить React Query кеш и context.
                  window.location.href = "/";
                } catch {
                  alert("Ошибка сети при удалении аккаунта");
                }
              }}
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Удалить аккаунт</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="app-content">
        {/* Приветствие — «Доброе утро, Иван» + день недели. Помогает
            воркеру сразу понять «программа меня узнала», плюс легче
            ориентироваться какой сегодня день. Не админу. */}
        {!canManageTasks && user ? (
          <GreetingBanner name={user.name ?? null} />
        ) : null}

        {/* Совет дня — одна короткая фраза для воркера. Не баннер,
            не реклама — мягкий приём «общаемся, а не работаем».
            Можно закрыть крестиком, тогда не покажем до завтра. */}
        {!canManageTasks ? <TipOfTheDay /> : null}

        {/* Hero stats: то, что видит сотрудник в первую очередь —
            сколько ещё надо сделать, сколько закрыто, кто опередил,
            и баланс премии. Заменяет минималистичный progress-card. */}
        {totalCount > 0 && (
          <StatHero
            isAdmin={Boolean(user?.isAdmin)}
            totalCount={totalCount}
            completedCount={
              filteredTasks.filter(
                (t) =>
                  t.isCompleted &&
                  ((t as { claimedByWorkerId?: number | null })
                    .claimedByWorkerId ?? null) === null
              ).length
            }
            claimedCount={
              filteredTasks.filter(
                (t) =>
                  t.isCompleted &&
                  ((t as { claimedByWorkerId?: number | null })
                    .claimedByWorkerId ?? null) !== null
              ).length
            }
            bonusBalance={(user as { bonusBalance?: number }).bonusBalance ?? 0}
            streakDays={streakDays}
            onBonusClick={() => setIsBonusInfoOpen(true)}
          />
        )}

        {/* «Молодец!» баннер — когда у воркера активных задач не осталось.
            Цель: видимая позитивная отметка вместо пустого конца списка.
            Не админу (admin видит все задачи всех — там «всё закрыто»
            редко и неинтересно как акцент). */}
        {!canManageTasks &&
          totalCount > 0 &&
          completedCount === totalCount && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="all-done-banner"
              role="status"
              aria-live="polite"
            >
              {/* Confetti — 8 эмодзи поднимаются один раз при показе
                  баннера. CSS-only, без зависимостей. */}
              <div className="all-done-confetti" aria-hidden="true">
                <span>🎉</span>
                <span>✨</span>
                <span>⭐</span>
                <span>🎊</span>
                <span>💫</span>
                <span>🎈</span>
                <span>🌟</span>
                <span>🥳</span>
              </div>
              <div className="all-done-emoji">🎉</div>
              <div className="all-done-text">
                <div className="all-done-title">Молодец!</div>
                <div className="all-done-subtitle">
                  Все задачи на сегодня закрыты. Отдыхай или подскажи коллеге.
                </div>
              </div>
            </motion.div>
          )}

        {/* Scope tabs — show only when there are shared tasks (event-log
            journals like acceptance, complaints). Personal-only orgs
            never see these tabs (no extra clutter). */}
        {hasSharedTasks ? (
          <div className="scope-tabs">
            <button
              type="button"
              onClick={() => setTaskTab("all")}
              className={`scope-tab ${taskTab === "all" ? "scope-tab-active" : ""}`}
            >
              Все
              <span className="scope-tab-count">
                {scopeCounts.personal + scopeCounts.shared}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTaskTab("personal")}
              className={`scope-tab ${taskTab === "personal" ? "scope-tab-active" : ""}`}
            >
              Мои задачи
              <span className="scope-tab-count">{scopeCounts.personal}</span>
            </button>
            <button
              type="button"
              onClick={() => setTaskTab("shared")}
              className={`scope-tab ${taskTab === "shared" ? "scope-tab-active" : ""}`}
            >
              Общие задачи смены
              <span className="scope-tab-count">{scopeCounts.shared}</span>
            </button>
          </div>
        ) : null}

        {/* Filters */}
        {(user?.isAdmin || categories.length > 0 || tasks.length > 6) && (
          <div className="filters-bar">
            <div className="relative w-full flex-1 sm:min-w-[220px] sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск задач (нажми / для фокуса)"
                className="h-10 w-full rounded-xl border-input bg-background pl-9 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {categories.length > 0 && (
              <Select value={filterByCategory} onValueChange={setFilterByCategory}>
                <SelectTrigger className="h-10 w-full rounded-xl border-input bg-background text-sm font-medium text-foreground sm:w-auto sm:min-w-[140px]">
                  <Tag className="w-4 h-4 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Категория" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все категории</SelectItem>
                  <SelectItem value="uncategorized">Без категории</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {user?.isAdmin && (
              <Select value={filterByUserId} onValueChange={setFilterByUserId}>
                <SelectTrigger className="h-10 w-full rounded-xl border-input bg-background text-sm font-medium text-foreground sm:w-auto sm:min-w-[150px]">
                  <User className="w-4 h-4 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Исполнитель" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все сотрудники</SelectItem>
                  <SelectItem value="unassigned">Не назначенные</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name || u.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Quick filter chips — быстрые тумблеры поверх стандартных
            фильтров. Скрываем когда задач слишком мало (меньше 4)
            чтобы не плодить кнопки на пустом списке. */}
        {tasks.length >= 4 ? (
          <div className="quick-chips">
            <button
              type="button"
              className={`quick-chip ${chipPhoto ? "quick-chip-active" : ""}`}
              onClick={() => setChipPhoto((v) => !v)}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>С фото</span>
            </button>
            <button
              type="button"
              className={`quick-chip ${chipBonus ? "quick-chip-active" : ""}`}
              onClick={() => setChipBonus((v) => !v)}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>С премией</span>
            </button>
            <button
              type="button"
              className={`quick-chip ${chipJournal ? "quick-chip-active" : ""}`}
              onClick={() => setChipJournal((v) => !v)}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Журнальные</span>
            </button>
            {chipPhoto || chipBonus || chipJournal ? (
              <button
                type="button"
                className="quick-chip quick-chip-reset"
                onClick={() => {
                  setChipPhoto(false);
                  setChipBonus(false);
                  setChipJournal(false);
                }}
              >
                <X className="w-3.5 h-3.5" />
                <span>Сбросить</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Task List */}
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-emoji" aria-hidden="true">
              {canManageTasks ? "📋" : "☕"}
            </div>
            <div className="empty-state-icon">
              <Inbox className="w-12 h-12 text-muted-foreground dark:text-[#c4b5fd]" />
            </div>
            <h3 className="empty-state-title">
              {canManageTasks ? "Нет задач" : "Сегодня задач нет"}
            </h3>
            <p className="empty-state-text">
              {canManageTasks
                ? "Создайте первую задачу для начала работы"
                : "Отдохни или загляни позже — задачи появляются по расписанию."}
            </p>
            {canManageTasks ? (
              <button
                onClick={() => setLocation("/tasks/new")}
                className="empty-state-button"
              >
                <Plus className="w-5 h-5" />
                Создать задачу
              </button>
            ) : (
              <button
                onClick={() => setLocation("/help")}
                className="empty-state-button-secondary"
              >
                <HelpCircle className="w-5 h-5" />
                Как пользоваться
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Phase 4: верификер видит здесь все «submitted» задачи
                от своих подчинённых с кнопками Принять/Отклонить.
                Если задач нет — компонент рендерит null. */}
            <VerificationQueue />
            <GroupedTaskList
            activeTasks={filteredTasks.filter((t) => !t.isCompleted)}
            completedTasks={filteredTasks.filter(
              (t) =>
                Boolean(t.isCompleted) &&
                ((t as { claimedByWorkerId?: number | null }).claimedByWorkerId ?? null) === null
            )}
            claimedByOthersTasks={filteredTasks.filter(
              (t) =>
                Boolean(t.isCompleted) &&
                ((t as { claimedByWorkerId?: number | null }).claimedByWorkerId ?? null) !== null
            )}
            isAdmin={canManageTasks}
            groupByWorker={canManageTasks && groupByWorker}
            onToggleGroupByWorker={() => setGroupByWorker((v) => !v)}
            getUserInitials={getUserInitials}
            getUserName={getUserName}
            getUserShortName={getUserShortName}
            getUserPosition={getUserPosition}
            onTaskClick={handleTaskClick}
            onToggleComplete={toggleTaskComplete}
            onEdit={(id) => setLocation(`/tasks/${id}/edit`)}
            onDuplicate={(task) => {
              setDuplicateTask(task);
              setIsDuplicateDialogOpen(true);
            }}
            onDelete={(id) => {
              if (confirm("Удалить задачу?")) deleteTask.mutate(id);
            }}
            searchQuery={searchQuery}
          />
          </>
        )}

        {/* Footer — простой и информативный, чтобы у пользователя было
            понимание «программа живая, есть куда обратиться». */}
        <footer className="app-footer">
          <div className="app-footer-links">
            <a
              href="/help"
              className="app-footer-link"
              onClick={(e) => {
                e.preventDefault();
                setLocation("/help");
              }}
            >
              Помощь
            </a>
            <span className="app-footer-dot" aria-hidden="true" />
            <a
              href="/instructions"
              className="app-footer-link"
              onClick={(e) => {
                e.preventDefault();
                setLocation("/instructions");
              }}
            >
              Инструкция
            </a>
            <span className="app-footer-dot" aria-hidden="true" />
            <span>TasksFlow · 2026</span>
          </div>
        </footer>
      </main>

      {/* Help-FAB для воркеров — мини-кнопка «?» в правом нижнем
          углу. Бабушки часто теряются в незнакомом интерфейсе и
          ищут где спросить — здесь явный ярлык, ведёт на /help.
          Для админа/руководителя — не показываем, чтобы не путать
          с FAB «создать задачу». */}
      {!canManageTasks && (
        <motion.button
          onClick={() => setLocation("/help")}
          className="help-fab"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 22,
            delay: 0.45,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
          aria-label="Помощь"
          title="Помощь — как пользоваться"
        >
          <HelpCircle className="w-6 h-6" />
        </motion.button>
      )}

      {/* FAB для admin/manager — spring entrance, pulse-glow,
          tap-springback. Один CTA-якорь для создания задачи.
          Руководитель сможет назначать только своим подчинённым
          (server-side scope-check на POST /api/tasks). */}
      {canManageTasks && filteredTasks.length > 0 && (
        <motion.button
          onClick={() => setLocation("/tasks/new")}
          className="fab-button"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 22,
            delay: 0.35,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
        >
          <Plus className="w-7 h-7" />
        </motion.button>
      )}

      {/* Dialogs */}
      {user && (
        <TaskViewDialog
          task={selectedTask}
          open={isTaskDialogOpen}
          onOpenChange={setIsTaskDialogOpen}
          onComplete={handleTaskComplete}
          canComplete={true}
          onTaskUpdate={handleTaskUpdate}
        />
      )}
      {journalTaskId !== null ? (
        <TaskFormFiller
          taskId={journalTaskId}
          open={journalTaskId !== null}
          onOpenChange={(v) => {
            if (!v) setJournalTaskId(null);
          }}
          onCompleted={() => {
            // Same key useTasks() subscribes to — was using wrong key
            // before, dashboard didn't refetch after journal submit
            // and task card stayed «не выполнено» visually.
            queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
          }}
        />
      ) : null}

      {user?.isAdmin && (
        <DuplicateTaskDialog
          task={duplicateTask}
          open={isDuplicateDialogOpen}
          onOpenChange={setIsDuplicateDialogOpen}
        />
      )}

      {/* Streak achievement modal — открывается один раз при достижении
          milestone (7/14/30/60/100/200 дней). Показ воркеру независимо
          от наличия задач сегодня. */}
      {!canManageTasks ? (
        <StreakAchievement userId={user?.id ?? null} streakDays={streakDays} />
      ) : null}

      {/* Onboarding tour — 4 шага для впервые-залогиненного воркера.
          После dismiss флаг tf_onboarded_v1=true в localStorage,
          повторно не показывается. Можно вернуть через /help (там
          вся та же информация). */}
      {!canManageTasks ? <OnboardingTour /> : null}

      {/* Bonus Info Dialog */}
      <Dialog open={isBonusInfoOpen} onOpenChange={setIsBonusInfoOpen}>
        <DialogContent className="bonus-info-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Gift className="w-6 h-6 text-white" />
              </div>
              Дополнительная премия
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-2xl">
              <CalendarCheck className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground/80">
                Премия выплачивается <strong className="text-foreground">2 раза в месяц</strong> — 1 и 16 числа каждого месяца.
              </p>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-500/5 to-green-500/10 rounded-2xl">
              <MessageCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground/80">
                По всем вопросам обращайтесь к <strong className="text-foreground">руководителю или заведующему</strong>.
              </p>
            </div>
            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 rounded-2xl border border-yellow-400/30">
                <Coins className="w-6 h-6 text-yellow-500" />
                <span className="text-2xl font-bold text-foreground">{(user as any)?.bonusBalance || 0} ₽</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
