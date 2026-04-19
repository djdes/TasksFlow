"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { DocumentPageHeader } from "@/components/journals/document-page-header";
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
import { USER_ROLE_LABEL_VALUES, getUsersForRoleLabel } from "@/lib/user-roles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createIntensiveCoolingRow,
  formatIntensiveCoolingDate,
  formatIntensiveCoolingDateTime,
  formatTemperatureLabel,
  getResponsibleTitleByRole,
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_DOCUMENT_TITLE,
  normalizeIntensiveCoolingConfig,
  type IntensiveCoolingConfig,
  type IntensiveCoolingRow,
} from "@/lib/intensive-cooling-document";

import { toast } from "sonner";
import { PositionSelectItems } from "@/components/shared/position-select";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  routeCode: string;
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  config: unknown;
  users: UserItem[];
};

function hourOptions() {
  return Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
}

function minuteOptions() {
  return Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
}

function getResponsibleLabel(row: IntensiveCoolingRow, users: UserItem[]) {
  const employee = users.find((item) => item.id === row.responsibleUserId);
  const name = employee?.name || "";
  const title = row.responsibleTitle || getResponsibleTitleByRole(employee?.role);
  if (!title && !name) return "—";
  return [title, name].filter(Boolean).join(", ");
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialRow: IntensiveCoolingRow | null;
  config: IntensiveCoolingConfig;
  users: UserItem[];
  onSave: (row: IntensiveCoolingRow) => Promise<void>;
}) {
  const [row, setRow] = useState<IntensiveCoolingRow>(() => createIntensiveCoolingRow());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    const fallbackUser =
      props.users.find((user) => user.id === props.config.defaultResponsibleUserId) ||
      props.users[0] ||
      null;
    setRow(
      props.initialRow ||
        createIntensiveCoolingRow({
          responsibleUserId: fallbackUser?.id || "",
          responsibleTitle:
            props.config.defaultResponsibleTitle ||
            getResponsibleTitleByRole(fallbackUser?.role),
        })
    );
  }, [props.config, props.initialRow, props.open, props.users]);

  function setValue<K extends keyof IntensiveCoolingRow>(
    key: K,
    value: IntensiveCoolingRow[K]
  ) {
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
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[620px]">
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
            <legend className="px-1 text-base font-medium">
              Дата и время изготовления блюда
            </legend>
            <div className="relative">
              <Input
                type="date"
                value={row.productionDate}
                onChange={(event) => setValue("productionDate", event.target.value)}
                className="h-11 rounded-2xl border-[#d7dbea] pr-12"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#6e7387]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                value={row.productionHour}
                onValueChange={(value) => setValue("productionHour", value)}
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
                value={row.productionMinute}
                onValueChange={(value) => setValue("productionMinute", value)}
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
            list="intensive-cooling-dishes"
            value={row.dishName}
            onChange={(event) => setValue("dishName", event.target.value)}
            className="h-11 rounded-2xl border-[#d7dbea]"
            placeholder="Введите наименование блюда"
          />
          <datalist id="intensive-cooling-dishes">
            {props.config.dishSuggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>

          <Input
            value={row.startTemperature}
            onChange={(event) => setValue("startTemperature", event.target.value)}
            className="h-11 rounded-2xl border-[#d7dbea]"
            placeholder="Введите температуру в начале процесса охлаждения, °C"
          />

          <Input
            value={row.endTemperature}
            onChange={(event) => setValue("endTemperature", event.target.value)}
            className="h-11 rounded-2xl border-[#d7dbea]"
            placeholder="Введите температуру через 1 час, °C"
          />

          <Textarea
            value={row.correctiveAction}
            onChange={(event) => setValue("correctiveAction", event.target.value)}
            className="min-h-32 rounded-2xl border-[#d7dbea]"
            placeholder="Корректирующие действия"
          />

          <Textarea
            value={row.comment}
            onChange={(event) => setValue("comment", event.target.value)}
            className="min-h-32 rounded-2xl border-[#d7dbea]"
            placeholder="Комментарий"
          />

          <div className="space-y-2">
            <Label className="text-base text-[#6e7387]">
              Лицо, проводившее контроль
            </Label>
            <Select
              value={row.responsibleTitle || "__empty__"}
              onValueChange={(value) => {
                const nextTitle = value === "__empty__" ? "" : value;
                setRow((current) => {
                  const candidates = nextTitle ? getUsersForRoleLabel(props.users, nextTitle) : props.users;
                  const stillValid = !current.responsibleUserId || candidates.some((u) => u.id === current.responsibleUserId);
                  return {
                    ...current,
                    responsibleTitle: nextTitle,
                    responsibleUserId: stillValid ? current.responsibleUserId : "",
                  };
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                <SelectValue placeholder="Лицо, проводившее контроль" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                <PositionSelectItems users={props.users} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-base text-[#6e7387]">Сотрудник</Label>
            <Select
              value={row.responsibleUserId || "__empty__"}
              onValueChange={(value) => {
                if (value === "__empty__") {
                  setValue("responsibleUserId", "");
                  return;
                }
                const user = props.users.find((item) => item.id === value);
                setRow((current) => ({
                  ...current,
                  responsibleUserId: value,
                  responsibleTitle:
                    current.responsibleTitle || getResponsibleTitleByRole(user?.role),
                }));
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#d7dbea]">
                <SelectValue placeholder="Сотрудник" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {(row.responsibleTitle ? getUsersForRoleLabel(props.users, row.responsibleTitle) : props.users).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              Настройки документа
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
            <div className="relative">
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-11 rounded-2xl border-[#d7dbea] pr-12"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#6e7387]" />
            </div>
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
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await props.onConfirm();
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
        <div className="flex justify-end px-8 py-6">
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="h-11 rounded-2xl bg-[#5563ff] px-8 text-[15px] text-white hover:bg-[#4452ee]"
          >
            {submitting ? "Завершение..." : "Закончить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IntensiveCoolingDocumentClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [config, setConfig] = useState(() =>
    normalizeIntensiveCoolingConfig(props.config, props.users)
  );
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<IntensiveCoolingRow | null>(null);

  const rows = useMemo(() => config.rows, [config.rows]);
  const isActive = props.status === "active";
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  async function persist(
    nextTitle: string,
    nextDateFrom: string,
    nextConfig: IntensiveCoolingConfig,
    nextStatus?: "active" | "closed"
  ) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextDateFrom,
        dateTo: nextDateFrom,
        status: nextStatus,
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

  async function handleSaveRow(row: IntensiveCoolingRow) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];
    await persist(title, dateFrom, { ...config, rows: nextRows });
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const nextConfig = {
      ...config,
      rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
    };
    await persist(title, dateFrom, nextConfig);
    setSelectedRowIds([]);
  }

  async function handleSaveSettings(payload: { title: string; dateFrom: string }) {
    await persist(
      payload.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
      payload.dateFrom,
      config
    );
  }

  async function handleFinish() {
    await persist(
      title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
      dateFrom,
      { ...config, finishedAt: new Date().toISOString() },
      "closed"
    );
    router.push(`/journals/${props.routeCode}?tab=closed`);
  }

  return (
    <div className="bg-white text-black">
      {selectedRowIds.length > 0 ? (
        <div className="border-b border-[#eef1f7] bg-white">
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

      <div className="mx-auto max-w-[1860px] space-y-8 px-6 py-6">
        <DocumentPageHeader
          backHref={`/journals/${props.routeCode}`}
          documentId={props.documentId}
          rightActions={
            isActive ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="size-4" />
                Настройки журнала
              </Button>
            ) : null
          }
        />

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em]">
            {title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
          </h1>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="mx-auto min-w-[1180px] border-collapse text-[16px]">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="min-w-[190px] border border-black px-6 py-6 text-center text-[20px] font-semibold"
                >
                  {props.organizationName || 'ООО "Тест"'}
                </td>
                <td className="min-w-[760px] border border-black px-6 py-5 text-center">
                  СИСТЕМА ХАССП
                </td>
                <td
                  rowSpan={2}
                  className="min-w-[250px] border border-black px-4 py-3 align-top text-[18px]"
                >
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>Начат</span>
                    <span>{formatIntensiveCoolingDate(dateFrom)}</span>
                  </div>
                  <div className="mt-3 flex justify-between gap-3 font-semibold">
                    <span>Окончен</span>
                    <span>{props.status === "closed" ? "__________" : "__________"}</span>
                  </div>
                  <div className="mt-6 text-right">СТР. 1 ИЗ 1</div>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-6 py-5 text-center italic">
                  {INTENSIVE_COOLING_DOCUMENT_TITLE.toUpperCase()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-center text-[26px] font-semibold">
          {INTENSIVE_COOLING_DOCUMENT_TITLE.toUpperCase()}
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
          <table className="w-full min-w-[1650px] border-collapse text-[14px]">
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
                <th className="w-[170px] border border-black p-2 text-center">
                  Дата и время изготовления блюда
                </th>
                <th className="w-[180px] border border-black p-2 text-center">
                  Наименование блюда
                </th>
                <th className="w-[170px] border border-black p-2 text-center">
                  Температура в начале процесса охлаждения
                </th>
                <th className="w-[150px] border border-black p-2 text-center">
                  Температура через 1 час
                </th>
                <th className="w-[410px] border border-black p-2 text-center">
                  Корректирующие действия
                </th>
                <th className="w-[170px] border border-black p-2 text-center">
                  Комментарий
                </th>
                <th className="w-[260px] border border-black p-2 text-center">
                  Лицо, проводившее контроль интенсивного охлаждения
                  <br />
                  (должность, ФИО)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={isActive ? "cursor-pointer hover:bg-[#fafbff]" : ""}
                  onClick={() => {
                    if (!isActive) return;
                    setEditingRow(row);
                    setRowDialogOpen(true);
                  }}
                >
                  <td
                    className="border border-black p-2 text-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds((current) =>
                          checked === true
                            ? [...current, row.id]
                            : current.filter((item) => item !== row.id)
                        )
                      }
                      disabled={!isActive}
                    />
                  </td>
                  <td className="border border-black p-3 text-center whitespace-pre-line">
                    {formatIntensiveCoolingDateTime(row)}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {row.dishName || "—"}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {formatTemperatureLabel(row.startTemperature)}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {formatTemperatureLabel(row.endTemperature)}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {row.correctiveAction || "—"}
                  </td>
                  <td className="border border-black p-3 text-center">
                    {row.comment || "—"}
                  </td>
                  <td className="border border-black p-3 text-center whitespace-pre-line">
                    {getResponsibleLabel(row, props.users)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="border border-black p-2 text-center" />
                  <td className="border border-black p-5 text-center text-[#8a8ea4]" colSpan={7}>
                    Строк пока нет
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
        dateFrom={dateFrom}
        onSave={(payload) =>
          handleSaveSettings(payload).catch((error) => {
            toast.error(error instanceof Error ? error.message : "Ошибка");
          })
        }
      />

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(value) => {
          setRowDialogOpen(value);
          if (!value) setEditingRow(null);
        }}
        initialRow={editingRow}
        config={config}
        users={props.users}
        onSave={(row) =>
          handleSaveRow(row).catch((error) => {
            toast.error(error instanceof Error ? error.message : "Ошибка");
          })
        }
      />

      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title={title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
        onConfirm={() =>
          handleFinish().catch((error) => {
            toast.error(error instanceof Error ? error.message : "Ошибка");
          })
        }
      />
    </div>
  );
}
