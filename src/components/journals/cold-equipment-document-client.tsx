"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Printer,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createColdEquipmentConfigItem,
  createEmptyColdEquipmentEntryData,
  getColdEquipmentDateLabel,
  normalizeColdEquipmentDocumentConfig,
  type ColdEquipmentConfigItem,
  type ColdEquipmentDocumentConfig,
  type ColdEquipmentEntryData,
} from "@/lib/cold-equipment-document";
import {
  buildDateKeys,
  getDayNumber,
  getHygienePositionLabel,
  getWeekdayShort,
  isWeekend,
} from "@/lib/hygiene-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

import { toast } from "sonner";
type EmployeeItem = {
  id: string;
  name: string;
  role: string;
};

type EntryRow = {
  id: string;
  employeeId: string;
  date: string;
  data: ColdEquipmentEntryData;
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
  config: ColdEquipmentDocumentConfig;
  initialEntries: EntryRow[];
};

function formatRange(min: number | null, max: number | null) {
  if (min == null && max == null) return "Норма не задана";
  if (min != null && max != null) return `от ${min}°C до ${max}°C`;
  if (min != null) return `от ${min}°C`;
  return `до ${max}°C`;
}

function buildResponsibleCodes(
  employees: EmployeeItem[],
  rows: EntryRow[],
  defaultResponsibleUserId: string | null
) {
  const codeMap: Record<string, string> = {};
  const usedIds = new Set<string>();

  rows.forEach((row) => {
    if (row.employeeId) usedIds.add(row.employeeId);
  });

  if (defaultResponsibleUserId) usedIds.add(defaultResponsibleUserId);

  Array.from(usedIds).forEach((employeeId, index) => {
    codeMap[employeeId] = `С${index + 1}`;
  });

  return {
    codeMap,
    items: Array.from(usedIds)
      .map((employeeId) => {
        const employee = employees.find((item) => item.id === employeeId);
        if (!employee) return null;

        return {
          employeeId,
          code: codeMap[employeeId],
          label: `${codeMap[employeeId]} - ${employee.name}`,
        };
      })
      .filter(
        (
          item
        ): item is {
          employeeId: string;
          code: string;
          label: string;
        } => item !== null
      ),
  };
}

