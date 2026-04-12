"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type EquipmentMaintenanceConfig,
  type EquipmentMaintenanceRow,
  type MaintenanceType,
  createEquipmentMaintenanceRow,
  normalizeEquipmentMaintenanceConfig,
  MONTH_KEYS,
  MONTH_LABELS,
  MONTH_FULL_LABELS,
  DAY_OPTIONS,
  formatMaintenanceDate,
} from "@/lib/equipment-maintenance-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig: EquipmentMaintenanceConfig;
  users: { id: string; name: string; role: string }[];
};

const POSITION_OPTIONS = USER_ROLE_LABEL_VALUES;

function buildYearOptions(currentYear: number) {
  const options: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    options.push(y);
  }
  return options;
}

export function EquipmentMaintenanceDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState(() =>
    normalizeEquipmentMaintenanceConfig(initialConfig)
  );
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Settings form state
  const [settingsTitle, setSettingsTitle] = useState(title);
  const [settingsDate, setSettingsDate] = useState(config.documentDate);
  const [settingsYear, setSettingsYear] = useState(config.year);
  const [settingsApproveRole, setSettingsApproveRole] = useState(config.approveRole);
  const [settingsApproveEmployeeId, setSettingsApproveEmployeeId] = useState(
    config.approveEmployeeId || ""
  );
  const [settingsApproveEmployee, setSettingsApproveEmployee] = useState(config.approveEmployee);
  const [settingsResponsibleRole, setSettingsResponsibleRole] = useState(config.responsibleRole);
  const [settingsResponsibleEmployeeId, setSettingsResponsibleEmployeeId] = useState(
    config.responsibleEmployeeId || ""
  );
  const [settingsResponsibleEmployee, setSettingsResponsibleEmployee] = useState(config.responsibleEmployee);

  // Add row draft state
  const [draftEquipmentName, setDraftEquipmentName] = useState("");
  const [draftWorkType, setDraftWorkType] = useState("");
  const [draftMaintenanceType, setDraftMaintenanceType] = useState<MaintenanceType>("A");
  const [draftPlan, setDraftPlan] = useState<Record<string, string>>(() =>
    Object.fromEntries(MONTH_KEYS.map((k) => [k, "-"]))
  );

  // Edit row draft state
  const [editEquipmentName, setEditEquipmentName] = useState("");
  const [editWorkType, setEditWorkType] = useState("");

  const isClosed = status === "closed";
  const organizationLabel = organizationName || 'ООО "Тест"';

  /* ---------- persistence ---------- */

  async function saveConfig(nextConfig: EquipmentMaintenanceConfig) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      if (!response.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      toast.error("Не удалось сохранить журнал");
    } finally {
      setIsSaving(false);
    }
  }

  function updateConfigAndSave(next: EquipmentMaintenanceConfig) {
    setConfig(next);
    saveConfig(next);
  }

  /* ---------- row helpers ---------- */

  function toggleRow(id: string, checked: boolean) {
    setSelectedRows((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    );
  }

  function removeSelectedRows() {
    if (selectedRows.length === 0) return;
    const next = {
      ...config,
      rows: config.rows.filter((row) => !selectedRows.includes(row.id)),
    };
    setSelectedRows([]);
    updateConfigAndSave(next);
  }

  /* ---------- add row ---------- */

  function resetDraft() {
    setDraftEquipmentName("");
    setDraftWorkType("");
    setDraftMaintenanceType("A");
    setDraftPlan(Object.fromEntries(MONTH_KEYS.map((k) => [k, "-"])));
  }

  function saveDraftRow() {
    const newRow = createEquipmentMaintenanceRow({
      equipmentName: draftEquipmentName,
      workType: draftWorkType,
      maintenanceType: draftMaintenanceType,
      plan: { ...draftPlan },
      fact: Object.fromEntries(MONTH_KEYS.map((k) => [k, ""])),
    });
    const next = { ...config, rows: [...config.rows, newRow] };
    updateConfigAndSave(next);
    resetDraft();
    setAddModalOpen(false);
  }

  /* ---------- edit row ---------- */

  function openEditRow(rowId: string) {
    const row = config.rows.find((r) => r.id === rowId);
    if (!row) return;
    setEditingRowId(rowId);
    setEditEquipmentName(row.equipmentName);
    setEditWorkType(row.workType);
    setEditModalOpen(true);
  }

  function saveEditRow() {
    if (!editingRowId) return;
    const next = {
      ...config,
      rows: config.rows.map((row) =>
        row.id === editingRowId
          ? { ...row, equipmentName: editEquipmentName, workType: editWorkType }
          : row
      ),
    };
    updateConfigAndSave(next);
    setEditModalOpen(false);
    setEditingRowId(null);
  }

  /* ---------- fact cell change ---------- */

  function handleFactChange(rowId: string, monthKey: string, value: string) {
    const next = {
      ...config,
      rows: config.rows.map((row) =>
        row.id === rowId
          ? { ...row, fact: { ...row.fact, [monthKey]: value } }
          : row
      ),
    };
    updateConfigAndSave(next);
  }

  /* ---------- settings save ---------- */

  async function handleSaveSettings() {
    const nextConfig: EquipmentMaintenanceConfig = {
      ...config,
      documentDate: settingsDate,
      year: settingsYear,
      approveRole: settingsApproveRole,
      approveEmployeeId: settingsApproveEmployeeId || null,
      approveEmployee: settingsApproveEmployee,
      responsibleRole: settingsResponsibleRole,
      responsibleEmployeeId: settingsResponsibleEmployeeId || null,
      responsibleEmployee: settingsResponsibleEmployee,
    };
    setConfig(nextConfig);

    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig, title: settingsTitle }),
      });
      if (!response.ok) throw new Error();
      setSettingsOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  }

  /* ---------- helpers ---------- */

  const yearOptions = buildYearOptions(config.year);

  return (
    <div className="space-y-6 text-black">
      {/* screen header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[#7a7f93]">{organizationName}</div>
          <h1 className="text-[48px] font-semibold tracking-[-0.03em]">
            {title}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSettingsTitle(title);
              setSettingsDate(config.documentDate);
              setSettingsYear(config.year);
              setSettingsApproveRole(config.approveRole);
              setSettingsApproveEmployeeId(config.approveEmployeeId || "");
              setSettingsApproveEmployee(config.approveEmployee);
              setSettingsResponsibleRole(config.responsibleRole);
              setSettingsResponsibleEmployeeId(config.responsibleEmployeeId || "");
              setSettingsResponsibleEmployee(config.responsibleEmployee);
              setSettingsOpen(true);
            }}
          >
            <Settings className="size-4" />
            Настройки журнала
          </Button>
        </div>
      </div>

      {/* HACCP block */}
      <div className="space-y-4 rounded-[20px] border bg-white p-6">
        {/* HACCP header table */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[18%] border border-black p-3 text-center text-[22px] font-semibold"
              >
                {organizationLabel}
              </td>
              <td className="border border-black p-2 text-center text-[18px] uppercase">
                СИСТЕМА ХАССП
              </td>
              <td
                rowSpan={2}
                className="w-[15%] border border-black p-2 text-center text-[18px] uppercase"
              >
                СТР.1 ИЗ 1
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-[17px] italic uppercase">
                ГРАФИК ПРОФИЛАКТИЧЕСКОГО ОБСЛУЖИВАНИЯ ОБОРУДОВАНИЯ
              </td>
            </tr>
          </tbody>
        </table>

        {/* "УТВЕРЖДАЮ" block */}
        <div className="mt-4 flex justify-end">
          <div className="w-[400px] text-right text-sm leading-relaxed">
            <div className="font-semibold uppercase">УТВЕРЖДАЮ</div>
            <div>{config.approveRole}</div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="inline-block w-[180px] border-b border-black" />
              <span>{config.approveEmployee}</span>
            </div>
            <div className="mt-1">
              {config.documentDate
                ? formatMaintenanceDate(config.documentDate)
                : ""}
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="mt-4 text-center text-[24px] font-semibold leading-tight">
          График профилактического обслуживания оборудования на {config.year} г.
        </h2>

        {/* Toolbar */}
        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="bg-[#5b66ff] hover:bg-[#4d58f5]"
              onClick={() => {
                resetDraft();
                setAddModalOpen(true);
              }}
            >
              <Plus className="size-4" />
              Добавить
            </Button>

            {selectedRows.length > 0 && (
              <>
                <span className="text-sm text-[#7a7f93]">
                  Выбрано: {selectedRows.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={removeSelectedRows}
                >
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              </>
            )}
          </div>
        )}

        {/* Legend row */}
        <div className="overflow-x-auto">
          <table className="mb-2 w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="border border-black p-2 font-semibold">
                  Тип профилактического обслуживания
                </td>
                <td className="border border-black p-2">
                  <span className="font-bold">A</span> = Ежемесячно
                </td>
                <td className="border border-black p-2">
                  <span className="font-bold">B</span> = Ежегодно
                </td>
              </tr>
            </tbody>
          </table>

          {/* Main table */}
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-10 border border-black p-1" />
                <th className="w-12 border border-black p-1">
                  № п/п
                </th>
                <th className="w-[220px] border border-black p-1">
                  Название оборудования / Вид работ
                </th>
                <th className="w-16 border border-black p-1" />
                {MONTH_KEYS.map((key) => (
                  <th key={key} className="border border-black p-1 text-center">
                    {MONTH_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => (
                <Fragment key={row.id}>
                  {/* Sub-row 1: Тип */}
                  <tr>
                    <td
                      rowSpan={3}
                      className="border border-black p-1 text-center align-middle"
                    >
                      {!isClosed && (
                        <Checkbox
                          checked={selectedRows.includes(row.id)}
                          onCheckedChange={(checked) =>
                            toggleRow(row.id, checked === true)
                          }
                        />
                      )}
                    </td>
                    <td
                      rowSpan={3}
                      className="border border-black p-1 text-center align-middle"
                    >
                      {index + 1}
                    </td>
                    <td
                      rowSpan={3}
                      className="border border-black p-2 align-top cursor-pointer hover:bg-gray-50"
                      onClick={() => !isClosed && openEditRow(row.id)}
                    >
                      <div className="font-medium">{row.equipmentName}</div>
                      {row.workType && (
                        <div className="mt-1 text-xs text-gray-500">
                          {row.workType}
                        </div>
                      )}
                    </td>
                    <td className="border border-black p-1 text-center text-xs font-medium">
                      Тип
                    </td>
                    {MONTH_KEYS.map((key) => (
                      <td
                        key={`type-${key}`}
                        className="border border-black p-1 text-center"
                      >
                        <span className="font-bold">{row.maintenanceType}</span>
                      </td>
                    ))}
                  </tr>

                  {/* Sub-row 2: План */}
                  <tr>
                    <td className="border border-black p-1 text-center text-xs font-medium">
                      План
                    </td>
                    {MONTH_KEYS.map((key) => (
                      <td
                        key={`plan-${key}`}
                        className="border border-black p-1 text-center"
                      >
                        {row.plan[key] || "-"}
                      </td>
                    ))}
                  </tr>

                  {/* Sub-row 3: Факт */}
                  <tr>
                    <td className="border border-black p-1 text-center text-xs font-medium">
                      Факт
                    </td>
                    {MONTH_KEYS.map((key) => (
                      <td
                        key={`fact-${key}`}
                        className="border border-black p-1 text-center"
                      >
                        {isClosed ? (
                          row.fact[key] || ""
                        ) : (
                          <select
                            className="w-full border-0 bg-transparent text-center text-sm outline-none cursor-pointer"
                            value={row.fact[key] || ""}
                            onChange={(e) =>
                              handleFactChange(row.id, key, e.target.value)
                            }
                          >
                            <option value="">--</option>
                            {DAY_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}

              {config.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + MONTH_KEYS.length}
                    className="border border-black p-4 text-center text-gray-400"
                  >
                    Нет записей. Нажмите &laquo;Добавить&raquo; чтобы добавить оборудование.
                  </td>
                </tr>
              )}

              {/* Responsible row */}
              <tr>
                <td
                  colSpan={4 + MONTH_KEYS.length}
                  className="border border-black p-2 text-sm"
                >
                  Ответственный: {config.responsibleRole},{" "}
                  {config.responsibleEmployee}
                </td>
              </tr>

              {/* Extra blank row */}
              <tr>
                <td className="border border-black p-1 text-center">
                  <Checkbox disabled />
                </td>
                <td
                  colSpan={3 + MONTH_KEYS.length}
                  className="border border-black p-1"
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Add Row Dialog ---------- */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Добавление новой строки</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Название оборудования</Label>
            <Textarea
              value={draftEquipmentName}
              onChange={(e) => setDraftEquipmentName(e.target.value)}
              placeholder="Название оборудования"
              rows={2}
            />

            <Label>Вид работ по обслуживанию</Label>
            <Textarea
              value={draftWorkType}
              onChange={(e) => setDraftWorkType(e.target.value)}
              placeholder="Вид работ"
              rows={2}
            />

            <Label>Тип обслуживания</Label>
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="maintenanceType"
                  checked={draftMaintenanceType === "A"}
                  onChange={() => setDraftMaintenanceType("A")}
                />
                <span className="font-bold">A</span> = Ежемесячно
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="maintenanceType"
                  checked={draftMaintenanceType === "B"}
                  onChange={() => setDraftMaintenanceType("B")}
                />
                <span className="font-bold">B</span> = Ежегодно
              </label>
            </div>

            <Label className="mt-2">Плановые дни по месяцам</Label>
            <div className="grid grid-cols-3 gap-2">
              {MONTH_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-20 text-sm">{MONTH_FULL_LABELS[key]}</span>
                  <Select
                    value={draftPlan[key]}
                    onValueChange={(val) =>
                      setDraftPlan((prev) => ({ ...prev, [key]: val }))
                    }
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={saveDraftRow} disabled={!draftEquipmentName.trim()}>
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Edit Row Dialog ---------- */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Редактирование строки</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Название оборудования</Label>
            <Textarea
              value={editEquipmentName}
              onChange={(e) => setEditEquipmentName(e.target.value)}
              rows={2}
            />

            <Label>Вид работ по обслуживанию</Label>
            <Textarea
              value={editWorkType}
              onChange={(e) => setEditWorkType(e.target.value)}
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditModalOpen(false)}
              >
                Отмена
              </Button>
              <Button onClick={saveEditRow}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Settings Dialog ---------- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Настройки журнала</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Название документа</Label>
            <Input
              value={settingsTitle}
              onChange={(e) => setSettingsTitle(e.target.value)}
            />

            <Label>Дата документа</Label>
            <Input
              type="date"
              value={settingsDate}
              onChange={(e) => setSettingsDate(e.target.value)}
            />

            <Label>Год</Label>
            <Select
              value={String(settingsYear)}
              onValueChange={(val) => setSettingsYear(Number(val))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Должность &laquo;Утверждаю&raquo;</Label>
            <Select
              value={settingsApproveRole}
              onValueChange={(value) => {
                const user = users.find((item) => getUserRoleLabel(item.role) === value);
                setSettingsApproveRole(value);
                setSettingsApproveEmployeeId(user?.id || "");
                setSettingsApproveEmployee(user?.name || settingsApproveEmployee);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {POSITION_OPTIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Сотрудник (утверждает)</Label>
            <Select
              value={settingsApproveEmployeeId}
              onValueChange={(value) => {
                const user = users.find((item) => item.id === value);
                setSettingsApproveEmployeeId(value);
                setSettingsApproveEmployee(user?.name || settingsApproveEmployee);
                if (user) setSettingsApproveRole(getUserRoleLabel(user.role));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {(settingsApproveRole ? getUsersForRoleLabel(users, settingsApproveRole) : users).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {buildStaffOptionLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Должность ответственного</Label>
            <Select
              value={settingsResponsibleRole}
              onValueChange={(value) => {
                const user = users.find((item) => getUserRoleLabel(item.role) === value);
                setSettingsResponsibleRole(value);
                setSettingsResponsibleEmployeeId(user?.id || "");
                setSettingsResponsibleEmployee(user?.name || settingsResponsibleEmployee);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {POSITION_OPTIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Сотрудник (ответственный)</Label>
            <Select
              value={settingsResponsibleEmployeeId}
              onValueChange={(value) => {
                const user = users.find((item) => item.id === value);
                setSettingsResponsibleEmployeeId(value);
                setSettingsResponsibleEmployee(user?.name || settingsResponsibleEmployee);
                if (user) setSettingsResponsibleRole(getUserRoleLabel(user.role));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {(settingsResponsibleRole ? getUsersForRoleLabel(users, settingsResponsibleRole) : users).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {buildStaffOptionLabel(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} disabled={isSaving}>
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
