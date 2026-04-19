"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Printer,
  Settings2,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import {
  createRegisterDocumentRow,
  normalizeRegisterDocumentConfig,
  type RegisterDocumentConfig,
  type RegisterDocumentRow,
  type RegisterField,
} from "@/lib/register-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";

import { toast } from "sonner";
import { StickyActionBar } from "@/components/journals/sticky-action-bar";
import { DocumentCloseButton } from "@/components/journals/document-close-button";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import {
  JOURNAL_DIALOG_BODY_CLASS,
  JOURNAL_DIALOG_GRID_CLASS,
  JOURNAL_DIALOG_HEADER_CLASS,
  REGISTER_DOCUMENT_ACTIONS_CLASS,
  REGISTER_DOCUMENT_HEADER_CLASS,
  REGISTER_DOCUMENT_PAGE_CLASS,
  REGISTER_DOCUMENT_SUMMARY_CLASS,
  REGISTER_DOCUMENT_SUMMARY_ROW_CLASS,
  REGISTER_DOCUMENT_SUMMARY_STATS_CLASS,
} from "@/components/journals/journal-responsive";
type EmployeeItem = {
  id: string;
  name: string;
  role: string;
};

type EquipmentItem = {
  id: string;
  name: string;
};

type Props = {
  documentId: string;
  templateCode?: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  fields: RegisterField[];
  initialConfig: RegisterDocumentConfig;
  users: EmployeeItem[];
  equipment: EquipmentItem[];
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
}

function resolveDisplayValue(
  field: RegisterField,
  value: string,
  users: EmployeeItem[],
  equipment: EquipmentItem[]
) {
  if (!value) return "";

  if (field.type === "employee") {
    return users.find((user) => user.id === value)?.name || value;
  }

  if (field.type === "equipment") {
    return equipment.find((item) => item.id === value)?.name || value;
  }

  if (field.type === "select") {
    return field.options.find((option) => option.value === value)?.label || value;
  }

  return value;
}

function isFieldVisible(field: RegisterField, values: Record<string, string>) {
  if (!field.showIf) return true;
  return values[field.showIf.field] === field.showIf.equals;
}

