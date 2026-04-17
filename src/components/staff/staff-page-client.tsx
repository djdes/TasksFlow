"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  StaffAddEmployeeDialog,
  StaffAddPeriodDialog,
  StaffAddPositionDialog,
  StaffArchiveDialog,
  StaffDeleteBlockedDialog,
  StaffEditPositionDialog,
  StaffIikoDialog,
  StaffInstructionDialog,
} from "@/components/staff/staff-dialogs";
import type {
  PositionCategory,
  StaffEmployee,
  StaffPageProps,
  StaffPosition,
} from "@/components/staff/staff-types";

type TabKey = "work-off" | "vacations" | "sick-leaves" | "dismissals";

function generateWorkOffDays(start: Date, count = 20): string[] {
  const out: string[] = [];
  const d = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function formatDayCell(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { top: `${dd}.${mm}`, bottom: dayNames[d.getUTCDay()] + "." };
}

function formatRange(fromIso: string, toIso: string) {
  return `${formatDate(fromIso)} — ${formatDate(toIso)}`;
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

type SortField = "name" | "position" | "date";
type SortOrder = "asc" | "desc";

export function StaffPageClient(props: StaffPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Accordion: all open by default.
  const [orgOpen, setOrgOpen] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState<
    Record<PositionCategory, boolean>
  >({ management: true, staff: true });
  const [openPositions, setOpenPositions] = useState<Set<string>>(
    () => new Set(props.positions.map((p) => p.id))
  );

  const toggleCategory = (k: PositionCategory) =>
    setCategoryOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  const togglePosition = (id: string) =>
    setOpenPositions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Selection for bulk actions.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anySelected = selected.size > 0;
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  // Modal state.
  const [dlg, setDlg] = useState<
    | { kind: "add-position"; categoryKey: PositionCategory }
    | { kind: "edit-position"; position: StaffPosition }
    | { kind: "add-employee"; position: StaffPosition }
    | { kind: "archive"; employee: StaffEmployee }
    | { kind: "delete-blocked"; employee: StaffEmployee }
    | { kind: "iiko" }
    | { kind: "instruction" }
    | {
        kind: "add-period";
        periodKind: "vacation" | "sick_leave" | "dismissal";
      }
    | null
  >(null);

  // Tab state.
  const [tab, setTab] = useState<TabKey>("work-off");
  const [alphabetic, setAlphabetic] = useState(true);

  // Helper data shapes.
  const positionsByCategory = useMemo(() => {
    const groups: Record<PositionCategory, StaffPosition[]> = {
      management: [],
      staff: [],
    };
    for (const p of props.positions) groups[p.categoryKey].push(p);
    return groups;
  }, [props.positions]);

  const employeesByPosition = useMemo(() => {
    const map = new Map<string | null, StaffEmployee[]>();
    const sortedEmployees = [...props.employees].sort((a, b) =>
      a.name.localeCompare(b.name, "ru")
    );
    for (const e of sortedEmployees) {
      const key = e.jobPositionId;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [props.employees]);

  const employeesDisplay = useMemo(() => {
    const copy = [...props.employees];
    if (alphabetic) copy.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return copy;
  }, [props.employees, alphabetic]);

  const workOffSet = useMemo(
    () =>
      new Set(props.workOffDays.map((w) => `${w.userId}::${w.date}`)),
    [props.workOffDays]
  );
  const workOffDates = useMemo(() => generateWorkOffDays(new Date(), 20), []);

  // Sorting for period/dismissal tables.
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const cycleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  function sortRows<T extends { userName: string; positionLabel: string; dateFrom?: string; date?: string }>(
    rows: T[]
  ): T[] {
    const sign = sortOrder === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortField === "name") return sign * a.userName.localeCompare(b.userName, "ru");
      if (sortField === "position") return sign * a.positionLabel.localeCompare(b.positionLabel, "ru");
      const da = a.dateFrom ?? a.date ?? "";
      const dbb = b.dateFrom ?? b.date ?? "";
      return sign * da.localeCompare(dbb);
    });
    return copy;
  }

  // Action handlers.
  async function callJson(url: string, init?: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `Ошибка ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }

  async function handleWorkOffToggle(userId: string, date: string, enabled: boolean) {
    try {
      await callJson("/api/staff/schedules/work-off", {
        method: "POST",
        body: JSON.stringify({ userId, date, enabled }),
      });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleArchive(id: string) {
    try {
      await callJson(`/api/staff/${id}/archive`, { method: "POST" });
      toast.success("Сотрудник в архиве");
      setDlg(null);
      clearSelection();
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleBulkArchive() {
    if (!anySelected) return;
    const ids = Array.from(selected);
    let ok = 0;
    for (const id of ids) {
      try {
        await callJson(`/api/staff/${id}/archive`, { method: "POST" });
        ok++;
      } catch {
        /* ignore single failures, continue */
      }
    }
    toast.success(`В архив: ${ok}/${ids.length}`);
    clearSelection();
    startTransition(() => router.refresh());
  }

  async function tryBulkDelete() {
    if (!anySelected) return;
    const ids = Array.from(selected);
    // We don't have a hard-delete endpoint — using DELETE /api/users/[id].
    let ok = 0;
    let blocked = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
        if (res.ok) ok++;
        else blocked++;
      } catch {
        blocked++;
      }
    }
    if (blocked > 0) {
      // Show the "blocked because referenced in journals" modal for the first
      // blocked employee, matching the reference screen.
      const first = props.employees.find((e) => selected.has(e.id));
      if (first) setDlg({ kind: "delete-blocked", employee: first });
    } else {
      toast.success(`Удалено: ${ok}`);
    }
    clearSelection();
    startTransition(() => router.refresh());
  }

  async function handlePeriodAdd(payload: {
    kind: "vacation" | "sick_leave" | "dismissal";
    userId: string;
    dateFrom: string;
    dateTo?: string;
  }) {
    try {
      if (payload.kind === "dismissal") {
        await callJson("/api/staff/schedules/dismissals", {
          method: "POST",
          body: JSON.stringify({ userId: payload.userId, date: payload.dateFrom }),
        });
      } else {
        await callJson("/api/staff/schedules/periods", {
          method: "POST",
          body: JSON.stringify({
            kind: payload.kind,
            userId: payload.userId,
            dateFrom: payload.dateFrom,
            dateTo: payload.dateTo,
          }),
        });
      }
      toast.success("Запись добавлена");
      setDlg(null);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function deletePeriodRow(id: string, kind: "vacation" | "sick_leave" | "dismissal") {
    try {
      const url =
        kind === "dismissal"
          ? `/api/staff/schedules/dismissals/${id}`
          : `/api/staff/schedules/periods/${id}?kind=${kind}`;
      await callJson(url, { method: "DELETE" });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  const firstSelected = anySelected
    ? props.employees.find((e) => selected.has(e.id)) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/settings"
            className="mb-3 inline-flex items-center gap-2 text-[14px] text-[#6f7282] hover:text-[#0b1024]"
          >
            <ArrowLeft className="size-4" />
            Настройки
          </Link>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
            Сотрудники
          </h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-10 gap-2 rounded-xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#5566f6] shadow-[0_0_0_1px_rgba(240,240,250,0.45)] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
          onClick={() => setDlg({ kind: "instruction" })}
        >
          <BookOpen className="size-4" />
          Инструкция
        </Button>
      </div>

      {/* Bulk-action toolbar. */}
      {anySelected ? (
        <div className="sticky top-[60px] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-[#ececf4] bg-white px-4 py-2.5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#6f7282] hover:bg-[#f5f6ff] hover:text-[#0b1024]"
          >
            <X className="size-4" />
            Выбрано: {selected.size}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size === 1 && firstSelected ? (
              <button
                type="button"
                onClick={() =>
                  firstSelected.jobPositionId
                    ? setDlg({
                        kind: "edit-position",
                        position:
                          props.positions.find(
                            (p) => p.id === firstSelected.jobPositionId
                          )!,
                      })
                    : toast.error("У сотрудника не выбрана должность")
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dcdfed] bg-white px-3 text-[13px] font-medium text-[#0b1024] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
              >
                <Pencil className="size-4" />
                Редактировать
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleBulkArchive}
              disabled={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dcdfed] bg-white px-3 text-[13px] font-medium text-[#0b1024] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff] disabled:opacity-60"
            >
              <Archive className="size-4" />
              Отправить в архив
            </button>
            <button
              type="button"
              onClick={tryBulkDelete}
              disabled={isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ffd2cd] bg-[#fff4f2] px-3 text-[13px] font-medium text-[#d2453d] hover:bg-[#ffecea] disabled:opacity-60"
            >
              <Trash2 className="size-4" />
              Удалить
            </button>
          </div>
        </div>
      ) : null}

      {/* Organisation accordion */}
      <div className="overflow-hidden rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <button
          type="button"
          onClick={() => setOrgOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[#f5f6ff]/60"
        >
          <span className="text-[16px] font-semibold text-[#5566f6]">
            {props.organization.name}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-[#9b9fb3] transition-transform",
              orgOpen && "rotate-180"
            )}
          />
        </button>
        {orgOpen ? (
          <div className="grid gap-4 border-t border-[#ececf4] bg-[#fafbff] p-4 md:grid-cols-2">
            {(["management", "staff"] as PositionCategory[]).map((cat) => (
              <CategoryColumn
                key={cat}
                title={cat === "management" ? "Руководство" : "Сотрудники"}
                categoryKey={cat}
                open={categoryOpen[cat]}
                onToggle={() => toggleCategory(cat)}
                positions={positionsByCategory[cat]}
                openPositions={openPositions}
                togglePosition={togglePosition}
                employeesByPosition={employeesByPosition}
                selected={selected}
                toggleSelected={toggleSelected}
                onAddPosition={() => setDlg({ kind: "add-position", categoryKey: cat })}
                onAddEmployee={(position) => setDlg({ kind: "add-employee", position })}
                onEditPosition={(position) => setDlg({ kind: "edit-position", position })}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-6 border-b border-[#ececf4]">
        {[
          { key: "work-off" as TabKey, label: "График выходных дней" },
          { key: "vacations" as TabKey, label: "График отпусков" },
          { key: "sick-leaves" as TabKey, label: "График больничных" },
          { key: "dismissals" as TabKey, label: "График увольнений" },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative -mb-px pb-3 pt-1 text-[14px] font-medium transition-colors",
                active
                  ? "text-[#0b1024]"
                  : "text-[#9b9fb3] hover:text-[#6f7282]"
              )}
            >
              {t.label}
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#5566f6]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <section className="space-y-4">
        <h2 className="text-center text-[18px] font-semibold text-[#0b1024]">
          {tab === "work-off" && "График выходных дней"}
          {tab === "vacations" && "График отпусков"}
          {tab === "sick-leaves" && "График больничных"}
          {tab === "dismissals" && "График увольнений"}
        </h2>

        <div className="space-y-2 text-[13px] leading-[1.55] text-[#6f7282]">
          <p>
            Данный график заполняется ТОЛЬКО для того, чтобы автоматически
            заполнять Гигиенический журнал. Ни на какие другие журналы данная
            настройка не влияет.
          </p>
          {tab === "work-off" && (
            <p>
              Если поставить здесь отметку, то при Автозаполнении в Гигиеническом
              журнале поставится значение <b>&quot;В&quot;</b>
            </p>
          )}
          {tab === "vacations" && (
            <p>
              Если добавить здесь строку, то при Автозаполнении в Гигиеническом
              журнале поставится значение <b>&quot;Отп&quot;</b>
            </p>
          )}
          {tab === "sick-leaves" && (
            <p>
              Если добавить здесь строку, то при Автозаполнении в Гигиеническом
              журнале поставится значение <b>&quot;Б/л&quot;</b>
            </p>
          )}
          {tab === "dismissals" && (
            <p>
              Если добавить здесь строку, то в указанную дату сотрудник
              перенесётся в <b>&quot;Архив&quot;</b>.
            </p>
          )}
        </div>

        {tab === "work-off" ? (
          <WorkOffGrid
            employees={employeesDisplay}
            positions={props.positions}
            dates={workOffDates}
            workOffSet={workOffSet}
            alphabetic={alphabetic}
            onToggleAlpha={() => setAlphabetic((v) => !v)}
            onIikoClick={() => setDlg({ kind: "iiko" })}
            onToggleDay={handleWorkOffToggle}
          />
        ) : tab === "dismissals" ? (
          <PeriodsTable
            rows={sortRows(props.dismissals)}
            kind="dismissal"
            onAdd={() => setDlg({ kind: "add-period", periodKind: "dismissal" })}
            onDelete={deletePeriodRow}
            onSort={cycleSort}
            sortField={sortField}
            sortOrder={sortOrder}
          />
        ) : (
          <PeriodsTable
            rows={
              tab === "vacations"
                ? sortRows(props.vacations)
                : sortRows(props.sickLeaves)
            }
            kind={tab === "vacations" ? "vacation" : "sick_leave"}
            onAdd={() =>
              setDlg({
                kind: "add-period",
                periodKind: tab === "vacations" ? "vacation" : "sick_leave",
              })
            }
            onDelete={deletePeriodRow}
            onSort={cycleSort}
            sortField={sortField}
            sortOrder={sortOrder}
          />
        )}
      </section>

      {/* Modals */}
      {dlg?.kind === "add-position" ? (
        <StaffAddPositionDialog
          categoryKey={dlg.categoryKey}
          open
          onClose={() => setDlg(null)}
          onCreated={() => {
            setDlg(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
      {dlg?.kind === "edit-position" ? (
        <StaffEditPositionDialog
          position={dlg.position}
          open
          onClose={() => setDlg(null)}
          onUpdated={() => {
            setDlg(null);
            clearSelection();
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
      {dlg?.kind === "add-employee" ? (
        <StaffAddEmployeeDialog
          position={dlg.position}
          positions={props.positions}
          open
          onClose={() => setDlg(null)}
          onCreated={() => {
            setDlg(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
      {dlg?.kind === "archive" ? (
        <StaffArchiveDialog
          employee={dlg.employee}
          open
          onClose={() => setDlg(null)}
          onConfirm={() => handleArchive(dlg.employee.id)}
        />
      ) : null}
      {dlg?.kind === "delete-blocked" ? (
        <StaffDeleteBlockedDialog
          employee={dlg.employee}
          open
          onClose={() => setDlg(null)}
        />
      ) : null}
      {dlg?.kind === "iiko" ? (
        <StaffIikoDialog open onClose={() => setDlg(null)} />
      ) : null}
      {dlg?.kind === "instruction" ? (
        <StaffInstructionDialog open onClose={() => setDlg(null)} />
      ) : null}
      {dlg?.kind === "add-period" ? (
        <StaffAddPeriodDialog
          kind={dlg.periodKind}
          positions={props.positions}
          employees={props.employees}
          open
          onClose={() => setDlg(null)}
          onConfirm={handlePeriodAdd}
        />
      ) : null}
    </div>
  );
}

function CategoryColumn(props: {
  title: string;
  categoryKey: PositionCategory;
  open: boolean;
  onToggle: () => void;
  positions: StaffPosition[];
  openPositions: Set<string>;
  togglePosition: (id: string) => void;
  employeesByPosition: Map<string | null, StaffEmployee[]>;
  selected: Set<string>;
  toggleSelected: (id: string) => void;
  onAddPosition: () => void;
  onAddEmployee: (position: StaffPosition) => void;
  onEditPosition: (position: StaffPosition) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={props.onToggle}
          className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#0b1024]"
        >
          {props.title}
          <ChevronDown
            className={cn(
              "size-4 text-[#9b9fb3] transition-transform",
              props.open && "rotate-180"
            )}
          />
        </button>
        <button
          type="button"
          onClick={props.onAddPosition}
          aria-label="Добавить должность"
          className="inline-flex size-7 items-center justify-center rounded-lg text-[#5566f6] hover:bg-[#eef1ff]"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {props.open ? (
        <div className="space-y-2">
          {props.positions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#dcdfed] bg-white px-4 py-6 text-center text-[13px] text-[#9b9fb3]">
              Пока нет должностей. Нажмите <b>+</b>, чтобы добавить.
            </p>
          ) : (
            props.positions.map((p) => {
              const employees = props.employeesByPosition.get(p.id) ?? [];
              const open = props.openPositions.has(p.id);
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-[#ececf4] bg-white"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => props.onEditPosition(p)}
                      className="inline-flex size-5 items-center justify-center rounded-full border-2 border-[#d0d4e6] text-transparent hover:border-[#5566f6] hover:text-[#5566f6]"
                      aria-label="Редактировать должность"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => props.togglePosition(p.id)}
                      className="flex flex-1 items-center justify-between gap-2 text-left"
                    >
                      <span className="text-[14px] font-medium text-[#0b1024]">
                        {p.name}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 text-[#9b9fb3] transition-transform",
                          open && "rotate-180"
                        )}
                      />
                    </button>
                  </div>
                  {open ? (
                    <div className="border-t border-[#ececf4] bg-[#fafbff]">
                      {employees.map((e) => (
                        <div
                          key={e.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-[13px] transition-colors",
                            props.selected.has(e.id) && "bg-[#eef1ff]"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={props.selected.has(e.id)}
                            onChange={() => props.toggleSelected(e.id)}
                            className="size-4 cursor-pointer rounded border-[#d0d4e6] text-[#5566f6] focus:ring-[#5566f6]"
                          />
                          <span className="flex-1 text-[#0b1024]">
                            {e.name}
                            {e.isSelf ? (
                              <span className="ml-1 text-[11px] text-[#9b9fb3]">
                                (вы)
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => props.onAddEmployee(p)}
                        className="flex w-full items-center justify-center gap-1 border-t border-[#ececf4] px-3 py-2 text-[13px] font-medium text-[#5566f6] hover:bg-[#eef1ff]"
                      >
                        <Plus className="size-3.5" />
                        Добавить
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function WorkOffGrid(props: {
  employees: StaffEmployee[];
  positions: StaffPosition[];
  dates: string[];
  workOffSet: Set<string>;
  alphabetic: boolean;
  onToggleAlpha: () => void;
  onIikoClick: () => void;
  onToggleDay: (userId: string, date: string, enabled: boolean) => void;
}) {
  const posNameById = new Map<string, string>(
    props.positions.map((p) => [p.id, p.name])
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <span
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              props.alphabetic ? "bg-[#5566f6]" : "bg-[#d0d4e6]"
            )}
          >
            <input
              type="checkbox"
              checked={props.alphabetic}
              onChange={props.onToggleAlpha}
              className="peer absolute inset-0 cursor-pointer appearance-none"
            />
            <span
              aria-hidden
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all",
                props.alphabetic ? "left-[18px]" : "left-0.5"
              )}
            />
          </span>
          <span className="text-[14px] font-medium text-[#0b1024]">
            Фамилии сотрудников по алфавиту
          </span>
        </label>
      </div>

      <Button
        type="button"
        onClick={props.onIikoClick}
        className="h-10 gap-2 rounded-xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_8px_20px_-12px_rgba(85,102,246,0.6)] hover:bg-[#4a5bf0]"
      >
        <UserPlus className="size-4" />
        Заполнить выходные дни из Айко
      </Button>

      <div className="overflow-x-auto rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        {props.employees.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-[#9b9fb3]">
            Нет сотрудников. Добавьте хотя бы одного, чтобы управлять графиком.
          </p>
        ) : (
          <table className="w-full min-w-[900px] border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#f5f6ff] text-[#6f7282]">
                <th className="sticky left-0 z-10 bg-[#f5f6ff] px-3 py-2 text-left font-medium">
                  Ф.И.О. работника
                </th>
                <th className="px-3 py-2 text-left font-medium">Должность</th>
                {props.dates.map((iso) => {
                  const { top, bottom } = formatDayCell(iso);
                  return (
                    <th
                      key={iso}
                      className="min-w-[44px] px-1 py-2 text-center font-normal leading-tight"
                    >
                      <div className="text-[11px]">{top}</div>
                      <div className="text-[10px] text-[#9b9fb3]">{bottom}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {props.employees.map((e) => {
                const positionName = e.jobPositionId
                  ? posNameById.get(e.jobPositionId) ?? e.positionTitle ?? "—"
                  : e.positionTitle || "—";
                return (
                  <tr key={e.id} className="border-t border-[#ececf4]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-[#0b1024]">
                      {e.name}
                    </td>
                    <td className="px-3 py-2 text-[#6f7282]">{positionName}</td>
                    {props.dates.map((iso) => {
                      const checked = props.workOffSet.has(`${e.id}::${iso}`);
                      return (
                        <td
                          key={iso}
                          className="border-l border-[#f0f1f8] px-1 py-1 text-center"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(evt) =>
                              props.onToggleDay(e.id, iso, evt.target.checked)
                            }
                            className="size-3.5 cursor-pointer rounded border-[#d0d4e6] text-[#5566f6] focus:ring-[#5566f6]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SortHead({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6f7282] hover:text-[#0b1024]"
    >
      {label}
      <ArrowUpDown
        className={cn(
          "size-3.5",
          active ? "text-[#5566f6]" : "text-[#c7ccea]"
        )}
      />
      {active ? (
        <span className="text-[10px] text-[#5566f6]">
          {order === "asc" ? "↑" : "↓"}
        </span>
      ) : null}
    </button>
  );
}

function PeriodsTable(props: {
  rows: Array<{
    id: string;
    userId: string;
    userName: string;
    positionLabel: string;
    dateFrom?: string;
    dateTo?: string;
    date?: string;
  }>;
  kind: "vacation" | "sick_leave" | "dismissal";
  onAdd: () => void;
  onDelete: (id: string, kind: "vacation" | "sick_leave" | "dismissal") => void;
  onSort: (field: SortField) => void;
  sortField: SortField;
  sortOrder: SortOrder;
}) {
  const dateLabel =
    props.kind === "vacation"
      ? "Даты отпуска"
      : props.kind === "sick_leave"
        ? "Даты больничного"
        : "Дата увольнения";
  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={props.onAdd}
        className="h-10 gap-2 rounded-xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_8px_20px_-12px_rgba(85,102,246,0.6)] hover:bg-[#4a5bf0]"
      >
        <Plus className="size-4" />
        Добавить
      </Button>

      <div className="overflow-hidden rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#f5f6ff]">
              <th className="w-[44px] px-3 py-2" />
              <th className="w-[60px] px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-[#9b9fb3]">
                № п/п
              </th>
              <th className="px-3 py-2 text-left">
                <SortHead
                  label="Ф.И.О. работника"
                  active={props.sortField === "name"}
                  order={props.sortOrder}
                  onClick={() => props.onSort("name")}
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHead
                  label="Должность"
                  active={props.sortField === "position"}
                  order={props.sortOrder}
                  onClick={() => props.onSort("position")}
                />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHead
                  label={dateLabel}
                  active={props.sortField === "date"}
                  order={props.sortOrder}
                  onClick={() => props.onSort("date")}
                />
              </th>
              <th className="w-[60px] px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-[13px] text-[#9b9fb3]"
                >
                  Записей пока нет.
                </td>
              </tr>
            ) : (
              props.rows.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#ececf4]">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-[#6f7282]">{idx + 1}</td>
                  <td className="px-3 py-2 text-[#0b1024]">{r.userName}</td>
                  <td className="px-3 py-2 text-[#6f7282]">{r.positionLabel}</td>
                  <td className="px-3 py-2 text-[#0b1024]">
                    {props.kind === "dismissal"
                      ? formatDate(r.date!)
                      : formatRange(r.dateFrom!, r.dateTo!)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => props.onDelete(r.id, props.kind)}
                      aria-label="Удалить"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-[#c7ccea] hover:bg-[#fff4f2] hover:text-[#d2453d]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
