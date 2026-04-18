"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Printer, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DocumentBackLink } from "@/components/journals/document-back-link";
import {
  JOURNAL_DIALOG_BODY_CLASS,
  JOURNAL_DIALOG_GRID_CLASS,
  JOURNAL_DIALOG_HEADER_CLASS,
  JOURNAL_DOCUMENT_ACTIONS_CLASS,
  JOURNAL_DOCUMENT_HEADER_CLASS,
  JOURNAL_DOCUMENT_SELECTION_BAR_CLASS,
  JOURNAL_DOCUMENT_SHELL_CLASS,
  JOURNAL_TABLE_VIEWPORT_CLASS,
} from "@/components/journals/journal-responsive";
import { PestControlDocumentClient } from "@/components/journals/pest-control-document-client";
import {
  isPestControlDocumentFields,
  normalizePestControlEntryData,
} from "@/lib/pest-control-document";

import { toast } from "sonner";
type EmployeeItem = {
  id: string;
  name: string;
  role: string;
};

type FieldOption = {
  value: string;
  label: string;
};

type FieldItem = {
  key: string;
  label: string;
  type: string;
  options: FieldOption[];
};

type EntryItem = {
  id: string;
  employeeId: string;
  date: string;
  data: Record<string, unknown>;
};

type Props = {
  templateCode: string;
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle?: string | null;
  responsibleUserId?: string | null;
  status: string;
  employees: EmployeeItem[];
  fields: FieldItem[];
  initialEntries: EntryItem[];
};

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function fieldValueToString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isSelectLikeField(field: FieldItem) {
  return (
    field.type === "select" ||
    field.type === "employee" ||
    field.type === "equipment"
  );
}

function sortedEntries(entries: EntryItem[]) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.employeeId.localeCompare(b.employeeId);
  });
}

