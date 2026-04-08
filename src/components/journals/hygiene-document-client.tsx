"use client";

import { type ReactNode, startTransition, useState } from "react";
import { Check, ClipboardList, Lock, Plus, Printer, Thermometer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  HYGIENE_REGISTER_LEGEND,
  HYGIENE_REGISTER_NOTES,
  HYGIENE_REGISTER_PERIODICITY,
  HYGIENE_STATUS_OPTIONS,
  buildDateKeys,
  formatMonthLabel,
  getDayNumber,
  getRoleLabel,
  getStatusMeta,
  getWeekdayShort,
  isWeekend,
  normalizeHygieneEntryData,
  toDateKey,
  type HygieneEntryData,
  type HygieneStatus,
} from "@/lib/hygiene-document";

type Employee = {
  id: string;
  name: string;
  role: string;
};

type InitialEntry = {
  employeeId: string;
  date: string;
  data: HygieneEntryData;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleName: string | null;
  status: string;
  employees: Employee[];
  initialEntries: InitialEntry[];
};

type EntryMap = Record<string, HygieneEntryData>;

function makeCellKey(employeeId: string, dateKey: string) {
  return `${employeeId}:${dateKey}`;
}

function buildEntryMap(initialEntries: InitialEntry[]): EntryMap {
  return initialEntries.reduce<EntryMap>((acc, entry) => {
    acc[makeCellKey(entry.employeeId, entry.date)] = normalizeHygieneEntryData(entry.data);
    return acc;
  }, {});
}

function includedIdsFromEntries(initialEntries: InitialEntry[]) {
  return Array.from(new Set(initialEntries.map((entry) => entry.employeeId)));
}

function getStatusTone(status?: string | null) {
  switch (status) {
    case "healthy":
      return "bg-emerald-50 text-emerald-700";
    case "day_off":
    case "vacation":
      return "bg-amber-50 text-amber-700";
    case "sick_leave":
    case "suspended":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-white text-slate-500";
  }
}

function getTemperatureTone(value?: boolean | null) {
  if (value === true) return "bg-rose-50 text-rose-700";
  if (value === false) return "bg-emerald-50 text-emerald-700";
  return "bg-white text-slate-500";
}

