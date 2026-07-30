import { CalendarClock, AlertTriangle } from "lucide-react";
import { getDueStatus, formatDueBadge } from "@shared/task-visibility";

/**
 * Бейдж срока задачи.
 *
 * Показывается ВСЕМ, а не только админам (в отличие от бейджей расписания):
 * срок и просрочка — это информация для исполнителя, именно он решает,
 * что делать в первую очередь.
 */
export function DueBadge({ dueDate }: { dueDate?: number | null }) {
  const status = getDueStatus(dueDate);
  if (status.kind === "none") return null;

  const label = formatDueBadge(dueDate);
  if (!label) return null;

  if (status.kind === "overdue") {
    return (
      <div
        className="task-badge overdue"
        title={`Просрочено на ${status.daysOverdue} дн.`}
        data-testid="badge-overdue"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Просрочено</span>
      </div>
    );
  }

  return (
    <div
      className={`task-badge ${status.kind === "today" ? "due-today" : "due"}`}
      data-testid="badge-due"
    >
      <CalendarClock className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
  );
}
