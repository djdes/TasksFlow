"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";
import {
  RecordCardsView,
  type RecordCardItem,
} from "@/components/journals/record-cards-view";
import {
  Archive,
  ChevronLeft,
  Paperclip,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { getUserRoleLabel } from "@/lib/user-roles";

type Employee = { id: string; name: string; role: string };
type Row = {
  id: string;
  employeeId: string;
  name: string;
  data: MedBookEntryData;
};
type Draft = {
  employeeId: string;
  positionTitle: string;
  birthDate: string;
  hireDate: string;
  gender: "male" | "female" | null;
  medBookNumber: string;
  note: string;
  photoUrl: string | null;
};
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

const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({
  employeeId: "",
  positionTitle: "",
  birthDate: today(),
  hireDate: today(),
  gender: null,
  medBookNumber: "",
  note: "",
  photoUrl: null,
});
const cellBg = (warn: boolean) => (warn ? "bg-[#f6caca]" : "bg-white");

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error ?? new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
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
  const { mobileView, switchMobileView } = useMobileView("med_books");
  const [rows, setRows] = useState(initialRows);
  const [docTitle, setDocTitle] = useState(title);
  const [settingsTitle, setSettingsTitle] = useState(title);
  const [examColumns, setExamColumns] = useState(config.examinations);
  const [vaccColumns, setVaccColumns] = useState(config.vaccinations);
  const [includeVaccinations, setIncludeVaccinations] = useState(
    config.includeVaccinations,
  );
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const editRow = rows.find((row) => row.id === editId) ?? null;
  const availableEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => !rows.some((row) => row.employeeId === employee.id),
      ),
    [employees, rows],
  );

  const sync = useCallback(
    async (
      nextRows: Row[],
      nextTitle?: string,
      nextConfig?: Partial<MedBookDocumentConfig>,
    ) => {
      setSaving(true);
      try {
        const entriesResponse = await fetch(
          `/api/journal-documents/${documentId}/entries`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entries: nextRows.map((row) => ({
                employeeId: row.employeeId,
                date: documentDateKey,
                data: row.data,
              })),
            }),
          },
        );
        if (!entriesResponse.ok) {
          const payload = await entriesResponse.json().catch(() => null);
          throw new Error(
            payload?.error || "Не удалось сохранить строки журнала",
          );
        }
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
                      includeVaccinations:
                        nextConfig.includeVaccinations ?? includeVaccinations,
                    },
                  }
                : {}),
            }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || "Не удалось сохранить документ");
          }
        }
      } finally {
        setSaving(false);
      }
    },
    [
      documentDateKey,
      documentId,
      examColumns,
      includeVaccinations,
      vaccColumns,
    ],
  );

  async function saveRows(nextRows: Row[]) {
    setRows(nextRows);
    try {
      await sync(nextRows);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить журнал",
      );
    }
  }

  async function patchStatus(nextStatus: "active" | "closed") {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      toast.error(payload?.error || "Не удалось обновить статус");
      return;
    }
    router.refresh();
  }

  function updateRow(rowId: string, patch: Partial<MedBookEntryData>) {
    saveRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, data: { ...row.data, ...patch } } : row,
      ),
    );
  }

  function editExam(rowId: string, column: string) {
    if (isClosed) return;
    const row = rows.find((item) => item.id === rowId);
    if (!row) return;
    const current = row.data.examinations[column];
    const date =
      window.prompt(`Дата осмотра: ${column}`, current?.date || "") ??
      current?.date ??
      "";
    const expiryDate =
      window.prompt(`Действует до: ${column}`, current?.expiryDate || "") ??
      current?.expiryDate ??
      "";
    saveRows(
      rows.map((item) =>
        item.id === rowId
          ? {
              ...item,
              data: {
                ...item.data,
                examinations: {
                  ...item.data.examinations,
                  [column]: {
                    date: date || null,
                    expiryDate: expiryDate || null,
                  },
                },
              },
            }
          : item,
      ),
    );
  }

  function editVacc(rowId: string, column: string) {
    if (isClosed) return;
    const row = rows.find((item) => item.id === rowId);
    if (!row) return;
    const current = row.data.vaccinations[column];
    const type = (window.prompt(
      `Тип (${Object.keys(VACCINATION_TYPE_LABELS).join(", ")}): ${column}`,
      current?.type || "done",
    ) ||
      current?.type ||
      "done") as MedBookVaccinationType;
    const dose =
      type === "done"
        ? (window.prompt(`Доза ${column}`, current?.dose || "") ?? "")
        : "";
    const date =
      type === "done"
        ? (window.prompt(`Дата ${column}`, current?.date || "") ?? "")
        : "";
    const expiryDate =
      type === "done"
        ? (window.prompt(`Действует до ${column}`, current?.expiryDate || "") ??
          "")
        : "";
    saveRows(
      rows.map((item) =>
        item.id === rowId
          ? {
              ...item,
              data: {
                ...item.data,
                vaccinations: {
                  ...item.data.vaccinations,
                  [column]: {
                    type,
                    dose: dose || null,
                    date: date || null,
                    expiryDate: expiryDate || null,
                  },
                },
              },
            }
          : item,
      ),
    );
  }

  async function onPhoto(files: FileList | null, target: "add" | "edit") {
    const file = files?.[0];
    if (!file) return;
    const photoUrl = await fileToDataUrl(file);
    if (target === "add") setDraft((current) => ({ ...current, photoUrl }));
    if (target === "edit" && editRow) updateRow(editRow.id, { photoUrl });
  }

  function addEmployee() {
    const employee = employees.find((item) => item.id === draft.employeeId);
    if (!employee) return;
    const positionTitle =
      draft.positionTitle || getUserRoleLabel(employee.role);
    saveRows([
      ...rows,
      {
        id: `local-${Date.now()}`,
        employeeId: employee.id,
        name: employee.name,
        data: {
          ...emptyMedBookEntry(positionTitle),
          birthDate: draft.birthDate || null,
          gender: draft.gender,
          hireDate: draft.hireDate || null,
          medBookNumber: draft.medBookNumber || null,
          note: draft.note || null,
          photoUrl: draft.photoUrl,
        },
      },
    ]).then(() => setAddOpen(false));
  }

  return (
    <div className="space-y-8">
      <DocumentBackLink href="/journals/med_books" documentId={documentId} />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
            {docTitle}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-[#dcdfed] bg-[#fafbff] px-4 text-[15px] text-[#5863f8] shadow-none hover:bg-[#f5f6ff]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
            Настройки журнала
          </Button>
          {isClosed ? (
            <Button
              type="button"
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white"
              onClick={() => patchStatus("active")}
            >
              <RotateCcw className="size-4" />
              Вернуть в активные
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white"
              onClick={() => patchStatus("closed")}
            >
              <Archive className="size-4" />
              Закрыть журнал
            </Button>
          )}
        </div>
      </div>

      {!isClosed ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white"
            onClick={() => {
              setDraft(emptyDraft());
              setAddOpen(true);
            }}
          >
            <Plus className="size-5" />
            Добавить сотрудника
          </Button>
          <Button
            type="button"
            className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white"
            onClick={() => {
              const name = window.prompt("Введите название исследования");
              if (name?.trim() && !examColumns.includes(name.trim()))
                setExamColumns((current) => [...current, name.trim()]);
            }}
          >
            <Plus className="size-5" />
            Добавить исследование
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView
            items={rows.map((row, index) => {
              const expiredCount = examColumns.filter((col) => {
                const exam = row.data.examinations[col];
                return exam?.date && isExaminationExpired(exam);
              }).length;
              const soonCount = examColumns.filter((col) => {
                const exam = row.data.examinations[col];
                return exam?.date && !isExaminationExpired(exam) && isExaminationExpiringSoon(exam);
              }).length;
              return {
                id: row.id,
                title: `№${index + 1} · ${row.name || "—"}`,
                subtitle: row.data.positionTitle || undefined,
                badge:
                  expiredCount > 0 ? (
                    <span className="rounded-full bg-[#fff2f1] px-2 py-0.5 text-[11px] font-semibold text-[#d2453d]">
                      {`Просрочено: ${expiredCount}`}
                    </span>
                  ) : soonCount > 0 ? (
                    <span className="rounded-full bg-[#fff9eb] px-2 py-0.5 text-[11px] font-semibold text-[#a16a13]">
                      {`Скоро: ${soonCount}`}
                    </span>
                  ) : undefined,
                fields: examColumns.map((column) => {
                  const exam = row.data.examinations[column];
                  const expired = exam ? isExaminationExpired(exam) : false;
                  const soon = exam ? isExaminationExpiringSoon(exam) : false;
                  const parts: string[] = [];
                  if (exam?.date) parts.push(formatMedBookDate(exam.date));
                  if (exam?.expiryDate) parts.push(`до ${formatMedBookDate(exam.expiryDate)}`);
                  return {
                    label: column,
                    value: parts.join(" · "),
                    warnIfEmpty: true,
                    hint: exam && (expired || soon)
                      ? expired
                        ? "Осмотр просрочен"
                        : "Скоро истечёт"
                      : undefined,
                    onClick: !isClosed ? () => editExam(row.id, column) : undefined,
                  };
                }),
                onClick: !isClosed ? () => setEditId(row.id) : undefined,
              };
            })}
            emptyLabel="Сотрудников пока нет."
          />
        ) : null}

        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="h-6 min-w-[1320px] bg-[#ececec]" />
        </MobileViewTableWrapper>
        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[1320px] border-collapse text-[14px] text-black">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="border border-black bg-[#ececec] px-2 py-4"
                >
                  № п/п
                </th>
                <th
                  rowSpan={2}
                  className="border border-black bg-[#ececec] px-3 py-4"
                >
                  Ф.И.О. сотрудника
                </th>
                <th
                  rowSpan={2}
                  className="border border-black bg-[#ececec] px-3 py-4"
                >
                  Должность
                </th>
                <th
                  colSpan={examColumns.length}
                  className="border border-black bg-[#ececec] px-3 py-4"
                >
                  Наименование специалиста / исследования
                </th>
              </tr>
              <tr>
                {examColumns.map((column) => (
                  <th
                    key={column}
                    className="border border-black bg-[#ececec] px-3 py-3"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="border border-black px-2 py-3 text-center">
                    {index + 1}
                  </td>
                  <td className="border border-black px-3 py-3 text-center">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 ${isClosed ? "" : "hover:text-[#5863f8]"}`}
                      onClick={() => !isClosed && setEditId(row.id)}
                    >
                      <span>{row.name}</span>
                      {row.data.photoUrl ? (
                        <Paperclip className="size-4 text-[#5863f8]" />
                      ) : null}
                    </button>
                  </td>
                  <td
                    className={`border border-black px-3 py-3 text-center ${cellBg(!row.data.positionTitle)} ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                    onClick={() => !isClosed && setEditId(row.id)}
                  >
                    {row.data.positionTitle}
                  </td>
                  {examColumns.map((column) => {
                    const exam = row.data.examinations[column];
                    const expired = exam ? isExaminationExpired(exam) : false;
                    const soon = exam ? isExaminationExpiringSoon(exam) : false;
                    return (
                      <td
                        key={column}
                        className={`border border-black px-3 py-3 text-center ${cellBg(!exam?.date || expired || soon)} ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                        onClick={() => editExam(row.id, column)}
                      >
                        {exam?.date ? (
                          <div>
                            {formatMedBookDate(exam.date)}
                            {exam.expiryDate ? (
                              <div
                                className={
                                  expired
                                    ? "text-[13px] text-[#d30000]"
                                    : "text-[13px]"
                                }
                              >
                                до {formatMedBookDate(exam.expiryDate)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </MobileViewTableWrapper>
        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="h-6 min-w-[1320px] bg-[#ececec]" />
        </MobileViewTableWrapper>
      </div>

      <div id="med-book-reference" className="space-y-5">
        <h2 className="text-[20px] font-semibold underline">
          Список специалистов и исследований
        </h2>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[980px] w-full border-collapse text-[14px] text-black">
            <thead>
              <tr>
                <th
                  colSpan={2}
                  className="border border-black bg-[#ececec] px-4 py-3 text-[18px]"
                >
                  Список специалистов и исследований при получении/прохождении
                  медицинской книжки для работников пищевой отрасли
                </th>
              </tr>
              <tr>
                <th className="border border-black bg-[#ececec] px-4 py-3 text-[18px]">
                  Предварительные осмотры (при поступлении на работу)
                </th>
                <th className="border border-black bg-[#ececec] px-4 py-3 text-[18px]">
                  Периодические (1 раз в год)
                </th>
              </tr>
            </thead>
            <tbody>
              {MED_BOOK_PRELIMINARY_PERIODIC_ROWS.map((row) => (
                <tr key={row.preliminary}>
                  <td className="border border-black px-4 py-3 align-top">
                    {row.preliminary}
                  </td>
                  <td className="border border-black px-4 py-3 align-top">
                    {row.periodic}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[980px] w-full border-collapse text-[14px] text-black">
            <thead>
              <tr>
                <th className="border border-black bg-[#ececec] px-4 py-3">
                  Наименование специалиста / исследования
                </th>
                <th className="border border-black bg-[#ececec] px-4 py-3">
                  Периодичность
                </th>
                <th className="border border-black bg-[#ececec] px-4 py-3">
                  Примечание
                </th>
              </tr>
            </thead>
            <tbody>
              {EXAMINATION_REFERENCE_DATA.map((item) => (
                <tr key={item.name}>
                  <td className="border border-black px-4 py-3 align-top">
                    {item.name}
                  </td>
                  <td className="border border-black px-4 py-3 align-top">
                    {item.periodicity}
                  </td>
                  <td className="border border-black px-4 py-3 align-top">
                    {item.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {includeVaccinations ? (
        <div className="space-y-5">
          <h2 className="text-center text-[34px] font-semibold tracking-[-0.03em] text-black">
            Прививки
          </h2>
          <div className="space-y-2">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="h-6 min-w-[1320px] bg-[#ececec]" />
            </div>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="min-w-[1320px] border-collapse text-[14px] text-black">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      className="border border-black bg-[#ececec] px-2 py-4"
                    >
                      № п/п
                    </th>
                    <th
                      rowSpan={2}
                      className="border border-black bg-[#ececec] px-3 py-4"
                    >
                      Ф.И.О. сотрудника
                    </th>
                    <th
                      rowSpan={2}
                      className="border border-black bg-[#ececec] px-3 py-4"
                    >
                      Должность
                    </th>
                    <th
                      colSpan={vaccColumns.length + 1}
                      className="border border-black bg-[#ececec] px-3 py-4"
                    >
                      Наименование прививки:
                    </th>
                  </tr>
                  <tr>
                    {vaccColumns.map((column) => (
                      <th
                        key={column}
                        className="border border-black bg-[#ececec] px-3 py-3"
                      >
                        {column}
                      </th>
                    ))}
                    <th className="border border-black bg-[#ececec] px-3 py-3">
                      Примечание
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="border border-black px-2 py-3 text-center">
                        {index + 1}
                      </td>
                      <td
                        className={`border border-black px-3 py-3 text-center ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                        onClick={() => !isClosed && setEditId(row.id)}
                      >
                        {row.name}
                      </td>
                      <td
                        className={`border border-black px-3 py-3 text-center ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                        onClick={() => !isClosed && setEditId(row.id)}
                      >
                        {row.data.positionTitle}
                      </td>
                      {vaccColumns.map((column) => {
                        const vacc = row.data.vaccinations[column];
                        const expired = vacc
                          ? isVaccinationExpired(vacc)
                          : false;
                        return (
                          <td
                            key={column}
                            className={`border border-black px-3 py-3 text-center ${cellBg(!vacc || expired)} ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                            onClick={() => editVacc(row.id, column)}
                          >
                            {vacc ? (
                              vacc.type === "done" ? (
                                <div>
                                  {vacc.dose ? `${vacc.dose}: ` : ""}
                                  {formatMedBookDate(vacc.date || null)}
                                  {vacc.expiryDate ? (
                                    <div
                                      className={
                                        expired
                                          ? "text-[13px] text-[#d30000]"
                                          : "text-[13px]"
                                      }
                                    >
                                      до {formatMedBookDate(vacc.expiryDate)}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div>{VACCINATION_TYPE_LABELS[vacc.type]}</div>
                              )
                            ) : null}
                          </td>
                        );
                      })}
                      <td
                        className={`border border-black px-3 py-3 text-center ${isClosed ? "" : "cursor-pointer hover:bg-[#eef1ff]"}`}
                        onClick={() => !isClosed && setEditId(row.id)}
                      >
                        {row.data.note || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="h-6 min-w-[1320px] bg-[#ececec]" />
            </div>
          </div>
          <h3 className="text-[20px] font-semibold underline">
            Список прививок
          </h3>
          <p className="text-[18px] leading-[1.55] text-black">
            Вакцинация всех сотрудников проводится в соответствии с Приказом
            Минздрава России от 06.12.2021 N 1122н.
          </p>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="min-w-[980px] w-full border-collapse text-[14px] text-black">
              <thead>
                <tr>
                  <th className="border border-black bg-[#ececec] px-4 py-3">
                    Наименование прививок
                  </th>
                  <th className="border border-black bg-[#ececec] px-4 py-3">
                    Периодичность
                  </th>
                </tr>
              </thead>
              <tbody>
                {VACCINATION_REFERENCE_DATA.map((item) => (
                  <tr key={item.name}>
                    <td className="border border-black px-4 py-3 align-top">
                      {item.name}
                    </td>
                    <td className="border border-black px-4 py-3 align-top">
                      {item.periodicity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 pt-2">
            {MED_BOOK_VACCINATION_RULES.map((rule) => (
              <p
                key={rule}
                className="text-[22px] font-semibold uppercase leading-[1.45] text-black"
              >
                {rule}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b border-[#e5e7f0] px-8 py-6">
            <DialogTitle className="text-[20px] font-medium text-black">
              Настройки документа
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <Label>Название документа</Label>
            <Input
              value={settingsTitle}
              onChange={(event) => setSettingsTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
            <label className="flex items-center gap-3 text-[16px] text-black">
              <input
                type="checkbox"
                checked={includeVaccinations}
                onChange={(event) =>
                  setIncludeVaccinations(event.target.checked)
                }
                className="size-5 rounded accent-[#5863f8]"
              />
              включить &quot;Прививки&quot;
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5"
              onClick={() => {
                const name = window.prompt("Введите название прививки");
                if (name?.trim() && !vaccColumns.includes(name.trim()))
                  setVaccColumns((current) => [...current, name.trim()]);
              }}
            >
              Добавить прививку
            </Button>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={saving || !settingsTitle.trim()}
                className="h-12 rounded-2xl bg-[#5863f8] px-6 text-[16px] text-white"
                onClick={async () => {
                  try {
                    await sync(rows, settingsTitle.trim(), {
                      examinations: examColumns,
                      vaccinations: vaccColumns,
                      includeVaccinations,
                    });
                    setDocTitle(settingsTitle.trim());
                    setSettingsOpen(false);
                    router.refresh();
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Не удалось сохранить настройки",
                    );
                  }
                }}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden rounded-[24px] border-0 p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#0b1024]">
              Добавление новой строки
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(92vh-160px)] space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Должность</Label>
              <Input
                value={draft.positionTitle}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    positionTitle: event.target.value,
                  }))
                }
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                placeholder="Должность"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Сотрудник</Label>
              <select
                className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                value={draft.employeeId}
                onChange={(event) => {
                  const value = event.target.value;
                  const employee = availableEmployees.find(
                    (item) => item.id === value,
                  );
                  setDraft((current) => ({
                    ...current,
                    employeeId: value,
                    positionTitle: employee
                      ? getUserRoleLabel(employee.role)
                      : current.positionTitle,
                  }));
                }}
              >
                <option value="">— выберите —</option>
                {availableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Дата рождения</Label>
                <Input
                  type="date"
                  value={draft.birthDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      birthDate: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Дата приема</Label>
                <Input
                  type="date"
                  value={draft.hireDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hireDate: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Пол</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["male", "Мужской"],
                    ["female", "Женский"],
                  ] as const
                ).map(([value, label]) => {
                  const active = draft.gender === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, gender: value }))}
                      className={`flex h-11 items-center justify-center rounded-2xl border px-4 text-[14px] font-medium transition-colors ${
                        active
                          ? "border-[#5566f6] bg-[#5566f6] text-white"
                          : "border-[#dcdfed] bg-white text-[#0b1024] hover:bg-[#fafbff]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Номер мед. книжки</Label>
              <Input
                value={draft.medBookNumber}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    medBookNumber: event.target.value,
                  }))
                }
                placeholder="Введите номер мед. книжки"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Примечание</Label>
              <Input
                value={draft.note}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Примечание"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Фото</Label>
              <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#dcdfed] bg-white px-6 py-8 text-center">
                {draft.photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.photoUrl}
                      alt="Фото сотрудника"
                      className="mx-auto h-24 rounded-xl object-cover"
                    />
                  </>
                ) : (
                  <div className="text-[14px] text-[#5566f6]">
                    Выберите файл или перетащите его сюда
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void onPhoto(event.target.files, "add")}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl border-[#dcdfed] px-5 text-[14px] font-medium text-[#0b1024] shadow-none hover:bg-[#fafbff] sm:w-auto"
              onClick={() => setAddOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={addEmployee}
              disabled={!draft.employeeId}
              className="h-11 w-full rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] sm:w-auto"
            >
              Добавить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editRow ? (
        <Dialog
          open={Boolean(editRow)}
          onOpenChange={(value) => {
            if (!value) setEditId(null);
          }}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden rounded-[24px] border-0 p-0 sm:max-w-[640px]">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#0b1024]">
                Редактирование строки
              </DialogTitle>
            </DialogHeader>

            <div className="max-h-[calc(92vh-160px)] space-y-5 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Должность</Label>
                <Input
                  defaultValue={editRow.data.positionTitle}
                  onBlur={(event) =>
                    updateRow(editRow.id, { positionTitle: event.target.value })
                  }
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  placeholder="Должность"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-[#3c4053]">Дата рождения</Label>
                  <Input
                    type="date"
                    defaultValue={editRow.data.birthDate || ""}
                    onBlur={(event) =>
                      updateRow(editRow.id, {
                        birthDate: event.target.value || null,
                      })
                    }
                    className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-[#3c4053]">Дата приема</Label>
                  <Input
                    type="date"
                    defaultValue={editRow.data.hireDate || ""}
                    onBlur={(event) =>
                      updateRow(editRow.id, {
                        hireDate: event.target.value || null,
                      })
                    }
                    className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Номер мед. книжки</Label>
                <Input
                  defaultValue={editRow.data.medBookNumber || ""}
                  onBlur={(event) =>
                    updateRow(editRow.id, {
                      medBookNumber: event.target.value || null,
                    })
                  }
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  placeholder="Введите номер мед. книжки"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Примечание</Label>
                <Input
                  defaultValue={editRow.data.note || ""}
                  onBlur={(event) =>
                    updateRow(editRow.id, { note: event.target.value || null })
                  }
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  placeholder="Примечание"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Фото</Label>
                <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#dcdfed] bg-white px-6 py-8 text-center">
                  {editRow.data.photoUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editRow.data.photoUrl}
                        alt="Фото сотрудника"
                        className="mx-auto h-24 rounded-xl object-cover"
                      />
                    </>
                  ) : (
                    <div className="text-[14px] text-[#5566f6]">
                      Выберите файл или перетащите его сюда
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void onPhoto(event.target.files, "edit")}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl border-[#ffd7d3] px-5 text-[14px] font-medium text-[#ff4d4f] shadow-none hover:bg-[#fff4f2] sm:w-auto"
                onClick={() => {
                  if (!window.confirm("Удалить строку сотрудника?")) return;
                  saveRows(rows.filter((row) => row.id !== editRow.id));
                  setEditId(null);
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Удалить
              </Button>
              <Button
                type="button"
                className="h-11 w-full rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] sm:w-auto"
                onClick={() => setEditId(null)}
              >
                Закрыть
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
