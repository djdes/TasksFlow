"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { getUsersForRoleLabel } from "@/lib/user-roles";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  buildDailyRange,
  formatRuDateDash,
  getGlassControlResponsibleOptions,
  GLASS_CONTROL_DEFAULT_FREQUENCY,
  GLASS_CONTROL_DOCUMENT_TITLE,
  GLASS_CONTROL_PAGE_TITLE,
  normalizeGlassControlConfig,
  normalizeGlassControlEntryData,
  toIsoDate,
  type GlassControlEntryData,
} from "@/lib/glass-control-document";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type EntryItem = {
  id: string;
  employeeId: string;
  date: string;
  data: Record<string, unknown>;
};

type RowItem = {
  id: string;
  employeeId: string;
  date: string;
  data: GlassControlEntryData;
};

type RowDialogState = {
  open: boolean;
  row: RowItem;
  originalRow: RowItem | null;
};

type Props = {
  routeCode: string;
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle?: string | null;
  responsibleUserId?: string | null;
  status: string;
  autoFill: boolean;
  users: UserItem[];
  config: unknown;
  initialEntries: EntryItem[];
  itemSuggestions?: string[];
};

function emptyEntryData(): GlassControlEntryData {
  return {
    damagesDetected: false,
    itemName: "",
    quantity: "",
    damageInfo: "",
  };
}

function createVirtualRow(
  date: string,
  employeeId: string,
  data: Partial<GlassControlEntryData> = {}
): RowItem {
  return {
    id: `virtual:${date}:${employeeId || "none"}`,
    date,
    employeeId,
    data: { ...emptyEntryData(), ...data },
  };
}

function normalizeEntry(entry: EntryItem): RowItem {
  return {
    id: entry.id,
    employeeId: entry.employeeId,
    date: entry.date,
    data: normalizeGlassControlEntryData(entry.data),
  };
}

function sortRows(rows: RowItem[]) {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.employeeId.localeCompare(b.employeeId);
  });
}

function rowKey(row: { employeeId: string; date: string }) {
  return `${row.employeeId}:${row.date}`;
}

function buildRows(params: {
  dateFrom: string;
  dateTo: string;
  status: string;
  entries: EntryItem[];
  fallbackEmployeeId: string;
}) {
  const today = toIsoDate(new Date());
  const effectiveTo =
    params.status === "closed" && params.dateTo ? params.dateTo : today;
  const days = buildDailyRange(params.dateFrom, effectiveTo);
  const existing = new Map(
    params.entries.map((entry) => [entry.date, normalizeEntry(entry)])
  );

  return sortRows(
    days.map(
      (day) => existing.get(day) || createVirtualRow(day, params.fallbackEmployeeId)
    )
  );
}

function GlassControlSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  initialState: {
    title: string;
    dateFrom: string;
    controlFrequency: string;
    responsibleTitle: string;
    responsibleUserId: string;
  };
  onSave: (payload: {
    title: string;
    dateFrom: string;
    controlFrequency: string;
    responsibleTitle: string;
    responsibleUserId: string;
  }) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState(props.initialState.title);
  const [dateFrom, setDateFrom] = useState(props.initialState.dateFrom);
  const [controlFrequency, setControlFrequency] = useState(
    props.initialState.controlFrequency
  );
  const [responsibleTitle, setResponsibleTitle] = useState(
    props.initialState.responsibleTitle
  );
  const [responsibleUserId, setResponsibleUserId] = useState(
    props.initialState.responsibleUserId
  );
  const options = useMemo(
    () => getGlassControlResponsibleOptions(props.users),
    [props.users]
  );

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.initialState.title);
    setDateFrom(props.initialState.dateFrom);
    setControlFrequency(props.initialState.controlFrequency);
    setResponsibleTitle(props.initialState.responsibleTitle);
    setResponsibleUserId(props.initialState.responsibleUserId);
  }, [props.initialState, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Настройки документа
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-4 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Название документа</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Частота контроля</Label>
            <Input
              value={controlFrequency}
              onChange={(event) => setControlFrequency(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {options.titles.map((titleItem) => (
                  <SelectItem key={titleItem} value={titleItem}>
                    {titleItem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {(responsibleTitle
                  ? getUsersForRoleLabel(props.users, responsibleTitle)
                  : props.users
                ).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave({
                    title,
                    dateFrom,
                    controlFrequency,
                    responsibleTitle,
                    responsibleUserId,
                  });
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RowItem;
  originalRow: RowItem | null;
  users: UserItem[];
  itemSuggestions: string[];
  responsibleTitle: string;
  onSave: (row: RowItem, originalRow: RowItem | null) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<RowItem>(props.row);
  const options = useMemo(
    () => getGlassControlResponsibleOptions(props.users),
    [props.users]
  );

  useEffect(() => {
    if (!props.open) return;
    setDraft(props.row);
  }, [props.open, props.row]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            {props.originalRow ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-4 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата</Label>
            <Input
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, date: event.target.value }))
              }
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[16px] font-semibold text-black">
              Состояние: повреждения обнаружены
            </Label>
            <div className="flex gap-6 text-[18px]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.data.damagesDetected === true}
                  onChange={() =>
                    setDraft((prev) => ({
                      ...prev,
                      data: { ...prev.data, damagesDetected: true },
                    }))
                  }
                  className="size-4 accent-[#5863f8]"
                />
                Да
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.data.damagesDetected === false}
                  onChange={() =>
                    setDraft((prev) => ({
                      ...prev,
                      data: {
                        ...prev.data,
                        damagesDetected: false,
                        itemName: "",
                        quantity: "",
                        damageInfo: "",
                      },
                    }))
                  }
                  className="size-4 accent-[#5863f8]"
                />
                Нет
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={props.responsibleTitle} disabled>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {options.titles.map((titleItem) => (
                  <SelectItem key={titleItem} value={titleItem}>
                    {titleItem}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select
              value={draft.employeeId}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, employeeId: value }))
              }
            >
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {(props.responsibleTitle
                  ? getUsersForRoleLabel(props.users, props.responsibleTitle)
                  : props.users
                ).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.data.damagesDetected && (
            <>
              <div className="space-y-1">
                <Label className="text-[16px] text-[#6f7282]">Наименование</Label>
                <Input
                  list="glass-control-item-suggestions"
                  value={draft.data.itemName}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      data: { ...prev.data, itemName: event.target.value },
                    }))
                  }
                  className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
                />
                <datalist id="glass-control-item-suggestions">
                  {props.itemSuggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <Label className="text-[16px] text-[#6f7282]">Кол-во</Label>
                <Input
                  value={draft.data.quantity}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      data: { ...prev.data, quantity: event.target.value },
                    }))
                  }
                  className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[16px] text-[#6f7282]">
                  Информация о повреждениях / замены
                </Label>
                <Input
                  value={draft.data.damageInfo}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      data: { ...prev.data, damageInfo: event.target.value },
                    }))
                  }
                  className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
                />
              </div>
            </>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave(draft, props.originalRow);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GlassControlDocumentClient(props: Props) {
  const router = useRouter();
  const config = useMemo(() => normalizeGlassControlConfig(props.config), [props.config]);
  const fallbackEmployeeId = props.responsibleUserId || props.users[0]?.id || "";
  const [rows, setRows] = useState(() =>
    buildRows({
      dateFrom: props.dateFrom,
      dateTo: props.dateTo,
      status: props.status,
      entries: props.initialEntries,
      fallbackEmployeeId,
    })
  );
  const [autoFill, setAutoFill] = useState(props.autoFill);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [rowDialog, setRowDialog] = useState<RowDialogState>({
    open: false,
    row: createVirtualRow(toIsoDate(new Date()), fallbackEmployeeId),
    originalRow: null,
  });

  const responsibleOptions = useMemo(
    () => getGlassControlResponsibleOptions(props.users),
    [props.users]
  );
  const isClosed = props.status === "closed";
  const selectedCount = selectedRowIds.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length && !isClosed;
  const itemSuggestions = useMemo(
    () => [...new Set(props.itemSuggestions || [])].filter(Boolean),
    [props.itemSuggestions]
  );

  async function upsertRow(nextRow: RowItem, originalRow: RowItem | null) {
    const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: nextRow.employeeId,
        date: nextRow.date,
        data: nextRow.data,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) {
      toast.error("Не удалось сохранить строку");
      throw new Error("save_row_failed");
    }

    const savedRow = normalizeEntry({
      id: result.entry.id,
      employeeId: result.entry.employeeId,
      date: toIsoDate(new Date(result.entry.date)),
      data: result.entry.data as Record<string, unknown>,
    });

    if (
      originalRow &&
      !originalRow.id.startsWith("virtual:") &&
      rowKey(originalRow) !== rowKey(nextRow)
    ) {
      await fetch(`/api/journal-documents/${props.documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [originalRow.id] }),
      });
    }

    setRows((current) => {
      const filtered = current.filter((row) => {
        if (originalRow && row.id === originalRow.id) return false;
        return rowKey(row) !== rowKey(savedRow);
      });

      return sortRows([...filtered, savedRow]);
    });
  }

  async function deleteSelectedRows() {
    const ids = selectedRowIds.filter((id) => !id.startsWith("virtual:"));
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;

    try {
      if (ids.length > 0) {
        const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });

        if (!response.ok) {
          throw new Error("Не удалось удалить строки");
        }
      }

      setRows((current) => current.filter((row) => !selectedRowIds.includes(row.id)));
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function syncAutoFill(nextValue: boolean) {
    const patchResponse = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoFill: nextValue }),
    });

    if (!patchResponse.ok) {
      toast.error("Не удалось обновить автозаполнение");
      return;
    }

    if (nextValue) {
      const dates = buildDailyRange(props.dateFrom, toIsoDate(new Date()));
      const existingDates = new Set(rows.map((row) => row.date));

      for (const date of dates) {
        if (existingDates.has(date)) continue;
        const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: fallbackEmployeeId,
            date,
            data: emptyEntryData(),
          }),
        });

        if (!response.ok) {
          toast.error("Не удалось автозаполнить журнал");
          return;
        }
      }
    }

    setAutoFill(nextValue);
    router.refresh();
  }

  async function saveSettings(payload: {
    title: string;
    dateFrom: string;
    controlFrequency: string;
    responsibleTitle: string;
    responsibleUserId: string;
  }) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || GLASS_CONTROL_DOCUMENT_TITLE,
        dateFrom: payload.dateFrom,
        responsibleTitle: payload.responsibleTitle || null,
        responsibleUserId: payload.responsibleUserId || null,
        config: {
          ...config,
          documentName: payload.title.trim() || GLASS_CONTROL_DOCUMENT_TITLE,
          controlFrequency: payload.controlFrequency.trim() || GLASS_CONTROL_DEFAULT_FREQUENCY,
        },
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки документа");
      throw new Error("save_settings_failed");
    }

    router.refresh();
  }

  async function closeJournal() {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed", dateTo: toIsoDate(new Date()) }),
    });

    if (!response.ok) {
      toast.error("Не удалось закончить журнал");
      return;
    }

    setCloseOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6 text-black">
      <DocumentBackLink href="/journals/glass_control" documentId={props.documentId} />
      {selectedCount > 0 && !isClosed && (
        <div className="sticky top-0 z-30 -mx-6 flex items-center gap-4 rounded-[20px] border-b border-[#eef0fb] bg-white/95 px-6 py-3 shadow-sm backdrop-blur">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-[18px] text-[#5b66ff]"
            onClick={() => setSelectedRowIds([])}
          >
            <X className="mr-2 inline size-5" />
            Выбрано: {selectedCount}
          </button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl border-[#ffd7d3] px-5 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
            onClick={() => deleteSelectedRows().catch(() => undefined)}
          >
            <Trash2 className="size-5" />
            Удалить
          </Button>
        </div>
      )}

      <div className="rounded-[28px] bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-8 flex items-center justify-end gap-4 print:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            onClick={() => setSettingsOpen(true)}
            disabled={isClosed}
          >
            <Settings2 className="size-4" />
            Настройки журнала
          </Button>
        </div>

        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {config.documentName || props.title || GLASS_CONTROL_DOCUMENT_TITLE}
        </h1>

        <div className="mt-6 rounded-[18px] bg-[#f6f7ff] px-5 py-4 print:hidden">
          <label className="flex items-center gap-4 text-[18px] font-semibold">
            <Switch
              checked={autoFill}
              onCheckedChange={(checked) => {
                void syncAutoFill(Boolean(checked));
              }}
              disabled={isClosed}
            />
            Автоматически заполнять журнал
          </label>
        </div>

        <div className="mx-auto mt-10 max-w-[1160px] space-y-8 print:mt-6">
          <table className="w-full border-collapse text-[16px]">
            <tbody>
              <tr>
                <td rowSpan={2} className="w-[18%] border border-black p-4 text-center font-semibold">
                  {props.organizationName}
                </td>
                <td className="border border-black p-3 text-center font-medium">
                  СИСТЕМА ХАССП
                </td>
                <td rowSpan={2} className="w-[16%] border border-black p-3 text-left font-semibold">
                  <div>Начат</div>
                  <div>{formatRuDateDash(props.dateFrom)}</div>
                  <div className="mt-3">Окончен</div>
                  <div>{isClosed && props.dateTo ? formatRuDateDash(props.dateTo) : "__________"}</div>
                </td>
              </tr>
              <tr>
                <td className="border border-black p-3 text-center italic">
                  {GLASS_CONTROL_PAGE_TITLE.toUpperCase()}
                </td>
              </tr>
              <tr>
                <td className="border border-black bg-[#efefef] p-3 font-semibold">
                  Частота контроля
                </td>
                <td className="border border-black p-3 text-center font-semibold" colSpan={2}>
                  {config.controlFrequency}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="text-center text-[20px] font-semibold uppercase">
            {GLASS_CONTROL_PAGE_TITLE}
          </div>

          <div className="flex items-center justify-between gap-4 print:hidden">
            {!isClosed && (
              <Button
                type="button"
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4957fb]"
                onClick={() =>
                  setRowDialog({
                    open: true,
                    row: createVirtualRow(toIsoDate(new Date()), fallbackEmployeeId),
                    originalRow: null,
                  })
                }
              >
                <Plus className="size-5" />
                Добавить
              </Button>
            )}

            {!isClosed && (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
                onClick={() => setCloseOpen(true)}
              >
                Закончить журнал
              </Button>
            )}
          </div>

          <table className="w-full border-collapse text-[16px]">
            <thead>
              <tr>
                {!isClosed && (
                  <th rowSpan={2} className="w-[34px] border border-black p-2 text-center">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds(checked === true ? rows.map((row) => row.id) : [])
                      }
                    />
                  </th>
                )}
                <th rowSpan={2} className="w-[130px] border border-black p-2 text-center">Дата</th>
                <th colSpan={2} className="border border-black p-2 text-center">
                  Состояние: повреждения обнаружены
                </th>
                <th colSpan={3} className="border border-black p-2 text-center">
                  Предмет, на котором обнаружены повреждения
                </th>
                <th rowSpan={2} className="w-[170px] border border-black p-2 text-center">
                  Фамилия ответственного лица
                </th>
              </tr>
              <tr>
                <th className="w-[70px] border border-black p-2 text-center">Да</th>
                <th className="w-[70px] border border-black p-2 text-center">Нет</th>
                <th className="border border-black p-2 text-center">Наименование</th>
                <th className="w-[100px] border border-black p-2 text-center">Кол-во</th>
                <th className="border border-black p-2 text-center">Информация о повреждениях / замены</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const userName = props.users.find((user) => user.id === row.employeeId)?.name || "";
                return (
                  <tr
                    key={row.id}
                    className={!isClosed ? "cursor-pointer hover:bg-[#fbfbff]" : undefined}
                    onClick={(event) => {
                      if (isClosed) return;
                      if ((event.target as HTMLElement).closest("button")) return;
                      if ((event.target as HTMLElement).closest("[role='checkbox']")) return;
                      setRowDialog({ open: true, row, originalRow: row });
                    }}
                  >
                    {!isClosed && (
                      <td className="border border-black p-2 text-center">
                        <Checkbox
                          checked={selectedRowIds.includes(row.id)}
                          onCheckedChange={(checked) =>
                            setSelectedRowIds((current) =>
                              checked === true
                                ? [...new Set([...current, row.id])]
                                : current.filter((id) => id !== row.id)
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="border border-black p-2 text-center">{formatRuDateDash(row.date)}</td>
                    <td className="border border-black p-2 text-center">{row.data.damagesDetected ? "V" : ""}</td>
                    <td className="border border-black p-2 text-center">{row.data.damagesDetected ? "" : "V"}</td>
                    <td className="border border-black p-2">{row.data.itemName}</td>
                    <td className="border border-black p-2 text-center">{row.data.quantity}</td>
                    <td className="border border-black p-2">{row.data.damageInfo}</td>
                    <td className="border border-black p-2 text-center">{userName}</td>
                  </tr>
                );
              })}
              <tr>
                {!isClosed && <td className="border border-black p-4 print:hidden" />}
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <GlassControlSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={props.users}
        initialState={{
          title: config.documentName || props.title || GLASS_CONTROL_DOCUMENT_TITLE,
          dateFrom: props.dateFrom,
          controlFrequency: config.controlFrequency || GLASS_CONTROL_DEFAULT_FREQUENCY,
          responsibleTitle: props.responsibleTitle || responsibleOptions.titles[0] || "Управляющий",
          responsibleUserId: props.responsibleUserId || fallbackEmployeeId,
        }}
        onSave={saveSettings}
      />

      <RowDialog
        open={rowDialog.open}
        onOpenChange={(open) => setRowDialog((prev) => ({ ...prev, open }))}
        row={rowDialog.row}
        originalRow={rowDialog.originalRow}
        users={props.users}
        itemSuggestions={itemSuggestions}
        responsibleTitle={props.responsibleTitle || "Управляющий"}
        onSave={upsertRow}
      />

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
              Закончить журнал &quot;{config.documentName || props.title}&quot;
            </DialogTitle>
            <button
              type="button"
              className="rounded-md p-1 text-black/80 hover:bg-black/5"
              onClick={() => setCloseOpen(false)}
            >
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="flex justify-end px-7 py-6">
            <Button
              type="button"
              onClick={() => void closeJournal()}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Закончить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
