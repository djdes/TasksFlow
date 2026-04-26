import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useUsers } from "@/hooks/use-users";
import { useTasks, useDeleteTask, useCompleteTask, useUncompleteTask } from "@/hooks/use-tasks";
import { useAuth } from "@/contexts/AuthContext";
import { TaskViewDialog } from "@/components/TaskViewDialog";
import { TaskFormFiller } from "@/components/TaskFormFiller";
import { DuplicateTaskDialog } from "@/components/DuplicateTaskDialog";
import { GroupedTaskList } from "@/components/GroupedTaskList";
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
  Palette
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
  const [searchQuery, setSearchQuery] = useState("");
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

  const baseFilteredTasks = user?.isAdmin
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
        });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTasks = normalizedSearch
    ? baseFilteredTasks.filter((task) => {
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
    : baseFilteredTasks;

  const completedCount = filteredTasks.filter(t => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllCompleted = completedCount === totalCount && totalCount > 0;

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
                    setLocation("/admin/settings");
                  }}
                >
                  <Settings className="w-5 h-5 text-primary" />
                  <span className="font-medium">Настройки</span>
                </button>
              </>
            )}
            <div className="dropdown-divider" />
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
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="app-content">
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
            onBonusClick={() => setIsBonusInfoOpen(true)}
          />
        )}

        {/* Filters */}
        {(user?.isAdmin || categories.length > 0 || tasks.length > 6) && (
          <div className="filters-bar">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск задач"
                className="h-10 rounded-xl border-gray-200 bg-white pl-9 text-sm"
              />
            </div>

            {categories.length > 0 && (
              <Select value={filterByCategory} onValueChange={setFilterByCategory}>
                <SelectTrigger className="h-10 w-auto min-w-[140px] rounded-xl text-sm font-medium bg-white border-gray-200">
                  <Tag className="w-4 h-4 mr-1.5 text-gray-400" />
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
                <SelectTrigger className="h-10 w-auto min-w-[150px] rounded-xl text-sm font-medium bg-white border-gray-200">
                  <User className="w-4 h-4 mr-1.5 text-gray-400" />
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

        {/* Task List */}
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Inbox className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="empty-state-title">
              {canManageTasks ? "Нет задач" : "Задач на сегодня нет"}
            </h3>
            <p className="empty-state-text">
              {canManageTasks
                ? "Создайте первую задачу для начала работы"
                : "Отдохните или проверьте расписание позже"}
            </p>
            {canManageTasks && (
              <button
                onClick={() => setLocation("/tasks/new")}
                className="empty-state-button"
              >
                <Plus className="w-5 h-5" />
                Создать задачу
              </button>
            )}
          </div>
        ) : (
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
          />
        )}
      </main>

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
