import { useMemo, useState } from "react";
import {
  Calendar,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Copy,
  Edit2,
  Tag,
  Trash2,
} from "lucide-react";
import type { Task } from "@shared/schema";
import {
  groupTasksByDate,
  type DayGroup,
  type YearGroup,
} from "@/lib/group-tasks";

const WEEK_DAY_SHORT_NAMES: Record<number, string> = {
  0: "Вс",
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
};

type Props = {
  activeTasks: Task[];
  completedTasks: Task[];
  isAdmin: boolean;
  getUserInitials: (workerId: number | null) => string;
  getUserName: (workerId: number | null) => string;
  onTaskClick: (task: Task) => void;
  onToggleComplete: (taskId: number, e?: React.MouseEvent) => void;
  onEdit: (taskId: number) => void;
  onDuplicate: (task: Task) => void;
  onDelete: (taskId: number) => void;
};

/**
 * Two-section, year → month → day accordion of tasks. Defaults keep the
 * current day expanded everywhere and collapse everything older, so the
 * first paint is always «Сегодня» ready and older work is one tap away.
 *
 * Completed section starts collapsed as a whole — workers care about
 * what's still open; managers can tap to open the archive.
 */
export function GroupedTaskList(props: Props) {
  const {
    activeTasks,
    completedTasks,
    isAdmin,
    getUserInitials,
    getUserName,
    onTaskClick,
    onToggleComplete,
    onEdit,
    onDuplicate,
    onDelete,
  } = props;

  const activeGroups = useMemo(
    () => groupTasksByDate(activeTasks, "createdAt"),
    [activeTasks]
  );
  const completedGroups = useMemo(
    () => groupTasksByDate(completedTasks, "completedAt"),
    [completedTasks]
  );

  const [completedOpen, setCompletedOpen] = useState(false);

  function renderTaskCard(task: Task) {
    const isCompleted = Boolean(task.isCompleted);
    const hasPrice = (task as unknown as { price?: number }).price
      ? ((task as unknown as { price?: number }).price ?? 0) > 0
      : false;
    const priceValue = (task as unknown as { price?: number }).price ?? 0;
    const categoryValue = (task as unknown as { category?: string })
      .category;
    const requiresPhoto = task.requiresPhoto && !task.photoUrl;
    const weekDays = (task as unknown as { weekDays?: number[] | null })
      .weekDays;
    const monthDay = (task as unknown as { monthDay?: number | null })
      .monthDay;

    return (
      <div
        key={task.id}
        className={`task-card ${isCompleted ? "completed" : ""}`}
        onClick={() => onTaskClick(task)}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => onToggleComplete(task.id, e)}
            className={`task-checkbox ${isCompleted ? "checked" : ""}`}
          >
            {isCompleted && <Check className="w-4 h-4 text-white" />}
          </button>

          <div className="task-content">
            <h3 className="task-title">{task.title}</h3>

            <div className="task-meta">
              {isAdmin && task.workerId && (
                <div className="worker-info">
                  <div className="worker-avatar">
                    {getUserInitials(task.workerId)}
                  </div>
                  <span>{getUserName(task.workerId)}</span>
                </div>
              )}
              {requiresPhoto && !isCompleted && (
                <div className="task-badge photo">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Фото</span>
                </div>
              )}
              {hasPrice && (
                <div className="task-badge price">
                  <Coins className="w-3.5 h-3.5" />
                  <span>+{priceValue} ₽</span>
                </div>
              )}
              {categoryValue && (
                <div className="task-badge category">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{categoryValue}</span>
                </div>
              )}
              {isAdmin && weekDays && weekDays.length > 0 && (
                <div className="task-badge schedule">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {[...weekDays]
                      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                      .map((d) => WEEK_DAY_SHORT_NAMES[d])
                      .join(", ")}
                  </span>
                </div>
              )}
              {isAdmin && monthDay && (
                <div className="task-badge schedule">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>{monthDay} число</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center">
            {isAdmin ? (
              <div className="task-actions">
                <button
                  className="task-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task.id);
                  }}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  className="task-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(task);
                  }}
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  className="task-action-btn delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="task-arrow">
                <ChevronRight className="w-5 h-5" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderDay(day: DayGroup) {
    return (
      <div key={day.dayKey} className="group-day">
        <div
          className={`group-day-header ${
            day.isToday ? "group-day-header--today" : ""
          }`}
        >
          <span className="group-day-label">{day.dayLabel}</span>
          <span className="group-day-count">{day.tasks.length}</span>
        </div>
        <div className="task-list">{day.tasks.map(renderTaskCard)}</div>
      </div>
    );
  }

  /**
   * Decide initial open-state per group:
   *   - Year: expanded if it's the current calendar year.
   *   - Month: expanded if it's the current month of the current year.
   *   - Day: always visible inside an expanded month (no day-level
   *     collapse — UX-wise «Сегодня / Вчера / 19 апреля» as pills works
   *     better than three-level accordions). Counts still show.
   *
   * Forced-open state is controlled via <details> `open` attribute. To
   * keep the tree uncontrolled (native browser state), we use defaultOpen
   * via `open` only on initial render.
   */
  function renderYearGroup(year: YearGroup) {
    return (
      <details
        key={year.yearKey}
        open={year.isCurrentYear}
        className="group-year"
      >
        <summary className="group-year-header">
          <ChevronDown className="group-chevron w-4 h-4" />
          <span className="group-year-label">{year.yearLabel}</span>
          <span className="group-year-count">{year.totalTasks}</span>
        </summary>
        <div className="group-year-body">
          {year.months.map((month) => (
            <details
              key={month.monthKey}
              open={month.isCurrentMonthOfCurrentYear || year.months.length === 1}
              className="group-month"
            >
              <summary className="group-month-header">
                <ChevronDown className="group-chevron w-4 h-4" />
                <span className="group-month-label">{month.monthLabel}</span>
                <span className="group-month-count">{month.totalTasks}</span>
              </summary>
              <div className="group-month-body">
                {month.days.map(renderDay)}
              </div>
            </details>
          ))}
        </div>
      </details>
    );
  }

  const showActiveEmpty = activeGroups.length === 0;
  const showCompletedEmpty = completedGroups.length === 0;

  return (
    <div className="grouped-task-list">
      <section className="grouped-section">
        <div className="grouped-section-header">
          <h2 className="grouped-section-title">Активные</h2>
          <span className="grouped-section-count">
            {activeTasks.length}
          </span>
        </div>
        {showActiveEmpty ? (
          <div className="grouped-empty">
            Все задачи на сегодня закрыты — респект!
          </div>
        ) : (
          activeGroups.map(renderYearGroup)
        )}
      </section>

      <section className="grouped-section grouped-section--completed">
        <button
          type="button"
          onClick={() => setCompletedOpen((v) => !v)}
          className="grouped-section-header grouped-section-header--clickable"
        >
          <ChevronDown
            className={`group-chevron w-4 h-4 ${
              completedOpen ? "" : "group-chevron--collapsed"
            }`}
          />
          <h2 className="grouped-section-title">Выполненные</h2>
          <span className="grouped-section-count">
            {completedTasks.length}
          </span>
        </button>
        {completedOpen ? (
          showCompletedEmpty ? (
            <div className="grouped-empty">
              Выполненных пока нет — будут появляться здесь по дням.
            </div>
          ) : (
            completedGroups.map(renderYearGroup)
          )
        ) : null}
      </section>
    </div>
  );
}
