import { useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  BookOpen,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Copy,
  Edit2,
  Lock,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type { Task } from "@shared/schema";
import {
  groupTasksByDate,
  type DayGroup,
  type YearGroup,
} from "@/lib/group-tasks";
import { getJournalBonus } from "@/lib/journal-bonus";
import { parseJournalLink } from "@/lib/journal-link-parse";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

/**
 * Staggered-вход для карточек внутри одного дня. Лёгкая каскадная
 * анимация делает первый paint ощутимо «премиальнее», но мы не
 * перебиваем тяжёлым motion-обёрткам поведение задачи (клики
 * остаются мгновенными — анимирована только маунт-фаза).
 */
const dayContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.03 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE_OUT_QUINT as unknown as number[] },
  },
};

/** Плавный коллапс секций (Выполненные / Сделано другими). */
const collapseVariants: Variants = {
  hidden: { opacity: 0, height: 0, transition: { duration: 0.24 } },
  visible: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.36, ease: EASE_OUT_QUINT as unknown as number[] },
  },
};

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
  /** Задачи, выполненные другим сотрудником в рамках race-for-bonus
   *  (claimedByWorkerId !== null). Текущему пользователю эти задачи
   *  выполнить уже нельзя — показываем как «архив», без действий. */
  claimedByOthersTasks?: Task[];
  isAdmin: boolean;
  /** Группировка верхнего уровня по сотруднику (вместо по дате).
   *  Полезно админу/руководителю чтобы сразу видеть кто что не сделал.
   *  Воркеру никогда не показываем этот режим. */
  groupByWorker?: boolean;
  onToggleGroupByWorker?: () => void;
  getUserInitials: (workerId: number | null) => string;
  getUserName: (workerId: number | null) => string;
  /** Короткая форма имени для admin-карточек (фамилия). Если не
   *  передана, фоллбек на getUserName. */
  getUserShortName?: (workerId: number | null) => string;
  /** Должность сотрудника для отображения «ФИО · Должность» в
   *  group-by-worker секциях и сортировки.  Если не передана —
   *  должность не показывается, сортировка только по имени. */
  getUserPosition?: (workerId: number | null) => string | null;
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
    claimedByOthersTasks = [],
    isAdmin,
    groupByWorker = false,
    onToggleGroupByWorker,
    getUserInitials,
    getUserName,
    getUserShortName,
    getUserPosition,
    onTaskClick,
    onToggleComplete,
    onEdit,
    onDuplicate,
    onDelete,
  } = props;
  const shortName = getUserShortName ?? getUserName;

  const activeGroups = useMemo(
    () => groupTasksByDate(activeTasks, "createdAt"),
    [activeTasks]
  );
  const completedGroups = useMemo(
    () => groupTasksByDate(completedTasks, "completedAt"),
    [completedTasks]
  );
  // Phase F: для каждого documentId считаем сколько siblings уже
  // выполнено. Показываем рядом с активной задачей если у неё в
  // journalLink стоит siblingVisibility=true (per-org per-journal
  // флаг от WeSetup).
  const siblingsByDoc = useMemo(() => {
    const map = new Map<
      string,
      Array<{ rowKey: string; label: string; doneByName: string | null }>
    >();
    for (const task of completedTasks) {
      const link = parseJournalLink(
        (task as { journalLink?: string | null }).journalLink ?? null,
      );
      if (!link?.siblingVisibility) continue;
      const arr = map.get(link.documentId) ?? [];
      arr.push({
        rowKey: link.rowKey,
        label: link.label ?? task.title,
        doneByName:
          (task as { workerId?: number | null }).workerId != null
            ? getUserName((task as { workerId: number }).workerId)
            : null,
      });
      map.set(link.documentId, arr);
    }
    return map;
  }, [completedTasks, getUserName]);
  const claimedGroups = useMemo(
    () => groupTasksByDate(claimedByOthersTasks, "completedAt"),
    [claimedByOthersTasks]
  );

  const [completedOpen, setCompletedOpen] = useState(false);
  const [claimedOpen, setClaimedOpen] = useState(false);

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
    // Для журнальных «единичных» задач (single-fillMode) — отдельный
    // бонусный бейдж, чтобы выделялся среди обычного price-зелёного.
    // Не показываем уже-выполненным карточкам: бонус начисляется при
    // выполнении, и держать яркий бейдж после завершения визуально
    // неаккуратно.
    const journalBonus = !isCompleted
      ? getJournalBonus(task as unknown as { journalLink?: string | null })
      : null;
    // Журнальная задача (привязана к WeSetup-документу) — даёт
    // воркеру понять «клик откроет журнальную форму», а не диалог.
    // Раньше клик по карточке всегда открывал TaskViewDialog, что
    // путало: кружок вёл в журнал, блок — в «другую форму».
    const isJournal = Boolean(
      (task as { journalLink?: string | null }).journalLink ||
        (categoryValue ?? "").startsWith("WeSetup · ")
    );
    // Phase F: «соседи закрыли». Берём журнальные siblings (не свою
    // задачу) и фильтруем по siblingVisibility=true в JournalLink.
    const taskLink = parseJournalLink(
      (task as { journalLink?: string | null }).journalLink ?? null,
    );
    const visibleSiblings =
      taskLink && taskLink.siblingVisibility && !isCompleted
        ? (siblingsByDoc.get(taskLink.documentId) ?? []).filter(
            (s) => s.rowKey !== taskLink.rowKey,
          )
        : [];

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
                <div className="worker-info" title={getUserName(task.workerId)}>
                  <div className="worker-avatar">
                    {getUserInitials(task.workerId)}
                  </div>
                  {/* Полное ФИО + должность для admin/manager:
                      «Иванов Сергей · Повар». Без должности руководителю
                      сложно сходу понять, кому в ряду из 30 сотрудников
                      что выдано — задача «Бракераж» у Иванова означает
                      одно если он шеф-повар и совсем другое если он
                      посудомойщик. */}
                  <span>
                    {getUserName(task.workerId)}
                    {getUserPosition?.(task.workerId) ? (
                      <span className="worker-info-position">
                        {" · "}
                        {getUserPosition(task.workerId)}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {isJournal && !isCompleted && (
                <div
                  className="task-badge journal"
                  title="Журнальная форма WeSetup"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Журнал</span>
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
              {journalBonus !== null && !hasPrice && (
                <div className="task-badge bonus" title="Премия за журнал">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+{journalBonus} ₽</span>
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

            {/* Phase F: подсветка «уже сделанных» соседей по журналу.
                Видим только когда WeSetup пометил siblingVisibility=true
                для этого журнала (per-org настройка). */}
            {visibleSiblings.length > 0 && (
              <div className="task-siblings">
                <span className="task-siblings-label">Уже закрыто:</span>
                <span className="task-siblings-list">
                  {visibleSiblings
                    .slice(0, 5)
                    .map((s) =>
                      s.doneByName ? `${s.label} · ${s.doneByName}` : s.label,
                    )
                    .join(" · ")}
                  {visibleSiblings.length > 5
                    ? ` и ещё ${visibleSiblings.length - 5}`
                    : ""}
                </span>
              </div>
            )}
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
              <div
                className={`task-arrow ${
                  isJournal && !isCompleted ? "task-arrow--journal" : ""
                }`}
                aria-hidden="true"
              >
                {isJournal && !isCompleted ? (
                  <BookOpen className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderClaimedCard(task: Task) {
    const claimedByWorkerId =
      (task as { claimedByWorkerId?: number | null }).claimedByWorkerId ?? null;
    const claimerName = getUserName(claimedByWorkerId);
    const claimerInitials = getUserInitials(claimedByWorkerId);
    const journalBonus = getJournalBonus(task as { journalLink?: string | null });

    return (
      <div key={task.id} className="task-card task-card--claimed">
        <div className="flex items-start gap-3">
          <div className="task-checkbox task-checkbox--claimed">
            <Lock className="w-4 h-4" />
          </div>
          <div className="task-content">
            <h3 className="task-title">{task.title}</h3>
            <div className="task-meta">
              <div className="task-badge claimed">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Сделал {claimerName}</span>
              </div>
              {journalBonus !== null && (
                <div className="task-badge claimed-bonus">
                  <Coins className="w-3.5 h-3.5" />
                  <span>−{journalBonus} ₽</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center">
            <div className="worker-avatar worker-avatar--sm" title={claimerName}>
              {claimerInitials}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderDay(
    day: DayGroup,
    cardRenderer: (task: Task) => JSX.Element = renderTaskCard
  ) {
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
        <motion.div
          className="task-list"
          variants={dayContainer}
          initial="hidden"
          animate="visible"
        >
          {day.tasks.map((task) => (
            <motion.div key={task.id} variants={cardVariants}>
              {cardRenderer(task)}
            </motion.div>
          ))}
        </motion.div>
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
  function renderYearGroup(
    year: YearGroup,
    cardRenderer: (task: Task) => JSX.Element = renderTaskCard
  ) {
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
                {month.days.map((day) => renderDay(day, cardRenderer))}
              </div>
            </details>
          ))}
        </div>
      </details>
    );
  }

  const showActiveEmpty = activeGroups.length === 0;
  const showCompletedEmpty = completedGroups.length === 0;
  const hasClaimed = claimedByOthersTasks.length > 0;
  const showClaimedEmpty = claimedGroups.length === 0;

  /**
   * Группировка активных задач по сотруднику — для админа/руководителя.
   * Каждый раздел — один воркер с подсчётом «осталось N» в шапке.
   * Внутри сохраняем разрезание по дням (как в обычном режиме), но
   * только для подмножества данного воркера. Это то самое «вижу что
   * у Иванова 3, у Петрова 5» из ТЗ.
   *
   * Сотрудники без задач не показываются. Несortированные (workerId=null)
   * собраны в отдельный «Без исполнителя» — туда видны задачи, у которых
   * админ ещё не назначил воркера (типичный кейс при создании новой).
   */
  const activeWorkerSections = useMemo(() => {
    if (!groupByWorker) return [];
    const byWorker = new Map<number | "unassigned", Task[]>();
    for (const t of activeTasks) {
      const key = t.workerId ?? ("unassigned" as const);
      const list = byWorker.get(key) ?? [];
      list.push(t);
      byWorker.set(key, list);
    }
    const sections = Array.from(byWorker.entries()).map(([key, list]) => ({
      key: String(key),
      workerId: key === "unassigned" ? null : (key as number),
      tasks: list,
      groups: groupTasksByDate(list, "createdAt"),
    }));
    sections.sort((a, b) => {
      // unassigned всегда сверху — это «надо назначить»
      if (a.workerId === null) return -1;
      if (b.workerId === null) return 1;
      // Если есть getUserPosition — сортируем по должности (alphabetical),
      // потом по имени. Это даёт наглядную группировку по ролям:
      // сначала Администратор смены, потом Бариста, потом Бармен и т.д.
      // (раньше сортировка была «больше задач — выше», но при 50
      // сотрудниках нулевые задачи мешались среди ненулевых).
      if (getUserPosition) {
        const pa = (getUserPosition(a.workerId) ?? "—").toLowerCase();
        const pb = (getUserPosition(b.workerId) ?? "—").toLowerCase();
        const cmp = pa.localeCompare(pb, "ru");
        if (cmp !== 0) return cmp;
      } else {
        // Старое поведение для tenant'ов без position-данных:
        // больше задач — выше.
        if (b.tasks.length !== a.tasks.length)
          return b.tasks.length - a.tasks.length;
      }
      return getUserName(a.workerId).localeCompare(
        getUserName(b.workerId),
        "ru"
      );
    });
    return sections;
  }, [activeTasks, groupByWorker, getUserName, getUserPosition]);

  function renderActiveByWorker() {
    if (activeWorkerSections.length === 0) {
      return (
        <div className="grouped-empty">
          Все задачи на сегодня закрыты — респект!
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {activeWorkerSections.map((section) => {
          const isUnassigned = section.workerId === null;
          const fullName = isUnassigned
            ? "Без исполнителя"
            : getUserName(section.workerId);
          const initials = isUnassigned
            ? "?"
            : getUserInitials(section.workerId);
          const position = isUnassigned
            ? null
            : getUserPosition?.(section.workerId) ?? null;
          return (
            // Default-collapsed: при много-сотрудниковой бригаде
            // развёрнутые секции занимают экраны, до нужного
            // приходится долго листать. Теперь руководитель сам
            // открывает того, кого хочет проверить. Исключение —
            // «Без исполнителя» оставляем default-open, чтобы не
            // упустить незаназначенные задачи.
            <details
              key={section.key}
              open={isUnassigned}
              className="worker-section"
            >
              <summary className="worker-section-header">
                <ChevronDown className="group-chevron w-4 h-4" />
                <div
                  className={`worker-avatar ${
                    isUnassigned ? "worker-avatar--unassigned" : ""
                  }`}
                  aria-hidden="true"
                >
                  {initials}
                </div>
                <span className="worker-section-name">
                  {fullName}
                  {position ? (
                    <span className="worker-section-position">
                      {" · "}
                      {position}
                    </span>
                  ) : null}
                </span>
                <span className="worker-section-count">
                  {section.tasks.length}
                </span>
              </summary>
              <div className="worker-section-body">
                {section.groups.map((g) => renderYearGroup(g))}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grouped-task-list">
      <section className="grouped-section">
        <div className="grouped-section-header grouped-section-header--toolbar">
          <h2 className="grouped-section-title">Активные</h2>
          <span className="grouped-section-count">
            {activeTasks.length}
          </span>
          {isAdmin && onToggleGroupByWorker ? (
            <button
              type="button"
              onClick={onToggleGroupByWorker}
              className="group-mode-toggle"
              title={
                groupByWorker
                  ? "Сейчас группировка по сотруднику — переключить на дату"
                  : "Сейчас по дате — переключить на группировку по сотруднику"
              }
            >
              {groupByWorker ? "По сотруднику" : "По дате"}
            </button>
          ) : null}
        </div>
        {showActiveEmpty && !groupByWorker ? (
          <div className="grouped-empty">
            Все задачи на сегодня закрыты — респект!
          </div>
        ) : groupByWorker ? (
          renderActiveByWorker()
        ) : (
          activeGroups.map((g) => renderYearGroup(g))
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
        <AnimatePresence initial={false}>
          {completedOpen ? (
            <motion.div
              key="completed-body"
              variants={collapseVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              style={{ overflow: "hidden" }}
            >
              {showCompletedEmpty ? (
                <div className="grouped-empty">
                  Выполненных пока нет — будут появляться здесь по дням.
                </div>
              ) : (
                completedGroups.map((g) => renderYearGroup(g))
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      {hasClaimed && (
        <section className="grouped-section grouped-section--claimed">
          <button
            type="button"
            onClick={() => setClaimedOpen((v) => !v)}
            className="grouped-section-header grouped-section-header--clickable"
          >
            <ChevronDown
              className={`group-chevron w-4 h-4 ${
                claimedOpen ? "" : "group-chevron--collapsed"
              }`}
            />
            <Lock className="w-4 h-4 grouped-section-icon" />
            <h2 className="grouped-section-title">Сделано другими</h2>
            <span className="grouped-section-count">
              {claimedByOthersTasks.length}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {claimedOpen ? (
              <motion.div
                key="claimed-body"
                variants={collapseVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                style={{ overflow: "hidden" }}
              >
                {showClaimedEmpty ? (
                  <div className="grouped-empty">
                    Тут появятся задачи, которые забрал другой сотрудник
                    раньше тебя — премию получает первый.
                  </div>
                ) : (
                  claimedGroups.map((g) => renderYearGroup(g, renderClaimedCard))
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}
