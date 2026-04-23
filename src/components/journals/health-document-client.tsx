"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, Rows3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffJournalToolbar } from "@/components/journals/staff-journal-toolbar";
import {
  HEALTH_REGISTER_NOTES,
  HEALTH_REGISTER_REMINDER,
  buildDateKeys,
  buildHygieneExampleEmployees,
  formatMonthLabel,
  getDayNumber,
  getHygienePositionLabel,
  getWeekdayShort,
  normalizeHealthEntryData,
  toDateKey,
  type HealthEntryData,
} from "@/lib/hygiene-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { FocusTodayScroller } from "@/components/journals/focus-today-scroller";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  status: string;
  autoFill?: boolean;
  employees: { id: string; name: string; role: string }[];
  initialEntries: { employeeId: string; date: string; data: HealthEntryData }[];
  printEmptyRows?: number;
};

function HealthCheckbox(props: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return <Checkbox checked={props.checked} onCheckedChange={(value) => props.onCheckedChange?.(value === true)} className="mx-auto h-5 w-5 rounded-[5px] border-[#c8ccda] data-[state=checked]:border-[#2563ff] data-[state=checked]:bg-[#2563ff]" />;
}

function HealthHeader({
  organizationLabel,
  pageLabel,
}: {
  organizationLabel: string;
  pageLabel: string;
}) {
  return (
    <table className="health-header w-full border-collapse">
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
            ЖУРНАЛ ЗДОРОВЬЯ
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function makeCellKey(employeeId: string, dateKey: string) {
  return `${employeeId}:${dateKey}`;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (result && typeof result.error === "string" && result.error) ||
        "Операция не выполнена"
    );
  }
  return result;
}

function getHealthMeasures(
  employeeId: string,
  dateKeys: string[],
  entryMap: Record<string, HealthEntryData>
) {
  return dateKeys.flatMap((dateKey) => {
    const measures = entryMap[makeCellKey(employeeId, dateKey)]?.measures?.trim();
    if (!measures) return [];

    return [`${getDayNumber(dateKey)} ${getWeekdayShort(dateKey)}. - ${measures}`];
  });
}

