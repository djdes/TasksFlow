"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, X } from "lucide-react";
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
  type HealthEntryData,
} from "@/lib/hygiene-document";

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
  return <Checkbox checked={props.checked} onCheckedChange={(value) => props.onCheckedChange?.(value === true)} className="mx-auto h-5 w-5 rounded-[5px] border-[#c8ccda]" />;
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
  const [emptyRows, setEmptyRows] = useState(String(printEmptyRows));
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      window.alert(error instanceof Error ? error.message : "Ошибка удаления строк");
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
          config: {
            printEmptyRows: Math.max(0, Number(emptyRows) || 0),
          },
        }),
      });
      setSettingsOpen(false);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    } finally {
      setIsSavingSettings(false);
    }
  }

  return (
    <div className="bg-white text-black">
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

      <div className="health-sheet mx-auto max-w-[1720px] px-8 py-6">
        <div className="screen-only mb-10 space-y-10">
          <StaffJournalToolbar
            documentId={documentId}
            heading="Журнал здоровья"
            title={documentTitle}
            status={status}
            autoFill={autoFill}
            responsibleTitle={props.responsibleTitle}
            users={employees}
            includedEmployeeIds={includedEmployeeIds}
          />

          <div className="flex flex-wrap items-center gap-3">
            {status === "active" && selectedCount > 0 && (
              <>
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
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => status === "active" && setSettingsOpen(true)}
              disabled={status !== "active"}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            >
              <Settings2 className="size-4" />
              Настройки печати
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-[1860px]">
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[22px] font-medium text-black">
              Настройки журнала
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="health-print-empty-rows">Пустые строки при печати</Label>
              <Input
                id="health-print-empty-rows"
                type="number"
                min={0}
                max={50}
                value={emptyRows}
                onChange={(event) => setEmptyRows(event.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec]"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="h-11 rounded-2xl bg-[#5b66ff] px-5 text-[15px] text-white hover:bg-[#4b57ff]"
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