function TrackedDocumentClientImpl({
  templateCode,
  documentId,
  title,
  dateFrom,
  dateTo,
  responsibleTitle,
  responsibleUserId,
  status,
  employees,
  fields,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(sortedEntries(initialEntries));
  const [isCreating, setIsCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [titleInput, setTitleInput] = useState(title);
  const [responsibleUserIdInput, setResponsibleUserIdInput] = useState(
    responsibleUserId || employees[0]?.id || ""
  );
  const [responsibleTitleInput, setResponsibleTitleInput] = useState(
    responsibleTitle || ""
  );
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [newEmployeeId, setNewEmployeeId] = useState(employees[0]?.id || "");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setEntries(sortedEntries(initialEntries));
  }, [initialEntries]);

  useEffect(() => {
    if (!settingsOpen) return;
    setTitleInput(title);
    setResponsibleUserIdInput(responsibleUserId || employees[0]?.id || "");
    setResponsibleTitleInput(responsibleTitle || "");
  }, [settingsOpen, title, responsibleUserId, responsibleTitle, employees]);

  useEffect(() => {
    if (!addRowOpen) return;
    setNewEmployeeId(employees[0]?.id || "");
    setNewDate(new Date().toISOString().slice(0, 10));
  }, [addRowOpen, employees]);

  const employeeMap = useMemo(
    () => Object.fromEntries(employees.map((item) => [item.id, item])),
    [employees]
  );
  const allSelected = entries.length > 0 && selectedRowIds.length === entries.length;

  async function saveEntry(nextEntry: EntryItem) {
    const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: nextEntry.employeeId,
        date: nextEntry.date,
        data: nextEntry.data,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) {
      throw new Error(result?.error || "Не удалось сохранить строку");
    }

    setEntries((current) => {
      const withoutCurrent = current.filter((item) => item.id !== nextEntry.id);
      return sortedEntries([
        ...withoutCurrent,
        { ...nextEntry, id: result.entry.id },
      ]);
    });
  }

  async function createEntry(employeeId: string, date: string) {
    setIsCreating(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          date,
          data: {},
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.entry) {
        throw new Error(result?.error || "Не удалось добавить строку");
      }

      setEntries((current) =>
        sortedEntries([
          ...current,
          {
            id: result.entry.id,
            employeeId,
            date,
            data: {},
          },
        ])
      );
      setAddRowOpen(false);
    } finally {
      setIsCreating(false);
    }
  }

  async function fillForToday() {
    if (employees.length === 0) return;
    setIsCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await Promise.all(
        employees.map((employee) =>
          fetch(`/api/journal-documents/${documentId}/entries`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: employee.id,
              date: today,
              data: {},
            }),
          })
        )
      );
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  async function saveSettings() {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.trim() || title,
        responsibleUserId: responsibleUserIdInput || null,
        responsibleTitle: responsibleTitleInput.trim() || null,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить настройки");
    }

    setSettingsOpen(false);
    router.refresh();
  }

  async function removeEntry(entryId: string) {
    if (!window.confirm("Удалить строку?")) return;

    const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [entryId] }),
    });

    if (!response.ok) {
      toast.error("Не удалось удалить строку");
      return;
    }

    setEntries((current) => current.filter((item) => item.id !== entryId));
    setSelectedRowIds((current) => current.filter((id) => id !== entryId));
  }

  async function removeSelectedEntries() {
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;

    try {
      const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRowIds }),
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить строки");
      }

      setEntries((current) => current.filter((item) => !selectedRowIds.includes(item.id)));
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  return (
    <div className="space-y-8">
      {status === "active" && selectedRowIds.length > 0 ? (
        <div className={JOURNAL_DOCUMENT_SELECTION_BAR_CLASS}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#fafbff] px-4 py-2 text-[15px] text-[#5563ff]"
            onClick={() => setSelectedRowIds([])}
          >
            Сбросить выбор ({selectedRowIds.length})
          </button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              removeSelectedEntries().catch((error) =>
                toast.error(error instanceof Error ? error.message : "Ошибка удаления строк")
              )
            }
            className="h-10 rounded-2xl border-[#ffd7d3] px-5 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
          >
            <Trash2 className="size-4" />
            Удалить выбранные ({selectedRowIds.length})
          </Button>
        </div>
      ) : null}

      <DocumentBackLink href={`/journals/${templateCode}`} documentId={documentId} />
      <div className={JOURNAL_DOCUMENT_SHELL_CLASS}>
        <div className={JOURNAL_DOCUMENT_HEADER_CLASS}>
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1024] sm:text-[32px]">
              {title}
            </h1>
            <div className="mt-2 text-[14px] text-[#84849a] sm:text-[16px]">
              Период: {formatDateLabel(dateFrom)} - {formatDateLabel(dateTo)}
            </div>
          </div>

          <div className={JOURNAL_DOCUMENT_ACTIONS_CLASS}>
            {status === "active" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    disabled={isCreating || employees.length === 0}
                    className="h-11 w-full rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4d58f5] sm:h-12 sm:w-auto sm:px-5 sm:text-[16px]"
                  >
                    <Plus className="size-5" />
                    Добавить
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-[260px] rounded-2xl border-0 p-2 shadow-xl"
                >
                  <DropdownMenuItem
                    className="h-12 rounded-xl px-3 text-[15px] text-[#3848c7]"
                    onSelect={() => setAddRowOpen(true)}
                  >
                    Добавить строку
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-12 rounded-xl px-3 text-[15px] text-[#3848c7]"
                    onSelect={() => {
                      fillForToday().catch((error) =>
                        toast.error(
                          error instanceof Error ? error.message : "Ошибка автозаполнения"
                        )
                      );
                    }}
                  >
                    Заполнить за сегодня
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {status === "active" && selectedRowIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  removeSelectedEntries().catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Ошибка удаления строк")
                  )
                }
                className="h-11 w-full rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2] sm:h-12 sm:w-auto sm:px-5 sm:text-[16px]"
              >
                <Trash2 className="size-5" />
                Удалить ({selectedRowIds.length})
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 w-full rounded-2xl border-[#e6e9f5] px-4 text-[15px] text-black shadow-none sm:h-12 sm:w-auto sm:px-5 sm:text-[16px]"
            >
              <Settings2 className="size-5" />
              Настройки
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                window.open(`/api/journal-documents/${documentId}/pdf`, "_blank")
              }
              className="h-11 w-full rounded-2xl border-[#e6e9f5] px-4 text-[15px] text-black shadow-none sm:h-12 sm:w-auto sm:px-5 sm:text-[16px]"
            >
              <Printer className="size-5" />
              Печать
            </Button>
          </div>
        </div>
      </div>

      <div className={JOURNAL_TABLE_VIEWPORT_CLASS}>
        <table className="min-w-[1200px] w-full border-collapse text-[15px]">
          <thead>
            <tr className="bg-[#f7f8fd]">
              {status === "active" && (
                <th className="w-[52px] border border-[#eceef5] px-2 py-3 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? entries.map((entry) => entry.id) : [])
                    }
                    disabled={entries.length === 0}
                  />
                </th>
              )}
              <th className="border border-[#eceef5] px-4 py-3 text-left font-medium text-[#5b6075]">
                Р”Р°С‚Р°
              </th>
              <th className="border border-[#eceef5] px-4 py-3 text-left font-medium text-[#5b6075]">
                Сотрудник
              </th>
              {fields.map((field) => (
                <th
                  key={field.key}
                  className="border border-[#eceef5] px-4 py-3 text-left font-medium text-[#5b6075]"
                >
                  {field.label}
                </th>
              ))}
              {status === "active" && (
                <th className="border border-[#eceef5] px-4 py-3 text-center font-medium text-[#5b6075]">
                  Действия
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-[#fbfbfe]">
                {status === "active" && (
                  <td className="border border-[#eceef5] p-2 text-center align-top">
                    <div className="flex h-10 items-center justify-center">
                      <Checkbox
                        checked={selectedRowIds.includes(entry.id)}
                        onCheckedChange={(checked) =>
                          setSelectedRowIds((current) =>
                            checked === true
                              ? [...new Set([...current, entry.id])]
                              : current.filter((id) => id !== entry.id)
                          )
                        }
                      />
                    </div>
                  </td>
                )}
                <td className="border border-[#eceef5] p-2 align-top">
                  {status === "active" ? (
                    <Input
                      type="date"
                      defaultValue={entry.date}
                      className="h-10 rounded-xl border-[#dfe1ec]"
                      onBlur={(event) =>
                        saveEntry({
                          ...entry,
                          date: event.target.value,
                        }).catch((error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Ошибка сохранения"
                          )
                        )
                      }
                    />
                  ) : (
                    <div className="px-2 py-2 text-[15px] text-black">
                      {formatDateLabel(entry.date)}
                    </div>
                  )}
                </td>

                <td className="border border-[#eceef5] p-2 align-top">
                  {status === "active" ? (
                    <Select
                      value={entry.employeeId}
                      onValueChange={(value) => {
                        saveEntry({ ...entry, employeeId: value }).catch((error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Ошибка сохранения"
                          )
                        );
                      }}
                    >
                      <SelectTrigger className="h-10 rounded-xl border-[#dfe1ec]">
                        <SelectValue placeholder="Сотрудник" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="px-2 py-2 text-[15px] text-black">
                      {employeeMap[entry.employeeId]?.name || ""}
                    </div>
                  )}
                </td>

                {fields.map((field) => {
                  const value = entry.data[field.key];
                  const stringValue = fieldValueToString(value);

                  return (
                    <td
                      key={`${entry.id}:${field.key}`}
                      className="border border-[#eceef5] p-2 align-top"
                    >
                      {status !== "active" ? (
                        <div className="px-2 py-2 text-[15px] text-black">
                          {stringValue || "-"}
                        </div>
                      ) : field.type === "boolean" ? (
                        <div className="flex h-10 items-center px-2">
                          <Checkbox
                            checked={value === true}
                            onCheckedChange={(checked) => {
                              saveEntry({
                                ...entry,
                                data: {
                                  ...entry.data,
                                  [field.key]: checked === true,
                                },
                              }).catch((error) =>
                                toast.error(
                                  error instanceof Error ? error.message : "Ошибка сохранения"
                                )
                              );
                            }}
                          />
                        </div>
                      ) : isSelectLikeField(field) && field.options.length > 0 ? (
                        <Select
                          value={stringValue || undefined}
                          onValueChange={(nextValue) => {
                            saveEntry({
                              ...entry,
                              data: {
                                ...entry.data,
                                [field.key]: nextValue,
                              },
                            }).catch((error) =>
                              toast.error(
                                error instanceof Error ? error.message : "Ошибка сохранения"
                              )
                            );
                          }}
                        >
                          <SelectTrigger className="h-10 rounded-xl border-[#dfe1ec]">
                            <SelectValue placeholder="Выберите значение" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={
                            field.type === "number"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                          }
                          defaultValue={stringValue}
                          className="h-10 rounded-xl border-[#dfe1ec]"
                          onBlur={(event) =>
                            saveEntry({
                              ...entry,
                              data: {
                                ...entry.data,
                                [field.key]: event.target.value,
                              },
                            }).catch((error) =>
                              toast.error(
                                error instanceof Error ? error.message : "Ошибка сохранения"
                              )
                            )
                          }
                        />
                      )}
                    </td>
                  );
                })}

                {status === "active" && (
                  <td className="border border-[#eceef5] p-2 text-center align-top">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeEntry(entry.id)}
                      className="h-10 rounded-xl border-[#ffd7d3] px-3 text-[#ff3b30] hover:bg-[#fff3f2]"
                    >
                      <Trash2 className="size-4" />
                      Удалить
                    </Button>
                  </td>
                )}
              </tr>
            ))}

            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={status === "active" ? fields.length + 4 : fields.length + 2}
                  className="border border-[#eceef5] p-8 text-center text-[16px] text-[#7d8196]"
                >
                  Пока нет строк. Добавьте первую запись.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[32px] border-0 p-0 sm:max-w-[760px]">
          <DialogHeader className={JOURNAL_DIALOG_HEADER_CLASS}>
            <DialogTitle className="text-[22px] font-medium text-black">
              Добавить строку
            </DialogTitle>
          </DialogHeader>

          <div className={JOURNAL_DIALOG_BODY_CLASS}>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Р”Р°С‚Р°</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(event) => setNewDate(event.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
              <Select value={newEmployeeId} onValueChange={setNewEmployeeId}>
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
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

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() =>
                  createEntry(newEmployeeId, newDate).catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Ошибка создания строки"
                    )
                  )
                }
                disabled={isCreating || !newDate || !newEmployeeId}
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
              >
                {isCreating ? "Создание..." : "Создать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[32px] border-0 p-0 sm:max-w-[860px]">
          <DialogHeader className={JOURNAL_DIALOG_HEADER_CLASS}>
            <DialogTitle className="text-[22px] font-medium text-black">
              Настройки журнала
            </DialogTitle>
          </DialogHeader>

          <div className={JOURNAL_DIALOG_BODY_CLASS}>
            <div className="space-y-3">
              <Label htmlFor="journal-title" className="text-[14px] text-[#73738a]">
                Название журнала
              </Label>
              <Input
                id="journal-title"
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>

            <div className={JOURNAL_DIALOG_GRID_CLASS}>
              <div className="space-y-3">
                <Label className="text-[14px] text-[#73738a]">Ответственный</Label>
                <Select
                  value={responsibleUserIdInput}
                  onValueChange={(value) => setResponsibleUserIdInput(value)}
                >
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
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

              <div className="space-y-3">
                <Label htmlFor="journal-responsible-title" className="text-[14px] text-[#73738a]">
                  Должность ответственного
                </Label>
                <Input
                  id="journal-responsible-title"
                  value={responsibleTitleInput}
                  onChange={(event) => setResponsibleTitleInput(event.target.value)}
                  className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                  placeholder="Например: Технолог"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() =>
                  saveSettings().catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Ошибка сохранения настроек"
                    )
                  )
                }
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
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

export function TrackedDocumentClient(props: Props) {
  if (props.templateCode === "pest_control" || isPestControlDocumentFields(props.fields)) {
    return (
      <PestControlDocumentClient
        documentId={props.documentId}
        title={props.title}
        organizationName={props.organizationName}
        dateFrom={props.dateFrom}
        dateTo={props.dateTo}
        status={props.status}
        routeCode="pest_control"
        users={props.employees}
        initialEntries={props.initialEntries.map((entry) => ({
          id: entry.id,
          data: normalizePestControlEntryData(
            entry.data,
            entry.date,
            props.employees,
            entry.employeeId
          ),
        }))}
      />
    );
  }

  return <TrackedDocumentClientImpl {...props} />;
}
