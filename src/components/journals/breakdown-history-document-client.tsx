"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, Plus, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createBreakdownRow,
  normalizeBreakdownHistoryDocumentConfig,
  BREAKDOWN_HISTORY_HEADING,
  BREAKDOWN_HISTORY_DOCUMENT_TITLE,
  type BreakdownHistoryDocumentConfig,
  type BreakdownRow,
} from "@/lib/breakdown-history-document";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";
import {
  RecordCardsView,
  type RecordCardItem,
} from "@/components/journals/record-cards-view";

import { toast } from "sonner";
import { StickyActionBar } from "@/components/journals/sticky-action-bar";
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

function formatTime(hour: string, minute: string) {
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function hourOptions() {
  return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
}

function minuteOptions() {
  return Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
}

/* ------------------------------------------------------------------ */
/*  Row Dialog                                                        */
/* ------------------------------------------------------------------ */

function RowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRow: BreakdownRow | null;
  onSave: (row: BreakdownRow) => Promise<void>;
}) {
  const [row, setRow] = useState<BreakdownRow>(() => props.initialRow || createBreakdownRow());
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setValue<K extends keyof BreakdownRow>(key: K, value: BreakdownRow[K]) {
    setRow((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await props.onSave(row);
      props.onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[30px] font-medium text-black">
            {props.initialRow ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          {/* Start date + time */}
          <fieldset className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <legend className="px-1 text-sm font-medium">Дата и время начала работ</legend>
            <Input
              type="date"
              value={row.startDate}
              onChange={(e) => setValue("startDate", e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={row.startHour} onValueChange={(v) => setValue("startHour", v)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Час" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions().map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={row.startMinute} onValueChange={(v) => setValue("startMinute", v)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Мин" />
                </SelectTrigger>
                <SelectContent>
                  {minuteOptions().map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label>Наименование оборудования</Label>
            <Input
              value={row.equipmentName}
              onChange={(e) => setValue("equipmentName", e.target.value)}
              className="focus:border-[#5563ff]"
            />
          </div>

          <div className="space-y-2">
            <Label>Описание поломки</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-[#5563ff] focus:outline-none"
              rows={3}
              value={row.breakdownDescription}
              onChange={(e) => setValue("breakdownDescription", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Выполненный ремонт</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-[#5563ff] focus:outline-none"
              rows={3}
              value={row.repairPerformed}
              onChange={(e) => setValue("repairPerformed", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Замена частей (если произведена)</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-[#5563ff] focus:outline-none"
              rows={2}
              value={row.partsReplaced}
              onChange={(e) => setValue("partsReplaced", e.target.value)}
            />
          </div>

          {/* End date + time */}
          <fieldset className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <legend className="px-1 text-sm font-medium">Дата и время окончания работ</legend>
            <Input
              type="date"
              value={row.endDate}
              onChange={(e) => setValue("endDate", e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={row.endHour} onValueChange={(v) => setValue("endHour", v)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Час" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions().map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={row.endMinute} onValueChange={(v) => setValue("endMinute", v)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Мин" />
                </SelectTrigger>
                <SelectContent>
                  {minuteOptions().map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label>Часы простоя</Label>
            <Input
              value={row.downtimeHours}
              onChange={(e) => setValue("downtimeHours", e.target.value)}
              className="focus:border-[#5563ff]"
            />
          </div>

          <div className="space-y-2">
            <Label>ФИО лица, ответственного за ремонт</Label>
            <Input
              value={row.responsiblePerson}
              onChange={(e) => setValue("responsiblePerson", e.target.value)}
              className="focus:border-[#5563ff]"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              className="bg-[#5563ff] hover:bg-[#4452ee]"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Сохранение..." : props.initialRow ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Dialog                                                   */
/* ------------------------------------------------------------------ */

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dateFrom: string;
  onSave: (params: { title: string; dateFrom: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await props.onSave({ title: title.trim(), dateFrom });
      props.onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[30px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label>Название документа</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              className="bg-[#5563ff] hover:bg-[#4452ee]"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Finish Journal Dialog                                             */
/* ------------------------------------------------------------------ */

function FinishDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  documentId: string;
  onFinished: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleFinish() {
    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-medium text-black">
            Закончить журнал &laquo;{props.title}&raquo;
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <p className="text-sm text-[#80849a]">
            После завершения журнал станет доступен только для чтения. Это действие нельзя отменить.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="bg-[#5563ff] hover:bg-[#4452ee]"
              onClick={handleFinish}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Завершение..." : "Закончить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function BreakdownHistoryDocumentClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [config, setConfig] = useState(() =>
    normalizeBreakdownHistoryDocumentConfig(props.config)
  );
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<BreakdownRow | null>(null);
  const { mobileView, switchMobileView } = useMobileView("breakdown_history");
  const rows = useMemo(() => config.rows, [config.rows]);
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;
  const isActive = props.status === "active";

  const cardItems: RecordCardItem[] = rows.map((row, index) => ({
    id: row.id,
    title: `№${index + 1} · ${formatDateLabel(row.startDate)} ${formatTime(
      row.startHour,
      row.startMinute
    )}`,
    subtitle: row.equipmentName || "—",
    leading: (
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
        className="size-5"
      />
    ),
    fields: [
      { label: "Описание поломки", value: row.breakdownDescription, hideIfEmpty: true },
      { label: "Выполненный ремонт", value: row.repairPerformed, hideIfEmpty: true },
      { label: "Замена частей", value: row.partsReplaced, hideIfEmpty: true },
      {
        label: "Окончание работ",
        value: `${formatDateLabel(row.endDate)} ${formatTime(row.endHour, row.endMinute)}`,
      },
      { label: "Часы простоя", value: row.downtimeHours, hideIfEmpty: true },
      { label: "Ответственный", value: row.responsiblePerson, hideIfEmpty: true },
    ],
    onClick: isActive
      ? () => {
          setEditingRow(row);
          setRowDialogOpen(true);
        }
      : undefined,
    actions: isActive ? (
      <button
        type="button"
        onClick={() => {
          setEditingRow(row);
          setRowDialogOpen(true);
        }}
        className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#5563ff] px-4 text-[14px] font-medium text-white hover:bg-[#4452ee]"
      >
        Редактировать
      </button>
    ) : null,
  }));

  /* Persist helper */
  async function persist(
    nextTitle: string,
    nextDateFrom: string,
    nextConfig: BreakdownHistoryDocumentConfig
  ) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextDateFrom,
        config: nextConfig,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить документ");
    }
    setTitle(nextTitle);
    setDateFrom(nextDateFrom);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: BreakdownRow) {
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
      const nextConfig = {
        ...config,
        rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
      };
      await persist(title, dateFrom, nextConfig);
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function handleSaveSettings(params: { title: string; dateFrom: string }) {
    await persist(params.title, params.dateFrom, config);
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1860px] space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        <DocumentBackLink href="/journals/breakdown_history" documentId={props.documentId} />
        {/* Page heading */}
        <div className="flex items-center justify-between">
          <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em]">
            {title || BREAKDOWN_HISTORY_HEADING}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            >
              <Settings2 className="size-4" />
              Настройки журнала
            </Button>
            {isActive && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setFinishOpen(true)}
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
              >
                Закончить журнал
              </Button>
            )}
          </div>
        </div>

        {/* HACCP Header table */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 rounded-[18px] border border-[#dadde9]">
          <table className="w-full border-collapse text-[15px]">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="w-[220px] border border-black px-4 py-3 text-center font-semibold"
                >
                  {props.organizationName || 'ООО "Организация"'}
                </td>
                <td className="border border-black px-4 py-2 text-center">
                  СИСТЕМА ХАССП
                </td>
                <td
                  rowSpan={2}
                  className="w-[200px] border border-black px-3 py-2"
                >
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <CalendarDays className="size-4" />
                    Начат {formatDateLabel(dateFrom)}
                  </div>
                  <div className="mt-1 text-sm">Окончен ___</div>
                  <div className="mt-2 text-right text-sm">СТР. 1 ИЗ 1</div>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-4 py-2 text-center italic">
                  {BREAKDOWN_HISTORY_DOCUMENT_TITLE.toUpperCase()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Title */}
        <div className="text-center text-[20px] font-semibold leading-tight sm:text-[34px]">
          КАРТОЧКА ИСТОРИИ ПОЛОМОК
        </div>

        {/* Action bar */}
        {isActive && (
          <StickyActionBar>
            <Button
              type="button"
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] hover:bg-[#4452ee]"
              onClick={() => {
                setEditingRow(null);
                setRowDialogOpen(true);
              }}
            >
              <Plus className="size-5" />
              Добавить
            </Button>

            {selectedRowIds.length > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-[#dadde9] bg-white px-4 py-2">
                <span className="text-sm">
                  Выбранно: {selectedRowIds.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#ffd7d3] text-[#ff3b30] hover:bg-[#fff0ef]"
                  onClick={() => {
                    handleDeleteSelected().catch((error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Ошибка удаления"
                      )
                    );
                  }}
                >
                  <X className="mr-1 size-4" />
                  Удалить
                </Button>
              </div>
            )}
          </StickyActionBar>
        )}

        {/* View toggle + cards/table */}
        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView items={cardItems} emptyLabel="Карточки поломок пока не добавлены." />
        ) : null}

        {/* Data table */}
        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 rounded-[18px] border border-[#dadde9]">
          <table className="min-w-[1600px] w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(
                        checked === true ? rows.map((r) => r.id) : []
                      )
                    }
                    disabled={rows.length === 0 || !isActive}
                  />
                </th>
                <th className="border border-black p-2">Дата и время начала работ</th>
                <th className="border border-black p-2">Наименование оборудования</th>
                <th className="border border-black p-2">Описание поломки</th>
                <th className="border border-black p-2">Выполненный ремонт</th>
                <th className="border border-black p-2">
                  Замена частей (если произведена)
                </th>
                <th className="border border-black p-2">Дата и время окончания работ</th>
                <th className="border border-black p-2">Часы простоя</th>
                <th className="border border-black p-2">
                  ФИО лица ответственного за ремонт
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td className="border border-black p-2">
                    <button
                      type="button"
                      className="text-left hover:text-[#5563ff]"
                      onClick={() => {
                        if (!isActive) return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                    >
                      {formatDateLabel(row.startDate)}{" "}
                      {formatTime(row.startHour, row.startMinute)}
                    </button>
                  </td>
                  <td className="border border-black p-2">
                    {row.equipmentName || "—"}
                  </td>
                  <td className="border border-black p-2">
                    {row.breakdownDescription || "—"}
                  </td>
                  <td className="border border-black p-2">
                    {row.repairPerformed || "—"}
                  </td>
                  <td className="border border-black p-2">
                    {row.partsReplaced || "—"}
                  </td>
                  <td className="border border-black p-2">
                    {formatDateLabel(row.endDate)}{" "}
                    {formatTime(row.endHour, row.endMinute)}
                  </td>
                  <td className="border border-black p-2">
                    {row.downtimeHours || "—"}
                  </td>
                  <td className="border border-black p-2">
                    {row.responsiblePerson || "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-black p-8 text-center text-[#80849a]"
                  >
                    Строк пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </MobileViewTableWrapper>
      </div>

      {/* Dialogs */}
      {settingsOpen && (
        <SettingsDialog
          key={`${title}:${dateFrom}`}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title={title}
          dateFrom={dateFrom}
          onSave={handleSaveSettings}
        />
      )}

      {rowDialogOpen && (
        <RowDialog
          key={editingRow?.id || "new-breakdown-row"}
          open={rowDialogOpen}
          onOpenChange={(open) => {
            setRowDialogOpen(open);
            if (!open) setEditingRow(null);
          }}
          initialRow={editingRow}
          onSave={handleSaveRow}
        />
      )}

      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title={title}
        documentId={props.documentId}
        onFinished={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
