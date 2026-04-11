"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Archive, ChevronLeft, Pencil, Plus, Printer, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EXAMINATION_REFERENCE_DATA,
  MED_BOOK_PRELIMINARY_PERIODIC_ROWS,
  MED_BOOK_VACCINATION_RULES,
  VACCINATION_REFERENCE_DATA,
  VACCINATION_TYPE_LABELS,
  emptyMedBookEntry,
  formatMedBookDate,
  isExaminationExpired,
  isExaminationExpiringSoon,
  isVaccinationExpired,
  type MedBookDocumentConfig,
  type MedBookEntryData,
  type MedBookVaccinationType,
} from "@/lib/med-book-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";
import { getUserRoleLabel } from "@/lib/user-roles";

type Employee = { id: string; name: string; role: string };
type Row = { id: string; employeeId: string; name: string; data: MedBookEntryData };
type Props = {
  documentId: string;
  title: string;
  templateCode: string;
  organizationName: string;
  status: string;
  config: MedBookDocumentConfig;
  employees: Employee[];
  initialRows: Row[];
  documentDateKey: string;
};

type Draft = {
  employeeId: string;
  positionTitle: string;
  birthDate: string;
  hireDate: string;
  medBookNumber: string;
  note: string;
};

function makeDraft(): Draft {
  const today = new Date().toISOString().slice(0, 10);
  return { employeeId: "", positionTitle: "", birthDate: today, hireDate: today, medBookNumber: "", note: "" };
}

