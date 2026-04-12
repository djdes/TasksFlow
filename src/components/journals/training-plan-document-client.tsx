"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Printer, Settings2, X } from "lucide-react";
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
import { getDistinctRoleLabels, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import {
  createEmptyTrainingRow,
  createTrainingTopic,
  normalizeTrainingPlanConfig,
  type TrainingPlanConfig,
} from "@/lib/training-plan-document";

import { toast } from "sonner";
type UserItem = { id: string; name: string; role: string };

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
};

const MONTH_OPTIONS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function roleOptionsFromUsers(users: UserItem[]) {
  return getDistinctRoleLabels(users);
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return getUsersForRoleLabel(users, roleLabel);
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

function AddPositionDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  onCreate: (name: string) => Promise<void>;
}) {
  const [position, setPosition] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const uniqueRoles = useMemo(() => {
    const labels = props.users.map((user) => getUserRoleLabel(user.role));
    return [...new Set(labels)];
  }, [props.users]);

  async function submit() {
    if (!position.trim()) {
      toast.error("Выберите должность");
      return;
    }

    setSubmitting(true);
    try {
      await props.onCreate(position.trim());
      setPosition("");
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[660px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">
              Добавление новой должности
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Должность</Label>
            <Select value={position || "__empty__"} onValueChange={(value) => setPosition(value === "__empty__" ? "" : value)}>
              <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {uniqueRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

function AddTopicDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [topicName, setTopicName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!topicName.trim()) {
      toast.error("Введите тему обучения");
      return;
    }

    setSubmitting(true);
    try {
      await props.onCreate(topicName.trim());
      setTopicName("");
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[660px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">
              Добавление новой темы
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <Input
            value={topicName}
            onChange={(event) => setTopicName(event.target.value)}
            placeholder="Тема обучения"
            className="h-14 rounded-2xl border-[#5b66ff] px-4 text-[20px]"
          />
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
            <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">
              Настройки документа
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState({ ...state, title: event.target.value })}
              className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[20px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Дата документа</Label>
            <div className="relative">
              <Input
                type="date"
                value={state.documentDate}
                onChange={(event) => setState({ ...state, documentDate: toIsoDate(event.target.value) })}
                className="h-14 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[20px]"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Год</Label>
            <Select value={state.year} onValueChange={(value) => setState({ ...state, year: value })}>
              <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 8 }).map((_, index) => {
                  const year = String(new Date().getFullYear() - 2 + index);
                  return (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Должность &quot;Утверждаю&quot;</Label>
            <Select
              value={state.approveRole}
              onValueChange={(value) => {
                const user = usersForRole(props.users, value)[0];
                setState({
                  ...state,
                  approveRole: value,
                  approveEmployeeId: user?.id || "",
                  approveEmployee: user?.name || state.approveEmployee,
                });
              }}
            >
              <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={state.approveEmployeeId || "__empty__"}
              onValueChange={(value) => {
                if (value === "__empty__") {
                  setState({ ...state, approveEmployeeId: "", approveEmployee: "" });
                  return;
                }
                const user = props.users.find((item) => item.id === value);
                setState({
                  ...state,
                  approveEmployeeId: value,
                  approveEmployee: user?.name || "",
                  approveRole: user ? getUserRoleLabel(user.role) : state.approveRole,
                });
              }}
            >
              <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[20px]">
                <SelectValue placeholder="- Выберите значение -" />
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
          </div>
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

export function TrainingPlanDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  users,
  config,
}: Props) {
  const router = useRouter();
  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const normalized = normalizeTrainingPlanConfig(config);
  const readOnly = status === "closed";

  const settingsState: SettingsState = {
    title,
    documentDate: normalized.documentDate,
    year: String(normalized.year),
    approveRole: normalized.approveRole,
    approveEmployeeId: normalized.approveEmployeeId || "",
    approveEmployee: normalized.approveEmployee,
  };

  async function patchConfig(nextConfig: TrainingPlanConfig, nextTitle = title) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextConfig.documentDate,
        dateTo: nextConfig.documentDate,
        config: nextConfig,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить документ");
      return;
    }

    router.refresh();
  }

  async function addPosition(name: string) {
    const topicIds = normalized.topics.map((topic) => topic.id);
    const row = createEmptyTrainingRow(name, topicIds);
    await patchConfig({ ...normalized, rows: [...normalized.rows, row] });
  }

  async function addTopic(name: string) {
    const topic = createTrainingTopic(name);
    const topics = [...normalized.topics, topic];
    const rows = normalized.rows.map((row) => ({
      ...row,
      cells: { ...row.cells, [topic.id]: { required: false, date: "" } },
    }));
    await patchConfig({ ...normalized, topics, rows });
  }

  async function toggleCell(rowId: string, topicId: string, checked: boolean) {
    const nextRows = normalized.rows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        cells: {
          ...row.cells,
          [topicId]: {
            ...row.cells[topicId],
            required: checked,
            date: checked ? row.cells[topicId]?.date || `01.${String(normalized.year).slice(-2)}` : "",
          },
        },
      };
    });
    await patchConfig({ ...normalized, rows: nextRows });
  }

  async function setCellDate(rowId: string, topicId: string, date: string) {
    const nextRows = normalized.rows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        cells: {
          ...row.cells,
          [topicId]: { ...row.cells[topicId], date },
        },
      };
    });
    await patchConfig({ ...normalized, rows: nextRows });
  }

  async function deleteSelectedRows() {
    if (selectedRowIds.length === 0) return;
    if (!window.confirm(`Удалить выбранные строки (${selectedRowIds.length})?`)) return;
    const nextRows = normalized.rows.filter((row) => !selectedRowIds.includes(row.id));
    setSelectedRowIds([]);
    await patchConfig({ ...normalized, rows: nextRows });
  }

  const allSelected = normalized.rows.length > 0 && selectedRowIds.length === normalized.rows.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-[16px] text-[#6f7282]">
          {organizationName} <span className="mx-2">›</span> План обучения персонала{" "}
          <span className="mx-2">›</span> {title}
        </div>
        <div className="flex items-center gap-3 self-start lg:self-auto">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl border-[#e8ebf7] px-4 text-[#5b66ff] hover:bg-[#f6f7ff]"
            onClick={() => window.open(`/api/journal-documents/${documentId}/pdf`, "_blank", "noopener,noreferrer")}
          >
            <Printer className="size-5" />
          </Button>
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
      </div>

      <h1 className="text-[56px] font-semibold tracking-[-0.04em] text-black">{title}</h1>

      {selectedRowIds.length > 0 && !readOnly && (
        <div className="flex items-center gap-4 rounded-2xl bg-[#f3f4fe] px-6 py-3">
          <button
            type="button"
            className="flex items-center gap-1 text-[16px] text-[#5b66ff]"
            onClick={() => setSelectedRowIds([])}
          >
            <X className="size-4" /> Выбрано: {selectedRowIds.length}
          </button>
          <button type="button" className="flex items-center gap-1 text-[16px] text-[#ff3b30]" onClick={deleteSelectedRows}>
            Удалить
          </button>
        </div>
      )}

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
              ПЛАН ОБУЧЕНИЯ ПЕРСОНАЛА
            </div>
          </div>
          <div className="flex items-center justify-center border-l border-black/70 text-[14px]">СТР. 1 ИЗ 1</div>
        </div>

        <div className="ml-auto flex w-[420px] flex-col items-end gap-1 text-right text-[14px] leading-tight">
          <div className="font-semibold">УТВЕРЖДАЮ</div>
          <div>{normalized.approveRole}</div>
          <div>{normalized.approveEmployee}</div>
          <div className="mt-1 h-px w-[230px] bg-black" />
          <div>{toViewDateLabel(normalized.documentDate)}</div>
        </div>

        <div className="py-4 text-center text-[24px] font-semibold">
          ПЛАН ОБУЧЕНИЯ ПЕРСОНАЛА НА {normalized.year} Г.
        </div>

        {!readOnly && (
          <div className="grid gap-4 md:grid-cols-2">
            <Button
              className="h-14 w-full rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setAddPositionOpen(true)}
            >
              <Plus className="size-5" /> Добавить должность
            </Button>
            <Button
              className="h-14 w-full rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setAddTopicOpen(true)}
            >
              <Plus className="size-5" /> Добавить тему обучения
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[14px]">
            <thead>
              <tr>
                <th rowSpan={2} className="w-14 border border-black/70 px-2 py-2">
                  {!readOnly && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds(checked === true ? normalized.rows.map((row) => row.id) : [])
                      }
                    />
                  )}
                </th>
                <th rowSpan={2} className="w-[60px] border border-black/70 px-2 py-2">
                  № п/п
                </th>
                <th rowSpan={2} className="w-[200px] border border-black/70 px-3 py-2">
                  Должностная единица, подлежащая обучению
                </th>
                <th colSpan={normalized.topics.length} className="border border-black/70 px-3 py-2">
                  Требуется обучение по теме:
                </th>
              </tr>
              <tr>
                {normalized.topics.map((topic) => (
                  <th key={topic.id} className="min-w-[140px] border border-black/70 px-2 py-2 text-center">
                    {topic.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {!readOnly && (
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
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">{index + 1}</td>
                  <td className="border border-black/70 px-3 py-2 text-center">{row.positionName}</td>
                  {normalized.topics.map((topic) => {
                    const cell = row.cells[topic.id] || { required: false, date: "" };
                    return (
                      <td key={topic.id} className="border border-black/70 px-2 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {readOnly ? (
                            cell.required ? (
                              <>
                                <Checkbox checked disabled />
                                {cell.date && <span className="text-[12px] text-[#5b66ff]">{cell.date}</span>}
                              </>
                            ) : (
                              <Checkbox checked={false} disabled />
                            )
                          ) : (
                            <>
                              <Checkbox
                                checked={cell.required}
                                onCheckedChange={(checked) => void toggleCell(row.id, topic.id, checked === true)}
                              />
                              {cell.required && (
                                <select
                                  className="w-[128px] border-b border-dashed border-[#5b66ff] bg-transparent text-center text-[12px] text-[#5b66ff] outline-none"
                                  value={cell.date ? cell.date.split(".")[0] : ""}
                                  onChange={(event) => {
                                    const month = event.target.value;
                                    const yy = String(normalized.year).slice(2);
                                    void setCellDate(row.id, topic.id, month ? `${month}.${yy}` : "");
                                  }}
                                >
                                  <option value=""></option>
                                  {MONTH_OPTIONS.map((label, monthIndex) => {
                                    const month = String(monthIndex + 1).padStart(2, "0");
                                    return (
                                      <option key={month} value={month}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="border border-black/70 px-2 py-2">{!readOnly && <Checkbox disabled />}</td>
                <td colSpan={2 + normalized.topics.length} className="border border-black/70 px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <AddPositionDialog
        open={addPositionOpen}
        onOpenChange={setAddPositionOpen}
        users={users}
        onCreate={addPosition}
      />
      <AddTopicDialog open={addTopicOpen} onOpenChange={setAddTopicOpen} onCreate={addTopic} />
      <DocumentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={users}
        initial={settingsState}
        onSubmit={async (value) => {
          const nextConfig = normalizeTrainingPlanConfig({
            ...normalized,
            year: Number(value.year),
            documentDate: value.documentDate,
            approveRole: value.approveRole,
            approveEmployeeId: value.approveEmployeeId || null,
            approveEmployee: value.approveEmployee,
          });
          await patchConfig(nextConfig, value.title.trim() || title);
        }}
      />
    </div>
  );
}