function EquipmentDialog({
  open,
  onOpenChange,
  initialItem,
  canDelete,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialItem: ColdEquipmentConfigItem | null;
  canDelete: boolean;
  onSave: (item: ColdEquipmentConfigItem) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialItem?.name || "");
  const [min, setMin] = useState(initialItem?.min?.toString() || "");
  const [max, setMax] = useState(initialItem?.max?.toString() || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialItem?.name || "");
    setMin(initialItem?.min?.toString() || "");
    setMax(initialItem?.max?.toString() || "");
  }, [initialItem, open]);

  async function handleSave() {
    const item = createColdEquipmentConfigItem({
      id: initialItem?.id,
      sourceEquipmentId: initialItem?.sourceEquipmentId || null,
      name,
      min: min === "" ? null : Number(min),
      max: max === "" ? null : Number(max),
    });

    setIsSubmitting(true);
    try {
      await onSave(item);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialItem) return;
    setIsSubmitting(true);
    try {
      await onDelete(initialItem.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[760px] overflow-y-auto rounded-[36px] border-0 p-0 shadow-[0_40px_140px_rgba(40,45,86,0.18)]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-[#d8dcea] px-12 py-10">
          <DialogTitle className="text-[22px] font-medium text-black">
            {initialItem ? "Редактирование оборудования" : "Добавление оборудования"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-black transition hover:bg-[#f3f4fb]"
          >
            <X className="size-9" />
          </button>
        </DialogHeader>

        <div className="space-y-7 px-12 py-10">
          <div className="space-y-3">
            <Label htmlFor="equipment-name" className="text-[14px] text-[#73738a]">
              Наименование
            </Label>
            <Input
              id="equipment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Холодильная камера"
              className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="equipment-min" className="text-[14px] text-[#73738a]">
                Температура от
              </Label>
              <Input
                id="equipment-min"
                type="number"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="equipment-max" className="text-[14px] text-[#73738a]">
                Температура до
              </Label>
              <Input
                id="equipment-max"
                type="number"
                value={max}
                onChange={(event) => setMax(event.target.value)}
                className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {initialItem && canDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="h-14 rounded-2xl border-[#ffd7d3] px-6 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
                >
                  Удалить строку
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || name.trim() === ""}
              className="h-14 rounded-2xl bg-[#5566f6] px-8 text-[18px] text-white hover:bg-[#4858eb]"
            >
              {isSubmitting ? "Сохранение..." : initialItem ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JournalSettingsDialog({
  open,
  onOpenChange,
  title,
  responsibleTitle,
  responsibleUserId,
  employees,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  employees: EmployeeItem[];
  config: ColdEquipmentDocumentConfig;
  onSave: (params: {
    title: string;
    responsibleTitle: string | null;
    responsibleUserId: string | null;
    config: ColdEquipmentDocumentConfig;
  }) => Promise<void>;
}) {
  const titleOptions = useMemo(
    () => [...new Set(employees.map((employee) => getHygienePositionLabel(employee.role)))],
    [employees]
  );

  const [name, setName] = useState(title);
  const [position, setPosition] = useState(responsibleTitle || titleOptions[0] || "");
  const [userId, setUserId] = useState(responsibleUserId || employees[0]?.id || "");
  const [skipWeekends, setSkipWeekends] = useState(config.skipWeekends);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(title);
    setPosition(responsibleTitle || titleOptions[0] || "");
    setUserId(responsibleUserId || employees[0]?.id || "");
    setSkipWeekends(config.skipWeekends);
  }, [config.skipWeekends, employees, open, responsibleTitle, responsibleUserId, title, titleOptions]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await onSave({
        title: name.trim(),
        responsibleTitle: position || null,
        responsibleUserId: userId || null,
        config: normalizeColdEquipmentDocumentConfig({
          ...config,
          skipWeekends,
        }),
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[980px] overflow-y-auto rounded-[38px] border-0 p-0 shadow-[0_40px_140px_rgba(40,45,86,0.18)]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-[#d8dcea] px-16 py-12">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки журнала
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-black transition hover:bg-[#f3f4fb]"
          >
            <X className="size-10" />
          </button>
        </DialogHeader>

        <div className="space-y-8 px-16 py-12">
          <div className="space-y-3">
            <Label htmlFor="journal-title" className="text-[20px] text-[#8b8fa3]">
              Название журнала
            </Label>
            <Input
              id="journal-title"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-22 rounded-[24px] border-[#dfe1ec] px-8 text-[24px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[20px] text-[#8b8fa3]">
              Должность ответственного за снятие показателей
            </Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="h-22 rounded-[24px] border-[#dfe1ec] bg-[#f3f4fb] px-8 text-[22px]">
                <SelectValue placeholder="Выберите должность" />
              </SelectTrigger>
              <SelectContent>
                {titleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[20px] text-[#8b8fa3]">Сотрудник</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-22 rounded-[24px] border-[#dfe1ec] bg-[#f3f4fb] px-8 text-[22px]">
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

          <div className="flex items-center gap-4 rounded-[26px] border border-[#dfe1ec] px-8 py-6">
            <Checkbox
              id="skip-weekends"
              checked={skipWeekends}
              onCheckedChange={(checked) => setSkipWeekends(checked === true)}
            />
            <Label
              htmlFor="skip-weekends"
              className="cursor-pointer text-[20px] font-normal text-black"
            >
              Не заполнять в выходные дни
            </Label>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="h-20 rounded-[24px] bg-[#5566f6] px-12 text-[22px] text-white hover:bg-[#4858eb]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ColdEquipmentDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  responsibleTitle,
  responsibleUserId,
  status,
  autoFill = false,
  employees,
  config,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [documentTitle, setDocumentTitle] = useState(title);
  const [rows, setRows] = useState<EntryRow[]>(initialEntries);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [checkedAutoFill, setCheckedAutoFill] = useState(autoFill);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<ColdEquipmentConfigItem | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const dateKeys = useMemo(() => buildDateKeys(dateFrom, dateTo), [dateFrom, dateTo]);
  const rowByDate = useMemo(
    () =>
      Object.fromEntries(
        [...rows]
          .sort((left, right) => left.date.localeCompare(right.date))
          .map((row) => [row.date, row])
      ) as Record<string, EntryRow>,
    [rows]
  );
  const responsibleCodes = useMemo(
    () => buildResponsibleCodes(employees, rows, responsibleUserId),
    [employees, responsibleUserId, rows]
  );
  const allSelected =
    config.equipment.length > 0 &&
    selectedEquipmentIds.length === config.equipment.length;

  async function persistDocument(payload: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить документ");
    }

    return result;
  }

  async function syncEntries() {
    const response = await fetch(`/api/journal-documents/${documentId}/cold-equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_entries" }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось синхронизировать строки");
    }
  }

  async function handleSaveSettings(params: {
    title: string;
    responsibleTitle: string | null;
    responsibleUserId: string | null;
    config: ColdEquipmentDocumentConfig;
  }) {
    await persistDocument(params);
    await syncEntries();
    setDocumentTitle(params.title);
    router.refresh();
  }

  async function handleSaveEquipment(item: ColdEquipmentConfigItem) {
    const nextConfig = normalizeColdEquipmentDocumentConfig({
      ...config,
      equipment: editingEquipment
        ? config.equipment.map((current) =>
            current.id === editingEquipment.id ? item : current
          )
        : [...config.equipment, item],
    });

    await persistDocument({ config: nextConfig });
    await syncEntries();
    router.refresh();
  }

  async function handleDeleteEquipment(itemId: string) {
    const nextEquipment = config.equipment.filter((item) => item.id !== itemId);
    if (nextEquipment.length === 0) {
      toast.error("В журнале должна остаться хотя бы одна строка оборудования.");
      return;
    }

    setIsDeleting(true);
    try {
      await persistDocument({
        config: {
          ...config,
          equipment: nextEquipment,
        },
      });
      await syncEntries();
      setSelectedEquipmentIds((current) => current.filter((value) => value !== itemId));
      router.refresh();
      toast.success("Строка удалена");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось удалить строку"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteSelectedEquipment() {
    if (selectedEquipmentIds.length === 0) return;

    const nextEquipment = config.equipment.filter(
      (item) => !selectedEquipmentIds.includes(item.id)
    );
    if (nextEquipment.length === 0) {
      toast.error("В журнале должна остаться хотя бы одна строка оборудования.");
      return;
    }

    if (!window.confirm(`Удалить выбранные строки (${selectedEquipmentIds.length})?`)) return;

    setIsDeleting(true);
    try {
      await persistDocument({
        config: {
          ...config,
          equipment: nextEquipment,
        },
      });
      await syncEntries();
      setSelectedEquipmentIds([]);
      router.refresh();
      toast.success(`Удалено строк: ${selectedEquipmentIds.length}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось удалить выбранные строки"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAutoFillChange(value: boolean) {
    setCheckedAutoFill(value);
    setIsSwitching(true);

    try {
      await persistDocument({ autoFill: value });

      if (value) {
        const response = await fetch(`/api/journal-documents/${documentId}/cold-equipment`, {
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
      toast.error(
        error instanceof Error ? error.message : "Ошибка обновления автозаполнения"
      );
    } finally {
      setIsSwitching(false);
    }
  }

  async function handleTemperatureBlur(
    dateKey: string,
    equipmentId: string,
    rawValue: string
  ) {
    const employeeId = rowByDate[dateKey]?.employeeId || responsibleUserId || employees[0]?.id;
    if (!employeeId) {
      toast.error("Нет сотрудника, которого можно назначить ответственным.");
      return;
    }

    const existingRow = rowByDate[dateKey];
    const nextData = existingRow
      ? {
          ...createEmptyColdEquipmentEntryData(
            config,
            existingRow.data.responsibleTitle || responsibleTitle
          ),
          ...existingRow.data,
          temperatures: {
            ...createEmptyColdEquipmentEntryData(
              config,
              existingRow.data.responsibleTitle || responsibleTitle
            ).temperatures,
            ...existingRow.data.temperatures,
          },
        }
      : createEmptyColdEquipmentEntryData(config, responsibleTitle);

    nextData.temperatures[equipmentId] = rawValue === "" ? null : Number(rawValue);

    const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        date: dateKey,
        data: nextData,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) {
      toast.error(result?.error || "Не удалось сохранить значение");
      return;
    }

    setRows((currentRows) => {
      const nextRow: EntryRow = {
        id: result.entry.id,
        employeeId,
        date: dateKey,
        data: nextData,
      };

      const withoutCurrent = currentRows.filter((row) => row.date !== dateKey);
      return [...withoutCurrent, nextRow].sort((left, right) =>
        left.date.localeCompare(right.date)
      );
    });
  }

  async function handlePrint() {
    try {
      await openDocumentPdf(documentId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть PDF");
    }
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1880px] px-6 py-8">
        <DocumentBackLink href="/journals/cold_equipment_control" documentId={documentId} />
        <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[1260px]">
            <h1 className="text-[48px] font-semibold leading-[1.08] tracking-[-0.05em] text-black">
              {documentTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handlePrint().catch(() => undefined);
              }}
              className="h-12 rounded-2xl border-[#eef0fb] px-5 text-[17px] text-[#5566f6] shadow-none hover:bg-[#f8f9ff]"
            >
              <Printer className="size-5" />
              Печать
            </Button>

            {status === "active" ? (
              <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-18 rounded-[22px] border-[#eef0fb] px-8 text-[22px] text-[#5566f6] shadow-none hover:bg-[#f8f9ff]"
              >
                <Settings2 className="size-6" />
                Настройки журнала
              </Button>
              <DocumentCloseButton
                documentId={documentId}
                title={documentTitle}
                variant="outline"
                className="h-18 rounded-[22px] border-[#eef0fb] px-8 text-[22px] text-[#5566f6] shadow-none hover:bg-[#f8f9ff]"
              >
                Закончить журнал
              </DocumentCloseButton>
              </>
            ) : null}
          </div>
        </div>

        <div className="mb-10 rounded-[32px] bg-[#f5f6ff] px-8 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Switch
                checked={checkedAutoFill}
                onCheckedChange={handleAutoFillChange}
                disabled={status !== "active" || isSwitching}
                className="h-11 w-18 data-[state=checked]:bg-[#5566f6] data-[state=unchecked]:bg-[#d6d9ee]"
              />
              <span className="text-[22px] font-medium text-black">
                Автоматически заполнять журнал
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSummaryOpen((value) => !value)}
              className="flex size-12 items-center justify-center rounded-full text-[#5566f6] hover:bg-white/70"
            >
              {summaryOpen ? <ChevronUp className="size-7" /> : <ChevronDown className="size-7" />}
            </button>
          </div>

          {summaryOpen ? (
            <div className="mt-8 space-y-6">
              {config.equipment.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-4 rounded-[24px] bg-white/70 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_170px_170px_44px]"
                >
                  <div className="text-[20px] leading-[1.35] text-black">
                    {item.name}, Темп. (T)
                  </div>
                  <div className="rounded-[18px] border border-[#d6d9e6] bg-white px-6 py-4 text-[20px]">
                    От {item.min ?? "—"}
                  </div>
                  <div className="rounded-[18px] border border-[#d6d9e6] bg-white px-6 py-4 text-[20px]">
                    До {item.max ?? "—"}
                  </div>
                  <div className="flex items-center justify-end">
                    {status === "active" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEquipment(item);
                          setEquipmentDialogOpen(true);
                        }}
                        className="rounded-full p-2 text-[#5566f6] hover:bg-[#eef1ff]"
                      >
                        <Pencil className="size-5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-6 pt-2 text-[20px]">
                <div className="rounded-[20px] bg-white px-6 py-4">
                  Ответственный: {(() => {
                    const userName = responsibleUserId
                      ? employees.find((employee) => employee.id === responsibleUserId)?.name || null
                      : null;
                    if (responsibleTitle && userName) return `${responsibleTitle}: ${userName}`;
                    return responsibleTitle || userName || "Не назначен";
                  })()}
                </div>
                <div className="rounded-[20px] bg-white px-6 py-4">
                  Период: {getColdEquipmentDateLabel(dateFrom)} - {getColdEquipmentDateLabel(dateTo)}
                </div>
                {config.skipWeekends ? (
                  <div className="rounded-[20px] bg-white px-6 py-4">
                    Выходные пропускаются при автозаполнении
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {status === "active" ? (
          <div className="sticky top-0 z-30 -mx-6 mb-6 flex flex-wrap items-center gap-3 border-b border-[#eef0fb] bg-white/95 px-6 py-3 backdrop-blur">
            <Button
              type="button"
              onClick={() => {
                setEditingEquipment(null);
                setEquipmentDialogOpen(true);
              }}
              className="h-18 rounded-[22px] bg-[#5566f6] px-8 text-[20px] text-white hover:bg-[#4858eb]"
            >
              <Plus className="size-6" />
              Добавить ХО
            </Button>

            {selectedEquipmentIds.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteSelectedEquipment}
                disabled={isDeleting}
                className="h-18 rounded-[22px] border-[#ffd7d3] px-8 text-[20px] text-[#ff3b30] hover:bg-[#fff3f2] disabled:opacity-60"
              >
                <Trash2 className="size-6" />
                {isDeleting ? "Удаление..." : `Удалить выбранные (${selectedEquipmentIds.length})`}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-[28px] border border-[#d9dce6] bg-white">
          <table className="min-w-[1900px] border-collapse text-[16px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[52px] border border-black p-3 text-center" rowSpan={2}>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedEquipmentIds(
                        checked === true ? config.equipment.map((item) => item.id) : []
                      )
                    }
                    disabled={status !== "active" || config.equipment.length === 0}
                  />
                </th>
                <th
                  className="min-w-[420px] border border-black p-3 text-center text-[22px] font-semibold"
                  rowSpan={2}
                >
                  Номер ХК
                </th>
                <th
                  className="border border-black p-3 text-center text-[22px] font-semibold"
                  colSpan={dateKeys.length}
                >
                  Месяц{" "}
                  {new Date(`${dateKeys[0]}T00:00:00Z`).toLocaleDateString("ru-RU", {
                    month: "long",
                    year: "numeric",
                  })}
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                {dateKeys.map((dateKey) => (
                  <th
                    key={dateKey}
                    className={`w-[66px] border border-black p-2 text-center font-semibold ${
                      isWeekend(dateKey) ? "bg-[#eceffd]" : ""
                    }`}
                  >
                    <div className="text-[18px]">{getDayNumber(dateKey)}</div>
                    <div className="text-[11px] font-normal uppercase text-[#666]">
                      {getWeekdayShort(dateKey)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="border border-black p-2" />
                <td
                  className="border border-black p-3 text-center text-[20px] font-semibold"
                  colSpan={dateKeys.length + 1}
                >
                  Температура °C
                </td>
              </tr>

              {config.equipment.map((item) => (
                <tr key={item.id}>
                  <td className="border border-black p-2 text-center">
                    <Checkbox
                      checked={selectedEquipmentIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelectedEquipmentIds((current) =>
                          checked === true
                            ? [...current, item.id]
                            : current.filter((value) => value !== item.id)
                        )
                      }
                      disabled={status !== "active"}
                    />
                  </td>

                  <td className="border border-black px-4 py-4 align-top">
                    <div className="text-[18px] font-medium">{item.name}</div>
                    <div className="mt-1 text-[13px] text-[#666a80]">{formatRange(item.min, item.max)}</div>
                  </td>

                  {dateKeys.map((dateKey) => {
                    const row = rowByDate[dateKey];
                    const value = row?.data.temperatures[item.id];

                    return (
                      <td
                        key={`${item.id}:${dateKey}`}
                        className={`border border-black p-1 text-center ${
                          isWeekend(dateKey) ? "bg-[#fafbff]" : ""
                        }`}
                      >
                        {status === "active" ? (
                          <Input
                            type="number"
                            step="0.1"
                            defaultValue={value ?? ""}
                            onBlur={(event) =>
                              handleTemperatureBlur(dateKey, item.id, event.target.value)
                            }
                            className="h-11 min-w-[58px] border-0 px-1 text-center text-[16px] shadow-none focus-visible:ring-1"
                          />
                        ) : (
                          <span className="text-[16px]">{value ?? ""}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr>
                <td className="border border-black p-2 text-center" />
                <td className="border border-black px-4 py-4 align-top">
                  <div className="text-[18px] font-medium">Ответственный за снятие показателей</div>
                  <div className="mt-2 space-y-1 text-[13px] text-[#4f5368]">
                    {responsibleCodes.items.map((item) => (
                      <div key={item.employeeId}>{item.label}</div>
                    ))}
                  </div>
                </td>

                {dateKeys.map((dateKey) => {
                  const row = rowByDate[dateKey];
                  const employeeId = row?.employeeId || responsibleUserId || "";

                  return (
                    <td
                      key={`responsible:${dateKey}`}
                      className={`border border-black p-2 text-center text-[15px] font-medium ${
                        isWeekend(dateKey) ? "bg-[#fafbff]" : ""
                      }`}
                    >
                      {employeeId ? responsibleCodes.codeMap[employeeId] || "" : ""}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <JournalSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        responsibleTitle={responsibleTitle}
        responsibleUserId={responsibleUserId}
        employees={employees}
        config={config}
        onSave={handleSaveSettings}
      />

      <EquipmentDialog
        open={equipmentDialogOpen}
        onOpenChange={setEquipmentDialogOpen}
        initialItem={editingEquipment}
        canDelete={config.equipment.length > 1}
        onSave={handleSaveEquipment}
        onDelete={handleDeleteEquipment}
      />
    </div>
  );
}
