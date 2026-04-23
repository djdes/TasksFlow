"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, Rows3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StaffJournalToolbar } from "@/components/journals/staff-journal-toolbar";
import { FocusTodayScroller } from "@/components/journals/focus-today-scroller";
import {
  HYGIENE_REGISTER_LEGEND,
  HYGIENE_REGISTER_NOTES,
  HYGIENE_STATUS_OPTIONS,
  buildDateKeys,
  buildHygieneExampleEmployees,
  formatMonthLabel,
  getDayNumber,
  getHygieneDefaultResponsibleTitle,
  getStatusMeta,
  normalizeHygieneEntryData,
  toDateKey,
  type HygieneEntryData,
  type HygieneStatus,
} from "@/lib/hygiene-document";

import { toast } from "sonner";
type Props = {
  documentId: string;
  routeCode?: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleName: string | null;
  status: string;
  autoFill?: boolean;
  employees: { id: string; name: string; role: string }[];
  initialEntries: { employeeId: string; date: string; data: HygieneEntryData }[];
};

const STATUS_CYCLE: Array<HygieneStatus | null> = [
  null,
  "healthy",
  "day_off",
  "sick_leave",
  "suspended",
  "vacation",
];

function HygieneCheckbox(props: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      checked={props.checked}
      onCheckedChange={(value) => props.onCheckedChange?.(value === true)}
      className="mx-auto h-5 w-5 rounded-[5px] border-[#c8ccda]"
    />
  );
}

function HygieneHeader({
  pageLabel,
  organizationLabel,
}: {
  pageLabel: string;
  organizationLabel: string;
}) {
  return (
    <table className="hygiene-header w-full border-collapse">
      <tbody>
        <tr>
          <td
            rowSpan={2}
            className="w-[270px] border border-black px-8 py-8 text-center text-[22px] font-semibold"
          >
            {organizationLabel}
          </td>
          <td className="border border-black px-8 py-4 text-center text-[18px] uppercase">
            СИСТЕМА ХАССП
          </td>
          <td
            rowSpan={2}
            className="w-[170px] border border-black px-8 py-8 text-center text-[18px] uppercase"
          >
            {pageLabel}
          </td>
        </tr>
        <tr>
          <td className="border border-black px-8 py-4 text-center text-[17px] italic uppercase">
            ГИГИЕНИЧЕСКИЙ ЖУРНАЛ
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function makeCellKey(employeeId: string, dateKey: string) {
  return `${employeeId}:${dateKey}`;
}

function buildEntryMap(entries: Props["initialEntries"]) {
  const result: Record<string, HygieneEntryData> = {};

  entries.forEach((entry) => {
    result[makeCellKey(entry.employeeId, entry.date)] = normalizeHygieneEntryData(entry.data);
  });

  return result;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (result && typeof result.error === "string" && result.error) || "Операция не выполнена"
    );
  }

  return result;
}

function getTemperatureLabel(entry?: HygieneEntryData) {
  if (entry?.temperatureAbove37 === false) return "нет";
  if (entry?.temperatureAbove37 === true) return "да";
  if (entry?.temperatureAbove37 === null && entry?.status === "day_off") return "-";
  return "";
}

function getNextStatus(current?: HygieneStatus | null) {
  const currentIndex = STATUS_CYCLE.findIndex((status) => status === (current ?? null));
  return STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
}

function buildEntryForStatus(nextStatus: HygieneStatus | null, current?: HygieneEntryData) {
  if (!nextStatus) return {};
  if (nextStatus === "healthy") {
    return {
      status: "healthy" as const,
      temperatureAbove37: current?.temperatureAbove37 === true,
    };
  }

  return {
    status: nextStatus,
    temperatureAbove37: null,
  };
}

