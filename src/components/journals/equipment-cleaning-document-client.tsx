"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, Trash2, X } from "lucide-react";
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
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyEquipmentCleaningRow,
  EQUIPMENT_CLEANING_VARIANT_LABELS,
  formatEquipmentCleaningDate,
  getEquipmentCleaningResultLabel,
  type EquipmentCleaningDocumentConfig,
  type EquipmentCleaningFieldVariant,
  type EquipmentCleaningRowData,
} from "@/lib/equipment-cleaning-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type EquipmentCleaningRow = {
  id: string;
  data: EquipmentCleaningRowData;
};

type Props = {
  documentId: string;
  routeCode?: string;
  title: string;
  templateCode: string;
  organizationName: string;
  status: "active" | "closed";
  dateFrom: string;
  config: EquipmentCleaningDocumentConfig;
  users: UserItem[];
  equipmentOptions: string[];
  initialRows: EquipmentCleaningRow[];
};

type RowDraftState = {
  id: string | null;
  data: EquipmentCleaningRowData;
};

const ROLE_OPTIONS = USER_ROLE_LABEL_VALUES;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0")
);

function userRoleLabel(role: string) {
  return getUserRoleLabel(role);
}

function splitTime(value: string) {
  const [hour = "00", minute = "00"] = value.split(":");
  return { hour, minute };
}

function mergeTime(hour: string, minute: string) {
  return `${hour}:${minute}`;
}

function buildPayload(data: EquipmentCleaningRowData) {
  return {
    ...data,
    rinseTemperature:
      data.rinseTemperature && data.rinseTemperature.trim().length > 0
        ? data.rinseTemperature.trim()
        : null,
  };
}

