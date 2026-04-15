"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
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
  CLEANING_VENTILATION_CHECKLIST_TITLE,
  buildChecklistDateKeys,
  getCleaningVentilationDescriptionLines,
  getCleaningVentilationPeriodicityLines,
  getMonthBoundsFromDate,
  normalizeCleaningVentilationConfig,
  normalizeCleaningVentilationEntryData,
  type CleaningVentilationChecklistConfig,
  type CleaningVentilationChecklistEntryData,
  type CleaningVentilationResponsible,
} from "@/lib/cleaning-ventilation-checklist-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  routeCode: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  users: UserItem[];
  config: CleaningVentilationChecklistConfig;
  initialEntries: { id: string; date: string; data: CleaningVentilationChecklistEntryData }[];
};

type SettingsState = {
  title: string;
  dateFrom: string;
  ventilationEnabled: boolean;
  mainResponsibleTitle: string;
  mainResponsibleUserId: string;
};

type RowProcedure = {
  id: "disinfection" | "ventilation" | "wet_cleaning";
  label: string;
  times: string[];
  responsibleUserId: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function formatRuDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("ru-RU");
}

function createId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (json && typeof json.error === "string" && json.error) || "Операция не выполнена"
    );
  }
  return json;
}

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [hour = "00", minute = "00"] = value.split(":");

  return (
    <div className="flex items-center gap-2">
      <Select
        value={hour}
        onValueChange={(nextHour) => onChange(`${nextHour}:${minute}`)}
        disabled={disabled}
      >
        <SelectTrigger className="h-12 w-[106px] rounded-[18px] border-[#d8dcea] bg-white px-4 text-[16px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={minute}
        onValueChange={(nextMinute) => onChange(`${hour}:${nextMinute}`)}
        disabled={disabled}
      >
        <SelectTrigger className="h-12 w-[106px] rounded-[18px] border-[#d8dcea] bg-white px-4 text-[16px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DocumentSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  initial: SettingsState;
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState<SettingsState>(props.initial);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setState(props.initial);
        }
        props.onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[840px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-7">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[34px] font-semibold tracking-[-0.03em] text-black">
              Настройки документа
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#0b1024]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-8 py-7">
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))}
              className="h-16 rounded-3xl border-[#d8dae6] px-6 text-[22px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Дата начала</Label>
            <div className="relative">
              <Input
                type="date"
                value={state.dateFrom}
                onChange={(event) =>
                  setState((current) => ({ ...current, dateFrom: event.target.value }))
                }
                className="h-16 rounded-3xl border-[#d8dae6] px-6 pr-14 text-[22px]"
              />
              <CalendarDays className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={state.ventilationEnabled}
                onCheckedChange={(checked) =>
                  setState((current) => ({ ...current, ventilationEnabled: checked === true }))
                }
                className="size-6 rounded-[10px]"
              />
              <span className="text-[20px] text-black">Проветривание</span>
            </label>
            <p className="text-[15px] text-black/70">
              Включайте, если помещение действительно проветривается. Без окон магия не сработает,
              даже если кожаные очень верят.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Должность ответственного</Label>
            <Select
              value={state.mainResponsibleTitle}
              onValueChange={(value) =>
                setState((current) => ({ ...current, mainResponsibleTitle: value }))
              }
            >
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f4f5fb] px-6 text-[22px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {["Управляющий", "Сотрудник"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Сотрудник</Label>
            <Select
              value={state.mainResponsibleUserId}
              onValueChange={(value) =>
                setState((current) => ({ ...current, mainResponsibleUserId: value }))
              }
            >
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f4f5fb] px-6 text-[22px]">
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
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={submitting}
              className="h-14 rounded-3xl bg-[#5563ff] px-8 text-[20px] text-white hover:bg-[#4554ff]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit(state);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddResponsibleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  onAdd: (responsible: CleaningVentilationResponsible) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [userId, setUserId] = useState("");

  return (
    <Dialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setTitle("");
          setUserId("");
        }
        props.onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[840px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-7">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[34px] font-semibold tracking-[-0.03em] text-black">
              Добавление ответственного лица
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#0b1024]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-8 py-7">
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Должность ответственного</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f4f5fb] px-6 text-[22px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {["Управляющий", "Сотрудник"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Сотрудник</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f4f5fb] px-6 text-[22px]">
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
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              className="h-14 rounded-3xl bg-[#5563ff] px-8 text-[20px] text-white hover:bg-[#4554ff]"
              disabled={!title || !userId}
              onClick={async () => {
                await props.onAdd({ id: createId(), title, userId });
                props.onOpenChange(false);
              }}
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CleaningVentilationChecklistDocumentClient({
  documentId,
  routeCode,
  title,
  organizationName,
  status,
  dateFrom,
  users,
  config: initialConfig,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(() =>
    normalizeCleaningVentilationConfig(initialConfig, users)
  );
  const [entryMap, setEntryMap] = useState<
    Record<string, { id?: string; data: CleaningVentilationChecklistEntryData }>
  >(() =>
    Object.fromEntries(
      initialEntries.map((entry) => [
        entry.date,
        { id: entry.id, data: normalizeCleaningVentilationEntryData(entry.data) },
      ])
    )
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [responsibleDialogOpen, setResponsibleDialogOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const isActive = status === "active";
  const docTitle = title || CLEANING_VENTILATION_CHECKLIST_TITLE;

  const activeProcedures = useMemo(
    () =>
      config.procedures.filter(
        (item) => item.enabled && (item.id !== "ventilation" || config.ventilationEnabled)
      ),
    [config]
  );

  const rows = useMemo(
    () =>
      buildChecklistDateKeys(
        dateFrom,
        config.skipWeekends,
        config.customDates,
        config.hiddenDates
      ).map((dateKey) => {
        const entry = entryMap[dateKey]?.data;
        return {
          dateKey,
          procedures: activeProcedures.map((procedure) => ({
            ...procedure,
            times: entry?.procedures[procedure.id] || procedure.times,
            responsibleUserId:
              entry?.responsibleUserId ||
              procedure.responsibleUserId ||
              config.mainResponsibleUserId,
          })),
        };
      }),
    [
      activeProcedures,
      config.customDates,
      config.hiddenDates,
      config.mainResponsibleUserId,
      config.skipWeekends,
      dateFrom,
      entryMap,
    ]
  );

  const settingsState: SettingsState = {
    title: docTitle,
    dateFrom,
    ventilationEnabled: config.ventilationEnabled,
    mainResponsibleTitle: config.mainResponsibleTitle,
    mainResponsibleUserId: config.mainResponsibleUserId,
  };

  const userMap = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users]
  );

  const persistConfig = async (
    nextConfig: CleaningVentilationChecklistConfig,
    options?: { title?: string; dateFrom?: string }
  ) => {
    const safeConfig = normalizeCleaningVentilationConfig(nextConfig, users);
    const nextDateFrom = options?.dateFrom || dateFrom;
    const monthBounds = getMonthBoundsFromDate(nextDateFrom);
    await requestJson(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: options?.title || docTitle,
        dateFrom: monthBounds.dateFrom,
        dateTo: monthBounds.dateTo,
        config: safeConfig,
      }),
    });
    setConfig(safeConfig);
    router.refresh();
  };

  const persistEntry = async (
    dateKey: string,
    nextData: CleaningVentilationChecklistEntryData
  ) => {
    const employeeId =
      nextData.responsibleUserId || config.mainResponsibleUserId || users[0]?.id;
    if (!employeeId) return;

    const result = await requestJson(`/api/journal-documents/${documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        date: dateKey,
        data: nextData,
      }),
    });

    setEntryMap((current) => ({
      ...current,
      [dateKey]: {
        id:
          result && result.entry && typeof result.entry.id === "string"
            ? result.entry.id
            : current[dateKey]?.id,
        data: nextData,
      },
    }));
  };

  const updateProcedureTime = async (
    dateKey: string,
    procedure: RowProcedure,
    timeIndex: number,
    value: string
  ) => {
    const existing = entryMap[dateKey]?.data || { procedures: {} };
    const sourceTimes =
      existing.procedures[procedure.id] ||
      config.procedures.find((item) => item.id === procedure.id)?.times ||
      [];
    const nextTimes = [...sourceTimes];
    nextTimes[timeIndex] = value;
    await persistEntry(dateKey, {
      procedures: {
        ...existing.procedures,
        [procedure.id]: nextTimes.filter(Boolean),
      },
      responsibleUserId:
        existing.responsibleUserId || procedure.responsibleUserId || config.mainResponsibleUserId,
    });
  };

  const clearSelectedRows = async () => {
    const ids = selection
      .map((item) => entryMap[item]?.id)
      .filter((item): item is string => Boolean(item));
    if (ids.length > 0) {
      await requestJson(`/api/journal-documents/${documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    }

    const nextConfig = {
      ...config,
      hiddenDates: [...new Set([...config.hiddenDates, ...selection])],
      customDates: config.customDates.filter((item) => !selection.includes(item)),
    };
    const nextEntryMap = { ...entryMap };
    selection.forEach((item) => delete nextEntryMap[item]);
    setEntryMap(nextEntryMap);
    setSelection([]);
    await persistConfig(nextConfig);
  };

  const addManualDate = async () => {
    const existingDates = rows.map((item) => item.dateKey);
    const lastDate = existingDates[existingDates.length - 1] || dateFrom;
    const nextDate = new Date(`${lastDate}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextIso = nextDate.toISOString().slice(0, 10);
    await persistConfig({
      ...config,
      hiddenDates: config.hiddenDates.filter((item) => item !== nextIso),
      customDates: [...new Set([...config.customDates, nextIso])],
    });
  };

  return (
    <div className="space-y-8">
      {selection.length > 0 ? (
        <div className="flex items-center gap-5 rounded-[22px] bg-white px-7 py-5 shadow-sm">
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl bg-[#f5f6ff] px-6 py-4 text-[18px] text-[#5563ff]"
            onClick={() => setSelection([])}
          >
            <X className="size-5" />
            Выбранно: {selection.length}
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl bg-[#fff1ef] px-6 py-4 text-[18px] text-[#ff3b30]"
            onClick={() => {
              clearSelectedRows().catch((error) =>
                toast.error(error instanceof Error ? error.message : "Не удалось удалить строки")
              );
            }}
          >
            <Trash2 className="size-5" />
            Удалить
          </button>
        </div>
      ) : null}

      <div className="space-y-6 rounded-[28px] bg-white p-8 shadow-sm">
        <DocumentBackLink href={`/journals/${routeCode}`} documentId={documentId} />

        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <h1 className="max-w-[980px] text-[48px] font-semibold tracking-[-0.04em] text-black md:text-[62px]">
            {docTitle}
          </h1>
          <div className="flex items-center gap-3">
            {isActive ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-14 rounded-2xl border-[#eef0fb] px-6 text-[17px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                Настройки журнала
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] bg-[#f4f5fe] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <label className="flex items-center gap-4 text-[22px] font-semibold text-black">
              <Checkbox
                checked={config.autoFillEnabled}
                disabled={!isActive}
                onCheckedChange={(checked) => {
                  persistConfig({ ...config, autoFillEnabled: checked === true }).catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки")
                  );
                }}
                className="size-7 rounded-[10px]"
              />
              Автоматически заполнять чек-лист
            </label>
            <button type="button" onClick={() => setPanelOpen((current) => !current)}>
              {panelOpen ? (
                <ChevronUp className="size-7 text-[#5863f8]" />
              ) : (
                <ChevronDown className="size-7 text-[#5863f8]" />
              )}
            </button>
          </div>

          {panelOpen ? (
            <div className="mt-6 space-y-7">
              {activeProcedures.map((procedure) => (
                <div key={procedure.id} className="space-y-4">
                  {procedure.times.map((time, index) => (
                    <div
                      key={`${procedure.id}-${index}`}
                      className="flex flex-col gap-3 md:flex-row md:items-center"
                    >
                      <div className="w-full text-[18px] text-black md:w-[180px]">
                        {procedure.label}
                      </div>
                      <TimeSelect
                        value={time}
                        disabled={!isActive}
                        onChange={(value) => {
                          const nextProcedures = config.procedures.map((item) =>
                            item.id === procedure.id
                              ? {
                                  ...item,
                                  times: item.times.map((existing, timeIndex) =>
                                    timeIndex === index ? value : existing
                                  ),
                                }
                              : item
                          );
                          persistConfig({ ...config, procedures: nextProcedures }).catch((error) =>
                            toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки")
                          );
                        }}
                      />
                    </div>
                  ))}

                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="w-full text-[18px] text-black md:w-[180px]">ФИО отв. лица</div>
                    <Select
                      value={procedure.responsibleUserId}
                      disabled={!isActive}
                      onValueChange={(value) => {
                        const nextProcedures = config.procedures.map((item) =>
                          item.id === procedure.id ? { ...item, responsibleUserId: value } : item
                        );
                        persistConfig({ ...config, procedures: nextProcedures }).catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки")
                        );
                      }}
                    >
                      <SelectTrigger className="h-12 w-full rounded-[18px] border-[#d8dcea] bg-white px-4 text-[16px] md:w-[320px]">
                        <SelectValue />
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
                </div>
              ))}

              <label className="flex items-center gap-3 text-[18px] text-black">
                <Checkbox
                  checked={config.skipWeekends}
                  disabled={!isActive}
                  onCheckedChange={(checked) => {
                    persistConfig({ ...config, skipWeekends: checked === true }).catch((error) =>
                      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки")
                    );
                  }}
                  className="size-6 rounded-[10px]"
                />
                Не заполнять в выходные дни
              </label>
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#d9dceb]">
          <table className="w-full border-collapse text-left">
            <tbody>
              <tr className="border-b border-[#d9dceb]">
                <td className="w-[220px] border-r border-[#d9dceb] px-5 py-4 align-middle text-[18px] font-semibold">
                  {organizationName || 'ООО "Тест"'}
                </td>
                <td className="border-r border-[#d9dceb] px-5 py-4 text-center text-[18px]">
                  СИСТЕМА ХАССП
                </td>
                <td className="w-[250px] border-r border-[#d9dceb] px-5 py-4 text-[15px] leading-6">
                  Начат {formatRuDate(dateFrom)}
                  <br />
                  Окончен __________
                </td>
                <td className="w-[120px] px-5 py-4 text-center text-[16px]">СТР. 1 ИЗ 1</td>
              </tr>
              <tr className="border-b border-[#d9dceb]">
                <td className="border-r border-[#d9dceb] px-5 py-4" />
                <td className="border-r border-[#d9dceb] px-5 py-4 text-center text-[18px] italic">
                  {CLEANING_VENTILATION_CHECKLIST_TITLE.toUpperCase()}
                </td>
                <td className="border-r border-[#d9dceb] px-5 py-4" />
                <td className="px-5 py-4" />
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b border-[#d9dceb]">
                <td className="w-[180px] border-r border-[#d9dceb] px-5 py-4 text-[16px] font-semibold">
                  Процедура
                </td>
                <td className="border-r border-[#d9dceb] px-5 py-4 text-[15px] leading-6">
                  {getCleaningVentilationDescriptionLines()
                    .filter(
                      (item) =>
                        item.label !== "Рабочие помещения при проветривании" ||
                        config.ventilationEnabled
                    )
                    .map((item) => (
                      <div key={item.label}>
                        <span className="font-semibold">{item.label}: </span>
                        {item.text}
                      </div>
                    ))}
                </td>
                <td className="w-[210px] border-r border-[#d9dceb] px-5 py-4 text-[16px] font-semibold">
                  Периодичность
                </td>
                <td className="w-[260px] px-5 py-4 text-[15px] leading-6">
                  {getCleaningVentilationPeriodicityLines(config.ventilationEnabled).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="border-r border-[#d9dceb] px-5 py-4" />
                <td className="border-r border-[#d9dceb] px-5 py-4" />
                <td className="border-r border-[#d9dceb] px-5 py-4 text-[16px] font-semibold">
                  Ответственные лица
                </td>
                <td className="space-y-3 px-5 py-4 text-[15px] leading-6">
                  {config.responsibles.length > 0 ? (
                    config.responsibles.map((responsible) => {
                      const user = userMap[responsible.userId];
                      return (
                        <div key={responsible.id} className="flex items-center justify-between gap-3">
                          <span>
                            {responsible.title} - {user?.name || "Не выбран"}
                          </span>
                          {isActive ? (
                            <button
                              type="button"
                              className="text-[#ff3b30]"
                              onClick={() => {
                                persistConfig({
                                  ...config,
                                  responsibles: config.responsibles.filter(
                                    (item) => item.id !== responsible.id
                                  ),
                                }).catch((error) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Не удалось обновить список ответственных"
                                  )
                                );
                              }}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div>—</div>
                  )}
                  {isActive ? (
                    <button
                      type="button"
                      className="rounded-2xl bg-[#f4f5fe] px-4 py-3 text-[15px] font-medium text-[#5563ff]"
                      onClick={() => setResponsibleDialogOpen(true)}
                    >
                      Добавить ответственного
                    </button>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          {isActive ? (
            <Button
              type="button"
              onClick={() => {
                addManualDate().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Не удалось добавить дату")
                );
              }}
              className="h-12 rounded-2xl bg-[#5563ff] px-6 text-[16px] text-white hover:bg-[#4554ff]"
            >
              <Plus className="mr-2 size-5" />
              Добавить
            </Button>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-[28px] border border-[#d9dceb]">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-[#f8f9fc]">
                <th className="w-[58px] border-b border-r border-[#d9dceb] px-4 py-4 text-center text-[15px] font-semibold text-black" />
                <th className="w-[140px] border-b border-r border-[#d9dceb] px-4 py-4 text-left text-[15px] font-semibold text-black">
                  Дата
                </th>
                <th className="w-[240px] border-b border-r border-[#d9dceb] px-4 py-4 text-left text-[15px] font-semibold text-black">
                  Процедура
                </th>
                <th className="w-[160px] border-b border-r border-[#d9dceb] px-4 py-4 text-center text-[15px] font-semibold text-black">
                  Время 1
                </th>
                <th className="w-[160px] border-b border-r border-[#d9dceb] px-4 py-4 text-center text-[15px] font-semibold text-black">
                  Время 2
                </th>
                <th className="w-[160px] border-b border-r border-[#d9dceb] px-4 py-4 text-center text-[15px] font-semibold text-black">
                  Время 3
                </th>
                <th className="border-b border-[#d9dceb] px-4 py-4 text-left text-[15px] font-semibold text-black">
                  ФИО ответственного лица
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.procedures.map((procedure, index) => {
                  const selected = selection.includes(row.dateKey);
                  const responsibleName = userMap[procedure.responsibleUserId]?.name || "";
                  return (
                    <tr key={`${row.dateKey}-${procedure.id}`} className="bg-white">
                      {index === 0 ? (
                        <td
                          rowSpan={row.procedures.length}
                          className="border-b border-r border-[#d9dceb] px-4 py-4 align-top"
                        >
                          <div className="flex justify-center">
                            <Checkbox
                              checked={selected}
                              disabled={!isActive}
                              onCheckedChange={(checked) => {
                                setSelection((current) =>
                                  checked === true
                                    ? [...new Set([...current, row.dateKey])]
                                    : current.filter((item) => item !== row.dateKey)
                                );
                              }}
                              className="mt-1 size-5 rounded-[8px]"
                            />
                          </div>
                        </td>
                      ) : null}
                      {index === 0 ? (
                        <td
                          rowSpan={row.procedures.length}
                          className="border-b border-r border-[#d9dceb] px-4 py-4 align-top text-[16px] text-black"
                        >
                          {formatRuDate(row.dateKey)}
                        </td>
                      ) : null}
                      <td className="border-b border-r border-[#d9dceb] px-4 py-4 text-[16px] text-black">
                        {procedure.label}
                      </td>
                      {[0, 1, 2].map((timeIndex) => (
                        <td
                          key={`${row.dateKey}-${procedure.id}-${timeIndex}`}
                          className="border-b border-r border-[#d9dceb] px-3 py-3"
                        >
                          <TimeSelect
                            value={procedure.times[timeIndex] || "00:00"}
                            disabled={!isActive || !config.autoFillEnabled}
                            onChange={(value) => {
                              updateProcedureTime(row.dateKey, procedure, timeIndex, value).catch(
                                (error) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Не удалось сохранить время"
                                  )
                              );
                            }}
                          />
                        </td>
                      ))}
                      <td className="border-b border-[#d9dceb] px-4 py-4 text-[16px] text-black">
                        {responsibleName}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DocumentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={users}
        initial={settingsState}
        onSubmit={async (value) => {
          await persistConfig(
            {
              ...config,
              ventilationEnabled: value.ventilationEnabled,
              mainResponsibleTitle: value.mainResponsibleTitle,
              mainResponsibleUserId: value.mainResponsibleUserId,
              procedures: config.procedures.map((item) => ({
                ...item,
                responsibleUserId:
                  item.responsibleUserId === config.mainResponsibleUserId
                    ? value.mainResponsibleUserId
                    : item.responsibleUserId,
              })),
            },
            {
              title: value.title,
              dateFrom: value.dateFrom,
            }
          );
        }}
      />

      <AddResponsibleDialog
        open={responsibleDialogOpen}
        onOpenChange={setResponsibleDialogOpen}
        users={users}
        onAdd={async (responsible) => {
          await persistConfig({
            ...config,
            responsibles: [...config.responsibles, responsible],
          });
        }}
      />
    </div>
  );
}
