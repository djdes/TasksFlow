"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Pencil,
  Plus,
  Printer,
  Settings2,
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
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import {
  getDistinctRoleLabels,
  getUserRoleLabel,
  getUsersForRoleLabel,
} from "@/lib/user-roles";
import {
  SANITATION_MONTHS,
  createEmptySanitationRow,
  getSanitationApproveLabel,
  normalizeSanitationDayConfig,
  type SanitationDayConfig,
  type SanitationMonthKey,
} from "@/lib/sanitation-day-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";

import { toast } from "sonner";
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
  approveEmployeeId: string;
  approveEmployee: string;
  responsibleRole: string;
  responsibleEmployeeId: string;
  responsibleEmployee: string;
};

type RoomDialogState = {
  id: string | null;
  name: string;
  plan: Record<SanitationMonthKey, string>;
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
  return getDistinctRoleLabels(users);
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return getUsersForRoleLabel(users, roleLabel);
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toViewDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `« ${day} » ${new Date(`${year}-${month}-01`).toLocaleDateString(
    "ru-RU",
    {
      month: "long",
    },
  )} ${year} г.`;
}

function displayMonthValue(value: string) {
  return value.trim() || "-";
}

function RoomDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  submitText: string;
  initial: RoomDialogState;
  includePlanFields: boolean;
  onSubmit: (value: RoomDialogState) => Promise<void>;
}) {
  const [state, setState] = useState<RoomDialogState>(props.initial);
  const [submitting, setSubmitting] = useState(false);

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
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.title}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">
              Название помещения
            </Label>
            <Input
              value={state.name}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Введите название помещения"
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>

          {props.includePlanFields ? (
            <>
              {SANITATION_MONTHS.map((month) => (
                <div key={month.key} className="space-y-2">
                  <Label className="text-[14px] text-[#73738a]">
                    {MONTH_FIELD_LABELS[month.key]}
                  </Label>
                  <Select
                    value={state.plan[month.key] || "__empty__"}
                    onValueChange={(value) =>
                      setState((current) => ({
                        ...current,
                        plan: {
                          ...current.plan,
                          [month.key]: value === "__empty__" ? "" : value,
                        },
                      }))
                    }
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
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
                      <SelectItem value="-">-</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                if (!state.name.trim()) {
                  toast.error("Введите название помещения");
                  return;
                }
                setSubmitting(true);
                try {
                  await props.onSubmit({ ...state, name: state.name.trim() });
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-12 rounded-2xl bg-[#5563ff] px-6 text-[18px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Сохранение..." : props.submitText}
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
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-8 py-6">
          <Input
            value={state.title}
            onChange={(event) =>
              setState((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Название документа"
            className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
          />

          <div className="relative">
            <Input
              type="date"
              value={state.documentDate}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  documentDate: toIsoDate(event.target.value),
                }))
              }
              className="h-11 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[20px]"
            />
            <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
          </div>

          <Select
            value={state.year}
            onValueChange={(value) =>
              setState((current) => ({ ...current, year: value }))
            }
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
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
              setState((current) => ({
                ...current,
                approveRole: value,
                approveEmployeeId: user?.id || "",
                approveEmployee: user?.name || current.approveEmployee,
              }));
            }}
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
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
            value={state.approveEmployeeId || "__empty__"}
            onValueChange={(value) => {
              if (value === "__empty__") {
                setState((current) => ({
                  ...current,
                  approveEmployeeId: "",
                  approveEmployee: "",
                }));
                return;
              }
              const user = props.users.find((item) => item.id === value);
              setState((current) => ({
                ...current,
                approveEmployeeId: value,
                approveEmployee: user?.name || "",
                approveRole: user
                  ? getUserRoleLabel(user.role)
                  : current.approveRole,
              }));
            }}
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">- Выберите значение -</SelectItem>
              {usersForRole(props.users, state.approveRole).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {buildStaffOptionLabel(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={state.responsibleRole}
            onValueChange={(value) => {
              const user = usersForRole(props.users, value)[0];
              setState((current) => ({
                ...current,
                responsibleRole: value,
                responsibleEmployeeId: user?.id || "",
                responsibleEmployee: user?.name || current.responsibleEmployee,
              }));
            }}
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
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
            value={state.responsibleEmployeeId || "__empty__"}
            onValueChange={(value) => {
              if (value === "__empty__") {
                setState((current) => ({
                  ...current,
                  responsibleEmployeeId: "",
                  responsibleEmployee: "",
                }));
                return;
              }
              const user = props.users.find((item) => item.id === value);
              setState((current) => ({
                ...current,
                responsibleEmployeeId: value,
                responsibleEmployee: user?.name || "",
                responsibleRole: user
                  ? getUserRoleLabel(user.role)
                  : current.responsibleRole,
              }));
            }}
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">- Выберите значение -</SelectItem>
              {usersForRole(props.users, state.responsibleRole).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {buildStaffOptionLabel(user)}
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

function DeleteRowsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  count: number;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.count > 1
                ? `Удаление ${props.count} строк`
                : "Удаление строки"}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex justify-end px-8 py-6">
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await props.onConfirm();
                props.onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-12 rounded-2xl bg-[#5563ff] px-6 text-[18px] text-white hover:bg-[#4554ff]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
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
  const pathname = usePathname();
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [roomDialogState, setRoomDialogState] = useState<RoomDialogState>({
    id: null,
    name: "",
    plan: {
      jan: "-",
      feb: "-",
      mar: "-",
      apr: "-",
      may: "-",
      jun: "-",
      jul: "-",
      aug: "-",
      sep: "-",
      oct: "-",
      nov: "-",
      dec: "-",
    },
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const normalized = normalizeSanitationDayConfig(config);
  const readOnly = status === "closed";

  const allSelected =
    normalized.rows.length > 0 &&
    selectedRowIds.length === normalized.rows.length;
  const selectedRows = normalized.rows.filter((row) =>
    selectedRowIds.includes(row.id),
  );
  const journalHref = pathname
    ? pathname.split("/documents/")[0]
    : "/journals/general_cleaning";

  const settingsState: SettingsState = {
    title,
    documentDate: normalized.documentDate,
    year: String(normalized.year),
    approveRole: normalized.approveRole,
    approveEmployeeId: normalized.approveEmployeeId || "",
    approveEmployee: normalized.approveEmployee,
    responsibleRole: normalized.responsibleRole,
    responsibleEmployeeId: normalized.responsibleEmployeeId || "",
    responsibleEmployee: normalized.responsibleEmployee,
  };

  async function patchConfig(
    nextConfig: SanitationDayConfig,
    nextTitle = title,
  ) {
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
      toast.error("Не удалось сохранить документ");
      return;
    }

    setSelectedRowIds([]);
    router.refresh();
  }

  async function saveMonthValue(
    rowId: string,
    month: SanitationMonthKey,
    value: string,
    mode: "plan" | "fact",
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

  async function saveRoomDialog(value: RoomDialogState) {
    if (!value.id) {
      const nextRow = createEmptySanitationRow(value.name);
      nextRow.plan = value.plan;
      await patchConfig({
        ...normalized,
        rows: [...normalized.rows, nextRow],
      });
      return;
    }

    await patchConfig({
      ...normalized,
      rows: normalized.rows.map((row) =>
        row.id === value.id ? { ...row, roomName: value.name } : row,
      ),
    });
  }

  async function deleteSelectedRows() {
    const rowIdSet = new Set(selectedRowIds);
    await patchConfig({
      ...normalized,
      rows: normalized.rows.filter((row) => !rowIdSet.has(row.id)),
    });
  }

  return (
    <div className="space-y-8">
      <DocumentBackLink href={journalHref} documentId={documentId} />
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div />
        <div className="flex items-center gap-3">
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            >
              <Settings2 className="size-4" />
              Настройки журнала
            </Button>
          )}
        </div>
      </div>

      <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black print:hidden">
        {title}
      </h1>

      <section className="space-y-6 rounded-[18px] border border-[#dadde9] bg-white p-8 print:border-0 print:p-0">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[18%] border border-black p-3 text-center text-[26px] font-semibold"
              >
                {organizationName}
              </td>
              <td className="border border-black p-2 text-center text-[22px]">
                СИСТЕМА ХАССП
              </td>
              <td className="w-[22%] border border-black p-2 text-center text-[20px]">
                СТР. 1 ИЗ 1
              </td>
            </tr>
            <tr>
              <td
                colSpan={2}
                className="border border-black p-2 text-center text-[18px] italic uppercase"
              >
                ГРАФИК И УЧЕТ ГЕНЕРАЛЬНЫХ УБОРОК
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-[320px] pr-2 text-right text-[12px] leading-snug">
            <div className="font-semibold">УТВЕРЖДАЮ</div>
            <div>{normalized.approveRole}</div>
            <div className="border-b border-black pb-1">
              {normalized.approveEmployee}
            </div>
            <div className="pt-1">
              {toViewDateLabel(normalized.documentDate)}
            </div>
          </div>
        </div>

        <h2 className="text-center text-[28px] font-semibold">
          График и учет генеральных уборок на предприятии в {normalized.year} г.
        </h2>

        {!readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button
              type="button"
              onClick={() => {
                setRoomDialogState({
                  id: null,
                  name: "",
                  plan: {
                    jan: "-",
                    feb: "-",
                    mar: "-",
                    apr: "-",
                    may: "-",
                    jun: "-",
                    jul: "-",
                    aug: "-",
                    sep: "-",
                    oct: "-",
                    nov: "-",
                    dec: "-",
                  },
                });
                setRoomDialogOpen(true);
              }}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4d58f5]"
            >
              <Plus className="size-5" />
              Добавить помещение
            </Button>

            {selectedRowIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedRowIds.length !== 1}
                  onClick={() => {
                    const target = selectedRows[0];
                    if (!target) return;
                    setRoomDialogState({
                      id: target.id,
                      name: target.roomName,
                      plan: { ...target.plan },
                    });
                    setRoomDialogOpen(true);
                  }}
                  className="rounded-2xl border-[#e9ecf6] px-5 py-3 text-[18px] text-[#5b66ff]"
                >
                  <Pencil className="size-5" />
                  Редактировать
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteOpen(true)}
                  className="rounded-2xl border-[#ffd8d4] px-5 py-3 text-[18px] text-[#ff6b5f] hover:bg-[#fff5f4]"
                >
                  <Trash2 className="size-5" />
                  Удалить
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-black bg-white text-[14px]">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="w-[54px] border border-black px-2 py-2"
                >
                  {!readOnly ? (
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) =>
                          setSelectedRowIds(
                            checked ? normalized.rows.map((row) => row.id) : [],
                          )
                        }
                      />
                    </div>
                  ) : null}
                </th>
                <th
                  rowSpan={2}
                  className="w-[360px] border border-black px-3 py-2"
                >
                  Помещение
                </th>
                <th
                  rowSpan={2}
                  className="w-[160px] border border-black px-3 py-2"
                >
                  Вид
                </th>
                <th colSpan={12} className="border border-black px-3 py-2">
                  График
                </th>
              </tr>
              <tr>
                {SANITATION_MONTHS.map((month) => (
                  <th
                    key={month.key}
                    className="w-[90px] border border-black px-2 py-2"
                  >
                    {month.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.rows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td
                      rowSpan={2}
                      className="border border-black px-2 py-2 align-middle"
                    >
                      {!readOnly ? (
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={selectedRowIds.includes(row.id)}
                            onCheckedChange={(checked) =>
                              setSelectedRowIds((current) =>
                                checked
                                  ? [...new Set([...current, row.id])]
                                  : current.filter((id) => id !== row.id),
                              )
                            }
                          />
                        </div>
                      ) : null}
                    </td>
                    <td
                      rowSpan={2}
                      className="border border-black px-3 py-2 text-center align-middle"
                    >
                      {row.roomName}
                    </td>
                    <td className="border border-black px-3 py-2 text-center">
                      План
                    </td>
                    {SANITATION_MONTHS.map((month) => (
                      <td
                        key={`${row.id}-plan-${month.key}`}
                        className="border border-black px-2 py-1 text-center"
                      >
                        {readOnly ? (
                          displayMonthValue(row.plan[month.key])
                        ) : (
                          <Input
                            defaultValue={row.plan[month.key] || ""}
                            aria-label={`${MONTH_FIELD_LABELS[month.key]} план`}
                            onBlur={(event) => {
                              const next = event.target.value;
                              if (next === (row.plan[month.key] || "")) return;
                              void saveMonthValue(
                                row.id,
                                month.key,
                                next,
                                "plan",
                              );
                            }}
                            className="h-10 rounded-lg border-0 bg-transparent px-1 text-center text-[14px]"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-black px-3 py-2 text-center">
                      Факт
                    </td>
                    {SANITATION_MONTHS.map((month) => (
                      <td
                        key={`${row.id}-fact-${month.key}`}
                        className="border border-black px-2 py-1 text-center"
                      >
                        {readOnly ? (
                          displayMonthValue(row.fact[month.key])
                        ) : (
                          <Input
                            defaultValue={row.fact[month.key] || ""}
                            aria-label={`${MONTH_FIELD_LABELS[month.key]} факт`}
                            onBlur={(event) => {
                              const next = event.target.value;
                              if (next === (row.fact[month.key] || "")) return;
                              void saveMonthValue(
                                row.id,
                                month.key,
                                next,
                                "fact",
                              );
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
                <td
                  colSpan={3}
                  className="border border-black px-3 py-2 text-center"
                >
                  Ответственный:{" "}
                  {getSanitationApproveLabel(
                    normalized.responsibleRole,
                    normalized.responsibleEmployee,
                  )}
                </td>
                <td
                  colSpan={12}
                  className="border border-black px-3 py-2 text-center text-[#4b5565]"
                >
                  Отметки по месяцам указаны в таблице выше.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <RoomDialog
        open={roomDialogOpen}
        onOpenChange={setRoomDialogOpen}
        initial={roomDialogState}
        title={
          roomDialogState.id
            ? "Редактирование строки"
            : "Добавление новой строки"
        }
        submitText={roomDialogState.id ? "Сохранить" : "Создать"}
        includePlanFields={!roomDialogState.id}
        onSubmit={saveRoomDialog}
      />

      <DeleteRowsDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        count={selectedRowIds.length}
        onConfirm={deleteSelectedRows}
      />

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
            approveEmployeeId: value.approveEmployeeId || null,
            approveEmployee: value.approveEmployee,
            responsibleRole: value.responsibleRole,
            responsibleEmployeeId: value.responsibleEmployeeId || null,
            responsibleEmployee: value.responsibleEmployee,
          });
          await patchConfig(next, value.title.trim() || title);
        }}
      />
    </div>
  );
}