export function EquipmentCleaningDocumentClient({
  documentId,
  routeCode,
  title,
  templateCode,
  organizationName,
  status,
  dateFrom,
  config,
  users,
  equipmentOptions,
  initialRows,
}: Props) {
  const router = useRouter();
  const journalRouteCode = routeCode || templateCode;
  const [rows, setRows] = useState(initialRows);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState(title);
  const [settingsDateFrom, setSettingsDateFrom] = useState(dateFrom);
  const [fieldVariant, setFieldVariant] =
    useState<EquipmentCleaningFieldVariant>(config.fieldVariant);
  const [draft, setDraft] = useState<RowDraftState>({
    id: null,
    data: emptyEquipmentCleaningRow({
      washerPosition: "Мойщик",
      controllerPosition: "Управляющий",
    }),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) => {
        const leftKey = `${left.data.washDate}T${left.data.washTime}`;
        const rightKey = `${right.data.washDate}T${right.data.washTime}`;
        return leftKey.localeCompare(rightKey);
      }),
    [rows]
  );

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function openCreateRow() {
    const washer = users[0] || null;
    const controller =
      users.find((user) => user.role === "owner") ||
      users.find((user) => user.role === "technologist") ||
      users[0] ||
      null;

    setDraft({
      id: null,
      data: emptyEquipmentCleaningRow({
        equipmentName: equipmentOptions[0] || "",
        washerPosition: "Мойщик",
        washerName: washer?.name || "",
        washerUserId: washer?.id || null,
        controllerPosition: userRoleLabel(controller?.role || "owner"),
        controllerName: controller?.name || "",
        controllerUserId: controller?.id || null,
      }),
    });
    setRowModalOpen(true);
  }

  function openEditRow(row: EquipmentCleaningRow) {
    setDraft({
      id: row.id,
      data: row.data,
    });
    setRowModalOpen(true);
  }

  function updateDraft(patch: Partial<EquipmentCleaningRowData>) {
    setDraft((current) => ({
      ...current,
      data: {
        ...current.data,
        ...patch,
      },
    }));
  }

  async function saveRow() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}/equipment-cleaning`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          data: buildPayload(draft.data),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.entry) {
        throw new Error(payload?.error || "Не удалось сохранить строку");
      }

      const nextRow = payload.entry as EquipmentCleaningRow;
      setRows((current) => {
        const withoutCurrent = current.filter((row) => row.id !== nextRow.id);
        return [...withoutCurrent, nextRow];
      });
      setRowModalOpen(false);
      setDraft({
        id: null,
        data: emptyEquipmentCleaningRow(),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения строки");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedRows() {
    if (selectedIds.length === 0) return;

    const response = await fetch(`/api/journal-documents/${documentId}/equipment-cleaning`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (!response.ok) {
      toast.error("Не удалось удалить строки");
      return;
    }

    setRows((current) => current.filter((row) => !selectedIds.includes(row.id)));
    setSelectedIds([]);
  }

  async function saveSettings() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settingsTitle.trim(),
          dateFrom: settingsDateFrom,
          dateTo: settingsDateFrom,
          config: {
            fieldVariant,
          },
        }),
      });
      if (!response.ok) {
        throw new Error();
      }
      setSettingsOpen(false);
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить настройки журнала");
    } finally {
      setIsSaving(false);
    }
  }

  async function closeDocument() {
    setIsClosing(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "closed",
        }),
      });
      if (!response.ok) {
        throw new Error();
      }
      setCloseOpen(false);
      router.push(`/journals/${journalRouteCode}?tab=closed`);
      router.refresh();
    } catch {
      toast.error("Не удалось закрыть журнал");
    } finally {
      setIsClosing(false);
    }
  }

  const draftTime = splitTime(draft.data.washTime);

  return (
    <div className="space-y-6 text-black">
      {selectedIds.length > 0 && status === "active" ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-white px-5 py-4 shadow-sm">
          <button
            type="button"
            className="flex items-center gap-2 text-[18px] text-[#5b66ff]"
            onClick={() => setSelectedIds([])}
          >
            <X className="size-6" />
            Выбрано: {selectedIds.length}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-[16px] bg-[#fff4f4] px-4 py-2 text-[18px] text-[#ff3b30]"
            onClick={() => {
              deleteSelectedRows().catch(() => {
                toast.error("Не удалось удалить строки");
              });
            }}
          >
            <Trash2 className="size-5" />
            Удалить
          </button>
        </div>
      ) : null}

      <DocumentBackLink href={`/journals/${journalRouteCode}`} documentId={documentId} />
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {title}
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="rounded-2xl border-[#eef0fb] px-7 py-6 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
        >
          Настройки журнала
        </Button>
      </div>

      <div className="space-y-6 rounded-[20px] border bg-white p-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-[18%] border border-black p-3 text-center text-[26px] font-semibold">
                {organizationName}
              </td>
              <td className="border border-black p-2 text-center text-[22px]">
                СИСТЕМА ХАССП
              </td>
              <td className="w-[22%] border border-black p-2 text-[20px] font-semibold">
                Начат&nbsp;&nbsp;{formatEquipmentCleaningDate(settingsDateFrom)}
                <div className="mt-2 font-normal">
                  Окончен&nbsp;__________
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-[18px] uppercase italic">
                Журнал мойки и дезинфекции оборудования
              </td>
              <td className="border border-black p-2 text-center text-[18px]">
                СТР. 1 ИЗ 1
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-center text-[28px] font-semibold uppercase">
          Журнал мойки и дезинфекции оборудования
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            type="button"
            onClick={openCreateRow}
            disabled={status !== "active"}
            className="rounded-2xl bg-[#5b66ff] px-8 py-6 text-[18px] text-white hover:bg-[#4d58f5]"
          >
            <Plus className="size-6" />
            Добавить
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCloseOpen(true)}
            disabled={status !== "active"}
            className="rounded-2xl border-[#eef0fb] px-7 py-6 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
          >
            Закончить журнал
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] border-collapse text-[16px]">
            <thead>
              <tr className="bg-[#f7f7fb]">
                <th className="w-[48px] border border-black p-2 text-center">
                  {status === "active" ? (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelectedIds(checked === true ? rows.map((row) => row.id) : [])
                      }
                    />
                  ) : null}
                </th>
                <th className="border border-black p-3 text-center font-semibold">Дата и время мойки</th>
                <th className="border border-black p-3 text-center font-semibold">Наименование оборудования</th>
                <th className="border border-black p-3 text-center font-semibold">Наименование моющего раствора</th>
                <th className="border border-black p-3 text-center font-semibold">Концентрация моющего раствора, %</th>
                <th className="border border-black p-3 text-center font-semibold">Наименование дезинфицирующего раствора</th>
                <th className="border border-black p-3 text-center font-semibold">Концентрация дезинфицирующего раствора, %</th>
                <th className="border border-black p-3 text-center font-semibold">
                  {fieldVariant === "rinse_temperature"
                    ? "Ополаскивание, °C"
                    : "Полнота смываемости дез. ср-ва с оборудования и инвентаря (тест на pH нейтральность)"}
                </th>
                <th className="border border-black p-3 text-center font-semibold">Мойщик (ФИО)</th>
                <th className="border border-black p-3 text-center font-semibold">Контролирующее лицо (должность, ФИО)</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.id}
                  className={status === "active" ? "cursor-pointer hover:bg-[#fafbff]" : ""}
                  onClick={() => status === "active" && openEditRow(row)}
                >
                  <td className="border border-black p-2 text-center" onClick={(event) => event.stopPropagation()}>
                    {status === "active" ? (
                      <Checkbox
                        checked={selectedIds.includes(row.id)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((current) =>
                            checked === true
                              ? [...new Set([...current, row.id])]
                              : current.filter((id) => id !== row.id)
                          )
                        }
                      />
                    ) : null}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {formatEquipmentCleaningDate(row.data.washDate)}
                    <br />
                    {row.data.washTime}
                  </td>
                  <td className="border border-black p-3 text-center">{row.data.equipmentName}</td>
                  <td className="border border-black p-3 text-center">{row.data.detergentName}</td>
                  <td className="border border-black p-3 text-center">{row.data.detergentConcentration}</td>
                  <td className="border border-black p-3 text-center">{row.data.disinfectantName}</td>
                  <td className="border border-black p-3 text-center">{row.data.disinfectantConcentration}</td>
                  <td className="border border-black p-3 text-center">
                    {fieldVariant === "rinse_temperature"
                      ? row.data.rinseTemperature || "—"
                      : getEquipmentCleaningResultLabel(row.data.rinseResult)}
                  </td>
                  <td className="border border-black p-3 text-center">{row.data.washerName}</td>
                  <td className="border border-black p-3 text-center">
                    {`${row.data.controllerPosition}, ${row.data.controllerName}`}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border border-black p-6 text-center text-[#6d7287]">
                    Записей пока нет
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={rowModalOpen} onOpenChange={setRowModalOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[24px] font-medium text-black">
              {draft.id ? "Редактирование строки" : "Добавление новой строки"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-[20px] border border-[#dfe1ec] p-4">
              <div className="mb-3 text-[18px] font-semibold text-black">Дата и время мойки</div>
              <div className="space-y-3">
                <Input
                  type="date"
                  value={draft.data.washDate}
                  onChange={(e) => updateDraft({ washDate: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={draftTime.hour}
                    onValueChange={(hour) =>
                      updateDraft({ washTime: mergeTime(hour, draftTime.minute) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Часы" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((hour) => (
                        <SelectItem key={hour} value={hour}>
                          {hour}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={draftTime.minute}
                    onValueChange={(minute) =>
                      updateDraft({ washTime: mergeTime(draftTime.hour, minute) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Минуты" />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTE_OPTIONS.map((minute) => (
                        <SelectItem key={minute} value={minute}>
                          {minute}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Наименование оборудования</Label>
              <Input
                list="equipment-cleaning-options"
                value={draft.data.equipmentName}
                onChange={(e) => updateDraft({ equipmentName: e.target.value })}
                placeholder="Введите наименование оборудования"
              />
              <datalist id="equipment-cleaning-options">
                {equipmentOptions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>

            <div className="space-y-3">
              <Label>Наименование моющего раствора</Label>
              <Input
                value={draft.data.detergentName}
                onChange={(e) => updateDraft({ detergentName: e.target.value })}
                placeholder="Введите наименование моющего раствора"
              />
            </div>

            <div className="space-y-3">
              <Label>Концентрация моющего раствора, %</Label>
              <Input
                value={draft.data.detergentConcentration}
                onChange={(e) => updateDraft({ detergentConcentration: e.target.value })}
                placeholder="Введите концентрацию моющего раствора, %"
              />
            </div>

            <div className="space-y-3">
              <Label>Наименование дезинфицирующего раствора</Label>
              <Input
                value={draft.data.disinfectantName}
                onChange={(e) => updateDraft({ disinfectantName: e.target.value })}
                placeholder="Введите наименование дезинфицирующего раствора"
              />
            </div>

            <div className="space-y-3">
              <Label>Концентрация дезинфицирующего раствора, %</Label>
              <Input
                value={draft.data.disinfectantConcentration}
                onChange={(e) => updateDraft({ disinfectantConcentration: e.target.value })}
                placeholder="Введите концентрацию дезинфицирующего раствора, %"
              />
            </div>

            {fieldVariant === "rinse_temperature" ? (
              <div className="space-y-3">
                <Label>Ополаскивание, °C</Label>
                <Input
                  value={draft.data.rinseTemperature || ""}
                  onChange={(e) => updateDraft({ rinseTemperature: e.target.value })}
                  placeholder="Введите температуру ополаскивания"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[18px] font-semibold text-black">
                  Полнота смываемости дез. ср-ва
                </div>
                <div className="flex flex-wrap gap-6 text-[18px]">
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={draft.data.rinseResult !== "non_compliant"}
                      onChange={() => updateDraft({ rinseResult: "compliant" })}
                      className="size-5 accent-[#5b66ff]"
                    />
                    Соответствует
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={draft.data.rinseResult === "non_compliant"}
                      onChange={() => updateDraft({ rinseResult: "non_compliant" })}
                      className="size-5 accent-[#5b66ff]"
                    />
                    Не соответствует
                  </label>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Мойщик</Label>
              <Select
                value={draft.data.washerPosition}
                onValueChange={(value) => {
                  const candidates = getUsersForRoleLabel(users, value);
                  const currentId = draft.data.washerUserId || "";
                  const stillValid = candidates.some((u) => u.id === currentId);
                  updateDraft({
                    washerPosition: value,
                    ...(stillValid
                      ? {}
                      : { washerUserId: "", washerName: "" }),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Мойщик" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Сотрудник</Label>
              <Select
                value={draft.data.washerUserId || ""}
                onValueChange={(value) => {
                  const user = users.find((item) => item.id === value);
                  updateDraft({
                    washerUserId: value,
                    washerName: user?.name || "",
                    ...(!draft.data.washerPosition && user
                      ? { washerPosition: getUserRoleLabel(user.role) }
                      : {}),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сотрудник" />
                </SelectTrigger>
                <SelectContent>
                  {(draft.data.washerPosition
                    ? getUsersForRoleLabel(users, draft.data.washerPosition)
                    : users).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Должность лица, проводившего контроль</Label>
              <Select
                value={draft.data.controllerPosition}
                onValueChange={(value) => {
                  const candidates = getUsersForRoleLabel(users, value);
                  const currentId = draft.data.controllerUserId || "";
                  const stillValid = candidates.some((u) => u.id === currentId);
                  updateDraft({
                    controllerPosition: value,
                    ...(stillValid
                      ? {}
                      : { controllerUserId: "", controllerName: "" }),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Должность" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Сотрудник</Label>
              <Select
                value={draft.data.controllerUserId || ""}
                onValueChange={(value) => {
                  const user = users.find((item) => item.id === value);
                  updateDraft({
                    controllerUserId: value,
                    controllerName: user?.name || "",
                    ...(!draft.data.controllerPosition && user
                      ? { controllerPosition: getUserRoleLabel(user.role) }
                      : {}),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Сотрудник" />
                </SelectTrigger>
                <SelectContent>
                  {(draft.data.controllerPosition
                    ? getUsersForRoleLabel(users, draft.data.controllerPosition)
                    : users).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveRow} disabled={isSaving} className="bg-[#5b66ff] text-white hover:bg-[#4d58f5]">
                {isSaving ? "Сохранение..." : draft.id ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[24px] font-medium text-black">
              Настройки документа
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-3">
              <Label>Название документа</Label>
              <Input value={settingsTitle} onChange={(e) => setSettingsTitle(e.target.value)} />
            </div>
            <div className="space-y-3">
              <Label>Дата начала</Label>
              <Input
                type="date"
                value={settingsDateFrom}
                onChange={(e) => setSettingsDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <div className="text-[18px] font-semibold text-black">Название поля</div>
              <div className="flex flex-col gap-3 text-[18px] text-black sm:flex-row sm:gap-8">
                {(Object.keys(EQUIPMENT_CLEANING_VARIANT_LABELS) as EquipmentCleaningFieldVariant[]).map((variant) => (
                  <label key={variant} className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={fieldVariant === variant}
                      onChange={() => setFieldVariant(variant)}
                      className="size-5 accent-[#5b66ff]"
                    />
                    {EQUIPMENT_CLEANING_VARIANT_LABELS[variant]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={isSaving} className="bg-[#5b66ff] text-white hover:bg-[#4d58f5]">
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[24px] font-medium text-black">
              {`Закончить журнал "${title}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end px-6 py-6">
            <Button onClick={closeDocument} disabled={isClosing} className="bg-[#5b66ff] text-white hover:bg-[#4d58f5]">
              {isClosing ? "Завершение..." : "Закончить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