function StatusCell({
  value,
  disabled,
  isSaving,
  onSelect,
}: {
  value?: HygieneStatus | null;
  disabled: boolean;
  isSaving: boolean;
  onSelect: (nextValue: HygieneStatus | null) => void;
}) {
  const meta = getStatusMeta(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full min-w-12 items-center justify-center rounded-md border border-slate-200 px-1 text-xs font-medium transition-colors",
            getStatusTone(value),
            !disabled && "hover:border-slate-400 hover:bg-slate-50",
            disabled && "cursor-default",
            isSaving && "opacity-60"
          )}
          title={meta ? meta.label : "Выбрать код"}
        >
          {meta?.code || "—"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuLabel>Состояние сотрудника</DropdownMenuLabel>
        {HYGIENE_STATUS_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => onSelect(option.value)}>
            {option.code}
            <span className="text-muted-foreground">{option.label}</span>
            {value === option.value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect(null)}>Очистить</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TemperatureCell({
  value,
  disabled,
  isSaving,
  onSelect,
}: {
  value?: boolean | null;
  disabled: boolean;
  isSaving: boolean;
  onSelect: (nextValue: boolean | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full min-w-12 items-center justify-center rounded-md border border-slate-200 px-1 text-xs font-medium transition-colors",
            getTemperatureTone(value),
            !disabled && "hover:border-slate-400 hover:bg-slate-50",
            disabled && "cursor-default",
            isSaving && "opacity-60"
          )}
          title="Температура выше 37°C"
        >
          {value === true ? "да" : value === false ? "нет" : "—"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuLabel>Температура выше 37°C</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onSelect(false)}>
          нет
          {value === false && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect(true)}>
          да
          {value === true && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect(null)}>Очистить</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmployeeRows({
  employee,
  index,
  dateKeys,
  entries,
  todayKey,
  isReadOnly,
  savingCells,
  onStatusSelect,
  onTemperatureSelect,
}: {
  employee: Employee;
  index: number;
  dateKeys: string[];
  entries: EntryMap;
  todayKey: string;
  isReadOnly: boolean;
  savingCells: Record<string, boolean>;
  onStatusSelect: (employeeId: string, dateKey: string, nextStatus: HygieneStatus | null) => void;
  onTemperatureSelect: (employeeId: string, dateKey: string, nextValue: boolean | null) => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-300">
        <td className="border-r border-slate-300 px-3 py-4 text-center font-medium text-slate-900" rowSpan={2}>
          {index + 1}
        </td>
        <td className="border-r border-slate-300 px-4 py-4 text-center font-medium text-slate-900" rowSpan={2}>
          {employee.name}
        </td>
        <td className="border-r border-slate-300 px-4 py-4 text-center text-slate-700" rowSpan={2}>
          {getRoleLabel(employee.role)}
        </td>
        {dateKeys.map((dateKey) => {
          const cellKey = makeCellKey(employee.id, dateKey);
          const entry = entries[cellKey];
          return (
            <td
              key={cellKey}
              className={cn(
                "border-r border-slate-300 px-1 py-1.5 align-middle",
                dateKey === todayKey && "bg-emerald-50/60",
                isWeekend(dateKey) && "bg-amber-50/50"
              )}
            >
              <StatusCell
                value={entry?.status}
                disabled={isReadOnly}
                isSaving={!!savingCells[cellKey]}
                onSelect={(nextValue) => onStatusSelect(employee.id, dateKey, nextValue)}
              />
            </td>
          );
        })}
      </tr>
      <tr className="border-b border-slate-300 bg-slate-50/50">
        {dateKeys.map((dateKey, dateIndex) => {
          const cellKey = makeCellKey(employee.id, dateKey);
          const entry = entries[cellKey];
          return (
            <td
              key={`${cellKey}:temp`}
              className={cn(
                "border-r border-slate-300 px-1 py-1.5 align-middle",
                dateKey === todayKey && "bg-emerald-50/60",
                isWeekend(dateKey) && "bg-amber-50/50"
              )}
            >
              <div className="relative">
                {dateIndex === 0 && (
                  <span className="absolute top-1/2 right-full hidden w-44 -translate-y-1/2 pr-3 text-right text-xs text-slate-600 xl:block">
                    Температура сотрудника более 37°C?
                  </span>
                )}
                <TemperatureCell
                  value={entry?.temperatureAbove37}
                  disabled={isReadOnly}
                  isSaving={!!savingCells[cellKey]}
                  onSelect={(nextValue) => onTemperatureSelect(employee.id, dateKey, nextValue)}
                />
              </div>
            </td>
          );
        })}
      </tr>
    </>
  );
}

export function HygieneDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  responsibleTitle,
  responsibleName,
  status: initialStatus,
  employees,
  initialEntries,
}: Props) {
  const dateKeys = buildDateKeys(dateFrom, dateTo);
  const [entries, setEntries] = useState<EntryMap>(() => buildEntryMap(initialEntries));
  const [includedEmployeeIds, setIncludedEmployeeIds] = useState<string[]>(() =>
    includedIdsFromEntries(initialEntries)
  );
  const [documentStatus, setDocumentStatus] = useState(initialStatus);
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isAddingEmployees, setIsAddingEmployees] = useState(false);
  const [isUpdatingDocument, setIsUpdatingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = documentStatus === "closed";
  const todayKey = toDateKey(new Date());
  const availableEmployees = employees.filter((employee) => !includedEmployeeIds.includes(employee.id));
  const includedEmployees = employees
    .filter((employee) => includedEmployeeIds.includes(employee.id))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));

  const totalStatusCells = includedEmployees.length * dateKeys.length;
  const filledStatusCells = Object.values(entries).filter((entry) => entry.status).length;
  const temperatureAlerts = Object.values(entries).filter((entry) => entry.temperatureAbove37 === true).length;
  const markedToday = includedEmployees.filter((employee) => {
    const entry = entries[makeCellKey(employee.id, todayKey)];
    return !!entry?.status || typeof entry?.temperatureAbove37 === "boolean";
  }).length;

  async function persistCell(
    employeeId: string,
    dateKey: string,
    nextData: HygieneEntryData,
    previousData: HygieneEntryData
  ) {
    const cellKey = makeCellKey(employeeId, dateKey);
    setSavingCells((current) => ({ ...current, [cellKey]: true }));
    setError(null);

    try {
      const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date: dateKey, data: nextData }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Не удалось сохранить ячейку");
      }
    } catch (saveError) {
      startTransition(() => {
        setEntries((current) => {
          const next = { ...current };
          if (!previousData.status && typeof previousData.temperatureAbove37 !== "boolean") {
            delete next[cellKey];
          } else {
            next[cellKey] = previousData;
          }
          return next;
        });
      });
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить ячейку");
    } finally {
      setSavingCells((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
    }
  }

  function updateStatus(employeeId: string, dateKey: string, nextStatus: HygieneStatus | null) {
    const cellKey = makeCellKey(employeeId, dateKey);
    const previousData = entries[cellKey] || {};
    const nextData: HygieneEntryData = { ...previousData, status: nextStatus };

    startTransition(() => {
      setEntries((current) => ({ ...current, [cellKey]: nextData }));
    });

    void persistCell(employeeId, dateKey, nextData, previousData);
  }

  function updateTemperature(employeeId: string, dateKey: string, nextValue: boolean | null) {
    const cellKey = makeCellKey(employeeId, dateKey);
    const previousData = entries[cellKey] || {};
    const nextData: HygieneEntryData = {
      ...previousData,
      temperatureAbove37: nextValue,
    };

    startTransition(() => {
      setEntries((current) => ({ ...current, [cellKey]: nextData }));
    });

    void persistCell(employeeId, dateKey, nextData, previousData);
  }

  async function handleAddEmployees(employeeIds: string[]) {
    if (employeeIds.length === 0) return;

    setIsAddingEmployees(true);
    setError(null);
    const addedIds: string[] = [];

    try {
      for (const employeeId of employeeIds) {
        const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, date: dateKeys[0], data: {} }),
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "Не удалось добавить сотрудника");
        }

        addedIds.push(employeeId);
      }

      startTransition(() => {
        setIncludedEmployeeIds((current) => Array.from(new Set([...current, ...addedIds])));
      });
      setSelectedEmployeeIds([]);
      setDialogOpen(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Не удалось добавить сотрудников");
    } finally {
      setIsAddingEmployees(false);
    }
  }

  async function toggleDocumentStatus() {
    const nextStatus = documentStatus === "closed" ? "active" : "closed";
    setIsUpdatingDocument(true);
    setError(null);

    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Не удалось обновить статус журнала");
      }

      setDocumentStatus(nextStatus);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Не удалось обновить статус журнала"
      );
    } finally {
      setIsUpdatingDocument(false);
    }
  }

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @media print {
          .print-hidden { display: none !important; }
          .print-shell { padding: 0 !important; box-shadow: none !important; border: none !important; background: white !important; }
          .print-scroll { overflow: visible !important; }
          .print-table { min-width: 0 !important; }
          body { background: white !important; }
        }
      `}</style>

      <section className="print-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <ClipboardList className="size-4" />
              Документный журнал HACCP / СанПиН
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Печатная форма и интерактивная сетка собраны в одном экране: можно вести журнал
                по дням, быстро добавлять сотрудников и сразу получать вид, близкий к бумажному образцу.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="print-hidden" onClick={() => window.print()}>
              <Printer className="size-4" />
              Печать
            </Button>
            <Button variant="outline" className="print-hidden" onClick={() => setDialogOpen(true)} disabled={isReadOnly}>
              <Plus className="size-4" />
              Добавить сотрудников
            </Button>
            <Button variant={documentStatus === "closed" ? "outline" : "default"} className="print-hidden" onClick={toggleDocumentStatus} disabled={isUpdatingDocument}>
              <Lock className="size-4" />
              {documentStatus === "closed" ? "Открыть журнал" : "Закрыть журнал"}
            </Button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard icon={<Users className="size-5 text-emerald-600" />} label="Сотрудники" value={includedEmployees.length} />
          <MetricCard label="Заполнено кодов" value={`${filledStatusCells}/${totalStatusCells || 0}`} />
          <MetricCard label="Отмечено сегодня" value={markedToday} />
          <MetricCard icon={<Thermometer className="size-5 text-rose-700" />} label="Температура > 37°C" value={temperatureAlerts} accent="text-rose-700" />
        </div>
        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
      </section>

      <section className="print-shell rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-hidden rounded-2xl border border-slate-300">
          <div className="grid grid-cols-[250px_minmax(0,1fr)_160px] border-b border-slate-300">
            <div className="flex items-center justify-center border-r border-slate-300 px-6 py-8 text-center text-2xl font-semibold text-slate-900">
              {organizationName}
            </div>
            <div>
              <div className="border-b border-slate-300 px-6 py-4 text-center text-sm uppercase tracking-[0.24em] text-slate-600">
                Система HACCP
              </div>
              <div className="px-6 py-5 text-center text-xl font-semibold uppercase tracking-[0.12em] text-slate-900">
                {title}
              </div>
            </div>
            <div className="flex items-center justify-center border-l border-slate-300 px-6 py-8 text-center text-sm font-medium uppercase tracking-[0.14em] text-slate-600">
              стр. 1 из 1
            </div>
          </div>
          <div className="grid grid-cols-[250px_minmax(0,1fr)]">
            <div className="border-r border-slate-300 px-6 py-5 text-sm font-semibold text-slate-900">
              Периодичность контроля
            </div>
            <div className="space-y-2 px-6 py-5 text-sm leading-6 text-slate-700">
              {HYGIENE_REGISTER_PERIODICITY.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <h2 className="text-3xl font-semibold uppercase tracking-[0.08em] text-slate-900">{title}</h2>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Badge variant="outline" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.16em]">
              {formatMonthLabel(dateFrom, dateTo)}
            </Badge>
            <Badge variant={documentStatus === "closed" ? "secondary" : "default"} className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.16em]">
              {documentStatus === "closed" ? "Закрыт" : "Активный"}
            </Badge>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Верхняя строка по каждому сотруднику фиксирует код состояния на день, нижняя строка показывает отметку по температуре выше 37°C.
        </div>

        <div className="print-scroll mt-8 overflow-x-auto rounded-2xl border border-slate-300">
          <table className="print-table min-w-[1280px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/80">
                <th className="border-b border-r border-slate-300 px-3 py-3 text-center font-semibold text-slate-900" rowSpan={2}>№ п/п</th>
                <th className="border-b border-r border-slate-300 px-4 py-3 text-center font-semibold text-slate-900" rowSpan={2}>Ф.И.О. работника</th>
                <th className="border-b border-r border-slate-300 px-4 py-3 text-center font-semibold text-slate-900" rowSpan={2}>Должность</th>
                <th className="border-b border-slate-300 px-4 py-3 text-center text-lg font-semibold text-slate-900" colSpan={dateKeys.length}>
                  Месяц {formatMonthLabel(dateFrom, dateTo)}
                </th>
              </tr>
              <tr className="bg-slate-50">
                {dateKeys.map((dateKey) => (
                  <th key={dateKey} className={cn("min-w-16 border-r border-slate-300 px-2 py-2 text-center", dateKey === todayKey && "bg-emerald-50", isWeekend(dateKey) && "bg-amber-50/70")}>
                    <div className="text-base font-semibold text-slate-900">{getDayNumber(dateKey)}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{getWeekdayShort(dateKey)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {includedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={dateKeys.length + 3} className="px-6 py-16 text-center text-sm text-slate-500">
                    Добавьте сотрудников в журнал, чтобы начать заполнение дневной сетки.
                  </td>
                </tr>
              ) : (
                includedEmployees.map((employee, index) => (
                  <EmployeeRows
                    key={employee.id}
                    employee={employee}
                    index={index}
                    dateKeys={dateKeys}
                    entries={entries}
                    todayKey={todayKey}
                    isReadOnly={isReadOnly}
                    savingCells={savingCells}
                    onStatusSelect={updateStatus}
                    onTemperatureSelect={updateTemperature}
                  />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80">
                <td className="border-t border-r border-slate-300 px-4 py-4 text-sm font-semibold text-slate-900" colSpan={2}>
                  Должность ответственного за контроль
                </td>
                <td className="border-t border-r border-slate-300 px-4 py-4 text-center font-medium text-slate-900">
                  {responsibleTitle || responsibleName || "Не указано"}
                </td>
                {dateKeys.map((dateKey) => (
                  <td key={dateKey} className="border-t border-r border-slate-300 px-2 py-4" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">В журнал регистрируются результаты:</p>
            <ul className="mt-2 space-y-1">
              {HYGIENE_REGISTER_NOTES.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Условные обозначения:</p>
            <ul className="mt-2 space-y-1 italic">
              {HYGIENE_REGISTER_LEGEND.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить сотрудников в журнал</DialogTitle>
            <DialogDescription>
              Выберите работников, которые должны отображаться в табличной форме на текущий период.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {availableEmployees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Все активные сотрудники уже добавлены в журнал.
              </div>
            ) : (
              availableEmployees.map((employee) => {
                const checked = selectedEmployeeIds.includes(employee.id);
                return (
                  <label key={employee.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        setSelectedEmployeeIds((current) =>
                          value === true ? [...current, employee.id] : current.filter((id) => id !== employee.id)
                        );
                      }}
                    />
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900">{employee.name}</div>
                      <div className="text-sm text-slate-500">{getRoleLabel(employee.role)}</div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void handleAddEmployees(availableEmployees.map((employee) => employee.id))} disabled={availableEmployees.length === 0 || isAddingEmployees}>
              Добавить всех активных
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isAddingEmployees}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void handleAddEmployees(selectedEmployeeIds)} disabled={selectedEmployeeIds.length === 0 || isAddingEmployees}>
                {isAddingEmployees ? "Добавление..." : "Добавить выбранных"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={cn("mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900", accent)}>
        {icon}
        {value}
      </div>
    </div>
  );
}