export function HygieneDocumentClient({
  documentId,
  routeCode,
  title,
  organizationName,
  dateFrom,
  dateTo,
  responsibleTitle,
  status,
  autoFill = false,
  employees,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [entryMap, setEntryMap] = useState<Record<string, HygieneEntryData>>(() =>
    buildEntryMap(initialEntries)
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  // Mobile-only view preference: 'cards' (default) vs 'table' (horizontal
  // scroll of the full sheet). Stored in localStorage so the choice sticks
  // per-device. Desktop / print always render the table — the toggle is
  // hidden on sm+ via Tailwind (`sm:hidden`), but we keep the state in
  // sync either way for consistency.
  const [mobileView, setMobileView] = useState<"cards" | "table">("cards");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null
  );

  useEffect(() => {
    setEntryMap(buildEntryMap(initialEntries));
  }, [initialEntries]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hygiene-mobile-view");
      if (saved === "table" || saved === "cards") setMobileView(saved);
    } catch {
      /* localStorage blocked — fall back to default 'cards' */
    }
  }, []);

  function switchMobileView(next: "cards" | "table") {
    setMobileView(next);
    try {
      window.localStorage.setItem("hygiene-mobile-view", next);
    } catch {
      /* ignore */
    }
  }

  const dateKeys = buildDateKeys(dateFrom, dateTo);
  const includedEmployeeIds = [...new Set(initialEntries.map((entry) => entry.employeeId))];
  const rosterUsers = employees.filter((employee) => includedEmployeeIds.includes(employee.id));
  const printableEmployees = buildHygieneExampleEmployees(
    rosterUsers,
    Math.max(rosterUsers.length, 7)
  );
  const organizationLabel = organizationName || 'ООО "Тест"';
  const responsibleLabel = responsibleTitle || getHygieneDefaultResponsibleTitle(employees);
  const documentTitle = title || "Гигиенический журнал";
  const monthLabel = formatMonthLabel(dateFrom, dateTo);
  const selectedCount = selectedEmployeeIds.length;
  const allSelected = rosterUsers.length > 0 && selectedCount === rosterUsers.length;
  const isActive = status === "active";

  function toggleEmployee(employeeId: string, checked: boolean) {
    setSelectedEmployeeIds((current) =>
      checked ? [...new Set([...current, employeeId])] : current.filter((item) => item !== employeeId)
    );
  }

  async function persistEntry(employeeId: string, dateKey: string, nextData: HygieneEntryData) {
    const key = makeCellKey(employeeId, dateKey);
    const previous = entryMap[key];

    setEntryMap((current) => ({ ...current, [key]: nextData }));
    setSavingCellKey(key);

    try {
      await requestJson(`/api/journal-documents/${documentId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          date: dateKey,
          data: nextData,
        }),
      });
    } catch (error) {
      setEntryMap((current) => {
        const copy = { ...current };
        if (previous && Object.keys(previous).length > 0) {
          copy[key] = previous;
        } else {
          delete copy[key];
        }
        return copy;
      });
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSavingCellKey((current) => (current === key ? null : current));
    }
  }

  async function handleDeleteSelected() {
    if (!isActive || selectedEmployeeIds.length === 0) return;

    setIsDeleting(true);
    try {
      await Promise.all(
        selectedEmployeeIds.map((employeeId) =>
          requestJson(`/api/journal-documents/${documentId}/entries`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId }),
          })
        )
      );
      setSelectedEmployeeIds([]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка удаления строк");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleStatusClick(employeeId: string, dateKey: string) {
    if (!isActive) return;

    const key = makeCellKey(employeeId, dateKey);
    const current = normalizeHygieneEntryData(entryMap[key]);
    const nextStatus = getNextStatus(current.status);
    const nextData = buildEntryForStatus(nextStatus, current);

    await persistEntry(employeeId, dateKey, nextData);
  }

  async function handleTemperatureClick(employeeId: string, dateKey: string) {
    if (!isActive) return;

    const key = makeCellKey(employeeId, dateKey);
    const current = normalizeHygieneEntryData(entryMap[key]);

    const nextData: HygieneEntryData =
      current.status === "healthy"
        ? {
            status: "healthy",
            temperatureAbove37: current.temperatureAbove37 === true ? false : true,
          }
        : {
            status: "healthy",
            temperatureAbove37: false,
          };

    await persistEntry(employeeId, dateKey, nextData);
  }

  return (
    <div className="bg-white text-black">
      <FocusTodayScroller />
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body {
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .screen-only {
            display: none !important;
          }

          .hygiene-sheet {
            width: 100%;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .hygiene-page {
            break-after: page;
            page-break-after: always;
          }

          .hygiene-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .hygiene-grid {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
          }

          .hygiene-grid th,
          .hygiene-grid td {
            font-size: 10px !important;
            line-height: 1.1 !important;
            padding: 4px 3px !important;
          }

          .hygiene-header td {
            font-size: 11px !important;
            line-height: 1.15 !important;
            padding: 8px 10px !important;
          }

          .hygiene-title {
            font-size: 24px !important;
            margin-bottom: 26px !important;
          }

          .hygiene-notes,
          .hygiene-legend,
          .hygiene-reminder {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }

          .hygiene-second-page-content {
            margin-top: 120px !important;
          }

          .hygiene-checkbox {
            width: 10px !important;
            height: 10px !important;
            border-radius: 2px !important;
          }
        }
      `}</style>

      {/*
        Toolbar + selection actions sit OUTSIDE the horizontally-scrolling
        hygiene-sheet wrapper. That matters on mobile: the sheet has
        `min-w-[1100px]` so the physical journal stays printable-wide, but
        anything inside that wrapper also gets stretched to 1100px — which
        would force the toolbar off-screen. Pulling it up into normal
        document flow keeps the toolbar tap-friendly regardless of view.
      */}
      <div className="screen-only mb-6 space-y-4 sm:mb-10 sm:space-y-8">
        <StaffJournalToolbar
          documentId={documentId}
          heading="Гигиенический журнал"
          title={documentTitle}
          status={status}
          autoFill={autoFill}
          responsibleTitle={responsibleTitle}
          users={employees}
          includedEmployeeIds={includedEmployeeIds}
          routeCode={routeCode}
          organizationName={organizationLabel}
          showHeaderActions
        />

        {isActive && selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedEmployeeIds([])}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            >
              Выбрано: {selectedCount}
              <X className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="h-11 rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
            >
              {isDeleting ? "Удаление..." : "Удалить"}
            </Button>
          </div>
        ) : null}

        {/* Mobile-only view toggle. Cards is the default — vertical list
            of employees with day-by-day accordion — far more usable on a
            phone than a 1100-px-wide table behind horizontal scroll. */}
        <div
          role="tablist"
          aria-label="Режим отображения"
          className="flex w-full rounded-2xl border border-[#ececf4] bg-white p-1 text-[13px] font-medium sm:hidden"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "cards"}
            onClick={() => switchMobileView("cards")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition-colors ${
              mobileView === "cards"
                ? "bg-[#f5f6ff] text-[#5566f6]"
                : "text-[#6f7282]"
            }`}
          >
            <LayoutGrid className="size-4" />
            Карточки
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "table"}
            onClick={() => switchMobileView("table")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition-colors ${
              mobileView === "table"
                ? "bg-[#f5f6ff] text-[#5566f6]"
                : "text-[#6f7282]"
            }`}
          >
            <Rows3 className="size-4" />
            Таблица
          </button>
        </div>
      </div>

      {/* Mobile cards view — rendered outside the scroll wrapper so it
          respects the viewport width naturally. Hidden on sm+ and in
          print (both always use the table). */}
      {mobileView === "cards" ? (
        <div className="mb-6 space-y-2 sm:hidden print:hidden">
          {printableEmployees
            .filter((employee) => employee.name)
            .map((employee) => {
              const expanded = expandedEmployeeId === employee.id;
              const filledCount = dateKeys.reduce((acc, dk) => {
                const entry = normalizeHygieneEntryData(
                  entryMap[makeCellKey(employee.id, dk)]
                );
                return acc + (entry.status ? 1 : 0);
              }, 0);
              const isSelected = selectedEmployeeIds.includes(employee.id);

              return (
                <div
                  key={employee.id}
                  className="rounded-2xl border border-[#ececf4] bg-white"
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span
                      onClick={(event) => event.stopPropagation()}
                      className="shrink-0"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (!isActive) return;
                          toggleEmployee(employee.id, Boolean(checked));
                        }}
                        disabled={!isActive}
                        className="size-5"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEmployeeId(expanded ? null : employee.id)
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-[#0b1024]">
                          {employee.name}
                        </div>
                        <div className="truncate text-[12px] text-[#6f7282]">
                          {employee.position || "—"}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[11px] font-semibold text-[#5566f6]">
                        {filledCount}/{dateKeys.length}
                      </span>
                      <ChevronDown
                        className={`size-4 shrink-0 text-[#6f7282] transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="space-y-1.5 border-t border-[#ececf4] p-3">
                      {dateKeys.map((dateKey) => {
                        const key = makeCellKey(employee.id, dateKey);
                        const entry = normalizeHygieneEntryData(
                          entryMap[key]
                        );
                        const statusMeta = getStatusMeta(entry.status);
                        const tempLabel = getTemperatureLabel(entry);
                        const isSaving = savingCellKey === key;
                        const dayNum = getDayNumber(dateKey);

                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-2 rounded-xl px-1 py-1.5 ${
                              isSaving ? "bg-[#f7f8ff]" : ""
                            }`}
                          >
                            <span className="w-8 shrink-0 text-center text-[13px] font-medium text-[#6f7282]">
                              {dayNum}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isActive) return;
                                handleStatusClick(
                                  employee.id,
                                  dateKey
                                ).catch(() => {});
                              }}
                              disabled={!isActive}
                              className="min-w-0 flex-1 rounded-lg border border-[#ececf4] bg-[#fafbff] px-3 py-2 text-left text-[12px] font-medium text-[#0b1024] hover:bg-[#f5f6ff] disabled:opacity-60"
                            >
                              {statusMeta?.code ? (
                                <>
                                  <span className="font-semibold">
                                    {statusMeta.code}
                                  </span>
                                  <span className="ml-1.5 text-[#6f7282]">
                                    {statusMeta.label}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[#9b9fb3]">— не заполнено</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isActive) return;
                                handleTemperatureClick(
                                  employee.id,
                                  dateKey
                                ).catch(() => {});
                              }}
                              disabled={!isActive}
                              title="Температура >37°C"
                              className="shrink-0 rounded-lg border border-[#ececf4] bg-[#fafbff] px-2 py-2 text-[12px] text-[#6f7282] hover:bg-[#f5f6ff] disabled:opacity-60"
                            >
                              T°: {tempLabel || "—"}
                            </button>
                          </div>
                        );
                      })}
                      {isActive ? (
                        <div className="pt-1 text-[11px] text-[#6f7282]">
                          Тап по статусу перебирает{" "}
                          {HYGIENE_STATUS_OPTIONS.map((item) => item.code).join(
                            " / "
                          )}
                          . T° — между «нет» и «да».
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          {printableEmployees.filter((employee) => employee.name).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-5 text-center text-[13px] text-[#6f7282]">
              В документе пока нет сотрудников. Добавьте их через «+ Новая
              строка» в меню документа.
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`${
          mobileView === "cards" ? "hidden sm:block print:block" : ""
        }`}
      >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 lg:overflow-visible sm:px-0 print:mx-0 print:overflow-visible print:px-0">
        <div className="hygiene-sheet mx-auto min-w-[1100px] max-w-[1720px] px-8 py-6 sm:min-w-0">

        <div className="hygiene-page">
          <div className="mx-auto max-w-[1380px]">
            <div className="mb-10">
              <HygieneHeader pageLabel="СТР. 1 ИЗ 1" organizationLabel={organizationLabel} />
            </div>

            <div className="hygiene-title mb-8 text-center text-[34px] font-bold uppercase">
              {documentTitle}
            </div>

            <table className="hygiene-grid w-full border-collapse text-[15px]">
              <thead>
                <tr className="bg-[#f2f2f2]">
                  <th
                    className="w-[42px] border border-black p-2 text-center font-semibold"
                    rowSpan={2}
                  >
                    <HygieneCheckbox
                      checked={allSelected}
                      onCheckedChange={(checked) => {
                        if (!isActive) return;
                        setSelectedEmployeeIds(
                          checked ? rosterUsers.map((employee) => employee.id) : []
                        );
                      }}
                    />
                  </th>
                  <th
                    className="w-[72px] border border-black p-2 text-center font-semibold"
                    rowSpan={2}
                  >
                    № п/п
                  </th>
                  <th
                    className="w-[230px] border border-black p-2 text-center font-semibold"
                    rowSpan={2}
                  >
                    Ф.И.О. работника
                  </th>
                  <th
                    className="w-[290px] border border-black p-2 text-center font-semibold"
                    rowSpan={2}
                  >
                    Должность
                  </th>
                  <th
                    className="border border-black p-2 text-center text-[16px] font-semibold"
                    colSpan={dateKeys.length}
                  >
                    Месяц {monthLabel}
                  </th>
                </tr>
                <tr className="bg-[#f2f2f2]">
                  {dateKeys.map((dateKey) => (
                    <th
                      key={dateKey}
                      data-focus-today={dateKey === toDateKey(new Date()) ? "" : undefined}
                      className="w-[58px] border border-black p-2 text-center font-semibold"
                    >
                      {getDayNumber(dateKey)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {printableEmployees.map((employee) => (
                  <Fragment key={employee.id}>
                    <tr>
                      <td rowSpan={2} className="border border-black p-2 text-center align-middle">
                        {employee.name ? (
                          <HygieneCheckbox
                            checked={selectedEmployeeIds.includes(employee.id)}
                            onCheckedChange={(checked) => {
                              if (!isActive) return;
                              toggleEmployee(employee.id, checked);
                            }}
                          />
                        ) : null}
                      </td>
                      <td rowSpan={2} className="border border-black p-2 text-center align-middle">
                        {employee.name ? employee.number : ""}
                      </td>
                      <td className="border border-black p-2 text-center">{employee.name || ""}</td>
                      <td className="border border-black p-2 text-center">
                        {employee.position || ""}
                      </td>
                      {dateKeys.map((dateKey) => {
                        const key = makeCellKey(employee.id, dateKey);
                        const entry = normalizeHygieneEntryData(entryMap[key]);
                        const statusMeta = getStatusMeta(entry.status);
                        const isSaving = savingCellKey === key;

                        return (
                          <td
                            key={`${employee.id}:${dateKey}:status`}
                            className={`border border-black p-2 text-center align-middle ${
                              isActive && employee.name ? "cursor-pointer hover:bg-[#f5f6ff]" : ""
                            } ${isSaving ? "bg-[#f7f8ff]" : ""}`}
                            onClick={() => {
                              if (!employee.name) return;
                              handleStatusClick(employee.id, dateKey).catch(() => {});
                            }}
                          >
                            {statusMeta?.code || ""}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-black p-2 text-center">
                        Температура сотрудника более 37°C?
                      </td>
                      {dateKeys.map((dateKey) => {
                        const key = makeCellKey(employee.id, dateKey);
                        const entry = normalizeHygieneEntryData(entryMap[key]);
                        const isSaving = savingCellKey === key;

                        return (
                          <td
                            key={`${employee.id}:${dateKey}:temp`}
                            className={`border border-black p-2 text-center align-middle ${
                              isActive && employee.name ? "cursor-pointer hover:bg-[#f5f6ff]" : ""
                            } ${isSaving ? "bg-[#f7f8ff]" : ""}`}
                            onClick={() => {
                              if (!employee.name) return;
                              handleTemperatureClick(employee.id, dateKey).catch(() => {});
                            }}
                          >
                            {getTemperatureLabel(entry)}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                ))}

                <tr>
                  <td className="border border-black p-2 text-center align-middle">
                    <HygieneCheckbox />
                  </td>
                  <td colSpan={2} className="border border-black p-2 text-center">
                    Должность ответственного за контроль
                  </td>
                  <td className="border border-black p-2 text-center">{responsibleLabel}</td>
                  {dateKeys.map((dateKey) => (
                    <td key={`blank:${dateKey}`} className="border border-black p-2" />
                  ))}
                </tr>
              </tbody>
            </table>

            <div className="hygiene-notes mt-8 text-[16px] leading-7">
              <div className="font-semibold">В журнал регистрируются результаты:</div>
              {HYGIENE_REGISTER_NOTES.map((note) => (
                <div key={note}>- {note}</div>
              ))}
            </div>

            <div className="hygiene-reminder mt-8 text-[16px] font-semibold leading-7">
              Список работников, отмеченных в журнале на день осмотра, должен соответствовать
              числу работников на этот день в смену
            </div>

            <div className="hygiene-legend mt-10 text-[16px] leading-7">
              <div className="font-semibold italic underline">Условные обозначения:</div>
              {HYGIENE_REGISTER_LEGEND.map((item) => (
                <div key={item} className="italic">
                  {item}
                </div>
              ))}
            </div>

            {isActive ? (
              <div className="mt-6 text-[13px] text-[#6f7282]">
                Клик по ячейке со статусом переключает отметку:{" "}
                {HYGIENE_STATUS_OPTIONS.map((item) => item.code).join(" / ")}. Клик по строке
                температуры переключает значение между «нет» и «да».
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
