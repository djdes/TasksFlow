"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Settings2, X } from "lucide-react";
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
  SANITATION_MONTHS,
  createEmptySanitationRow,
  getSanitationApproveLabel,
  normalizeSanitationDayConfig,
  type SanitationDayConfig,
  type SanitationMonthKey,
  type SanitationMonthValues,
} from "@/lib/sanitation-day-document";

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  users: UserItem[];
  config: unknown;
};

type SettingsState = {
  title: string;
  documentDate: string;
  year: string;
  approveRole: string;
  approveEmployee: string;
  responsibleRole: string;
  responsibleEmployee: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Управляющий",
  technologist: "Технолог",
  operator: "Сотрудник",
};

const MONTH_FIELD_LABELS: Record<SanitationMonthKey, string> = {
  jan: "Январь",
  feb: "Февраль",
  mar: "Март",
  apr: "Апрель",
  may: "Май",
  jun: "Июнь",
  jul: "Июль",
  aug: "Август",
  sep: "Сентябрь",
  oct: "Октябрь",
  nov: "Ноябрь",
  dec: "Декабрь",
};

function roleOptionsFromUsers(users: UserItem[]) {
  const labels = users.map((u) => ROLE_LABELS[u.role] || u.role);
  return [...new Set(labels)];
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return users.filter((u) => (ROLE_LABELS[u.role] || u.role) === roleLabel);
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toViewDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `« ${day} » ${new Date(`${year}-${month}-01`).toLocaleDateString("ru-RU", {
    month: "long",
  })} ${year} г.`;
}

function AddRoomDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreate: (name: string, plan: SanitationMonthValues) => Promise<void>;
}) {
  const [roomName, setRoomName] = useState("");
  const [months, setMonths] = useState<SanitationMonthValues>({
    jan: "",
    feb: "",
    mar: "",
    apr: "",
    may: "",
    jun: "",
    jul: "",
    aug: "",
    sep: "",
    oct: "",
    nov: "",
    dec: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function patchMonth(month: SanitationMonthKey, value: string) {
    setMonths((prev) => ({ ...prev, [month]: value }));
  }

  async function submit() {
    if (!roomName.trim()) {
      window.alert("Введите название помещения");
      return;
    }
    setSubmitting(true);
    try {
      await props.onCreate(roomName.trim(), months);
      setRoomName("");
      setMonths({
        jan: "",
        feb: "",
        mar: "",
        apr: "",
        may: "",
        jun: "",
        jul: "",
        aug: "",
        sep: "",
        oct: "",
        nov: "",
        dec: "",
      });
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">
              Добавление новой строки
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-auto px-8 py-6">
          <Input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Введите название помещения"
            className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[20px]"
          />

          {SANITATION_MONTHS.map((month) => (
            <div key={month.key} className="space-y-2">
              <Label className="text-[18px] text-[#73738a]">{MONTH_FIELD_LABELS[month.key]}</Label>
              <Select
                value={months[month.key] || "__empty__"}
                onValueChange={(value) =>
                  patchMonth(month.key, value === "__empty__" ? "" : value)
                }
              >
                <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
                  <SelectValue placeholder="--" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">--</SelectItem>
                  {Array.from({ length: 31 }).map((_, index) => {
                    const value = String(index + 1).padStart(2, "0");
                    return (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="h-12 rounded-2xl bg-[#5563ff] px-6 text-[18px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentSettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  initial: SettingsState;
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState<SettingsState>(props.initial);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(value) => {
        if (value) setState(props.initial);
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[42px] font-semibold tracking-[-0.03em] text-black">
              Настройки документа
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-8 py-6">
          <Input
            value={state.title}
            onChange={(e) => setState({ ...state, title: e.target.value })}
            placeholder="Название документа"
            className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[20px]"
          />

          <div className="relative">
            <Input
              type="date"
              value={state.documentDate}
              onChange={(e) => setState({ ...state, documentDate: toIsoDate(e.target.value) })}
              className="h-14 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[20px]"
            />
            <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
          </div>

          <Select value={state.year} onValueChange={(value) => setState({ ...state, year: value })}>
            <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 8 }).map((_, idx) => {
                const year = String(new Date().getFullYear() - 2 + idx);
                return (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select
            value={state.approveRole}
            onValueChange={(value) => {
              const user = usersForRole(props.users, value)[0];
              setState({
                ...state,
                approveRole: value,
                approveEmployee: user?.name || state.approveEmployee,
              });
            }}
          >
            <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
              <SelectValue placeholder='Должность "Утверждаю"' />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.approveEmployee}
            onValueChange={(value) => setState({ ...state, approveEmployee: value })}
          >
            <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              {usersForRole(props.users, state.approveRole).map((user) => (
                <SelectItem key={user.id} value={user.name}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.responsibleRole}
            onValueChange={(value) => {
              const user = usersForRole(props.users, value)[0];
              setState({
                ...state,
                responsibleRole: value,
                responsibleEmployee: user?.name || state.responsibleEmployee,
              });
            }}
          >
            <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
              <SelectValue placeholder="Должность ответственного" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.responsibleEmployee}
            onValueChange={(value) => setState({ ...state, responsibleEmployee: value })}
          >
            <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              {usersForRole(props.users, state.responsibleRole).map((user) => (
                <SelectItem key={user.id} value={user.name}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit(state);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-12 rounded-2xl bg-[#5563ff] px-6 text-[18px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SanitationDayDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  users,
  config,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const normalized = normalizeSanitationDayConfig(config);
  const readOnly = status === "closed";

  const settingsState: SettingsState = {
    title,
    documentDate: normalized.documentDate,
    year: String(normalized.year),
    approveRole: normalized.approveRole,
    approveEmployee: normalized.approveEmployee,
    responsibleRole: normalized.responsibleRole,
    responsibleEmployee: normalized.responsibleEmployee,
  };

  async function patchConfig(nextConfig: SanitationDayConfig, nextTitle = title) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextConfig.documentDate,
        dateTo: nextConfig.documentDate,
        responsibleTitle: nextConfig.responsibleRole,
        config: nextConfig,
      }),
    });
    if (!response.ok) {
      window.alert("Не удалось сохранить документ");
      return;
    }
    router.refresh();
  }

  async function addRoom(roomName: string, plan: SanitationMonthValues) {
    const row = createEmptySanitationRow(roomName);
    row.plan = plan;
    const next = {
      ...normalized,
      rows: [...normalized.rows, row],
    };
    await patchConfig(next);
  }

  async function saveMonthValue(
    rowId: string,
    month: SanitationMonthKey,
    value: string,
    mode: "plan" | "fact"
  ) {
    const nextRows = normalized.rows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        [mode]: {
          ...row[mode],
          [month]: value,
        },
      };
    });
    await patchConfig({ ...normalized, rows: nextRows });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="text-[16px] text-[#6f7282]">
          {organizationName} <span className="mx-2">›</span> График и учет генеральных уборок{" "}
          <span className="mx-2">›</span> {title}
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            className="h-12 rounded-xl border-[#e8ebf7] px-5 text-[14px] text-[#5b66ff]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
            Настройки журнала
          </Button>
        )}
      </div>

      <h1 className="text-[56px] font-semibold tracking-[-0.04em] text-black">{title}</h1>

      <section className="space-y-4 rounded-[18px] border border-[#dadde9] bg-white p-8">
        <div className="grid grid-cols-[220px_1fr_220px] border border-black/70">
          <div className="flex items-center justify-center border-r border-black/70 py-10 text-[16px] font-semibold">
            {organizationName}
          </div>
          <div className="grid grid-rows-2">
            <div className="flex items-center justify-center border-b border-black/70 py-4 text-[14px]">
              СИСТЕМА ХАССП
            </div>
            <div className="flex items-center justify-center py-4 text-[14px] italic">
              ГРАФИК И УЧЕТ ГЕНЕРАЛЬНЫХ УБОРОК
            </div>
          </div>
          <div className="flex items-center justify-center border-l border-black/70 text-[14px]">
            СТР. 1 ИЗ 1
          </div>
        </div>

        <div className="ml-auto w-[420px] text-right text-[14px] leading-tight">
          <div className="font-semibold">УТВЕРЖДАЮ</div>
          <div>{normalized.approveRole}</div>
          <div>{normalized.approveEmployee}</div>
          <div>{toViewDateLabel(normalized.documentDate)}</div>
        </div>

        <div className="py-4 text-center text-[24px] font-semibold">
          График и учет генеральных уборок на предприятии в {normalized.year} г.
        </div>

        {!readOnly && (
          <div>
            <Button
              className="h-14 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-5" />
              Добавить помещение
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[14px]">
            <thead>
              <tr>
                <th rowSpan={2} className="w-14 border border-black/70 px-2 py-2">
                  <Checkbox />
                </th>
                <th rowSpan={2} className="w-[460px] border border-black/70 px-3 py-2">
                  Помещение
                </th>
                <th rowSpan={2} className="w-[240px] border border-black/70 px-3 py-2" />
                <th colSpan={12} className="border border-black/70 px-3 py-2">
                  График
                </th>
              </tr>
              <tr>
                {SANITATION_MONTHS.map((month) => (
                  <th key={month.key} className="w-[95px] border border-black/70 px-2 py-2">
                    {month.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.rows.map((row) => (
                <Fragment key={row.id}>
                  <tr key={`${row.id}-plan`}>
                    <td rowSpan={2} className="border border-black/70 px-2 py-2 align-top">
                      <Checkbox />
                    </td>
                    <td rowSpan={2} className="border border-black/70 px-3 py-2 align-top">
                      {row.roomName}
                    </td>
                    <td className="border border-black/70 px-3 py-2 text-center">План</td>
                    {SANITATION_MONTHS.map((month) => (
                      <td key={`${row.id}-plan-${month.key}`} className="border border-black/70 px-2 py-1 text-center">
                        {readOnly ? (
                          row.plan[month.key] || ""
                        ) : (
                          <Input
                            defaultValue={row.plan[month.key] || ""}
                            onBlur={(e) => {
                              const next = e.target.value;
                              if (next === (row.plan[month.key] || "")) return;
                              void saveMonthValue(row.id, month.key, next, "plan");
                            }}
                            className="h-10 rounded-lg border-0 bg-transparent px-1 text-center text-[14px]"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr key={`${row.id}-fact`}>
                    <td className="border border-black/70 px-3 py-2 text-center">Факт</td>
                    {SANITATION_MONTHS.map((month) => (
                      <td key={`${row.id}-fact-${month.key}`} className="border border-black/70 px-2 py-1 text-center">
                        {readOnly ? (
                          row.fact[month.key] || ""
                        ) : (
                          <Input
                            defaultValue={row.fact[month.key] || ""}
                            onBlur={(e) => {
                              const next = e.target.value;
                              if (next === (row.fact[month.key] || "")) return;
                              void saveMonthValue(row.id, month.key, next, "fact");
                            }}
                            className="h-10 rounded-lg border-0 bg-transparent px-1 text-center text-[14px]"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              ))}
              <tr>
                <td className="border border-black/70 px-2 py-2">
                  <Checkbox />
                </td>
                <td colSpan={2} className="border border-black/70 px-3 py-2">
                  Ответственный: {getSanitationApproveLabel(normalized.responsibleRole, normalized.responsibleEmployee)}
                </td>
                {SANITATION_MONTHS.map((month) => (
                  <td key={`footer-${month.key}`} className="border border-black/70 px-2 py-2" />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <AddRoomDialog open={addOpen} onOpenChange={setAddOpen} onCreate={addRoom} />

      <DocumentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={users}
        initial={settingsState}
        onSubmit={async (value) => {
          const next = normalizeSanitationDayConfig({
            ...normalized,
            year: Number(value.year),
            documentDate: value.documentDate,
            approveRole: value.approveRole,
            approveEmployee: value.approveEmployee,
            responsibleRole: value.responsibleRole,
            responsibleEmployee: value.responsibleEmployee,
          });
          await patchConfig(next, value.title.trim() || title);
        }}
      />
    </div>
  );
}
