"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel } from "@/lib/user-roles";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createStaffTrainingRow,
  normalizeStaffTrainingConfig,
  TRAINING_TYPES,
  TRAINING_TOPICS,
  ATTESTATION_RESULTS,
  STAFF_TRAINING_FULL_TITLE,
  type StaffTrainingConfig,
  type StaffTrainingRow,
} from "@/lib/staff-training-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig: StaffTrainingConfig;
  users: { id: string; name: string; role: string }[];
};

const POSITION_OPTIONS = USER_ROLE_LABEL_VALUES;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

export function StaffTrainingDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState(() =>
    normalizeStaffTrainingConfig(initialConfig)
  );
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState(title);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    field: string;
  } | null>(null);
  const [cellEditValue, setCellEditValue] = useState("");

  const [draftRow, setDraftRow] = useState<StaffTrainingRow>(() =>
    createStaffTrainingRow({
      date: nowDate(),
      employeeId: users[0]?.id || null,
      employeeName: users[0]?.name || "",
      employeePosition: users[0]
        ? getHygienePositionLabel(users[0].role)
        : "",
    })
  );

  const isClosed = status === "closed";

  /* ---------- persistence ---------- */

  async function saveConfig(nextConfig: StaffTrainingConfig) {
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
      window.alert("Не удалось сохранить журнал");
    } finally {
      setIsSaving(false);
    }
  }

  function updateConfigAndSave(next: StaffTrainingConfig) {
    setConfig(next);
    saveConfig(next);
  }

  /* ---------- row helpers ---------- */

  function updateRow(id: string, patch: Partial<StaffTrainingRow>) {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row
      ),
    }));
  }

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

  function saveDraftRow() {
    const next = {
      ...config,
      rows: [...config.rows, draftRow],
    };
    updateConfigAndSave(next);
    setDraftRow(
      createStaffTrainingRow({
        date: nowDate(),
        employeeId: users[0]?.id || null,
        employeeName: users[0]?.name || "",
        employeePosition: users[0]
          ? getHygienePositionLabel(users[0].role)
          : "",
      })
    );
    setAddModalOpen(false);
  }

  /* ---------- cell editing ---------- */

  function openCellEdit(rowId: string, field: string) {
    if (isClosed) return;
    const row = config.rows.find((r) => r.id === rowId);
    if (!row) return;
    setCellEditValue((row as Record<string, unknown>)[field] as string || "");
    setEditingCell({ rowId, field });
  }

  function saveCellEdit() {
    if (!editingCell) return;
    const { rowId, field } = editingCell;
    const next = {
      ...config,
      rows: config.rows.map((row) =>
        row.id === rowId ? { ...row, [field]: cellEditValue } : row
      ),
    };
    updateConfigAndSave(next);
    setEditingCell(null);
    setCellEditValue("");
  }

  function getCellEditLabel(): string {
    if (!editingCell) return "";
    switch (editingCell.field) {
      case "attestationResult":
        return "Результат аттестации";
      case "trainingType":
        return "Вид инструктажа";
      case "unscheduledReason":
        return "Причина проведения внепланового инструктажа";
      case "instructorName":
        return "Должность инструктирующего";
      default:
        return "Редактирование";
    }
  }

  /* ---------- close journal ---------- */

  async function handleCloseJournal() {
    if (!window.confirm(`Закончить журнал "${title}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!response.ok) {
      window.alert("Не удалось закончить журнал");
      return;
    }
    router.refresh();
  }

  /* ---------- helpers ---------- */

  function emptyCellClass(value: string) {
    return !value ? "bg-red-50" : "";
  }

  const pageCount = Math.max(1, Math.ceil(config.rows.length / 20));

  return (
    <div className="space-y-6 text-black">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[#7a7f93]">{organizationName}</div>
          <h1 className="text-[48px] font-semibold tracking-[-0.03em]">
            {title}
          </h1>
        </div>
        <div className="flex gap-2">
          {!isClosed && (
            <Button
              type="button"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleCloseJournal}
            >
              Закончить журнал
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
            Настройки журнала
          </Button>
        </div>
      </div>

      {/* HACCP block */}
      <div className="space-y-4 rounded-[20px] border bg-white p-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[18%] border border-black p-3 text-center font-semibold"
              >
                {organizationName}
              </td>
              <td className="border border-black p-2 text-center">
                СИСТЕМА ХАССП
              </td>
              <td className="w-[20%] border border-black p-2">
                Начат &nbsp;{" "}
                {new Date(dateFrom).toLocaleDateString("ru-RU")}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-sm uppercase">
                ЖУРНАЛ РЕГИСТРАЦИИ ИНСТРУКТАЖЕЙ (ОБУЧЕНИЯ) СОТРУДНИКОВ
              </td>
              <td className="border border-black p-2">
                Окончен &nbsp;{" "}
                {isClosed ? "________" : "________"}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="border border-black p-2 text-right text-sm">
                Страниц: {pageCount}
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-center text-[28px] font-semibold leading-tight">
          ЖУРНАЛ
          <br />
          регистрации инструктажей (обучения) сотрудников
        </h2>

        {/* toolbar */}
        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="bg-[#5b66ff] hover:bg-[#4d58f5]"
                >
                  <Plus className="size-4" />
                  Добавить
                  <ChevronDown className="ml-1 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[280px] rounded-2xl border-0 p-2">
                <DropdownMenuItem onSelect={() => setAddModalOpen(true)}>
                  Добавить сотрудника
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPlanModalOpen(true)}>
                  Заполнить из плана обучения
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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

        {/* main table */}
        <div className="overflow-x-auto">
          <table className="min-w-[1600px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-10 border p-2" />
                <th className="border p-2">Дата</th>
                <th className="border p-2">
                  Ф.И.О. инструктируемого
                </th>
                <th className="border p-2">
                  Профессия / должность инструктируемого
                </th>
                <th className="border p-2">
                  Тема инструктажа (обучения)
                </th>
                <th className="border p-2">
                  Вид инструктажа (первичный / повторный / внеплановый)
                </th>
                <th className="border p-2">
                  Причина проведения внепланового инструктажа
                </th>
                <th className="border p-2">
                  Ф.И.О. / должность инструктирующего
                </th>
                <th className="border p-2">
                  Результат аттестации после обучения (удовл. / не удовл.)
                </th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row) => {
                const trainingLabel =
                  TRAINING_TYPES.find((t) => t.value === row.trainingType)
                    ?.label || row.trainingType;
                const attestLabel =
                  ATTESTATION_RESULTS.find(
                    (a) => a.value === row.attestationResult
                  )?.label || row.attestationResult;

                return (
                  <tr key={row.id}>
                    <td className="border p-2 align-top">
                      {!isClosed && (
                        <Checkbox
                          checked={selectedRows.includes(row.id)}
                          onCheckedChange={(checked) =>
                            toggleRow(row.id, checked === true)
                          }
                        />
                      )}
                    </td>
                    <td className="border p-1 align-top whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="border p-1 align-top">{row.employeeName}</td>
                    <td className="border p-1 align-top">
                      {row.employeePosition}
                    </td>
                    <td className="border p-1 align-top">{row.topic}</td>
                    <td
                      className={`border p-1 align-top cursor-pointer ${emptyCellClass(row.trainingType)}`}
                      onClick={() => openCellEdit(row.id, "trainingType")}
                    >
                      {trainingLabel || <span className="text-gray-300">---</span>}
                    </td>
                    <td
                      className={`border p-1 align-top cursor-pointer ${emptyCellClass(row.unscheduledReason)}`}
                      onClick={() =>
                        openCellEdit(row.id, "unscheduledReason")
                      }
                    >
                      {row.unscheduledReason || (
                        <span className="text-gray-300">---</span>
                      )}
                    </td>
                    <td
                      className={`border p-1 align-top cursor-pointer ${emptyCellClass(row.instructorName)}`}
                      onClick={() =>
                        openCellEdit(row.id, "instructorName")
                      }
                    >
                      {row.instructorName || (
                        <span className="text-gray-300">---</span>
                      )}
                    </td>
                    <td
                      className={`border p-1 align-top cursor-pointer ${emptyCellClass(row.attestationResult)}`}
                      onClick={() =>
                        openCellEdit(row.id, "attestationResult")
                      }
                    >
                      {attestLabel || (
                        <span className="text-gray-300">---</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {config.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="border p-4 text-center text-gray-400">
                    Нет записей. Нажмите &laquo;Добавить&raquo; чтобы добавить сотрудника.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Add Row Dialog ---------- */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Добавление записи</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Дата</Label>
            <Input
              type="date"
              value={draftRow.date}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, date: e.target.value }))
              }
            />

            <Label>Должность инструктируемого</Label>
            <Select
              value={draftRow.employeePosition}
              onValueChange={(val) =>
                setDraftRow((prev) => ({ ...prev, employeePosition: val }))
              }
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

            <Label>Ф.И.О. инструктируемого</Label>
            <Select
              value={draftRow.employeeId || "__empty__"}
              onValueChange={(val) => {
                const user = users.find((u) => u.id === val);
                setDraftRow((prev) => ({
                  ...prev,
                  employeeId: user?.id || null,
                  employeeName: user?.name || "",
                  employeePosition: user
                    ? getHygienePositionLabel(user.role)
                    : prev.employeePosition,
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Р’С‹Р±РµСЂРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ -</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {buildStaffOptionLabel(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Вид инструктажа</Label>
            <Select
              value={draftRow.trainingType}
              onValueChange={(val) =>
                setDraftRow((prev) => ({ ...prev, trainingType: val }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Тема обучения</Label>
            <Select
              value={draftRow.topic}
              onValueChange={(val) =>
                setDraftRow((prev) => ({ ...prev, topic: val }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_TOPICS.map((t) => (
                  <SelectItem key={t.value} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Причина проведения внепланового инструктажа</Label>
            <Textarea
              value={draftRow.unscheduledReason}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  unscheduledReason: e.target.value,
                }))
              }
              placeholder="Причина"
            />

            <Label>Должность инструктирующего</Label>
            <Select
              value={draftRow.instructorName}
              onValueChange={(val) =>
                setDraftRow((prev) => ({ ...prev, instructorName: val }))
              }
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

            <div className="flex justify-end pt-2">
              <Button onClick={saveDraftRow}>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Cell Edit Dialog ---------- */}
      <Dialog
        open={editingCell !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCell(null);
            setCellEditValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Редактирование ячейки</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>{getCellEditLabel()}</Label>

            {editingCell?.field === "attestationResult" && (
              <div className="flex items-center gap-4 text-sm">
                {ATTESTATION_RESULTS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={cellEditValue === opt.value}
                      onChange={() => setCellEditValue(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}

            {editingCell?.field === "trainingType" && (
              <Select value={cellEditValue} onValueChange={setCellEditValue}>
                <SelectTrigger>
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {editingCell?.field === "unscheduledReason" && (
              <Textarea
                value={cellEditValue}
                onChange={(e) => setCellEditValue(e.target.value)}
                placeholder="Причина"
                rows={3}
              />
            )}

            {editingCell?.field === "instructorName" && (
              <Select value={cellEditValue} onValueChange={setCellEditValue}>
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
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingCell(null);
                  setCellEditValue("");
                }}
              >
                Отмена
              </Button>
              <Button onClick={saveCellEdit}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Plan Fill Dialog ---------- */}
      <Dialog open={planModalOpen} onOpenChange={setPlanModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Заполнение журнала</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>План</Label>
            <Select disabled>
              <SelectTrigger>
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Нет доступных планов</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end">
              <Button disabled>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Settings Dialog ---------- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Настройки журнала</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Название журнала</Label>
            <Input
              value={settingsTitle}
              onChange={(e) => setSettingsTitle(e.target.value)}
            />
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/journal-documents/${documentId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: settingsTitle }),
                    });
                    if (!response.ok) {
                      throw new Error("Не удалось сохранить настройки");
                    }
                    setSettingsOpen(false);
                    router.refresh();
                  } catch {
                    window.alert("Не удалось сохранить настройки");
                  }
                }}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
