"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Settings, Trash2, X } from "lucide-react";
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
  type EquipmentCalibrationConfig,
  type CalibrationRow,
  createCalibrationRow,
  normalizeEquipmentCalibrationConfig,
  formatCalibrationDate,
  formatCalibrationDateLong,
  calculateNextCalibrationDate,
  isCalibrationOverdue,
} from "@/lib/equipment-calibration-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import { DocumentBackLink } from "@/components/journals/document-back-link";

import { toast } from "sonner";
import { PositionSelectItems } from "@/components/shared/position-select";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig: EquipmentCalibrationConfig;
  users: { id: string; name: string; role: string }[];
};

const POSITION_OPTIONS = USER_ROLE_LABEL_VALUES;

export function EquipmentCalibrationDocumentClient({
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
    normalizeEquipmentCalibrationConfig(initialConfig)
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

  // Add row draft state
  const [draftName, setDraftName] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftPurpose, setDraftPurpose] = useState("");
  const [draftRange, setDraftRange] = useState("");
  const [draftInterval, setDraftInterval] = useState("12");
  const [draftLastDate, setDraftLastDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftNote, setDraftNote] = useState("");

  // Edit row draft state
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editRange, setEditRange] = useState("");
  const [editInterval, setEditInterval] = useState("12");
  const [editLastDate, setEditLastDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const isClosed = status === "closed";
  const organizationLabel = organizationName || 'ООО "Тест"';

  /* ---------- persistence ---------- */

  async function saveConfig(nextConfig: EquipmentCalibrationConfig) {
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

  function updateConfigAndSave(next: EquipmentCalibrationConfig) {
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
    setDraftName("");
    setDraftNumber("");
    setDraftLocation("");
    setDraftPurpose("");
    setDraftRange("");
    setDraftInterval("12");
    setDraftLastDate(new Date().toISOString().slice(0, 10));
    setDraftNote("");
  }

  function saveDraftRow() {
    const newRow = createCalibrationRow({
      equipmentName: draftName,
      equipmentNumber: draftNumber,
      location: draftLocation,
      purpose: draftPurpose,
      measurementRange: draftRange,
      calibrationInterval: parseInt(draftInterval, 10) || 12,
      lastCalibrationDate: draftLastDate,
      note: draftNote,
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
    setEditName(row.equipmentName);
    setEditNumber(row.equipmentNumber);
    setEditLocation(row.location);
    setEditPurpose(row.purpose);
    setEditRange(row.measurementRange);
    setEditInterval(String(row.calibrationInterval));
    setEditLastDate(row.lastCalibrationDate);
    setEditNote(row.note);
    setEditModalOpen(true);
  }

  function saveEditRow() {
    if (!editingRowId) return;
    const next = {
      ...config,
      rows: config.rows.map((row) =>
        row.id === editingRowId
          ? {
              ...row,
              equipmentName: editName,
              equipmentNumber: editNumber,
              location: editLocation,
              purpose: editPurpose,
              measurementRange: editRange,
              calibrationInterval: parseInt(editInterval, 10) || 12,
              lastCalibrationDate: editLastDate,
              note: editNote,
            }
          : row
      ),
    };
    updateConfigAndSave(next);
    setEditModalOpen(false);
    setEditingRowId(null);
  }

  /* ---------- settings save ---------- */

  async function handleSaveSettings() {
    const nextConfig: EquipmentCalibrationConfig = {
      ...config,
      documentDate: settingsDate,
      year: settingsYear,
      approveRole: settingsApproveRole,
      approveEmployeeId: settingsApproveEmployeeId || null,
      approveEmployee: settingsApproveEmployee,
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

  /* ---------- render ---------- */

  return (
    <div className="space-y-6 text-black">
      {/* Breadcrumb */}
      <DocumentBackLink href="/journals/equipment_calibration" documentId={documentId} />

      {/* screen header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em]">{title}</h1>
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
            setSettingsOpen(true);
          }}
          className="h-11 shrink-0 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
        >
          Настройки журнала
        </Button>
      </div>

      {/* Selection bar */}
      {selectedRows.length > 0 && !isClosed && (
        <div className="flex items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => setSelectedRows([])}
            className="text-[#6f7282] hover:text-black"
          >
            <X className="size-4" />
          </button>
          <span className="text-[14px]">Выбранно: {selectedRows.length}</span>
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]"
            onClick={removeSelectedRows}
          >
            <Trash2 className="mr-1 size-4" />
            Удалить
          </Button>
        </div>
      )}

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
                СТР. 1 ИЗ 1
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-[17px] italic uppercase">
                ГРАФИК ПОВЕРКИ СРЕДСТВ ИЗМЕРЕНИЙ
              </td>
            </tr>
          </tbody>
        </table>

        {/* УТВЕРЖДАЮ block */}
        <div className="mt-4 flex justify-end">
          <div className="w-[400px] text-right text-sm leading-relaxed">
            <div className="font-semibold uppercase">УТВЕРЖДАЮ</div>
            <div>{config.approveRole}</div>
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="inline-block w-[180px] border-b border-black" />
              <span>{config.approveEmployee}</span>
            </div>
            <div className="mt-1">
              {config.documentDate ? formatCalibrationDateLong(config.documentDate) : ""}
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="mt-4 text-center text-[24px] font-semibold leading-tight">
          График поверки средств измерений на {config.year} г.
        </h2>

        {/* Toolbar */}
        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Button
              type="button"
              className="bg-[#5566f6] hover:bg-[#4d58f5]"
              onClick={() => {
                resetDraft();
                setAddModalOpen(true);
              }}
            >
              <Plus className="size-4" />
              Добавить
            </Button>
          </div>
        )}

        {/* Main table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-10 border border-black p-1" rowSpan={2} />
                <th className="w-12 border border-black p-1" rowSpan={2}>
                  № п/п
                </th>
                <th className="w-[280px] border border-black p-1" rowSpan={2}>
                  Идентификаторы СИ (наименование, тип, заводское обозначение, номер, место расположения)
                </th>
                <th className="border border-black p-1" colSpan={2}>
                  Метрологические характеристики
                </th>
                <th className="border border-black p-1" rowSpan={2}>
                  Межповерочный интервал
                </th>
                <th className="border border-black p-1" rowSpan={2}>
                  Дата последней поверки
                </th>
                <th className="border border-black p-1" rowSpan={2}>
                  Сроки проведения очередной поверки
                </th>
                <th className="border border-black p-1" rowSpan={2}>
                  Примечание
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                <th className="border border-black p-1">
                  Назначение (измеряемые параметры)
                </th>
                <th className="border border-black p-1">
                  Предел (диапазон) измерений
                </th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => {
                const nextDate = calculateNextCalibrationDate(row.lastCalibrationDate, row.calibrationInterval);
                const overdue = isCalibrationOverdue(row.lastCalibrationDate, row.calibrationInterval);

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-black p-1 text-center">
                      {!isClosed && (
                        <Checkbox
                          checked={selectedRows.includes(row.id)}
                          onCheckedChange={(checked) =>
                            toggleRow(row.id, checked === true)
                          }
                        />
                      )}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {index + 1}
                    </td>
                    <td
                      className="border border-black p-2 cursor-pointer"
                      onClick={() => !isClosed && openEditRow(row.id)}
                    >
                      <div>
                        {row.equipmentName}
                        {row.equipmentNumber ? `, ${row.equipmentNumber}` : ""}
                        {row.location ? `, ${row.location}` : ""}
                      </div>
                    </td>
                    <td className="border border-black p-1 text-center">
                      {row.purpose}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {row.measurementRange}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {row.calibrationInterval} мес.
                    </td>
                    <td className="border border-black p-1 text-center">
                      {formatCalibrationDate(row.lastCalibrationDate)}
                    </td>
                    <td
                      className={`border border-black p-1 text-center ${overdue ? "font-semibold text-[#ff3b30]" : ""}`}
                    >
                      {formatCalibrationDate(nextDate)}
                    </td>
                    <td className="border border-black p-1 text-center">
                      {row.note}
                    </td>
                  </tr>
                );
              })}

              {config.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-black p-4 text-center text-gray-400"
                  >
                    Нет записей. Нажмите &laquo;Добавить&raquo; чтобы добавить СИ.
                  </td>
                </tr>
              )}

              {/* Extra blank row */}
              <tr>
                <td className="border border-black p-1 text-center">
                  <Checkbox disabled />
                </td>
                <td
                  colSpan={8}
                  className="border border-black p-1"
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Add Row Dialog ---------- */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[24px] font-semibold text-black">
              Добавление новой строки
            </DialogTitle>
            <button
              type="button"
              className="rounded-md p-1 text-black/80 hover:bg-black/5"
              onClick={() => setAddModalOpen(false)}
            >
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="space-y-4 px-7 py-6">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Введите наименование, тип, заводское обозначение СИ"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <Input
              value={draftNumber}
              onChange={(e) => setDraftNumber(e.target.value)}
              placeholder="Введите номер СИ"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <Input
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="Введите место расположения СИ"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <Input
              value={draftPurpose}
              onChange={(e) => setDraftPurpose(e.target.value)}
              placeholder="Введите назначение (измеряемые параметры)"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <Input
              value={draftRange}
              onChange={(e) => setDraftRange(e.target.value)}
              placeholder="Введите предел (диапазон) измерений"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <Input
              value={draftInterval}
              onChange={(e) => setDraftInterval(e.target.value)}
              placeholder="Введите межповерочный интервал, месяцев"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Дата последней поверки</Label>
              <Input
                type="date"
                value={draftLastDate}
                onChange={(e) => setDraftLastDate(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <Textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Примечание"
              rows={3}
              className="rounded-2xl border-[#dfe1ec] px-5 py-4 text-[16px]"
            />
            <div className="flex justify-end pt-1">
              <Button
                onClick={saveDraftRow}
                disabled={!draftName.trim()}
                className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
              >
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Edit Row Dialog ---------- */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[24px] font-semibold text-black">
              Редактирование строки
            </DialogTitle>
            <button
              type="button"
              className="rounded-md p-1 text-black/80 hover:bg-black/5"
              onClick={() => setEditModalOpen(false)}
            >
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="space-y-4 px-7 py-6">
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Наименование, тип, заводское обозначение СИ</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Номер СИ</Label>
              <Input
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Место расположения СИ</Label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Назначение (измеряемые параметры)</Label>
              <Input
                value={editPurpose}
                onChange={(e) => setEditPurpose(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Предел (диапазон) измерений</Label>
              <Input
                value={editRange}
                onChange={(e) => setEditRange(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Межповерочный интервал, месяцев</Label>
              <Input
                value={editInterval}
                onChange={(e) => setEditInterval(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Дата последней поверки</Label>
              <Input
                type="date"
                value={editLastDate}
                onChange={(e) => setEditLastDate(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Примечание</Label>
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={3}
                className="rounded-2xl border-[#dfe1ec] px-5 py-4 text-[16px]"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button
                onClick={saveEditRow}
                className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Settings Dialog ---------- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[24px] font-semibold text-black">
              Настройки документа
            </DialogTitle>
            <button
              type="button"
              className="rounded-md p-1 text-black/80 hover:bg-black/5"
              onClick={() => setSettingsOpen(false)}
            >
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="space-y-4 px-7 py-6">
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Название документа</Label>
              <Input
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Дата документа</Label>
              <Input
                type="date"
                value={settingsDate}
                onChange={(e) => setSettingsDate(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Год</Label>
              <Select
                value={String(settingsYear)}
                onValueChange={(val) => setSettingsYear(Number(val))}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Должность &quot;Утверждаю&quot;</Label>
              <Select
                value={settingsApproveRole}
                onValueChange={(value) => {
                  const user = users.find((item) => getUserRoleLabel(item.role) === value);
                  setSettingsApproveRole(value);
                  setSettingsApproveEmployeeId(user?.id || "");
                  setSettingsApproveEmployee(user?.name || settingsApproveEmployee);
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  <PositionSelectItems users={users} />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Сотрудник</Label>
              <Select
                value={settingsApproveEmployeeId}
                onValueChange={(value) => {
                  const user = users.find((item) => item.id === value);
                  setSettingsApproveEmployeeId(value);
                  setSettingsApproveEmployee(user?.name || settingsApproveEmployee);
                  if (user) setSettingsApproveRole(getUserRoleLabel(user.role));
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {(settingsApproveRole ? getUsersForRoleLabel(users, settingsApproveRole) : users).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{buildStaffOptionLabel(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
              >
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
