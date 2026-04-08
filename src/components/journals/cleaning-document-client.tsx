"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CLEANING_DOCUMENT_TITLE,
  CLEANING_LEGEND,
  createCleaningConfigItem,
  getCleaningMarkCode,
  normalizeCleaningEntryData,
  type CleaningConfigItem,
  type CleaningDocumentConfig,
} from "@/lib/cleaning-document";
import {
  buildDateKeys,
  formatMonthLabel,
  getDayNumber,
  getHygienePositionLabel,
  isWeekend,
} from "@/lib/hygiene-document";

type EmployeeItem = {
  id: string;
  name: string;
  role: string;
};

type AreaItem = {
  id: string;
  name: string;
};

type EntryItem = {
  id: string;
  employeeId: string;
  date: string;
  data: {
    mark: "routine" | "general" | null;
  };
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  status: string;
  autoFill?: boolean;
  employees: EmployeeItem[];
  areas: AreaItem[];
  config: CleaningDocumentConfig;
  initialEntries: EntryItem[];
};

function JournalHeader({
  organizationName,
}: {
  organizationName: string;
}) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        <tr>
          <td
            rowSpan={2}
            className="w-[240px] border border-black px-6 py-6 text-center text-[18px] font-semibold"
          >
            {organizationName}
          </td>
          <td className="border border-black px-6 py-4 text-center text-[16px] uppercase">
            СИСТЕМА ХАССП
          </td>
          <td
            rowSpan={2}
            className="w-[140px] border border-black px-6 py-6 text-center text-[16px] uppercase"
          >
            СТР. 1 ИЗ 1
          </td>
        </tr>
        <tr>
          <td className="border border-black px-6 py-4 text-center text-[16px] italic uppercase">
            ЖУРНАЛ УБОРКИ
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function CleaningRowDialog({
  open,
  onOpenChange,
  initialRow,
  canDelete,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialRow: CleaningConfigItem | null;
  canDelete: boolean;
  onSave: (row: CleaningConfigItem) => Promise<void>;
  onDelete: (rowId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [detergent, setDetergent] = useState("");
  const [routineScope, setRoutineScope] = useState("");
  const [generalScope, setGeneralScope] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    const row = initialRow || createCleaningConfigItem();
    setName(row.name);
    setDetergent(row.detergent);
    setRoutineScope(row.routineScope);
    setGeneralScope(row.generalScope);
  }, [initialRow, open]);

  async function handleSave() {
    const nextRow = createCleaningConfigItem({
      id: initialRow?.id,
      sourceAreaId: initialRow?.sourceAreaId || null,
      name,
      detergent,
      routineScope,
      generalScope,
    });

    setIsSubmitting(true);
    try {
      await onSave(nextRow);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialRow) return;

    setIsSubmitting(true);
    try {
      await onDelete(initialRow.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[32px] font-medium text-black">
            {initialRow ? "Редактирование строки" : "Добавление помещения"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-14 py-12">
          <div className="space-y-3">
            <Label htmlFor="cleaning-room-name">Наименование помещения</Label>
            <Input
              id="cleaning-room-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="cleaning-row-detergent">Моющие и дезинфицирующие средства</Label>
            <Textarea
              id="cleaning-row-detergent"
              value={detergent}
              onChange={(event) => setDetergent(event.target.value)}
              className="min-h-[96px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="cleaning-row-routine">Текущая уборка</Label>
            <Textarea
              id="cleaning-row-routine"
              value={routineScope}
              onChange={(event) => setRoutineScope(event.target.value)}
              className="min-h-[96px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="cleaning-row-general">Генеральная уборка</Label>
            <Textarea
              id="cleaning-row-general"
              value={generalScope}
              onChange={(event) => setGeneralScope(event.target.value)}
              className="min-h-[96px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[16px]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {initialRow && canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="h-14 rounded-2xl border-[#ffd7d3] px-6 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
                >
                  Удалить строку
                </Button>
              )}
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || name.trim() === ""}
              className="h-14 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : initialRow ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function makeCellKey(rowId: string, dateKey: string) {
  return `${rowId}:${dateKey}`;
}

function getNextMark(mark: "routine" | "general" | null) {
  if (mark === null) return "routine" as const;
  if (mark === "routine") return "general" as const;
  return null;
}

export function CleaningDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  responsibleUserId,
  status,
  autoFill = false,
  employees,
  areas,
  config,
  initialEntries,
}: Props) {
  const router = useRouter();
  const dateKeys = useMemo(() => buildDateKeys(dateFrom, dateTo), [dateFrom, dateTo]);
  const monthLabel = useMemo(() => formatMonthLabel(dateFrom, dateTo), [dateFrom, dateTo]);
  const [configState, setConfigState] = useState(config);
  const [entries, setEntries] = useState(initialEntries);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [checkedAutoFill, setCheckedAutoFill] = useState(autoFill);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [editingRow, setEditingRow] = useState<CleaningConfigItem | null>(null);
  const [creatingRowOpen, setCreatingRowOpen] = useState(false);

  useEffect(() => {
    setConfigState(config);
  }, [config]);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    setCheckedAutoFill(autoFill);
  }, [autoFill]);

  const entryMap = useMemo(() => {
    const map: Record<string, EntryItem> = {};
    entries.forEach((entry) => {
      map[makeCellKey(entry.employeeId, entry.date)] = entry;
    });
    return map;
  }, [entries]);

  const userMap = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const cleaningResponsible = configState.responsibleCleaningUserId
    ? userMap[configState.responsibleCleaningUserId]
    : null;
  const controlResponsible = configState.responsibleControlUserId
    ? userMap[configState.responsibleControlUserId]
    : null;

  const filledDateKeys = useMemo(
    () => new Set(entries.map((entry) => entry.date)),
    [entries]
  );

  async function persistDocument(body: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось обновить документ");
    }

    return result;
  }

  async function saveConfig(
    nextConfig: CleaningDocumentConfig,
    extraBody: Record<string, unknown> = {}
  ) {
    const previousConfig = configState;
    setConfigState(nextConfig);
    setIsSavingSettings(true);

    try {
      await persistDocument({
        config: nextConfig,
        ...extraBody,
      });
    } catch (error) {
      setConfigState(previousConfig);
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleCleaningResponsibleChange(userId: string) {
    const nextConfig = {
      ...configState,
      responsibleCleaningUserId: userId,
    };

    try {
      await saveConfig(nextConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    }
  }

  async function handleControlResponsibleChange(userId: string) {
    const employee = employees.find((item) => item.id === userId);
    const nextConfig = {
      ...configState,
      responsibleControlUserId: userId,
    };

    try {
      await saveConfig(nextConfig, {
        responsibleUserId: userId,
        responsibleTitle: employee ? getHygienePositionLabel(employee.role) : null,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    }
  }

  async function handleSkipWeekendsChange(value: boolean) {
    const nextConfig = {
      ...configState,
      skipWeekends: value,
    };

    try {
      await saveConfig(nextConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    }
  }

  async function handleAutoFillChange(value: boolean) {
    setCheckedAutoFill(value);
    setIsSwitching(true);

    try {
      await persistDocument({ autoFill: value });

      if (value) {
        const response = await fetch(`/api/journal-documents/${documentId}/cleaning`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply_auto_fill" }),
        });

        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error || "Не удалось применить автозаполнение");
        }
      }

      router.refresh();
    } catch (error) {
      setCheckedAutoFill(!value);
      window.alert(
        error instanceof Error ? error.message : "Ошибка обновления автозаполнения"
      );
    } finally {
      setIsSwitching(false);
    }
  }

  async function saveCell(rowId: string, date: string, mark: "routine" | "general" | null) {
    const response = await fetch(`/api/journal-documents/${documentId}/cleaning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_cell",
        rowId,
        date,
        mark,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить значение");
    }

    setEntries((current) => {
      if (!mark) {
        return current.filter((entry) => !(entry.employeeId === rowId && entry.date === date));
      }

      const normalizedEntry: EntryItem = {
        id:
          typeof result?.entry?.id === "string"
            ? result.entry.id
            : `${rowId}:${date}`,
        employeeId: rowId,
        date,
        data: {
          mark,
        },
      };

      const existingIndex = current.findIndex(
        (entry) => entry.employeeId === rowId && entry.date === date
      );

      if (existingIndex === -1) {
        return [...current, normalizedEntry];
      }

      const next = [...current];
      next[existingIndex] = normalizedEntry;
      return next;
    });
  }

  async function handleCellClick(rowId: string, date: string) {
    const currentEntry = entryMap[makeCellKey(rowId, date)];
    const currentMark = normalizeCleaningEntryData(currentEntry?.data).mark;
    const nextMark = getNextMark(currentMark);

    try {
      await saveCell(rowId, date, nextMark);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения");
    }
  }

  async function syncRemovedRows(removedRowIds: string[]) {
    if (removedRowIds.length === 0) return;

    const response = await fetch(`/api/journal-documents/${documentId}/cleaning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sync_rows",
        removedRowIds,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось синхронизировать строки");
    }
  }

  async function handleSaveRow(row: CleaningConfigItem) {
    const existingIndex = configState.rows.findIndex((item) => item.id === row.id);
    const nextRows =
      existingIndex === -1
        ? [...configState.rows, row]
        : configState.rows.map((item) => (item.id === row.id ? row : item));

    const nextConfig = {
      ...configState,
      rows: nextRows,
    };

    try {
      await saveConfig(nextConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения строки");
    }
  }

  async function handleDeleteRow(rowId: string) {
    const nextRows = configState.rows.filter((row) => row.id !== rowId);
    if (nextRows.length === 0) {
      window.alert("В журнале должна остаться хотя бы одна строка.");
      return;
    }

    const nextConfig = {
      ...configState,
      rows: nextRows,
    };

    try {
      await saveConfig(nextConfig);
      setEntries((current) => current.filter((entry) => entry.employeeId !== rowId));
      setSelectedRowIds((current) => current.filter((id) => id !== rowId));
      await syncRemovedRows([rowId]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка удаления строки");
    }
  }

  async function handleFillFromAreas() {
    const existingAreaIds = new Set(
      configState.rows
        .map((row) => row.sourceAreaId)
        .filter((value): value is string => Boolean(value))
    );

    const rowsToAdd = areas
      .filter((area) => !existingAreaIds.has(area.id))
      .map((area) =>
        createCleaningConfigItem({
          sourceAreaId: area.id,
          name: area.name,
          detergent: "",
          routineScope: "Пол, рабочие поверхности, двери",
          generalScope: "Пол, стены, рабочие поверхности, двери",
        })
      );

    if (rowsToAdd.length === 0) {
      window.alert("Все помещения из настроек уже добавлены.");
      return;
    }

    const nextConfig = {
      ...configState,
      rows: [...configState.rows, ...rowsToAdd],
    };

    try {
      await saveConfig(nextConfig);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка добавления помещений");
    }
  }

  async function handleDeleteSelectedRows() {
    if (selectedRowIds.length === 0) return;

    const nextRows = configState.rows.filter((row) => !selectedRowIds.includes(row.id));
    if (nextRows.length === 0) {
      window.alert("В журнале должна остаться хотя бы одна строка.");
      return;
    }

    const confirmed = window.confirm("Удалить выбранные строки?");
    if (!confirmed) return;

    const removedRowIds = [...selectedRowIds];
    const nextConfig = {
      ...configState,
      rows: nextRows,
    };

    try {
      await saveConfig(nextConfig);
      setEntries((current) =>
        current.filter((entry) => !removedRowIds.includes(entry.employeeId))
      );
      setSelectedRowIds([]);
      await syncRemovedRows(removedRowIds);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка удаления строк");
    }
  }

  const documentTitle = title || CLEANING_DOCUMENT_TITLE;
  void responsibleUserId;

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

          .cleaning-sheet {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .cleaning-grid th,
          .cleaning-grid td,
          .cleaning-scope-grid th,
          .cleaning-scope-grid td {
            font-size: 9px !important;
            line-height: 1.15 !important;
            padding: 4px 3px !important;
          }
        }
      `}</style>

      <div className="cleaning-sheet mx-auto max-w-[1900px] px-8 py-6">
        <div className="screen-only mb-10 space-y-8">
          <div className="flex items-start justify-between gap-6">
            <h1 className="text-[62px] font-semibold tracking-[-0.04em] text-black">
              {CLEANING_DOCUMENT_TITLE}
            </h1>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(`/api/journal-documents/${documentId}/pdf`, "_blank")}
                className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                <Printer className="size-5" />
                Печать
              </Button>

              {status === "active" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSettingsOpen((current) => !current)}
                  className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
                >
                  Настройки журнала
                  {settingsOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                </Button>
              )}
            </div>
          </div>

          {status === "active" && settingsOpen && (
            <div className="rounded-[24px] bg-[#f3f4fe] px-6 py-6">
              <div className="grid gap-6">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={checkedAutoFill}
                    onCheckedChange={handleAutoFillChange}
                    disabled={isSwitching}
                    className="h-10 w-16 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
                  />
                  <span className="text-[20px] font-medium text-black">
                    Автоматически заполнять журнал
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[18px] text-black">Ответственный за уборку</Label>
                    <Select
                      value={configState.responsibleCleaningUserId || ""}
                      onValueChange={handleCleaningResponsibleChange}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="h-16 rounded-2xl border-[#dfe1ec] bg-white px-5 text-[18px]">
                        <SelectValue placeholder="Выберите сотрудника" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[18px] text-black">Ответственный за контроль</Label>
                    <Select
                      value={configState.responsibleControlUserId || ""}
                      onValueChange={handleControlResponsibleChange}
                      disabled={isSavingSettings}
                    >
                      <SelectTrigger className="h-16 rounded-2xl border-[#dfe1ec] bg-white px-5 text-[18px]">
                        <SelectValue placeholder="Выберите сотрудника" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Checkbox
                    id="skip-weekends-cleaning"
                    checked={configState.skipWeekends}
                    onCheckedChange={(checked) => handleSkipWeekendsChange(checked === true)}
                    disabled={isSavingSettings}
                  />
                  <Label htmlFor="skip-weekends-cleaning" className="text-[18px] text-black">
                    Не заполнять в выходные дни
                  </Label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto max-w-[1750px] space-y-8">
          <JournalHeader organizationName={organizationName} />

          <div className="text-center text-[30px] font-bold uppercase">{documentTitle}</div>

          {status === "active" && (
            <div className="screen-only flex items-center justify-between gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-[58px] rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4b57ff]">
                    <Plus className="size-6" />
                    Добавить
                    <ChevronDown className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[320px] rounded-[24px] border-0 p-4 shadow-xl">
                  <DropdownMenuItem
                    className="h-14 rounded-2xl px-4 text-[18px] text-[#5464ff]"
                    onSelect={() => setCreatingRowOpen(true)}
                  >
                    Добавить помещение
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-14 rounded-2xl px-4 text-[18px] text-[#5464ff]"
                    onSelect={handleFillFromAreas}
                  >
                    Заполнить из списка помещений
                  </DropdownMenuItem>
                  {selectedRowIds.length > 0 && (
                    <DropdownMenuItem
                      className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                      onSelect={handleDeleteSelectedRows}
                    >
                      <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
                      Удалить выбранные
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {selectedRowIds.length > 0 && (
                <div className="text-[16px] text-[#6f7282]">Выбрано строк: {selectedRowIds.length}</div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="cleaning-grid min-w-max w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-[#f2f2f2]">
                  <th rowSpan={2} className="w-[48px] border border-black p-2 text-center">
                    <div className="mx-auto h-4 w-4 rounded-[4px] border border-black bg-white" />
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[340px] border border-black p-2 text-center font-semibold"
                  >
                    Наименование помещения
                  </th>
                  <th
                    rowSpan={2}
                    className="w-[300px] border border-black p-2 text-center font-semibold"
                  >
                    Моющие и дезинфицирующие средства
                  </th>
                  <th colSpan={dateKeys.length} className="border border-black p-2 text-center font-semibold">
                    Месяц {monthLabel}
                  </th>
                </tr>
                <tr className="bg-[#f2f2f2]">
                  {dateKeys.map((dateKey) => (
                    <th
                      key={dateKey}
                      className={`w-[50px] border border-black p-2 text-center font-semibold ${
                        isWeekend(dateKey) ? "bg-[#ececf3]" : ""
                      }`}
                    >
                      {getDayNumber(dateKey)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {configState.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="border border-black p-2 text-center align-middle">
                      <div className="screen-only flex justify-center">
                        <Checkbox
                          checked={selectedRowIds.includes(row.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRowIds((current) =>
                              checked === true
                                ? [...new Set([...current, row.id])]
                                : current.filter((item) => item !== row.id)
                            );
                          }}
                          disabled={status !== "active"}
                        />
                      </div>
                    </td>
                    <td className="border border-black p-2 align-middle">
                      {status === "active" ? (
                        <button
                          type="button"
                          onClick={() => setEditingRow(row)}
                          className="text-left font-medium hover:text-[#5464ff]"
                        >
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="border border-black p-2 align-middle">{row.detergent}</td>
                    {dateKeys.map((dateKey) => {
                      const entry = entryMap[makeCellKey(row.id, dateKey)];
                      const mark = normalizeCleaningEntryData(entry?.data).mark;
                      const code = getCleaningMarkCode(mark);

                      return (
                        <td
                          key={`${row.id}:${dateKey}`}
                          className={`border border-black p-0 text-center align-middle ${
                            isWeekend(dateKey) ? "bg-[#fafafe]" : ""
                          }`}
                        >
                          {status === "active" ? (
                            <button
                              type="button"
                              onClick={() => handleCellClick(row.id, dateKey)}
                              className="h-full min-h-[44px] w-full text-[16px] font-medium"
                            >
                              {code}
                            </button>
                          ) : (
                            <div className="min-h-[44px] py-2 text-[16px] font-medium">{code}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr className="bg-[#fafafa]">
                  <td className="border border-black p-2" />
                  <td className="border border-black p-2 font-medium">Ответственный за уборку</td>
                  <td className="border border-black p-2">
                    {cleaningResponsible ? `С1 - ${cleaningResponsible.name}` : ""}
                  </td>
                  {dateKeys.map((dateKey) => (
                    <td key={`cleaning-responsible:${dateKey}`} className="border border-black p-2 text-center">
                      {filledDateKeys.has(dateKey) ? "С1" : ""}
                    </td>
                  ))}
                </tr>

                <tr className="bg-[#fafafa]">
                  <td className="border border-black p-2" />
                  <td className="border border-black p-2 font-medium">Ответственный за контроль</td>
                  <td className="border border-black p-2">
                    {controlResponsible ? `С1 - ${controlResponsible.name}` : ""}
                  </td>
                  {dateKeys.map((dateKey) => (
                    <td key={`control-responsible:${dateKey}`} className="border border-black p-2 text-center">
                      {filledDateKeys.has(dateKey) ? "С1" : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2 text-[16px] leading-7">
            <div className="font-semibold italic underline">Условные обозначения:</div>
            {CLEANING_LEGEND.map((item) => (
              <div key={item} className="italic">
                {item}
              </div>
            ))}
          </div>

          <table className="cleaning-scope-grid w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[360px] border border-black p-2 text-center font-semibold">
                  Наименование помещения
                </th>
                <th className="border border-black p-2 text-center font-semibold">
                  Текущая уборка
                </th>
                <th className="border border-black p-2 text-center font-semibold">
                  Генеральная уборка
                </th>
              </tr>
            </thead>
            <tbody>
              {configState.rows.map((row) => (
                <tr key={`scope:${row.id}`}>
                  <td className="border border-black p-2 align-top">{row.name}</td>
                  <td className="border border-black p-2 align-top">{row.routineScope}</td>
                  <td className="border border-black p-2 align-top">{row.generalScope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CleaningRowDialog
        open={creatingRowOpen}
        onOpenChange={setCreatingRowOpen}
        initialRow={null}
        canDelete={false}
        onSave={handleSaveRow}
        onDelete={handleDeleteRow}
      />

      <CleaningRowDialog
        open={!!editingRow}
        onOpenChange={(value) => {
          if (!value) setEditingRow(null);
        }}
        initialRow={editingRow}
        canDelete={configState.rows.length > 1}
        onSave={handleSaveRow}
        onDelete={handleDeleteRow}
      />
    </div>
  );
}
