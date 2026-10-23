import { useMemo, useState } from "react";
import { Redirect, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Hourglass,
  Repeat2,
  XCircle,
} from "lucide-react";
import type { HistoryItem, HistoryStatus, PersonSummary } from "@shared/history";
import { dayOfWeek, shiftDay, TIMEZONE_OPTIONS, utcOffsetLabel } from "@shared/day";
import { useAuth } from "@/contexts/AuthContext";
import { useUsers } from "@/hooks/use-users";
import { csvUrl, useHistoryDay, useReportSummary } from "@/lib/reports-api";
import { getUserInitials } from "@/lib/user-display";
import { avatarTone } from "@/lib/shift-summary";
import { PageSkeleton, ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { PhotoViewer, type ViewerPhoto } from "@/components/PhotoViewer";
import { DayBars } from "@/components/reports/DayBars";
import { useLocations } from "@/hooks/use-locations";

/**
 * «История и отчёты». Журнал дня — кто что сделал, с фото; сводка — по
 * людям и дням за период, с выгрузкой в Excel. Прошлые дни приходят из
 * истории (её пишет ночной сброс), сегодняшний — из живых задач.
 * Сотрудник видит только себя, руководитель — своих, админ — всех.
 */
type Tab = "day" | "summary";
type Period = "7" | "30" | "month";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

function dayTitle(day: string, today: string | null): string {
  if (today && day === today) return "Сегодня";
  if (today && day === shiftDay(today, -1)) return "Вчера";
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function dayMeta(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}, ${WEEKDAYS[dayOfWeek(day)]}`;
}

function periodRange(period: Period, today: string): { from: string; to: string } {
  if (period === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: shiftDay(today, period === "7" ? -6 : -29), to: today };
}

const STATUS: Record<HistoryStatus, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  done: { label: "Сделано", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  submitted: { label: "На проверке", icon: Clock3, tone: "text-sky-600 dark:text-sky-400" },
  claimed: { label: "Сделал коллега", icon: Repeat2, tone: "text-muted-foreground" },
  pending: { label: "Ждёт", icon: Hourglass, tone: "text-amber-600 dark:text-amber-400" },
  missed: { label: "Не сделано", icon: XCircle, tone: "text-[#d03b3b]" },
};

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

function photosOf(item: HistoryItem): ViewerPhoto[] {
  const own = item.photoUrls.map((url) => ({ url, label: item.title }));
  const fromChecklist = (item.checklist ?? []).flatMap((c) => (c.photoUrls ?? []).map((url) => ({ url, label: c.title })));
  return [...own, ...fromChecklist];
}

export default function Reports() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(search).get("tab") === "summary" ? "summary" : "day"));
  const [day, setDay] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("7");
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null);

  const canPickPeople = !!user && (user.isAdmin || Array.isArray(safeManaged((user as { managedWorkerIds?: unknown }).managedWorkerIds)));
  const { data: users = [] } = useUsers();
  const { data: locations = [] } = useLocations(canPickPeople);
  const history = useHistoryDay(day, workerId, locationId);
  const today = history.data?.today ?? null;
  const range = today ? periodRange(period, today) : null;
  const summary = useReportSummary(tab === "summary" ? range : null, workerId, locationId);

  const names = useMemo(() => new Map(users.map((u) => [u.id, u.name || u.phone || `#${u.id}`])), [users]);
  const shownDay = history.data?.day ?? day;
  const tz = history.data?.timezone ?? summary.data?.timezone ?? null;

  if (authLoading) return <PageSkeleton />;
  if (!user) return <Redirect to="/login" />;

  const groups = groupByWorker(history.data?.items ?? [], names);
  const counts = countStatuses(history.data?.items ?? []);
  const tzLabel = tz ? `${TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz} (${utcOffsetLabel(tz)})` : null;

  return (
    <div className="page-screen reports-page">
      <div className="page-container">
        <button type="button" onClick={() => setLocation("/dashboard")} className="page-back group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          К задачам
        </button>
        <div className="page-header flex items-center gap-3">
          <div className="page-icon">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="page-title">{user.isAdmin || canPickPeople ? "История и отчёты" : "Моя история"}</h1>
            <p className="page-subtitle">Кто что сделал — с фото, по дням и по людям{tzLabel ? ` · время: ${tzLabel}` : ""}</p>
          </div>
        </div>

        <div className="reports-toolbar">
          <div className="reports-tabs" role="tablist" aria-label="Раздел">
            {([["day", "Журнал дня"], ["summary", "Сводка"]] as const).map(([key, title]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className="reports-tab"
                onClick={() => setTab(key)}
              >
                {title}
              </button>
            ))}
          </div>
          {canPickPeople && locations.length > 0 && (
            <label className="reports-person">
              <span className="sr-only">Точка</span>
              <select
                value={locationId ?? ""}
                onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
                className="reports-select"
              >
                <option value="">Все точки</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canPickPeople && (
            <label className="reports-person">
              <span className="sr-only">Сотрудник</span>
              <select
                value={workerId ?? ""}
                onChange={(e) => setWorkerId(e.target.value ? Number(e.target.value) : null)}
                className="reports-select"
              >
                <option value="">Все сотрудники</option>
                {users
                  .slice()
                  .sort((a, b) => (names.get(a.id) ?? "").localeCompare(names.get(b.id) ?? "", "ru"))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {names.get(u.id)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {tab === "day" ? (
          <section className="content-panel reports-panel" aria-labelledby="reports-day-title" aria-busy={history.isFetching || undefined}>
            <div className="reports-daynav">
              <button
                type="button"
                className="reports-iconbtn"
                aria-label="Предыдущий день"
                disabled={!shownDay}
                onClick={() => shownDay && setDay(shiftDay(shownDay, -1))}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="reports-daytitle">
                <h2 id="reports-day-title">{shownDay ? dayTitle(shownDay, today) : "Сегодня"}</h2>
                {shownDay && <span>{dayMeta(shownDay)}</span>}
              </div>
              <button
                type="button"
                className="reports-iconbtn"
                aria-label="Следующий день"
                disabled={!shownDay || !today || shownDay >= today}
                onClick={() => shownDay && setDay(shiftDay(shownDay, 1))}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <input
                type="date"
                className="reports-date"
                aria-label="Выбрать дату"
                value={shownDay ?? ""}
                max={today ?? undefined}
                onChange={(e) => e.target.value && setDay(e.target.value)}
              />
            </div>

            {history.isLoading ? (
              <ListSkeleton rows={4} />
            ) : history.isError && !history.data ? (
              <QueryError onRetry={() => void history.refetch()} message={(history.error as Error)?.message} />
            ) : (
              <div className={history.isFetching ? "reports-refetching" : undefined}>
                {history.data && history.data.items.length > 0 && (
                  <p className="reports-counts">
                    <span>Сделано <b>{counts.done + counts.submitted}</b></span>
                    {counts.missed > 0 && <span>Не сделано <b>{counts.missed}</b></span>}
                    {counts.pending > 0 && <span>Ждёт <b>{counts.pending}</b></span>}
                    {counts.claimed > 0 && <span>Сделали коллеги <b>{counts.claimed}</b></span>}
                  </p>
                )}
                {groups.length === 0 ? (
                  <div className="reports-empty">
                    <p className="reports-empty-title">{shownDay === today ? "Сегодня задач пока нет" : "В этот день записей нет"}</p>
                    <p>История копится с первого дня после обновления: в полночь по времени компании день уходит сюда вместе с фото.</p>
                  </div>
                ) : (
                  <div className="reports-groups">
                    {groups.map((g) => (
                      <PersonDay
                        key={g.workerId}
                        group={g}
                        onPhoto={(photos, index) => setViewer({ photos, index })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <SummaryTab
            period={period}
            onPeriod={setPeriod}
            range={range}
            today={today}
            summary={summary}
            workerId={workerId}
            locationId={locationId}
            onPerson={canPickPeople ? (id) => setWorkerId(id) : undefined}
          />
        )}
      </div>

      <PhotoViewer
        photos={viewer?.photos ?? []}
        index={viewer?.index ?? 0}
        open={!!viewer}
        onOpenChange={(open) => !open && setViewer(null)}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
      />
    </div>
  );
}

function safeManaged(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

type Group = { workerId: number; name: string; items: HistoryItem[]; done: number; total: number };

function groupByWorker(items: HistoryItem[], names: Map<number, string>): Group[] {
  const map = new Map<number, Group>();
  for (const it of items) {
    if (it.workerId == null) continue;
    let g = map.get(it.workerId);
    if (!g) {
      g = { workerId: it.workerId, name: names.get(it.workerId) ?? `Сотрудник ${it.workerId}`, items: [], done: 0, total: 0 };
      map.set(it.workerId, g);
    }
    g.items.push(it);
    if (it.status !== "claimed") g.total++;
    if (it.status === "done" || it.status === "submitted") g.done++;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function countStatuses(items: HistoryItem[]) {
  const c = { done: 0, submitted: 0, claimed: 0, pending: 0, missed: 0 };
  for (const it of items) c[it.status]++;
  return c;
}

function PersonDay({ group, onPhoto }: { group: Group; onPhoto: (photos: ViewerPhoto[], index: number) => void }) {
  return (
    <article className="reports-person-day" aria-label={group.name}>
      <header>
        <span className="reports-avatar" data-tone={avatarTone(group.workerId) ?? undefined} aria-hidden="true">
          {getUserInitials({ name: group.name })}
        </span>
        <span className="reports-person-name">{group.name}</span>
        {group.total > 0 && (
          <span className="reports-person-score">
            {group.done} из {group.total}
          </span>
        )}
      </header>
      <ul>
        {group.items.map((it) => {
          const st = STATUS[it.status];
          const Icon = st.icon;
          const photos = photosOf(it);
          const checklistDone = it.checklist ? it.checklist.filter((c) => c.done).length : 0;
          return (
            <li key={it.key} className="reports-item" data-status={it.status}>
              <Icon className={`reports-item-icon ${st.tone}`} aria-hidden="true" />
              <div className="reports-item-main">
                <p className="reports-item-title">{it.title}</p>
                <p className="reports-item-meta">
                  <span className={st.tone}>{st.label}</span>
                  {it.time && <span>{it.time}</span>}
                  {it.status === "missed" && it.checklist && checklistDone > 0 && (
                    <span>пункты {checklistDone} из {it.checklist.length}</span>
                  )}
                  {it.category && <span>{it.category}</span>}
                  {it.price > 0 && <span>+{rub(it.price)}</span>}
                </p>
              </div>
              {photos.length > 0 && (
                <div className="reports-thumbs">
                  {photos.slice(0, 3).map((ph, i) => (
                    <button
                      key={ph.url + i}
                      type="button"
                      className="reports-thumb"
                      aria-label={`Фото ${i + 1} из ${photos.length}: ${it.title}`}
                      onClick={() => onPhoto(photos, i)}
                    >
                      <img src={ph.url} alt="" loading="lazy" decoding="async" />
                      {i === 2 && photos.length > 3 && <span className="reports-thumb-more">+{photos.length - 3}</span>}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function SummaryTab({
  period,
  onPeriod,
  range,
  today,
  summary,
  workerId,
  locationId,
  onPerson,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  range: { from: string; to: string } | null;
  today: string | null;
  summary: ReturnType<typeof useReportSummary>;
  workerId: number | null;
  locationId: number | null;
  onPerson?: (id: number) => void;
}) {
  const data = summary.data;
  const totals = data?.totals;
  const base = totals ? totals.done + totals.missed : 0;
  const rate = totals && base > 0 ? Math.round((totals.done / base) * 100) : null;

  return (
    <section className="content-panel reports-panel" aria-labelledby="reports-summary-title" aria-busy={summary.isFetching || undefined}>
      <div className="reports-summary-head">
        <h2 id="reports-summary-title" className="sr-only">Сводка за период</h2>
        <div className="reports-periods" role="radiogroup" aria-label="Период">
          {([["7", "7 дней"], ["30", "30 дней"], ["month", "Этот месяц"]] as const).map(([key, title]) => (
            <button key={key} type="button" role="radio" aria-checked={period === key} className="reports-period" onClick={() => onPeriod(key)}>
              {title}
            </button>
          ))}
        </div>
        {range && (
          <a className="reports-csv" href={csvUrl(range, workerId, locationId)} download>
            <Download className="w-4 h-4" aria-hidden="true" />
            Excel (CSV)
          </a>
        )}
      </div>

      {summary.isLoading || !range ? (
        <ListSkeleton rows={4} />
      ) : summary.isError && !data ? (
        <QueryError onRetry={() => void summary.refetch()} message={(summary.error as Error)?.message} />
      ) : data ? (
        <div className={summary.isFetching ? "reports-refetching" : undefined}>
          <div className="reports-kpis">
            <Kpi label="Сделано" value={String(totals!.done)} />
            <Kpi label="Не сделано" value={String(totals!.missed)} />
            <Kpi label="Выполнение" value={rate === null ? "—" : `${rate}%`} />
            <Kpi label="Премии" value={rub(totals!.bonus)} />
          </div>

          <DayBars days={data.days} from={data.from} to={data.to} today={today ?? data.today} />

          <div className="reports-people" role="table" aria-label="По сотрудникам">
            <div className="reports-people-row reports-people-head" role="row">
              <span role="columnheader">Сотрудник</span>
              <span role="columnheader">Сделано</span>
              <span role="columnheader">Не сделано</span>
              <span role="columnheader">Выполнение</span>
              <span role="columnheader">Премии</span>
            </div>
            {data.people.length === 0 ? (
              <p className="reports-empty">За этот период записей нет.</p>
            ) : (
              data.people.map((p) => <PersonRow key={p.workerId} person={p} onPick={onPerson} />)
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="reports-kpi">
      <span className="reports-kpi-label">{label}</span>
      <span className="reports-kpi-value">{value}</span>
    </div>
  );
}

function PersonRow({ person, onPick }: { person: PersonSummary; onPick?: (id: number) => void }) {
  const pct = person.rate === null ? null : Math.round(person.rate * 100);
  const avatar = (
    <span className="reports-avatar" data-tone={avatarTone(person.workerId) ?? undefined} aria-hidden="true">
      {getUserInitials({ name: person.name })}
    </span>
  );
  return (
    <div role="row" className="reports-people-row">
      <span role="cell" className="reports-people-name">
        {onPick ? (
          <button type="button" onClick={() => onPick(person.workerId)} title="Показать только этого сотрудника">
            {avatar}
            {person.name}
          </button>
        ) : (
          <>
            {avatar}
            {person.name}
          </>
        )}
      </span>
      <span role="cell" data-label="Сделано">{person.done}</span>
      <span role="cell" data-label="Не сделано">{person.missed}</span>
      <span role="cell" data-label="Выполнение" className="reports-meter-cell">
        {pct === null ? (
          "—"
        ) : (
          <>
            <span className="reports-meter" aria-hidden="true">
              <i style={{ width: `${pct}%` }} data-level={pct >= 90 ? "good" : pct >= 70 ? "warn" : "bad"} />
            </span>
            {pct}%
          </>
        )}
      </span>
      <span role="cell" data-label="Премии">{person.bonus > 0 ? rub(person.bonus) : "—"}</span>
    </div>
  );
}
