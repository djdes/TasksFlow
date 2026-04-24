import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers } from "@/hooks/use-users";
import { useTasks, useDeleteTask, useCompleteTask, useUncompleteTask } from "@/hooks/use-tasks";
import { useAuth } from "@/contexts/AuthContext";
import { TaskViewDialog } from "@/components/TaskViewDialog";
import { TaskFormFiller } from "@/components/TaskFormFiller";
import { DuplicateTaskDialog } from "@/components/DuplicateTaskDialog";
import { GroupedTaskList } from "@/components/GroupedTaskList";
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
  User
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
  const [duplicateTask, setDuplicateTask] = useState<Task | null>(null);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBonusInfoOpen, setIsBonusInfoOpen] = useState(false);

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
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["users"] });
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

  const getUserInitials = (userId: number | null) => {
    if (!userId) return "?";
    const foundUser = users.find(u => u.id === userId);
    if (!foundUser) return "?";
    const name = foundUser.name || foundUser.phone;
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

  const filteredTasks = user?.isAdmin
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

  const completedCount = filteredTasks.filter(t => t.isCompleted).length;
  const totalCount = filteredTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllCompleted = completedCount === totalCount && totalCount > 0;

  const handleTaskClick = (task: typeof tasks[0]) => {
    setSelectedTask(task);
    setIsTaskDialogOpen(true);
  };

  const toggleTaskComplete = async (taskId: number, e?: React.MouseEvent, comment?: string) => {
    if (e) {
      e.stopPropagation();
    }
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.isCompleted) {
      uncompleteTask.mutate(taskId);
      return;
    }

    // Journal-bound tasks: redirect the worker to WeSetup's public
    // `/task-fill/<taskId>` page — there they see the SAME add-row
    // form admins use inside the WeSetup journal. No session
    // needed, auth via HMAC token we ask the backend to mint now.
    const category = (task as { category?: string | null }).category ?? "";
    const hasJournalLink = Boolean(
      (task as { journalLink?: string | null }).journalLink
    );
    if (hasJournalLink || category.startsWith("WeSetup · ")) {
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
        // Fallback — just open the old inline form so the worker can
        // still complete the task even if WeSetup is down.
        setJournalTaskId(taskId);
      }
      return;
    }

    if (task.requiresPhoto && !task.photoUrl) {
      handleTaskClick(task);
      return;
    }

    completeTask.mutate({ id: taskId, comment });
  };

  const handleTaskComplete = (comment?: string) => {
    if (selectedTask) {
      if (selectedTask.isCompleted) {
        uncompleteTask.mutate(selectedTask.id);
      } else {
        completeTask.mutate({ id: selectedTask.id, comment });
      }
      setIsTaskDialogOpen(false);
      setSelectedTask(null);
    }
  };

  const handleTaskUpdate = (updatedTask: typeof tasks[0]) => {
    queryClient.setQueryData(["tasks"], (oldTasks: typeof tasks | undefined) => {
      if (!oldTasks) return [];
      return oldTasks.map(task => task.id === updatedTask.id ? updatedTask : task);
    });
    setSelectedTask(updatedTask);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
    <div className={`app-layout ${user?.isAdmin ? 'has-sidebar' : ''}`}>
      {/* Header */}
      <header className="app-header relative">
        <div className="app-header-content">
          <div className="flex items-center gap-3">
            {/* Menu button for non-admin */}
            {!user.isAdmin && (
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="header-button"
                aria-label="Меню"
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}

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

        {/* Dropdown menu for non-admin */}
        {!user.isAdmin && isMenuOpen && (
          <div className="dropdown-menu animate-fade-in">
            <button
              className="dropdown-item w-full"
              onClick={() => setIsMenuOpen(false)}
            >
              <Home className="w-5 h-5 text-primary" />
              <span className="font-medium">Главная</span>
            </button>
            <div className="dropdown-divider" />
            <button
              className="dropdown-item danger w-full"
              onClick={() => {
                setIsMenuOpen(false);
                logout();
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
        {/* Compact Progress Bar */}
        {totalCount > 0 && (
          <div className="progress-card">
            <span className="progress-text">{completedCount}/{totalCount}</span>
            <div className="progress-bar-container">
              <div
                className={`progress-bar-fill ${isAllCompleted ? 'completed' : 'in-progress'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={`progress-percentage ${isAllCompleted ? 'text-green-600' : 'text-gray-700'}`}>
              {progressPercent}%
            </span>
          </div>
        )}

        {/* Filters - only for admin */}
        {user?.isAdmin && (
          <div className="filters-bar">
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
          </div>
        )}

        {/* Task List */}
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Inbox className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="empty-state-title">
              {user?.isAdmin ? "Нет задач" : "Задач на сегодня нет"}
            </h3>
            <p className="empty-state-text">
              {user?.isAdmin
                ? "Создайте первую задачу для начала работы"
                : "Отдохните или проверьте расписание позже"}
            </p>
            {user?.isAdmin && (
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
            completedTasks={filteredTasks.filter((t) => Boolean(t.isCompleted))}
            isAdmin={Boolean(user?.isAdmin)}
            getUserInitials={getUserInitials}
            getUserName={getUserName}
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

      {/* FAB for admin */}
      {user?.isAdmin && filteredTasks.length > 0 && (
        <button
          onClick={() => setLocation("/tasks/new")}
          className="fab-button"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

      {/* Bottom Navigation */}
      {user?.isAdmin && (
        <nav className="bottom-nav">
          <div className="bottom-nav-content">
            <button className="bottom-nav-item active">
              <Home className="w-5 h-5" />
              <span>Главная</span>
            </button>

            <button
              className="bottom-nav-item"
              onClick={() => setLocation("/admin/users")}
            >
              <User className="w-5 h-5" />
              <span>Сотрудники</span>
            </button>

            <button
              className="bottom-nav-item"
              onClick={() => setLocation("/admin/settings")}
            >
              <Settings className="w-5 h-5" />
              <span>Настройки</span>
            </button>

            <button
              className="bottom-nav-item"
              onClick={() => logout()}
            >
              <LogOut className="w-5 h-5" />
              <span>Выход</span>
            </button>
          </div>
        </nav>
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
            queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
