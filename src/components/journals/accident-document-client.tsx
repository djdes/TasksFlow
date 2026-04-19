"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import {
  CalendarDays,
  Plus,
  Printer,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  ACCIDENT_DOCUMENT_HEADING,
  ACCIDENT_DOCUMENT_TITLE,
  createAccidentRow,
  normalizeAccidentDocumentConfig,
  type AccidentDocumentConfig,
  type AccidentRow,
} from "@/lib/accident-document";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  config: unknown;
};

function formatDateLabel(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
}

function formatDateTime(date: string, hour: string, minute: string) {
  return `${formatDateLabel(date)}\n${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function hourOptions() {
  return Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
}

function minuteOptions() {
  return Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialRow: AccidentRow | null;
  onSave: (row: AccidentRow) => Promise<void>;
}) {
  const [row, setRow] = useState<AccidentRow>(() => createAccidentRow());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setRow(props.initialRow || createAccidentRow());
  }, [props.initialRow, props.open]);

  function setValue<K extends keyof AccidentRow>(key: K, value: AccidentRow[K]) {
    setRow((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await props.onSave(row);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[30px] font-medium text-black">
              {props.initialRow ? "Редактирование строки" : "Добавление новой строки"}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#101425]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <fieldset className="space-y-3 rounded-[18px] border border-[#e5e8f2] p-4">
            <legend className="px-1 text-base font-medium">Дата и время аварии</legend>
            <div className="relative">
              <Input
                type="date"
                value={row.accidentDate}
                onChange={(event) => setValue("accidentDate", event.target.value)}
                className="h-11 rounded-2xl border-[#d7dbea] pr-12"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#6e7387]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                value={row.accidentHour}
                onValueChange={(value) => setValue("accidentHour", value)}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                  <SelectValue placeholder="Часы" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions().map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.accidentMinute}
                onValueChange={(value) => setValue("accidentMinute", value)}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                  <SelectValue placeholder="Минуты" />
                </SelectTrigger>
                <SelectContent>
                  {minuteOptions().map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <Input
            value={row.locationName}
            onChange={(event) => setValue("locationName", event.target.value)}
            className="h-11 rounded-2xl border-[#d7dbea]"
            placeholder="Введите наименование помещения"
          />

          <div className="space-y-2">
            <Label className="text-base font-medium text-black">
              Описание аварии (причины, возникновения, предпринятые действия для
              ликвидации аварии и т.д.)
            </Label>
            <Textarea
              value={row.accidentDescription}
              onChange={(event) => setValue("accidentDescription", event.target.value)}
              className="min-h-32 rounded-2xl border-[#d7dbea]"
              placeholder="Описание аварии"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-medium text-black">
              Наличие «потенциально небезопасной» пищевой продукции, предпринятые
              действия с продукцией
            </Label>
            <Textarea
              value={row.affectedProducts}
              onChange={(event) => setValue("affectedProducts", event.target.value)}
              className="min-h-32 rounded-2xl border-[#d7dbea]"
              placeholder='Наличие «небезопасной» пищевой продукции'
            />
          </div>

          <fieldset className="space-y-3 rounded-[18px] border border-[#e5e8f2] p-4">
            <legend className="px-1 text-base font-medium">Дата и время ликвидации</legend>
            <div className="relative">
              <Input
                type="date"
                value={row.resolvedDate}
                onChange={(event) => setValue("resolvedDate", event.target.value)}
                className="h-11 rounded-2xl border-[#d7dbea] pr-12"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#6e7387]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                value={row.resolvedHour}
                onValueChange={(value) => setValue("resolvedHour", value)}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                  <SelectValue placeholder="Часы" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions().map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.resolvedMinute}
                onValueChange={(value) => setValue("resolvedMinute", value)}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                  <SelectValue placeholder="Минуты" />
                </SelectTrigger>
                <SelectContent>
                  {minuteOptions().map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label className="text-base font-medium text-black">
              ФИО лиц, ответственных за ликвидацию аварии и ее последствий
            </Label>
            <Textarea
              value={row.responsiblePeople}
              onChange={(event) => setValue("responsiblePeople", event.target.value)}
              className="min-h-28 rounded-2xl border-[#d7dbea]"
              placeholder="ФИО лиц"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-medium text-black">
              Мероприятия (корректирующие действия), предпринятые комиссией для
              исключения возникновения аварии
            </Label>
            <Textarea
              value={row.correctiveActions}
              onChange={(event) => setValue("correctiveActions", event.target.value)}
              className="min-h-32 rounded-2xl border-[#d7dbea]"
              placeholder="Мероприятия (корректирующие действия)"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5563ff] px-8 text-[15px] text-white hover:bg-[#4452ee]"
            >
              {submitting
                ? "Сохранение..."
                : props.initialRow
                  ? "Сохранить"
                  : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  dateFrom: string;
  onSave: (payload: { title: string; dateFrom: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.title);
    setDateFrom(props.dateFrom);
  }, [props.dateFrom, props.open, props.title]);

  async function handleSave() {
    setSubmitting(true);
    try {
      await props.onSave({ title: title.trim(), dateFrom });
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[30px] font-medium text-black">
              Настройки журнала
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#101425]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-base text-[#6e7387]">Название документа</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#d7dbea]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-base text-[#6e7387]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-11 rounded-2xl border-[#d7dbea]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5563ff] px-8 text-[15px] text-white hover:bg-[#4452ee]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  documentId: string;
  onFinished: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleFinish() {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${props.documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось закончить журнал");
      }

      props.onFinished();
      props.onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[30px] font-medium text-black">
              Закончить журнал &quot;{props.title}&quot;
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#101425]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <p className="text-sm text-[#6e7387]">
            После завершения журнал перейдет в раздел закрытых и будет доступен
            только для чтения.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5563ff] px-8 text-[15px] text-white hover:bg-[#4452ee]"
            >
              {submitting ? "Завершение..." : "Закончить журнал"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AccidentDocumentClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [config, setConfig] = useState(() =>
    normalizeAccidentDocumentConfig(props.config)
  );
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AccidentRow | null>(null);

  const rows = useMemo(() => config.rows, [config.rows]);
  const isActive = props.status === "active";
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  async function persist(
    nextTitle: string,
    nextDateFrom: string,
    nextConfig: AccidentDocumentConfig
  ) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextDateFrom,
        dateTo: nextDateFrom,
        config: nextConfig,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить журнал");
    }
    setTitle(nextTitle);
    setDateFrom(nextDateFrom);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: AccidentRow) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];
    await persist(title, dateFrom, { ...config, rows: nextRows });
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;
    try {
      await persist(title, dateFrom, {
        ...config,
        rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
      });
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function handleSaveSettings(payload: { title: string; dateFrom: string }) {
    await persist(payload.title || ACCIDENT_DOCUMENT_TITLE, payload.dateFrom, config);
  }

  return (
    <div className="bg-white text-black">
      {selectedRowIds.length > 0 ? (
        <div className="sticky top-0 z-30 border-b border-[#eef1f7] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1860px] items-center gap-4 px-6 py-5">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#fafbff] px-4 py-3 text-[15px] text-[#5563ff]"
              onClick={() => setSelectedRowIds([])}
            >
              <X className="size-5" />
              Выбрано: {selectedRowIds.length}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#fff4f2] px-4 py-3 text-[15px] text-[#ff3b30]"
              onClick={() => {
                handleDeleteSelected().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Ошибка")
                );
              }}
            >
              <Trash2 className="size-5" />
              Удалить
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1860px] space-y-8 px-4 py-4 sm:px-6 sm:py-6">
        <DocumentBackLink href="/journals/accident_journal" documentId={props.documentId} />


        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[32px]">
            {title || ACCIDENT_DOCUMENT_HEADING}
          </h1>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
            Настройки журнала
          </Button>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="mx-auto min-w-[1040px] border-collapse text-[16px]">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="min-w-[190px] border border-black px-6 py-6 text-center text-[20px] font-semibold"
                >
                  {props.organizationName || 'ООО "Тест"'}
                </td>
                <td className="min-w-[700px] border border-black px-6 py-5 text-center">
                  СИСТЕМА ХАССП
                </td>
                <td
                  rowSpan={2}
                  className="min-w-[220px] border border-black px-4 py-3 align-top text-[18px]"
                >
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>Начат</span>
                    <span>{formatDateLabel(dateFrom)}</span>
                  </div>
                  <div className="mt-3 flex justify-between gap-3 font-semibold">
                    <span>Окончен</span>
                    <span>__________</span>
                  </div>
                  <div className="mt-6 text-right">СТР. 1 ИЗ 1</div>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-6 py-5 text-center italic">
                  {ACCIDENT_DOCUMENT_TITLE.toUpperCase()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-center text-[26px] font-semibold">
          {ACCIDENT_DOCUMENT_TITLE.toUpperCase()}
        </div>

        <div className="flex items-center justify-between gap-4">
          {isActive ? (
            <Button
              type="button"
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4452ee]"
              onClick={() => {
                setEditingRow(null);
                setRowDialogOpen(true);
              }}
            >
              <Plus className="size-5" />
              Добавить
            </Button>
          ) : (
            <div />
          )}
          {isActive ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-[#edf0fb] bg-[#fafbff] px-4 text-[15px] text-[#5566f6]"
              onClick={() => setFinishOpen(true)}
            >
              Закончить журнал
            </Button>
          ) : null}
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[1650px] w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? rows.map((row) => row.id) : [])
                    }
                    disabled={!isActive || rows.length === 0}
                  />
                </th>
                <th className="w-[72px] border border-black p-2 text-center">№ п/п</th>
                <th className="w-[150px] border border-black p-2 text-center">
                  Дата и время аварии
                </th>
                <th className="w-[210px] border border-black p-2 text-center">
                  Наименование помещения, в котором зафиксирована авария
                </th>
                <th className="w-[300px] border border-black p-2 text-center">
                  Описание аварии (причины, возникновения, предпринятые действия для
                  ликвидации аварии и т.д.)
                </th>
                <th className="w-[280px] border border-black p-2 text-center">
                  Наличие «потенциально небезопасной» пищевой продукции,
                  предпринятые действия с продукцией
                </th>
                <th className="w-[180px] border border-black p-2 text-center">
                  Дата и время ликвидации аварии, допуск к работе
                </th>
                <th className="w-[210px] border border-black p-2 text-center">
                  ФИО лиц, ответственных за ликвидацию аварии и ее последствий
                </th>
                <th className="w-[320px] border border-black p-2 text-center">
                  Мероприятия (корректирующие действия), предпринятые комиссией для
                  исключения возникновения аварии
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
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
                      disabled={!isActive}
                    />
                  </td>
                  <td className="border border-black p-2 text-center">{index + 1}</td>
                  <td className="border border-black p-2 text-center whitespace-pre-line">
                    <button
                      type="button"
                      className="w-full text-center hover:text-[#5563ff]"
                      onClick={() => {
                        if (!isActive) return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                    >
                      {formatDateTime(row.accidentDate, row.accidentHour, row.accidentMinute)}
                    </button>
                  </td>
                  <td className="border border-black p-2 text-center">{row.locationName}</td>
                  <td className="border border-black p-2 text-center">{row.accidentDescription}</td>
                  <td className="border border-black p-2 text-center">{row.affectedProducts}</td>
                  <td className="border border-black p-2 text-center whitespace-pre-line">
                    {formatDateTime(row.resolvedDate, row.resolvedHour, row.resolvedMinute)}
                  </td>
                  <td className="border border-black p-2 text-center">{row.responsiblePeople}</td>
                  <td className="border border-black p-2 text-center">{row.correctiveActions}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border border-black p-8 text-center text-[#80849a]">
                    Строк пока нет
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className="border border-black p-2 text-center">
                  <Checkbox checked={false} disabled />
                </td>
                <td colSpan={8} className="border border-black p-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={title}
        dateFrom={dateFrom}
        onSave={handleSaveSettings}
      />

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(value) => {
          setRowDialogOpen(value);
          if (!value) setEditingRow(null);
        }}
        initialRow={editingRow}
        onSave={handleSaveRow}
      />

      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title={title || ACCIDENT_DOCUMENT_TITLE}
        documentId={props.documentId}
        onFinished={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