export function HealthDocumentClient(props: Props) {
  const router = useRouter();
  const {
    documentId,
    title,
    organizationName,
    dateFrom,
    dateTo,
    status,
    autoFill = false,
    employees,
    initialEntries,
    printEmptyRows = 0,
  } = props;
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDocTitle, setSettingsDocTitle] = useState(title || "Журнал здоровья");
  const [emptyRows, setEmptyRows] = useState(String(printEmptyRows));
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Mobile-only view preference: 'cards' (default) vs 'table'. See
  // hygiene-document-client.tsx for the full rationale — a 1100-px-wide
  // grid behind horizontal scroll is unusable on a phone, so by default
  // we collapse the journal into an accordion per employee. Print and
  // sm+ viewports always use the table.
  const [mobileView, setMobileView] = useState<"cards" | "table">("cards");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("health-mobile-view");
      if (saved === "table" || saved === "cards") setMobileView(saved);
    } catch {
      /* localStorage blocked — fall back to default 'cards' */
    }
  }, []);

  function switchMobileView(next: "cards" | "table") {
    setMobileView(next);
    try {
      window.localStorage.setItem("health-mobile-view", next);
    } catch {
      /* ignore */
    }
  }

  const dateKeys = buildDateKeys(dateFrom, dateTo);
  const includedEmployeeIds = [...new Set(initialEntries.map((entry) => entry.employeeId))];
  const rosterUsers = employees.filter((employee) => includedEmployeeIds.includes(employee.id));
  const printableEmployees = buildHygieneExampleEmployees(
    rosterUsers,
    Math.max(rosterUsers.length + printEmptyRows, 5)
  );
  const monthLabel = formatMonthLabel(dateFrom, dateTo);
  const organizationLabel = organizationName || 'ООО "Тест"';
  const documentTitle = title || "Журнал здоровья";
  const entryMap: Record<string, HealthEntryData> = {};

  initialEntries.forEach((entry) => {
    entryMap[makeCellKey(entry.employeeId, entry.date)] = normalizeHealthEntryData(entry.data);
  });

  const selectedCount = selectedEmployeeIds.length;
  const allSelected = rosterUsers.length > 0 && selectedCount === rosterUsers.length;

  function toggleEmployee(employeeId: string, checked: boolean) {
    setSelectedEmployeeIds((current) =>
      checked ? [...new Set([...current, employeeId])] : current.filter((item) => item !== employeeId)
    );
  }

  async function handleDeleteSelected() {
    if (selectedEmployeeIds.length === 0) return;
    if (status !== "active") return;

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

  async function handleSaveSettings() {
    if (status !== "active") return;
    setIsSavingSettings(true);
    try {
      await requestJson(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settingsDocTitle.trim() || "Журнал здоровья",
          config: {
            printEmptyRows: Math.max(0, Number(emptyRows) || 0),
          },
        }),
      });
      setSettingsOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
  }

  return (
    <div className="bg-white text-black">
      <FocusTodayScroller />
      {/* Back-link + Print are rendered by StaffJournalToolbar below. */}
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

          .health-sheet {
            width: 100%;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .health-grid {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
          }

          .health-grid th,
          .health-grid td {
            font-size: 10px !important;
            line-height: 1.1 !important;
            padding: 4px 3px !important;
          }

          .health-header td {
            font-size: 11px !important;
            line-height: 1.15 !important;
            padding: 8px 10px !important;
          }

          .health-title {
            font-size: 24px !important;
            margin-bottom: 24px !important;
          }

          .health-notes {
            font-size: 10px !important;
            line-height: 1.25 !important;
            margin-top: 24px !important;
          }

          .health-checkbox {
            width: 10px !important;
            height: 10px !important;
            border-radius: 2px !important;
          }
        }
      `}</style>

      <div className="health-sheet mx-auto max-w-[1720px] px-4 py-4 sm:px-8 sm:py-6">
        <div className="screen-only mb-6 space-y-4 sm:mb-10 sm:space-y-8">
          <StaffJournalToolbar
            documentId={documentId}
            heading="Журнал Здоровья"
            title={documentTitle}
            status={status}
            autoFill={autoFill}
            responsibleTitle={props.responsibleTitle}
            users={employees}
            includedEmployeeIds={includedEmployeeIds}
            routeCode="health_check"
            organizationName={organizationLabel}
            showHeaderActions
            hideAutoFill
            onSettingsClick={() => {
              setSettingsDocTitle(documentTitle);
              setEmptyRows(String(printEmptyRows));
              setSettingsOpen(true);
            }}
          />

          {status === "active" && selectedCount > 0 && (
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
          )}

          {/* Mobile-only view toggle. Cards = accordion per employee (a
              lot easier to read on a 320-px phone than a 1100-px grid
              behind horizontal scroll). */}
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

        {/* Mobile Cards view — hidden on sm+ and in print. Read-only
            display of each employee's per-day sign-off and measures. */}
        {mobileView === "cards" ? (
          <div className="mb-6 space-y-2 sm:hidden print:hidden">
            {printableEmployees
              .filter((employee) => employee.name)
              .map((employee) => {
                const expanded = expandedEmployeeId === employee.id;
                const signedCount = dateKeys.reduce((acc, dk) => {
                  const d = entryMap[makeCellKey(employee.id, dk)];
                  return acc + (d?.signed ? 1 : 0);
                }, 0);
                const isSelected = selectedEmployeeIds.includes(employee.id);
                const measures = getHealthMeasures(
                  employee.id,
                  dateKeys,
                  entryMap
                );

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
                            if (status !== "active") return;
                            toggleEmployee(employee.id, Boolean(checked));
                          }}
                          disabled={status !== "active"}
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
                            {employee.position ||
                              getHygienePositionLabel("operator")}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[11px] font-semibold text-[#5566f6]">
                          {signedCount}/{dateKeys.length}
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
                          const d = entryMap[makeCellKey(employee.id, dateKey)];
                          const signed = Boolean(d?.signed);
                          return (
                            <div
                              key={`${employee.id}:${dateKey}`}
                              className="flex items-center gap-2 rounded-xl px-1 py-1.5"
                            >
                              <span className="w-12 shrink-0 text-center text-[13px] font-medium text-[#6f7282]">
                                {getDayNumber(dateKey)}{" "}
                                {getWeekdayShort(dateKey)}.
                              </span>
                              <span
                                className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-[12px] font-medium ${
                                  signed
                                    ? "bg-[#f5f6ff] text-[#5566f6]"
                                    : "bg-[#fafbff] text-[#9b9fb3]"
                                }`}
                              >
                                {signed ? "Подпись есть" : "— не заполнено"}
                              </span>
                            </div>
                          );
                        })}
                        {measures.length > 0 ? (
                          <div className="mt-2 rounded-xl border border-[#ececf4] bg-[#fafbff] p-3 text-[13px] leading-5 text-[#3c4053]">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f7282]">
                              Принятые меры
                            </div>
                            {measures.map((item) => (
                              <div key={`${employee.id}:m:${item}`}>{item}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            {printableEmployees.filter((employee) => employee.name).length ===
            0 ? (
              <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-5 text-center text-[13px] text-[#6f7282]">
                В документе пока нет сотрудников.
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
        <div className="mx-auto min-w-[1100px] max-w-[1860px] sm:min-w-0">
          <div className="mb-10">
            <HealthHeader organizationLabel={organizationLabel} pageLabel="СТР. 1 ИЗ 1" />
          </div>

          <div className="health-title mb-8 text-center text-[34px] font-bold uppercase">
            {documentTitle}
          </div>

          <table className="health-grid w-full border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th
                  className="w-[42px] border border-black p-2 text-center font-semibold"
                  rowSpan={2}
                >
                  <HealthCheckbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      if (status !== "active") return;
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
                  №
                  <br />
                  п/п
                </th>
                <th
                  className="w-[230px] border border-black p-2 text-center font-semibold"
                  rowSpan={2}
                >
                  Ф.И.О. работника
                </th>
                <th
                  className="w-[270px] border border-black p-2 text-center font-semibold"
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
                <th
                  className="w-[200px] border border-black p-2 text-center font-semibold"
                  rowSpan={2}
                >
                  Принятые меры
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                {dateKeys.map((dateKey) => (
                  <th
                    key={dateKey}
                    data-focus-today={dateKey === toDateKey(new Date()) ? "" : undefined}
                    className="w-[58px] border border-black p-2 text-center font-semibold"
                  >
                    <div>{getDayNumber(dateKey)}</div>
                    <div>{getWeekdayShort(dateKey)}.</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {printableEmployees.map((employee) => {
                const measures = getHealthMeasures(employee.id, dateKeys, entryMap);

                return (
                  <tr key={employee.id}>
                    <td className="border border-black p-2 text-center align-middle">
                      {employee.name ? (
                        <HealthCheckbox
                          checked={selectedEmployeeIds.includes(employee.id)}
                          onCheckedChange={(checked) => {
                            if (status !== "active") return;
                            toggleEmployee(employee.id, checked);
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="border border-black p-2 text-center align-middle">
                      {employee.name ? employee.number : ""}
                    </td>
                    <td className="border border-black p-2 text-center align-middle">
                      {employee.name || ""}
                    </td>
                    <td className="border border-black p-2 text-center align-middle">
                      {employee.name
                        ? employee.position || getHygienePositionLabel("operator")
                        : ""}
                    </td>
                    {dateKeys.map((dateKey) => {
                      const data = entryMap[makeCellKey(employee.id, dateKey)];

                      return (
                        <td
                          key={`${employee.id}:${dateKey}`}
                          className="border border-black p-2 text-center align-middle"
                        >
                          {data?.signed ? "+" : ""}
                        </td>
                      );
                    })}
                    <td className="border border-black px-3 py-2 align-middle">
                      <div className="space-y-1 text-left text-[14px] leading-5">
                        {measures.map((item) => (
                          <div key={`${employee.id}:${item}`}>{item}</div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}

              <tr>
                <td className="border border-black p-2 text-center align-middle">
                  <HealthCheckbox />
                </td>
                <td className="border border-black p-2 text-center" />
                <td className="border border-black p-2 text-center" />
                <td className="border border-black p-2 text-center" />
                {dateKeys.map((dateKey) => (
                  <td key={`blank:${dateKey}`} className="border border-black p-2" />
                ))}
                <td className="border border-black p-2" />
              </tr>
            </tbody>
          </table>

          <div className="health-notes mt-12 space-y-7 text-[16px] leading-7">
            {HEALTH_REGISTER_NOTES.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <p className="font-semibold">{HEALTH_REGISTER_REMINDER}</p>
          </div>
        </div>
        </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[520px]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[22px] font-medium text-black">
              Настройки документа
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="health-doc-title">Название документа</Label>
              <Input
                id="health-doc-title"
                value={settingsDocTitle}
                onChange={(event) => setSettingsDocTitle(event.target.value)}
                placeholder="Введите название документа"
                className="h-11 rounded-2xl border-[#dfe1ec] px-4"
              />
            </div>
            <div className="space-y-2">
              <Label>Добавлять пустых строк при печати</Label>
              <select
                value={emptyRows}
                onChange={(event) => setEmptyRows(event.target.value)}
                className="h-11 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-4 text-sm"
              >
                {[0, 1, 2, 3, 4, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="h-11 rounded-2xl bg-[#5566f6] px-5 text-[15px] text-white hover:bg-[#4b57ff]"
              >
                {isSavingSettings ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
