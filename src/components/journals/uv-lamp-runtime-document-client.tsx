"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, Settings2, Trash2, X } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildDailyRange,
  buildUvRuntimeDocumentTitle,
  formatRuDateDash,
  getUvResponsibleOptions,
  normalizeUvRuntimeDocumentConfig,
  normalizeUvRuntimeEntryData,
  toIsoDate,
  type UvRuntimeDocumentConfig,
  type UvRuntimeEntryData,
} from "@/lib/uv-lamp-runtime-document";

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

type Props = {
  documentId: string;
  title: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle?: string | null;
  responsibleUserId?: string | null;
  users: UserItem[];
  config: unknown;
  initialEntries: EntryItem[];
};

type GridRow = {
  id: string;
  date: string;
  employeeId: string;
  data: UvRuntimeEntryData;
};

function defaultEntryData(data?: Record<string, unknown>) {
  return normalizeUvRuntimeEntryData(data || {});
}

function entryToRow(entry: EntryItem): GridRow {
  return {
    id: entry.id,
    date: entry.date,
    employeeId: entry.employeeId,
    data: defaultEntryData(entry.data),
  };
}

function buildRows(params: {
  dateFrom: string;
  dateTo: string;
  status: string;
  initialEntries: EntryItem[];
  fallbackEmployeeId: string;
}) {
  const today = toIsoDate(new Date());
  const effectiveTo = params.status === "closed" ? params.dateTo : today;
  const days = buildDailyRange(params.dateFrom, effectiveTo);

  const byDate = new Map(params.initialEntries.map((entry) => [entry.date, entry]));
  return days.map((day, index) => {
    const existing = byDate.get(day);
    if (existing) {
      return entryToRow(existing);
    }

    return {
      id: `virtual:${day}:${index}`,
      date: day,
      employeeId: params.fallbackEmployeeId,
      data: {
        startTime: "",
        endTime: "",
        counterValue: "",
      },
    };
  });
}

function UvRuntimeSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  initialConfig: UvRuntimeDocumentConfig;
  initialDateFrom: string;
  initialResponsibleTitle: string;
  initialResponsibleUserId: string;
  onSave: (data: {
    config: UvRuntimeDocumentConfig;
    dateFrom: string;
    responsibleTitle: string;
    responsibleUserId: string;
  }) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [lampNumber, setLampNumber] = useState(props.initialConfig.lampNumber);
  const [areaName, setAreaName] = useState(props.initialConfig.areaName);
  const [dateFrom, setDateFrom] = useState(props.initialDateFrom);
  const [responsibleTitle, setResponsibleTitle] = useState(props.initialResponsibleTitle);
  const [responsibleUserId, setResponsibleUserId] = useState(props.initialResponsibleUserId);

  const options = useMemo(() => getUvResponsibleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.open) return;
    setLampNumber(props.initialConfig.lampNumber);
    setAreaName(props.initialConfig.areaName);
    setDateFrom(props.initialDateFrom);
    setResponsibleTitle(props.initialResponsibleTitle);
    setResponsibleUserId(props.initialResponsibleUserId);
  }, [
    props.open,
    props.initialConfig,
    props.initialDateFrom,
    props.initialResponsibleTitle,
    props.initialResponsibleUserId,
  ]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[40px] font-semibold tracking-[-0.03em] text-black">
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
            <Label className="text-[16px] text-[#6f7282]">Бактерицидная установка №</Label>
            <Input
              value={lampNumber}
              onChange={(event) => setLampNumber(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[30px] leading-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Наименование цеха/участка применения</Label>
            <Input
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[24px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[24px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[24px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="- Выберите значение -">- Выберите значение -</SelectItem>
                {options.management.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[16px] font-semibold italic text-black">Руководство</SelectLabel>
                    {options.management.map((user) => (
                      <SelectItem key={`title:${user.id}`} value={user.role === "technologist" ? "Управляющий" : "Руководитель"}>
                        {user.role === "technologist" ? "Управляющий" : "Руководитель"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {options.staff.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[16px] font-semibold italic text-black">Сотрудники</SelectLabel>
                    <SelectItem value="Шеф-повар">Шеф-повар</SelectItem>
                    <SelectItem value="Повар">Повар</SelectItem>
                    <SelectItem value="Официант">Официант</SelectItem>
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[24px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((user) => (
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
                    config: {
                      lampNumber: lampNumber.trim() || "1",
                      areaName: areaName.trim() || "Журнал учета работы",
                    },
                    dateFrom,
                    responsibleTitle,
                    responsibleUserId,
                  });
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UvLampRuntimeDocumentClient(props: Props) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const config = useMemo(() => normalizeUvRuntimeDocumentConfig(props.config), [props.config]);
  const fallbackEmployeeId = props.responsibleUserId || props.users[0]?.id || "";
  const [rows, setRows] = useState(
    buildRows({
      dateFrom: props.dateFrom,
      dateTo: props.dateTo,
      status: props.status,
      initialEntries: props.initialEntries,
      fallbackEmployeeId,
    })
  );

  const userMap = useMemo(() => Object.fromEntries(props.users.map((user) => [user.id, user.name])), [props.users]);

  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  function addManualRow() {
    const lastDate = rows[rows.length - 1]?.date || props.dateFrom;
    const next = new Date(`${lastDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = toIsoDate(next);

    if (rows.some((row) => row.date === nextDate)) return;

    setRows((current) => [
      ...current,
      {
        id: `virtual:${nextDate}:${current.length}`,
        date: nextDate,
        employeeId: fallbackEmployeeId,
        data: {
          startTime: "",
          endTime: "",
          counterValue: "",
        },
      },
    ]);
  }

  async function saveRow(row: GridRow) {
    const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: row.employeeId || fallbackEmployeeId,
        date: row.date,
        data: row.data,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) {
      throw new Error("save_row_failed");
    }

    const saved: GridRow = {
      id: result.entry.id,
      employeeId: row.employeeId || fallbackEmployeeId,
      date: row.date,
      data: row.data,
    };
    setRows((current) => current.map((item) => (item.date === saved.date ? saved : item)));
  }

  async function deleteSelectedRows() {
    const deletable = rows.filter((row) => selectedRowIds.includes(row.id) && !row.id.startsWith("virtual:"));
    if (deletable.length === 0) return;
    if (!window.confirm("Удалить выбранные строки?")) return;

    const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: deletable.map((row) => row.id) }),
    });

    if (!response.ok) {
      window.alert("Не удалось удалить выбранные строки");
      return;
    }

    setRows((current) =>
      current.map((row) =>
        selectedRowIds.includes(row.id)
          ? { ...row, id: `virtual:${row.date}`, data: { startTime: "", endTime: "", counterValue: "" } }
          : row
      )
    );
    setSelectedRowIds([]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[12px] border border-[#eceef5] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[24px] font-semibold text-black">{props.title || buildUvRuntimeDocumentTitle(config)}</div>
          <div className="flex items-center gap-2">
            {props.status === "active" && (
              <Button
                type="button"
                onClick={addManualRow}
                className="h-9 rounded-md bg-[#5b66ff] px-3 text-[13px] font-medium text-white hover:bg-[#4c58ff]"
              >
                <Plus className="mr-1 size-4" />
                Добавить
              </Button>
            )}
            {props.status === "active" && selectedRowIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-md border-[#ffd7d3] px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1]"
                onClick={() => {
                  deleteSelectedRows().catch(() => {
                    window.alert("Не удалось удалить выбранные строки");
                  });
                }}
              >
                <Trash2 className="mr-1 size-4" />
                Удалить
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-md border-[#eceef5] px-3 text-[13px]"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="mr-1 size-4" />
              Настройки
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-md border-[#eceef5] px-3 text-[13px]"
              onClick={() => window.open(`/api/journal-documents/${props.documentId}/pdf`, "_blank")}
            >
              <Printer className="mr-1 size-4" />
              Печать
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-[#eceef5] bg-white">
        <table className="min-w-[1240px] w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f6f7fb]">
              {props.status === "active" && (
                <th className="w-[40px] border border-[#eceef5] px-2 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? rows.map((row) => row.id) : [])
                    }
                  />
                </th>
              )}
              <th className="border border-[#eceef5] px-3 py-2 text-left font-medium text-[#5b6075]">Дата</th>
              <th className="border border-[#eceef5] px-3 py-2 text-left font-medium text-[#5b6075]">Время включения</th>
              <th className="border border-[#eceef5] px-3 py-2 text-left font-medium text-[#5b6075]">Время выключения</th>
              <th className="border border-[#eceef5] px-3 py-2 text-left font-medium text-[#5b6075]">Показание счетчика, ч</th>
              <th className="border border-[#eceef5] px-3 py-2 text-left font-medium text-[#5b6075]">Ответственный</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-[#fafbff]">
                {props.status === "active" && (
                  <td className="border border-[#eceef5] p-2 text-center">
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds((current) =>
                          checked === true ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id)
                        )
                      }
                    />
                  </td>
                )}
                <td className="border border-[#eceef5] p-2">
                  <div className="px-2 py-1 text-[18px] text-black">{formatRuDateDash(row.date)}</div>
                </td>
                <td className="border border-[#eceef5] p-2">
                  {props.status === "active" ? (
                    <Input
                      type="time"
                      value={row.data.startTime}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, data: { ...item.data, startTime: event.target.value } }
                              : item
                          )
                        )
                      }
                      onBlur={() => {
                        saveRow(row).catch(() => window.alert("Не удалось сохранить строку"));
                      }}
                      className="h-9 rounded-md border-[#dfe1ec] text-[13px]"
                    />
                  ) : (
                    <div className="px-2 py-1 text-[18px] text-black">{row.data.startTime || "—"}</div>
                  )}
                </td>
                <td className="border border-[#eceef5] p-2">
                  {props.status === "active" ? (
                    <Input
                      type="time"
                      value={row.data.endTime}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, data: { ...item.data, endTime: event.target.value } }
                              : item
                          )
                        )
                      }
                      onBlur={() => {
                        saveRow(row).catch(() => window.alert("Не удалось сохранить строку"));
                      }}
                      className="h-9 rounded-md border-[#dfe1ec] text-[13px]"
                    />
                  ) : (
                    <div className="px-2 py-1 text-[18px] text-black">{row.data.endTime || "—"}</div>
                  )}
                </td>
                <td className="border border-[#eceef5] p-2">
                  {props.status === "active" ? (
                    <Input
                      value={row.data.counterValue}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, data: { ...item.data, counterValue: event.target.value } }
                              : item
                          )
                        )
                      }
                      onBlur={() => {
                        saveRow(row).catch(() => window.alert("Не удалось сохранить строку"));
                      }}
                      className="h-9 rounded-md border-[#dfe1ec] text-[13px]"
                    />
                  ) : (
                    <div className="px-2 py-1 text-[18px] text-black">{row.data.counterValue || "—"}</div>
                  )}
                </td>
                <td className="border border-[#eceef5] p-2">
                  {props.status === "active" ? (
                    <Select
                      value={row.employeeId || fallbackEmployeeId}
                      onValueChange={(value) =>
                        setRows((current) =>
                          current.map((item) => (item.id === row.id ? { ...item, employeeId: value } : item))
                        )
                      }
                    >
                      <SelectTrigger className="h-9 rounded-md border-[#dfe1ec] text-[13px]">
                        <SelectValue placeholder="Выберите сотрудника" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="px-2 py-1 text-[18px] text-black">{userMap[row.employeeId] || "—"}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UvRuntimeSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={props.users}
        initialConfig={config}
        initialDateFrom={props.dateFrom}
        initialResponsibleTitle={props.responsibleTitle || ""}
        initialResponsibleUserId={props.responsibleUserId || fallbackEmployeeId}
        onSave={async (data) => {
          const response = await fetch(`/api/journal-documents/${props.documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: buildUvRuntimeDocumentTitle(data.config),
              config: data.config,
              dateFrom: data.dateFrom,
              responsibleTitle: data.responsibleTitle || null,
              responsibleUserId: data.responsibleUserId || null,
            }),
          });

          if (!response.ok) {
            window.alert("Не удалось сохранить настройки");
            return;
          }

          router.refresh();
        }}
      />
    </div>
  );
}