function RowDialog({
  open,
  onOpenChange,
  title,
  fields,
  users,
  equipment,
  initialRow,
  defaultResponsibleUserId,
  onSave,
  onDelete,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  fields: RegisterField[];
  users: EmployeeItem[];
  equipment: EquipmentItem[];
  initialRow: RegisterDocumentRow | null;
  defaultResponsibleUserId: string | null;
  onSave: (row: RegisterDocumentRow) => Promise<void>;
  onDelete: (rowId: string) => Promise<void>;
  canDelete: boolean;
}) {
  const [row, setRow] = useState<RegisterDocumentRow>(() =>
    createRegisterDocumentRow(fields)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    const nextRow =
      initialRow ||
      createRegisterDocumentRow(fields, {
        values: Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.type === "employee" ? defaultResponsibleUserId || "" : "",
          ])
        ),
      });

    setRow(nextRow);
  }, [defaultResponsibleUserId, fields, initialRow, open]);

  const visibleFields = useMemo(
    () => fields.filter((field) => isFieldVisible(field, row.values)),
    [fields, row.values]
  );

  function updateValue(key: string, value: string) {
    setRow((current) => ({
      ...current,
      values: {
        ...current.values,
        [key]: value,
      },
    }));
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await onSave(row);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения строки");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка удаления строки");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[32px] border-0 p-0 sm:max-w-[820px]">
        <DialogHeader className={JOURNAL_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-[22px] font-medium text-black">
            {initialRow ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>

        <div className={JOURNAL_DIALOG_BODY_CLASS}>
          <div className="text-[16px] text-[#73738a] sm:text-[18px]">{title}</div>

          <div className="grid gap-5">
            {visibleFields.map((field) => {
              const value = row.values[field.key] || "";
              const selectOptions =
                field.type === "employee"
                  ? users.map((user) => ({ value: user.id, label: user.name }))
                  : field.type === "equipment"
                    ? equipment.map((item) => ({ value: item.id, label: item.name }))
                    : field.options;

              return (
                <div key={field.key} className="space-y-3">
                  <Label className="text-[14px] text-[#73738a]">{field.label}</Label>
                  {field.type === "select" ||
                  field.type === "employee" ||
                  field.type === "equipment" ? (
                    <Select value={value} onValueChange={(nextValue) => updateValue(field.key, nextValue)}>
                      <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                        <SelectValue placeholder="Выберите значение" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "date" ? (
                    <Input
                      type="date"
                      value={value}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    />
                  ) : field.type === "number" ? (
                    <Input
                      type="number"
                      value={value}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    />
                  ) : field.type === "text" && field.label.length > 28 ? (
                    <Textarea
                      value={value}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      className="min-h-[120px] rounded-3xl border-[#dfe1ec] px-6 py-4 text-[18px]"
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {initialRow && canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="h-11 rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
                >
                  Удалить строку
                </Button>
              )}
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : initialRow ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  title,
  users,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  users: EmployeeItem[];
  config: RegisterDocumentConfig;
  onSave: (params: { title: string; config: RegisterDocumentConfig }) => Promise<void>;
}) {
  const [documentTitle, setDocumentTitle] = useState(title);
  const [userId, setUserId] = useState(config.defaultResponsibleUserId || "");
  const [responsibleTitle, setResponsibleTitle] = useState(config.defaultResponsibleTitle || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDocumentTitle(title);
    setUserId(config.defaultResponsibleUserId || "");
    setResponsibleTitle(config.defaultResponsibleTitle || "");
  }, [config.defaultResponsibleTitle, config.defaultResponsibleUserId, open, title]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await onSave({
        title: documentTitle.trim(),
        config: {
          ...config,
          defaultResponsibleUserId: userId || null,
          defaultResponsibleTitle: responsibleTitle || null,
        },
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[32px] border-0 p-0 sm:max-w-[860px]">
        <DialogHeader className={JOURNAL_DIALOG_HEADER_CLASS}>
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки журнала
          </DialogTitle>
        </DialogHeader>

          <div className={JOURNAL_DIALOG_BODY_CLASS}>
          <div className="space-y-3">
            <Label htmlFor="register-title" className="sr-only">
              Название журнала
            </Label>
            <Input
              id="register-title"
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
              className="h-22 rounded-3xl border-[#dfe1ec] px-8 text-[24px]"
            />
          </div>

            <div className={JOURNAL_DIALOG_GRID_CLASS}>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Ответственный по умолчанию</Label>
              <Select
                value={userId}
                onValueChange={(nextValue) => {
                  setUserId(nextValue);
                  const user = users.find((item) => item.id === nextValue);
                  if (user && !responsibleTitle) {
                    setResponsibleTitle(getHygienePositionLabel(user.role));
                  }
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
              <Input
                value={responsibleTitle}
                onChange={(event) => setResponsibleTitle(event.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RegisterDocumentClient({
  documentId,
  templateCode,
  title,
  organizationName,
  dateFrom,
  dateTo,
  status,
  fields,
  initialConfig,
  users,
  equipment,
}: Props) {
  void organizationName;
  const router = useRouter();
  const [config, setConfig] = useState(() =>
    normalizeRegisterDocumentConfig(initialConfig, fields)
  );
  const [documentTitle, setDocumentTitle] = useState(title);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RegisterDocumentRow | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setConfig(normalizeRegisterDocumentConfig(initialConfig, fields));
  }, [fields, initialConfig]);

  useEffect(() => {
    setDocumentTitle(title);
  }, [title]);

  const allSelected =
    config.rows.length > 0 && selectedRowIds.length === config.rows.length;

  const visibleFields = useMemo(() => fields.slice(0, 6), [fields]);

  async function persist(nextTitle: string, nextConfig: RegisterDocumentConfig) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        config: nextConfig,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить журнал");
    }

    setDocumentTitle(nextTitle);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: RegisterDocumentRow) {
    const nextConfig = {
      ...config,
      rows: editingRow
        ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
        : [...config.rows, row],
    };

    await persist(documentTitle, nextConfig);
    setEditingRow(null);
  }

  async function handleDeleteRow(rowId: string) {
    const nextConfig = {
      ...config,
      rows: config.rows.filter((row) => row.id !== rowId),
    };

    await persist(documentTitle, nextConfig);
    setSelectedRowIds((current) => current.filter((item) => item !== rowId));
    setEditingRow(null);
  }

  async function handleSaveSettings(params: {
    title: string;
    config: RegisterDocumentConfig;
  }) {
    await persist(params.title, params.config);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;

    try {
      const nextConfig = {
        ...config,
        rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
      };

      await persist(documentTitle, nextConfig);
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  return (
    <div className="bg-white text-black">
      <div className={REGISTER_DOCUMENT_PAGE_CLASS}>
        {templateCode ? <DocumentBackLink href={`/journals/${templateCode}`} documentId={documentId} /> : null}
        <div className={REGISTER_DOCUMENT_HEADER_CLASS}>
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1024] sm:text-[32px]">
              {documentTitle}
            </h1>
            <div className="mt-2 text-[14px] text-[#63667a] sm:mt-3 sm:text-[18px]">
              Период: {formatDate(dateFrom)} - {formatDate(dateTo)}
            </div>
          </div>

          <div className={REGISTER_DOCUMENT_ACTIONS_CLASS}>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(`/api/journal-documents/${documentId}/pdf`, "_blank")}
              className="h-11 w-full rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff] sm:w-auto"
            >
              <Printer className="size-6" />
              Печать
            </Button>
            {status === "active" && (
              <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-11 w-full rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff] sm:w-auto"
              >
                <Settings2 className="size-6" />
                Настройки журнала
              </Button>
              <DocumentCloseButton
                documentId={documentId}
                title={documentTitle}
                variant="outline"
                className="h-11 w-full rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff] sm:w-auto"
              >
                Закончить журнал
              </DocumentCloseButton>
              </>
            )}
          </div>
        </div>

        <div className={REGISTER_DOCUMENT_SUMMARY_CLASS}>
          <div className={REGISTER_DOCUMENT_SUMMARY_ROW_CLASS}>
            <div className={REGISTER_DOCUMENT_SUMMARY_STATS_CLASS}>
              <div className="rounded-2xl bg-white/70 px-4 py-3 text-[15px] text-black shadow-sm sm:px-5 sm:text-[18px]">
                Строк в журнале: <span className="font-semibold">{config.rows.length}</span>
              </div>
              <div className="rounded-2xl bg-white/70 px-4 py-3 text-[15px] text-black shadow-sm sm:px-5 sm:text-[18px]">
                Ответственный по умолчанию:{" "}
                <span className="font-semibold">
                  {users.find((user) => user.id === config.defaultResponsibleUserId)?.name || "Не задан"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSummaryOpen((value) => !value)}
              className="flex size-11 shrink-0 items-center justify-center self-end rounded-full text-[#5566f6] hover:bg-white/70 lg:self-auto"
            >
              {summaryOpen ? <ChevronUp className="size-7" /> : <ChevronDown className="size-7" />}
            </button>
          </div>

          {summaryOpen && (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {visibleFields.map((field) => (
                <div key={field.key} className="rounded-2xl bg-white/70 px-4 py-4 shadow-sm sm:px-5">
                  <div className="text-[14px] text-[#70738a] sm:text-[15px]">{field.label}</div>
                  <div className="mt-2 text-[16px] font-medium text-black sm:text-[18px]">
                    {config.rows[0]
                      ? resolveDisplayValue(field, config.rows[0].values[field.key] || "", users, equipment) || "—"
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {status === "active" && (
          <StickyActionBar>
            <Button
              type="button"
              onClick={() => {
                setEditingRow(null);
                setRowDialogOpen(true);
              }}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              <Plus className="size-7" />
              Добавить строку
            </Button>

            {selectedRowIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteSelected}
                disabled={isPending}
                className="h-11 rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
              >
                <Trash2 className="size-6" />
                Удалить выбранные
              </Button>
            )}
          </StickyActionBar>
        )}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 rounded-[28px] border border-[#ececf4] bg-white">
          <table className="min-w-[1400px] w-full border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[52px] border border-black p-2 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(
                        checked === true ? config.rows.map((row) => row.id) : []
                      )
                    }
                    disabled={status !== "active" || config.rows.length === 0}
                  />
                </th>
                <th className="w-[80px] border border-black p-2 text-center font-semibold">№</th>
                {fields.map((field) => (
                  <th key={field.key} className="border border-black p-3 text-center font-semibold">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="border border-black p-2 text-center">
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds((current) =>
                          checked === true
                            ? [...new Set([...current, row.id])]
                            : current.filter((item) => item !== row.id)
                        )
                      }
                      disabled={status !== "active"}
                    />
                  </td>
                  <td className="border border-black p-2 text-center">{index + 1}</td>
                  {fields.map((field, fieldIndex) => {
                    const cellValue = isFieldVisible(field, row.values)
                      ? resolveDisplayValue(field, row.values[field.key] || "", users, equipment)
                      : "";

                    return (
                      <td key={`${row.id}:${field.key}`} className="border border-black p-2 align-top">
                        {fieldIndex === 0 && status === "active" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRow(row);
                              setRowDialogOpen(true);
                            }}
                            className="flex w-full items-start justify-between gap-3 text-left hover:text-[#3848c7]"
                          >
                            <span>{cellValue || "—"}</span>
                            <Pencil className="mt-1 size-4 shrink-0" />
                          </button>
                        ) : (
                          cellValue || "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {config.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={fields.length + 2}
                    className="border border-black px-4 py-10 text-center text-[18px] text-[#666a80]"
                  >
                    Пока нет строк. Добавь первую запись через кнопку выше.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        users={users}
        config={config}
        onSave={handleSaveSettings}
      />

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(value) => {
          setRowDialogOpen(value);
          if (!value) setEditingRow(null);
        }}
        title={documentTitle}
        fields={fields}
        users={users}
        equipment={equipment}
        initialRow={editingRow}
        defaultResponsibleUserId={config.defaultResponsibleUserId}
        onSave={handleSaveRow}
        onDelete={handleDeleteRow}
        canDelete={config.rows.length > 1}
      />
    </div>
  );
}