function cellBg(alert: boolean) {
  return alert ? "bg-[#f6caca]" : "bg-white";
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
  documentDateKey,
}: Props) {
  const router = useRouter();
  const isClosed = status === "closed";
  const [rows, setRows] = useState(initialRows);
  const [docTitle, setDocTitle] = useState(title);
  const [settingsTitle, setSettingsTitle] = useState(title);
  const [examColumns, setExamColumns] = useState(config.examinations);
  const [vaccColumns, setVaccColumns] = useState(config.vaccinations);
  const [includeVaccinations, setIncludeVaccinations] = useState(config.includeVaccinations);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(makeDraft());
  const [editRowId, setEditRowId] = useState<string | null>(null);
  const [examCell, setExamCell] = useState<{ rowId: string; name: string } | null>(null);
  const [examDate, setExamDate] = useState("");
  const [examExpiry, setExamExpiry] = useState("");
  const [vaccCell, setVaccCell] = useState<{ rowId: string; name: string } | null>(null);
  const [vaccType, setVaccType] = useState<MedBookVaccinationType>("done");
  const [vaccDose, setVaccDose] = useState("");
  const [vaccDate, setVaccDate] = useState("");
  const [vaccExpiry, setVaccExpiry] = useState("");

  const editRow = rows.find((row) => row.id === editRowId) ?? null;
  const availableEmployees = useMemo(
    () => employees.filter((employee) => !rows.some((row) => row.employeeId === employee.id)),
    [employees, rows]
  );

  const sync = useCallback(
    async (nextRows: Row[], nextTitle?: string, nextConfig?: Partial<MedBookDocumentConfig>) => {
      setSaving(true);
      try {
        const entriesResponse = await fetch(`/api/journal-documents/${documentId}/entries`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: nextRows.map((row) => ({
              employeeId: row.employeeId,
              date: documentDateKey,
              data: row.data,
            })),
          }),
        });
        if (!entriesResponse.ok) throw new Error("Не удалось сохранить строки");

        if (nextTitle !== undefined || nextConfig) {
          const response = await fetch(`/api/journal-documents/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(nextTitle !== undefined ? { title: nextTitle } : {}),
              ...(nextConfig
                ? {
                    config: {
                      examinations: nextConfig.examinations ?? examColumns,
                      vaccinations: nextConfig.vaccinations ?? vaccColumns,
                      includeVaccinations: nextConfig.includeVaccinations ?? includeVaccinations,
                    },
                  }
                : {}),
            }),
          });
          if (!response.ok) throw new Error("Не удалось сохранить документ");
        }
      } finally {
        setSaving(false);
      }
    },
    [documentDateKey, documentId, examColumns, includeVaccinations, vaccColumns]
  );

  async function saveRows(nextRows: Row[]) {
    setRows(nextRows);
    try {
      await sync(nextRows);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить журнал");
    }
  }

  async function patchStatus(nextStatus: "active" | "closed") {
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("Не удалось обновить статус");
      router.push(`/journals/${templateCode}${nextStatus === "closed" ? "?tab=closed" : ""}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить статус");
    }
  }

  function addEmployee() {
    if (!draft.employeeId) return;
    const employee = employees.find((item) => item.id === draft.employeeId);
    if (!employee) return;
    const nextRows = [
      ...rows,
      {
        id: `row-${Date.now()}`,
        employeeId: employee.id,
        name: employee.name,
        data: {
          ...emptyMedBookEntry(draft.positionTitle || getUserRoleLabel(employee.role)),
          birthDate: draft.birthDate || null,
          hireDate: draft.hireDate || null,
          medBookNumber: draft.medBookNumber || null,
          note: draft.note || null,
        },
      },
    ];
    setDraft(makeDraft());
    setAddOpen(false);
    void saveRows(nextRows);
  }

  function saveEdit(patch: Partial<MedBookEntryData>) {
    if (!editRow) return;
    void saveRows(rows.map((row) => (row.id === editRow.id ? { ...row, data: { ...row.data, ...patch } } : row)));
  }

  function deleteRow(rowId: string) {
    void saveRows(rows.filter((row) => row.id !== rowId));
    if (editRowId === rowId) setEditRowId(null);
  }

  function startExamEdit(rowId: string, name: string) {
    if (isClosed) return;
    const exam = rows.find((row) => row.id === rowId)?.data.examinations[name];
    setExamCell({ rowId, name });
    setExamDate(exam?.date || "");
    setExamExpiry(exam?.expiryDate || "");
  }

  function saveExam() {
    if (!examCell) return;
    const nextRows = rows.map((row) =>
      row.id === examCell.rowId
        ? {
            ...row,
            data: {
              ...row.data,
              examinations: {
                ...row.data.examinations,
                [examCell.name]: { date: examDate || null, expiryDate: examExpiry || null },
              },
            },
          }
        : row
    );
    setExamCell(null);
    void saveRows(nextRows);
  }

  function clearExam() {
    if (!examCell) return;
    const nextRows = rows.map((row) => {
      if (row.id !== examCell.rowId) return row;
      const examinations = { ...row.data.examinations };
      delete examinations[examCell.name];
      return { ...row, data: { ...row.data, examinations } };
    });
    setExamCell(null);
    void saveRows(nextRows);
  }

  function startVaccEdit(rowId: string, name: string) {
    if (isClosed) return;
    const vacc = rows.find((row) => row.id === rowId)?.data.vaccinations[name];
    setVaccCell({ rowId, name });
    setVaccType(vacc?.type || "done");
    setVaccDose(vacc?.dose || "");
    setVaccDate(vacc?.date || "");
    setVaccExpiry(vacc?.expiryDate || "");
  }

  function saveVacc() {
    if (!vaccCell) return;
    const nextRows = rows.map((row) =>
      row.id === vaccCell.rowId
        ? {
            ...row,
            data: {
              ...row.data,
              vaccinations: {
                ...row.data.vaccinations,
                [vaccCell.name]: {
                  type: vaccType,
                  dose: vaccType === "done" ? vaccDose || null : null,
                  date: vaccType === "done" ? vaccDate || null : null,
                  expiryDate: vaccType === "done" ? vaccExpiry || null : null,
                },
              },
            },
          }
        : row
    );
    setVaccCell(null);
    void saveRows(nextRows);
  }

  function clearVacc() {
    if (!vaccCell) return;
    const nextRows = rows.map((row) => {
      if (row.id !== vaccCell.rowId) return row;
      const vaccinations = { ...row.data.vaccinations };
      delete vaccinations[vaccCell.name];
      return { ...row, data: { ...row.data, vaccinations } };
    });
    setVaccCell(null);
    void saveRows(nextRows);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-[15px] text-[#6f7487]">
            <Link href={`/journals/${templateCode}`} className="hover:text-black hover:underline">{organizationName}</Link>
            <span>{">"}</span>
            <Link href={`/journals/${templateCode}`} className="hover:text-black hover:underline">Медицинские книжки</Link>
            <span>{">"}</span>
            <span>{docTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/journals/${templateCode}`} className="inline-flex size-11 items-center justify-center rounded-xl border border-[#e3e6f2] bg-white text-[#6f7487] transition hover:border-[#ccd2e7] hover:text-black">
              <ChevronLeft className="size-5" />
            </Link>
            <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-black md:text-[56px]">{docTitle}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" className="h-16 rounded-2xl border border-[#edf0ff] bg-[#fafbff] px-7 text-[18px] font-medium text-[#5863f8] hover:bg-[#f3f5ff] hover:text-[#5863f8]" onClick={() => openDocumentPdf(documentId).catch(() => toast.error("Не удалось открыть PDF"))}>
            <Printer className="size-5" />Печать
          </Button>
          <Button type="button" variant="ghost" className="h-16 rounded-2xl border border-[#edf0ff] bg-[#fafbff] px-7 text-[18px] font-medium text-[#5863f8] hover:bg-[#f3f5ff] hover:text-[#5863f8]" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="size-5" />Настройки журнала
          </Button>
          {isClosed ? (
            <Button type="button" className="h-16 rounded-2xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]" onClick={() => patchStatus("active")}>
              <RotateCcw className="size-5" />Вернуть в активные
            </Button>
          ) : (
            <Button type="button" className="h-16 rounded-2xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]" onClick={() => patchStatus("closed")}>
              <Archive className="size-5" />Закрыть журнал
            </Button>
          )}
        </div>
      </div>

      {!isClosed ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="h-16 rounded-2xl bg-[#5863f8] px-8 text-[18px] font-medium text-white hover:bg-[#4b57f3]" onClick={() => { setDraft(makeDraft()); setAddOpen(true); }}>
            <Plus className="size-5" />Добавить сотрудника
          </Button>
          <Button type="button" className="h-16 rounded-2xl bg-[#5863f8] px-8 text-[18px] font-medium text-white hover:bg-[#4b57f3]" onClick={() => { const name = window.prompt("Введите название исследования"); if (name?.trim() && !examColumns.includes(name.trim())) setExamColumns((current) => [...current, name.trim()]); }}>
            <Plus className="size-5" />Добавить исследование
          </Button>
        </div>
      ) : null}

      <TableBlock>
        <table className="min-w-[1320px] border-collapse text-[14px] leading-[1.35] text-black">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-black bg-[#ececec] px-2 py-4 text-center">№ п/п</th>
              <th rowSpan={2} className="border border-black bg-[#ececec] px-3 py-4 text-center">Ф.И.О. сотрудника</th>
              <th rowSpan={2} className="border border-black bg-[#ececec] px-3 py-4 text-center">Должность</th>
              <th colSpan={examColumns.length} className="border border-black bg-[#ececec] px-3 py-4 text-center">Наименование специалиста / исследования</th>
            </tr>
            <tr>
              {examColumns.map((column) => <th key={column} className="border border-black bg-[#ececec] px-3 py-3 text-center font-medium">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className="border border-black px-2 py-3 text-center">{index + 1}</td>
                <td className="border border-black px-3 py-3 text-center">
                  <button type="button" className={`inline-flex items-center gap-2 ${isClosed ? "" : "hover:text-[#5863f8]"}`} onClick={() => { if (!isClosed) setEditRowId(row.id); }}>
                    <span>{row.name}</span>{!isClosed ? <Pencil className="size-3 text-[#7c7c93]" /> : null}
                  </button>
                </td>
                <td className={`border border-black px-3 py-3 text-center ${cellBg(!row.data.positionTitle)}`}>{row.data.positionTitle}</td>
                {examColumns.map((column) => {
                  const exam = row.data.examinations[column];
                  const expired = exam ? isExaminationExpired(exam) : false;
                  const soon = exam ? isExaminationExpiringSoon(exam) : false;
                  return (
                    <td key={column} className={`border border-black px-3 py-3 text-center ${cellBg(!exam?.date || expired || soon)} ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`} onClick={() => startExamEdit(row.id, column)}>
                      {exam?.date ? <div className="space-y-1"><div>{formatMedBookDate(exam.date)}</div>{exam.expiryDate ? <div className={expired ? "text-[12px] text-[#d30000]" : "text-[12px] text-black"}>до {formatMedBookDate(exam.expiryDate)}</div> : null}</div> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableBlock>

      <div id="med-book-reference" className="space-y-5">
        <h2 className="text-[20px] font-semibold underline">Список специалистов и исследований</h2>
        <SimpleTable columns={["Предварительные осмотры (при поступлении на работу)", "Периодические (1 раз в год)"]}>
          {MED_BOOK_PRELIMINARY_PERIODIC_ROWS.map((row) => (
            <tr key={row.preliminary}>
              <td className="border border-black px-4 py-3 align-top">{row.preliminary}</td>
              <td className="border border-black px-4 py-3 align-top">{row.periodic}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable columns={["Наименование специалиста / исследования", "Периодичность", "Примечание"]}>
          {EXAMINATION_REFERENCE_DATA.map((item) => (
            <tr key={item.name}>
              <td className="border border-black px-4 py-3 align-top">{item.name}</td>
              <td className="border border-black px-4 py-3 align-top">{item.periodicity}</td>
              <td className="border border-black px-4 py-3 align-top">{item.note || "—"}</td>
            </tr>
          ))}
        </SimpleTable>
      </div>

      {includeVaccinations ? (
        <div className="space-y-5">
          <h2 className="text-center text-[34px] font-semibold tracking-[-0.03em] text-black">Прививки</h2>
          <TableBlock>
            <table className="min-w-[1320px] border-collapse text-[14px] leading-[1.35] text-black">
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-black bg-[#ececec] px-2 py-4 text-center">№ п/п</th>
                  <th rowSpan={2} className="border border-black bg-[#ececec] px-3 py-4 text-center">Ф.И.О. сотрудника</th>
                  <th rowSpan={2} className="border border-black bg-[#ececec] px-3 py-4 text-center">Должность</th>
                  <th colSpan={vaccColumns.length + 1} className="border border-black bg-[#ececec] px-3 py-4 text-center">Наименование прививки:</th>
                </tr>
                <tr>
                  {vaccColumns.map((column) => <th key={column} className="border border-black bg-[#ececec] px-3 py-3 text-center font-medium">{column}</th>)}
                  <th className="border border-black bg-[#ececec] px-3 py-3 text-center font-medium">Примечание</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id}>
                    <td className="border border-black px-2 py-3 text-center">{index + 1}</td>
                    <td className="border border-black px-3 py-3 text-center">{row.name}</td>
                    <td className="border border-black px-3 py-3 text-center">{row.data.positionTitle}</td>
                    {vaccColumns.map((column) => {
                      const vacc = row.data.vaccinations[column];
                      const expired = vacc ? isVaccinationExpired(vacc) : false;
                      return (
                        <td key={column} className={`border border-black px-3 py-3 text-center ${cellBg(!vacc || expired)} ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`} onClick={() => startVaccEdit(row.id, column)}>
                          {vacc ? vacc.type === "done" ? <div className="space-y-1"><div>{vacc.dose ? `${vacc.dose}: ` : ""}{formatMedBookDate(vacc.date || null)}</div>{vacc.expiryDate ? <div className={expired ? "text-[12px] text-[#d30000]" : "text-[12px] text-black"}>до {formatMedBookDate(vacc.expiryDate)}</div> : null}</div> : <div>{VACCINATION_TYPE_LABELS[vacc.type]}</div> : null}
                        </td>
                      );
                    })}
                    <td className="border border-black px-3 py-3 text-center">{row.data.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBlock>
          <SimpleTable columns={["Наименование прививок", "Периодичность"]}>
            {VACCINATION_REFERENCE_DATA.map((item) => (
              <tr key={item.name}>
                <td className="border border-black px-4 py-3 align-top">{item.name}</td>
                <td className="border border-black px-4 py-3 align-top">{item.periodicity}</td>
              </tr>
            ))}
          </SimpleTable>
          <div className="space-y-2 pt-2">
            {MED_BOOK_VACCINATION_RULES.map((rule) => <p key={rule} className="text-[22px] font-semibold uppercase leading-[1.45] text-black">{rule}</p>)}
          </div>
        </div>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[640px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b border-[#e5e7f0] px-8 py-6">
            <DialogTitle className="text-[20px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2">
              <Label>Название документа</Label>
              <Input value={settingsTitle} onChange={(event) => setSettingsTitle(event.target.value)} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <label className="flex items-center gap-3 text-[16px] text-black">
              <input type="checkbox" checked={includeVaccinations} onChange={(event) => setIncludeVaccinations(event.target.checked)} className="size-5 rounded accent-[#5863f8]" />
              {`включить "Прививки"`}
            </label>
            <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#dfe1ec] px-5" onClick={() => { const name = window.prompt("Введите название прививки"); if (name?.trim() && !vaccColumns.includes(name.trim())) setVaccColumns((current) => [...current, name.trim()]); }}>
              Добавить прививку
            </Button>
            <div className="flex justify-end">
              <Button type="button" disabled={saving || !settingsTitle.trim()} className="h-12 rounded-2xl bg-[#5863f8] px-6 text-[16px] text-white hover:bg-[#4b57f3]" onClick={async () => {
                try {
                  await sync(rows, settingsTitle.trim(), { examinations: examColumns, vaccinations: vaccColumns, includeVaccinations });
                  setDocTitle(settingsTitle.trim());
                  setSettingsOpen(false);
                  router.refresh();
                } catch {
                  toast.error("Не удалось сохранить настройки");
                }
              }}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b border-[#e5e7f0] px-8 py-6">
            <DialogTitle className="text-[20px] font-medium text-black">Добавление новой строки</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <Input value={draft.positionTitle} onChange={(event) => setDraft((current) => ({ ...current, positionTitle: event.target.value }))} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" placeholder="Должность" />
            <Select value={draft.employeeId} onValueChange={(value) => {
              const employee = availableEmployees.find((item) => item.id === value);
              setDraft((current) => ({ ...current, employeeId: value, positionTitle: employee ? getUserRoleLabel(employee.role) : current.positionTitle }));
            }}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]"><SelectValue placeholder="Сотрудник" /></SelectTrigger>
              <SelectContent>{availableEmployees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={draft.birthDate} onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            <Input type="date" value={draft.hireDate} onChange={(event) => setDraft((current) => ({ ...current, hireDate: event.target.value }))} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            <Input value={draft.medBookNumber} onChange={(event) => setDraft((current) => ({ ...current, medBookNumber: event.target.value }))} placeholder="Введите номер мед. книжки" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            <Input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Примечание" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            <div className="flex justify-end">
              <Button type="button" onClick={addEmployee} disabled={!draft.employeeId} className="h-12 rounded-2xl bg-[#5863f8] px-7 text-[16px] text-white hover:bg-[#4b57f3]">Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editRow ? (
        <Dialog open={Boolean(editRow)} onOpenChange={(value) => { if (!value) setEditRowId(null); }}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
            <DialogHeader className="border-b border-[#e5e7f0] px-8 py-6">
              <DialogTitle className="text-[20px] font-medium text-black">Редактирование строки</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 px-8 py-6">
              <div className="rounded-2xl border border-[#e6e9f5] bg-[#fafbff] px-5 py-4"><div className="text-[14px] text-[#7c7c93]">Должность</div><div className="mt-1 text-[18px] font-medium text-black">{editRow.data.positionTitle}</div></div>
              <div className="rounded-2xl border border-[#e6e9f5] bg-[#fafbff] px-5 py-4"><div className="text-[14px] text-[#7c7c93]">Сотрудник</div><div className="mt-1 text-[18px] font-medium text-black">{editRow.name}</div></div>
              <Input type="date" defaultValue={editRow.data.birthDate || ""} onBlur={(event) => saveEdit({ birthDate: event.target.value || null })} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
              <Input type="date" defaultValue={editRow.data.hireDate || ""} onBlur={(event) => saveEdit({ hireDate: event.target.value || null })} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
              <Input defaultValue={editRow.data.medBookNumber || ""} onBlur={(event) => saveEdit({ medBookNumber: event.target.value || null })} placeholder="Введите номер мед. книжки" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
              <Input defaultValue={editRow.data.note || ""} onBlur={(event) => saveEdit({ note: event.target.value || null })} placeholder="Примечание" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" className="h-11 rounded-2xl px-4 text-[#ff4d4f] hover:bg-[#fff3f3] hover:text-[#ff4d4f]" onClick={() => deleteRow(editRow.id)}><Trash2 className="size-4" />Удалить</Button>
                <Button type="button" className="h-12 rounded-2xl bg-[#5863f8] px-7 text-[16px] text-white hover:bg-[#4b57f3]" onClick={() => setEditRowId(null)}>Закрыть</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <CellDialog open={Boolean(examCell)} onOpenChange={(value) => { if (!value) setExamCell(null); }} title={examCell?.name || ""}>
        <div className="space-y-2"><Label>Дата осмотра</Label><Input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className="h-12 rounded-xl border-[#dfe1ec] px-4" /></div>
        <div className="space-y-2"><Label>Действует до</Label><Input type="date" value={examExpiry} onChange={(event) => setExamExpiry(event.target.value)} className="h-12 rounded-xl border-[#dfe1ec] px-4" /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={clearExam} className="h-10 rounded-xl px-4">Очистить</Button><Button onClick={saveExam} className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]">Сохранить</Button></div>
      </CellDialog>

      <CellDialog open={Boolean(vaccCell)} onOpenChange={(value) => { if (!value) setVaccCell(null); }} title={vaccCell?.name || ""}>
        <div className="space-y-2"><Label>Тип</Label><Select value={vaccType} onValueChange={(value) => setVaccType(value as MedBookVaccinationType)}><SelectTrigger className="h-12 rounded-xl border-[#dfe1ec]"><SelectValue /></SelectTrigger><SelectContent>{(Object.entries(VACCINATION_TYPE_LABELS) as [MedBookVaccinationType, string][]).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {vaccType === "done" ? <><div className="space-y-2"><Label>Доза</Label><Input value={vaccDose} onChange={(event) => setVaccDose(event.target.value)} className="h-12 rounded-xl border-[#dfe1ec] px-4" /></div><div className="space-y-2"><Label>Дата прививки</Label><Input type="date" value={vaccDate} onChange={(event) => setVaccDate(event.target.value)} className="h-12 rounded-xl border-[#dfe1ec] px-4" /></div><div className="space-y-2"><Label>Действует до</Label><Input type="date" value={vaccExpiry} onChange={(event) => setVaccExpiry(event.target.value)} className="h-12 rounded-xl border-[#dfe1ec] px-4" /></div></> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={clearVacc} className="h-10 rounded-xl px-4">Очистить</Button><Button onClick={saveVacc} className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]">Сохранить</Button></div>
      </CellDialog>
    </div>
  );
}

function TableBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="h-6 min-w-[1320px] bg-[#ececec]" />
      </div>
      <div className="overflow-x-auto">{children}</div>
      <div className="overflow-x-auto">
        <div className="h-6 min-w-[1320px] bg-[#ececec]" />
      </div>
    </div>
  );
}

function SimpleTable({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="min-w-[980px] w-full border-collapse text-[14px] leading-[1.45] text-black"><thead><tr>{columns.map((column) => <th key={column} className="border border-black bg-[#ececec] px-4 py-3 text-center">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function CellDialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (value: boolean) => void; title: string; children: React.ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[calc(100vw-2rem)] max-w-[400px] rounded-[24px] border-0 p-0"><DialogHeader className="border-b px-6 py-5"><DialogTitle className="text-[18px] font-medium">{title}</DialogTitle></DialogHeader><div className="space-y-4 px-6 py-5">{children}</div></DialogContent></Dialog>;
}
