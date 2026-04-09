"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import {
  type MedBookDocumentConfig,
  type MedBookEntryData,
  type MedBookVaccinationType,
  VACCINATION_TYPE_LABELS,
  EXAMINATION_REFERENCE_DATA,
  VACCINATION_REFERENCE_DATA,
  MED_BOOK_VACCINATION_RULES,
  emptyMedBookEntry,
  formatMedBookDate,
  isExaminationExpired,
  isExaminationExpiringSoon,
} from "@/lib/med-book-document";
import { toast } from "sonner";

type EmployeeRow = {
  id: string;
  employeeId: string;
  name: string;
  data: MedBookEntryData;
};

type Props = {
  documentId: string;
  title: string;
  templateCode: string;
  organizationName: string;
  status: string;
  config: MedBookDocumentConfig;
  employees: { id: string; name: string; role: string }[];
  initialRows: EmployeeRow[];
};

function getPositionLabel(role: string): string {
  switch (role) {
    case "owner": return "Управляющий";
    case "technologist": return "Шеф-повар";
    case "operator": return "Повар";
    default: return "Сотрудник";
  }
}

export function MedBookDocumentClient({
  documentId,
  title,
  templateCode,
  organizationName,
  status,
  config,
  employees,
  initialRows,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<EmployeeRow[]>(initialRows);
  const [examColumns, setExamColumns] = useState<string[]>(config.examinations);
  const [vaccColumns, setVaccColumns] = useState<string[]>(config.vaccinations);
  const [saving, setSaving] = useState(false);

  // Dialogs
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [addExamOpen, setAddExamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Exam cell editing
  const [editingExamCell, setEditingExamCell] = useState<{ rowId: string; examName: string } | null>(null);
  const [editExamDate, setEditExamDate] = useState("");
  const [editExamExpiry, setEditExamExpiry] = useState("");

  // Vaccination cell editing
  const [editingVaccCell, setEditingVaccCell] = useState<{ rowId: string; vaccName: string } | null>(null);
  const [editVaccType, setEditVaccType] = useState<MedBookVaccinationType>("done");
  const [editVaccDose, setEditVaccDose] = useState("");
  const [editVaccDate, setEditVaccDate] = useState("");
  const [editVaccExpiry, setEditVaccExpiry] = useState("");

  // Add row form state
  const [newRowEmployeeId, setNewRowEmployeeId] = useState("");
  const [newRowPosition, setNewRowPosition] = useState("");
  const [newRowBirthDate, setNewRowBirthDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRowGender, setNewRowGender] = useState<"male" | "female" | null>(null);
  const [newRowHireDate, setNewRowHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRowMedBookNumber, setNewRowMedBookNumber] = useState("");

  // Settings dialog
  const [settingsTitle, setSettingsTitle] = useState(title);

  const availableEmployees = useMemo(
    () => employees.filter((emp) => !rows.some((r) => r.employeeId === emp.id)),
    [employees, rows]
  );

  const saveEntries = useCallback(
    async (updatedRows: EmployeeRow[], updatedConfig?: Partial<MedBookDocumentConfig>) => {
      setSaving(true);
      try {
        const entries = updatedRows.map((row) => ({
          employeeId: row.employeeId,
          date: new Date().toISOString().slice(0, 10),
          data: row.data,
        }));

        await fetch(`/api/journal-documents/${documentId}/entries`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        });

        if (updatedConfig) {
          await fetch(`/api/journal-documents/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: {
                ...config,
                examinations: updatedConfig.examinations ?? examColumns,
                vaccinations: updatedConfig.vaccinations ?? vaccColumns,
                includeVaccinations: updatedConfig.includeVaccinations ?? config.includeVaccinations,
              },
            }),
          });
        }
      } catch {
        toast.error("Ошибка сохранения");
      } finally {
        setSaving(false);
      }
    },
    [documentId, config, examColumns, vaccColumns]
  );

  function handleAddRow() {
    if (!newRowEmployeeId) return;
    const emp = employees.find((e) => e.id === newRowEmployeeId);
    if (!emp) return;

    const newRow: EmployeeRow = {
      id: `row-${Date.now()}`,
      employeeId: emp.id,
      name: emp.name,
      data: {
        ...emptyMedBookEntry(newRowPosition || getPositionLabel(emp.role)),
        birthDate: newRowBirthDate || null,
        gender: newRowGender,
        hireDate: newRowHireDate || null,
        medBookNumber: newRowMedBookNumber || null,
      },
    };

    const updated = [...rows, newRow];
    setRows(updated);
    saveEntries(updated);
    setAddRowOpen(false);
    resetAddRowForm();
  }

  function resetAddRowForm() {
    setNewRowEmployeeId("");
    setNewRowPosition("");
    setNewRowBirthDate(new Date().toISOString().slice(0, 10));
    setNewRowGender(null);
    setNewRowHireDate(new Date().toISOString().slice(0, 10));
    setNewRowMedBookNumber("");
  }

  function handleDeleteRow(rowId: string) {
    const updated = rows.filter((r) => r.id !== rowId);
    setRows(updated);
    saveEntries(updated);
  }

  function openExamCellEdit(rowId: string, examName: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const exam = row.data.examinations[examName];
    setEditingExamCell({ rowId, examName });
    setEditExamDate(exam?.date || "");
    setEditExamExpiry(exam?.expiryDate || "");
  }

  function saveExamCell() {
    if (!editingExamCell) return;
    const { rowId, examName } = editingExamCell;
    const updated = rows.map((r) => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        data: {
          ...r.data,
          examinations: {
            ...r.data.examinations,
            [examName]: {
              date: editExamDate || null,
              expiryDate: editExamExpiry || null,
            },
          },
        },
      };
    });
    setRows(updated);
    saveEntries(updated);
    setEditingExamCell(null);
  }

  function openVaccCellEdit(rowId: string, vaccName: string) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const vacc = row.data.vaccinations[vaccName];
    setEditingVaccCell({ rowId, vaccName });
    setEditVaccType(vacc?.type || "done");
    setEditVaccDose(vacc?.dose || "");
    setEditVaccDate(vacc?.date || "");
    setEditVaccExpiry(vacc?.expiryDate || "");
  }

  function saveVaccCell() {
    if (!editingVaccCell) return;
    const { rowId, vaccName } = editingVaccCell;
    const updated = rows.map((r) => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        data: {
          ...r.data,
          vaccinations: {
            ...r.data.vaccinations,
            [vaccName]: {
              type: editVaccType,
              dose: editVaccDose || null,
              date: editVaccDate || null,
              expiryDate: editVaccExpiry || null,
            },
          },
        },
      };
    });
    setRows(updated);
    saveEntries(updated);
    setEditingVaccCell(null);
  }

  function handleAddExamColumn(name: string) {
    if (!name.trim() || examColumns.includes(name.trim())) return;
    const updated = [...examColumns, name.trim()];
    setExamColumns(updated);
    saveEntries(rows, { examinations: updated });
    setAddExamOpen(false);
  }

  function handleSaveSettings() {
    if (!settingsTitle.trim()) return;
    fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: settingsTitle.trim() }),
    }).then(() => {
      setSettingsOpen(false);
      router.refresh();
    });
  }

  // Edit row dialog
  const editRow = rows.find((r) => r.id === editRowId);

  function handleSaveEditRow(data: Partial<MedBookEntryData>) {
    if (!editRowId) return;
    const updated = rows.map((r) => {
      if (r.id !== editRowId) return r;
      return { ...r, data: { ...r.data, ...data } };
    });
    setRows(updated);
    saveEntries(updated);
    setEditRowId(null);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/journals/${templateCode}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <Button
          variant="ghost"
          className="text-[#5b66ff]"
          onClick={() => {
            setSettingsTitle(title);
            setSettingsOpen(true);
          }}
        >
          Настройки журнала
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => {
            resetAddRowForm();
            setAddRowOpen(true);
          }}
          className="bg-[#5b66ff] text-white hover:bg-[#4b57ff]"
        >
          <Plus className="mr-1 size-4" />
          Добавить сотрудника
        </Button>
        <Button
          onClick={() => setAddExamOpen(true)}
          className="bg-[#5b66ff] text-white hover:bg-[#4b57ff]"
        >
          <Plus className="mr-1 size-4" />
          Добавить исследование
        </Button>
      </div>

      {/* Examinations table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-2 py-2 text-center">
                № п/п
              </th>
              <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                Ф.И.О. сотрудника
              </th>
              <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                Должность
              </th>
              <th
                colSpan={examColumns.length}
                className="border border-gray-300 bg-gray-50 px-3 py-2 text-center"
              >
                Наименование специалиста / исследования
              </th>
            </tr>
            <tr>
              {examColumns.map((col) => (
                <th
                  key={col}
                  className="border border-gray-300 bg-gray-50 px-2 py-2 text-center text-xs font-medium"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} className="group">
                <td className="border border-gray-300 px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-gray-300"
                    />
                    {idx + 1}
                  </div>
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  <div className="flex items-center justify-between gap-1">
                    {row.name}
                    <button
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => setEditRowId(row.id)}
                    >
                      <Pencil className="size-3 text-gray-400" />
                    </button>
                  </div>
                </td>
                <td className="border border-gray-300 px-3 py-2">
                  {row.data.positionTitle}
                </td>
                {examColumns.map((col) => {
                  const exam = row.data.examinations[col];
                  const expired = exam ? isExaminationExpired(exam) : false;
                  const expiringSoon = exam ? isExaminationExpiringSoon(exam) : false;

                  return (
                    <td
                      key={col}
                      className={`cursor-pointer border border-gray-300 px-2 py-1 text-center text-xs ${
                        expired
                          ? "bg-red-100 text-red-800"
                          : expiringSoon
                            ? "bg-yellow-50 text-yellow-800"
                            : ""
                      }`}
                      onClick={() => openExamCellEdit(row.id, col)}
                    >
                      {exam?.date ? (
                        <div>
                          <div>{formatMedBookDate(exam.date)}</div>
                          {exam.expiryDate && (
                            <div className="text-[10px] text-gray-500">
                              до {formatMedBookDate(exam.expiryDate)}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Static: Список специалистов и исследований */}
      <div id="med-book-reference">
        <h2 className="mb-4 text-lg font-bold">Список специалистов и исследований</h2>
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                Наименование специалиста / исследование
              </th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                Периодичность
              </th>
              <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                Примечание
              </th>
            </tr>
          </thead>
          <tbody>
            {EXAMINATION_REFERENCE_DATA.map((item) => (
              <tr key={item.name}>
                <td className="border border-gray-300 px-3 py-2">{item.name}</td>
                <td className="border border-gray-300 px-3 py-2">{item.periodicity}</td>
                <td className="border border-gray-300 px-3 py-2">{item.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vaccinations table */}
      {config.includeVaccinations && (
        <>
          <h2 className="text-center text-lg font-bold">Прививки</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-2 py-2 text-center">
                    № п/п
                  </th>
                  <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                    Ф.И.О. сотрудника
                  </th>
                  <th rowSpan={2} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                    Должность
                  </th>
                  <th
                    colSpan={vaccColumns.length + 1}
                    className="border border-gray-300 bg-gray-50 px-3 py-2 text-center"
                  >
                    Наименование прививки:
                  </th>
                </tr>
                <tr>
                  {vaccColumns.map((col) => (
                    <th
                      key={col}
                      className="border border-gray-300 bg-gray-50 px-2 py-2 text-center text-xs font-medium"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="border border-gray-300 bg-gray-50 px-2 py-2 text-center text-xs font-medium">
                    Примечание
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-2 py-2 text-center">
                      {idx + 1}
                    </td>
                    <td className="border border-gray-300 px-3 py-2">{row.name}</td>
                    <td className="border border-gray-300 px-3 py-2">
                      {row.data.positionTitle}
                    </td>
                    {vaccColumns.map((col) => {
                      const vacc = row.data.vaccinations[col];
                      const isExpired = vacc?.expiryDate
                        ? vacc.expiryDate < new Date().toISOString().slice(0, 10)
                        : false;

                      return (
                        <td
                          key={col}
                          className={`cursor-pointer border border-gray-300 px-2 py-1 text-center text-xs ${isExpired ? "bg-red-100" : ""}`}
                          onClick={() => openVaccCellEdit(row.id, col)}
                        >
                          {vacc ? (
                            vacc.type === "refusal" ? (
                              <span className="text-gray-500">Отказ сотрудника</span>
                            ) : vacc.type === "exemption" ? (
                              <span className="text-gray-500">Мед. отвод</span>
                            ) : (
                              <div>
                                {vacc.dose && <div>{vacc.dose}: {formatMedBookDate(vacc.date || null)}</div>}
                                {vacc.expiryDate && (
                                  <div className="text-[10px] text-gray-500">
                                    до {formatMedBookDate(vacc.expiryDate)}
                                  </div>
                                )}
                              </div>
                            )
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="border border-gray-300 px-2 py-2 text-center text-xs">
                      {row.data.note || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Static: Список прививок */}
          <h2 className="text-lg font-bold">Список прививок</h2>
          <p className="text-sm leading-relaxed">
            Вакцинация всех сотрудников проводится в соответствии Приказом Минздрава России от 06.12.2021 N 1122н
            «Об утверждении национального календаря профилактических прививок, календаря профилактических прививок
            по эпидемическим показаниям и порядка проведения профилактических прививок»:
          </p>
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                  Наименование прививок
                </th>
                <th className="border border-gray-300 bg-gray-50 px-3 py-2 text-left">
                  Периодичность
                </th>
              </tr>
            </thead>
            <tbody>
              {VACCINATION_REFERENCE_DATA.map((item) => (
                <tr key={item.name}>
                  <td className="border border-gray-300 px-3 py-2">{item.name}</td>
                  <td className="border border-gray-300 px-3 py-2">{item.periodicity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 text-sm font-bold">
            {MED_BOOK_VACCINATION_RULES.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
        </>
      )}

      {/* ===== DIALOGS ===== */}

      {/* Add Row Dialog */}
      <AddRowDialog
        open={addRowOpen}
        onOpenChange={setAddRowOpen}
        employees={availableEmployees}
        employeeId={newRowEmployeeId}
        onEmployeeChange={(id) => {
          setNewRowEmployeeId(id);
          const emp = employees.find((e) => e.id === id);
          if (emp) setNewRowPosition(getPositionLabel(emp.role));
        }}
        position={newRowPosition}
        onPositionChange={setNewRowPosition}
        birthDate={newRowBirthDate}
        onBirthDateChange={setNewRowBirthDate}
        gender={newRowGender}
        onGenderChange={setNewRowGender}
        hireDate={newRowHireDate}
        onHireDateChange={setNewRowHireDate}
        medBookNumber={newRowMedBookNumber}
        onMedBookNumberChange={setNewRowMedBookNumber}
        onSave={handleAddRow}
      />

      {/* Edit Row Dialog */}
      {editRow && (
        <EditRowDialog
          open={!!editRowId}
          onOpenChange={(v) => { if (!v) setEditRowId(null); }}
          row={editRow}
          onSave={handleSaveEditRow}
          onDelete={() => handleDeleteRow(editRow.id)}
        />
      )}

      {/* Add Examination Dialog */}
      <AddColumnDialog
        open={addExamOpen}
        onOpenChange={setAddExamOpen}
        dialogTitle="Добавление нового специалиста / исследования"
        placeholder="Введите название исследования"
        onSave={handleAddExamColumn}
      />

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[20px] font-medium">
              Настройки документа
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Название документа</Label>
              <Input
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                className="h-12 rounded-xl border-[#dfe1ec] px-4"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSaveSettings}
                className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exam Cell Edit Dialog */}
      <Dialog open={!!editingExamCell} onOpenChange={(v) => { if (!v) setEditingExamCell(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[400px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[18px] font-medium">
              {editingExamCell?.examName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Дата осмотра</Label>
              <Input
                type="date"
                value={editExamDate}
                onChange={(e) => setEditExamDate(e.target.value)}
                className="h-12 rounded-xl border-[#dfe1ec] px-4"
              />
            </div>
            <div className="space-y-2">
              <Label>Действует до</Label>
              <Input
                type="date"
                value={editExamExpiry}
                onChange={(e) => setEditExamExpiry(e.target.value)}
                className="h-12 rounded-xl border-[#dfe1ec] px-4"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (editingExamCell) {
                    const { rowId, examName } = editingExamCell;
                    const updated = rows.map((r) => {
                      if (r.id !== rowId) return r;
                      const exams = { ...r.data.examinations };
                      delete exams[examName];
                      return { ...r, data: { ...r.data, examinations: exams } };
                    });
                    setRows(updated);
                    saveEntries(updated);
                  }
                  setEditingExamCell(null);
                }}
                className="h-10 rounded-xl px-4"
              >
                Очистить
              </Button>
              <Button
                onClick={saveExamCell}
                className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vaccination Cell Edit Dialog */}
      <Dialog open={!!editingVaccCell} onOpenChange={(v) => { if (!v) setEditingVaccCell(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[400px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[18px] font-medium">
              {editingVaccCell?.vaccName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Тип</Label>
              <Select value={editVaccType} onValueChange={(v) => setEditVaccType(v as MedBookVaccinationType)}>
                <SelectTrigger className="h-12 rounded-xl border-[#dfe1ec]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(VACCINATION_TYPE_LABELS) as [MedBookVaccinationType, string][]).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            {editVaccType === "done" && (
              <>
                <div className="space-y-2">
                  <Label>Доза (V1, V2...)</Label>
                  <Input
                    value={editVaccDose}
                    onChange={(e) => setEditVaccDose(e.target.value)}
                    placeholder="V1"
                    className="h-12 rounded-xl border-[#dfe1ec] px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата прививки</Label>
                  <Input
                    type="date"
                    value={editVaccDate}
                    onChange={(e) => setEditVaccDate(e.target.value)}
                    className="h-12 rounded-xl border-[#dfe1ec] px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Действует до</Label>
                  <Input
                    type="date"
                    value={editVaccExpiry}
                    onChange={(e) => setEditVaccExpiry(e.target.value)}
                    className="h-12 rounded-xl border-[#dfe1ec] px-4"
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (editingVaccCell) {
                    const { rowId, vaccName } = editingVaccCell;
                    const updated = rows.map((r) => {
                      if (r.id !== rowId) return r;
                      const vaccs = { ...r.data.vaccinations };
                      delete vaccs[vaccName];
                      return { ...r, data: { ...r.data, vaccinations: vaccs } };
                    });
                    setRows(updated);
                    saveEntries(updated);
                  }
                  setEditingVaccCell(null);
                }}
                className="h-10 rounded-xl px-4"
              >
                Очистить
              </Button>
              <Button
                onClick={saveVaccCell}
                className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]"
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

/* ===== Sub-components ===== */

function AddRowDialog({
  open,
  onOpenChange,
  employees,
  employeeId,
  onEmployeeChange,
  position,
  onPositionChange,
  birthDate,
  onBirthDateChange,
  gender,
  onGenderChange,
  hireDate,
  onHireDateChange,
  medBookNumber,
  onMedBookNumberChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: { id: string; name: string; role: string }[];
  employeeId: string;
  onEmployeeChange: (id: string) => void;
  position: string;
  onPositionChange: (v: string) => void;
  birthDate: string;
  onBirthDateChange: (v: string) => void;
  gender: "male" | "female" | null;
  onGenderChange: (v: "male" | "female" | null) => void;
  hireDate: string;
  onHireDateChange: (v: string) => void;
  medBookNumber: string;
  onMedBookNumberChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[20px] font-medium">
            Добавление новой строки
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label>Должность</Label>
            <Select value={position} onValueChange={onPositionChange}>
              <SelectTrigger className="h-12 rounded-xl border-[#dfe1ec]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {["Управляющий", "Шеф-повар", "Повар", "Кондитер", "Официант", "Бармен"].map(
                  (p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {employees.length > 0 && (
            <div className="space-y-2">
              <Label>Сотрудник</Label>
              <Select value={employeeId} onValueChange={onEmployeeChange}>
                <SelectTrigger className="h-12 rounded-xl border-[#dfe1ec]">
                  <SelectValue placeholder="- Выберите сотрудника -" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Дата рождения</Label>
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.target.value)}
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>

          <div className="space-y-2">
            <Label>Пол</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender-new"
                  checked={gender === "male"}
                  onChange={() => onGenderChange("male")}
                />
                Мужской
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender-new"
                  checked={gender === "female"}
                  onChange={() => onGenderChange("female")}
                />
                Женский
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Дата приема на работу</Label>
            <Input
              type="date"
              value={hireDate}
              onChange={(e) => onHireDateChange(e.target.value)}
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>

          <div className="space-y-2">
            <Input
              value={medBookNumber}
              onChange={(e) => onMedBookNumberChange(e.target.value)}
              placeholder="Введите номер мед. книжки"
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>

          <div className="flex justify-center pt-2">
            <Button
              onClick={onSave}
              disabled={!employeeId}
              className="h-11 rounded-xl bg-[#5b66ff] px-8 text-white hover:bg-[#4b57ff]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditRowDialog({
  open,
  onOpenChange,
  row,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: EmployeeRow;
  onSave: (data: Partial<MedBookEntryData>) => void;
  onDelete: () => void;
}) {
  const [birthDate, setBirthDate] = useState(row.data.birthDate || "");
  const [gender, setGender] = useState(row.data.gender);
  const [hireDate, setHireDate] = useState(row.data.hireDate || "");
  const [medBookNumber, setMedBookNumber] = useState(row.data.medBookNumber || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[20px] font-medium">
            Редактирование строки
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div>
            <div className="text-sm font-semibold">Должность</div>
            <div className="text-sm">{row.data.positionTitle}</div>
          </div>
          <div>
            <div className="text-sm font-semibold">Сотрудник</div>
            <div className="text-sm">{row.name}</div>
          </div>
          <div className="space-y-2">
            <Label>Дата рождения</Label>
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>
          <div className="space-y-2">
            <Label>Пол</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender-edit"
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />
                Мужской
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender-edit"
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />
                Женский
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Дата приема на работу</Label>
            <Input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>
          <div className="space-y-2">
            <Input
              value={medBookNumber}
              onChange={(e) => setMedBookNumber(e.target.value)}
              placeholder="Введите номер мед. книжки"
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>
          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              className="text-red-500 hover:text-red-600"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
            >
              <Trash2 className="mr-1 size-4" />
              Удалить
            </Button>
            <Button
              onClick={() =>
                onSave({
                  birthDate: birthDate || null,
                  gender,
                  hireDate: hireDate || null,
                  medBookNumber: medBookNumber || null,
                })
              }
              className="h-11 rounded-xl bg-[#5b66ff] px-8 text-white hover:bg-[#4b57ff]"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddColumnDialog({
  open,
  onOpenChange,
  dialogTitle,
  placeholder,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dialogTitle: string;
  placeholder: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setName("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[20px] font-medium">
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            className="h-12 rounded-xl border-[#dfe1ec] px-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onSave(name.trim());
                setName("");
              }
            }}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (name.trim()) {
                  onSave(name.trim());
                  setName("");
                }
              }}
              disabled={!name.trim()}
              className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
