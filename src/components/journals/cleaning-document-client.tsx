"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  ACTIVITY_LABELS,
  CLEANING_PAGE_TITLE,
  normalizeCleaningDocumentConfig,
  normalizeCleaningEntryData,
  type CleaningActivityEntry,
  type CleaningActivityType,
  type CleaningDocumentConfig,
  type CleaningEntryData,
  type CleaningResponsiblePerson,
} from "@/lib/cleaning-document";
import { formatMonthLabel } from "@/lib/hygiene-document";

/* ─── Types ─── */

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type EntryItem = {
  id: string;
  employeeId: string;
  date: string;
  data: CleaningEntryData;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  autoFill: boolean;
  users: UserItem[];
  config: CleaningDocumentConfig;
  initialEntries: EntryItem[];
};

/* ─── Helpers ─── */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRuDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getActivityTypes(ventilationEnabled: boolean): CleaningActivityType[] {
  return ventilationEnabled
    ? ["disinfection", "ventilation", "wetCleaning"]
    : ["disinfection", "wetCleaning"];
}

function getRoleName(role: string): string {
  switch (role) {
    case "owner": return "Руководитель";
    case "technologist": return "Управляющий";
    case "operator": return "Повар";
    default: return "Сотрудник";
  }
}

function parseTime(t: string): { h: string; m: string } {
  const parts = t.split(":");
  return { h: parts[0] || "12", m: parts[1] || "00" };
}

/* ─── Settings Dialog ─── */

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dateFrom: string;
  ventilationEnabled: boolean;
  responsibleTitle: string;
  responsibleUserId: string;
  users: UserItem[];
  onSave: (data: {
    title: string;
    dateFrom: string;
    ventilationEnabled: boolean;
    responsibleTitle: string;
    responsibleUserId: string;
  }) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [docTitle, setDocTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [ventilationEnabled, setVentilationEnabled] = useState(props.ventilationEnabled);
  const [responsibleTitle, setResponsibleTitle] = useState(props.responsibleTitle);
  const [responsibleUserId, setResponsibleUserId] = useState(props.responsibleUserId);

  useEffect(() => {
    if (!props.open) return;
    setDocTitle(props.title);
    setDateFrom(props.dateFrom);
    setVentilationEnabled(props.ventilationEnabled);
    setResponsibleTitle(props.responsibleTitle);
    setResponsibleUserId(props.responsibleUserId);
  }, [props.open, props.title, props.dateFrom, props.ventilationEnabled, props.responsibleTitle, props.responsibleUserId]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
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

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Название документа</Label>
            <Input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="flex items-center gap-4">
            <Switch
              checked={ventilationEnabled}
              onCheckedChange={setVentilationEnabled}
              className="data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
            />
            <span className="text-[16px] font-medium text-black">Включить проветривание</span>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Руководитель">Руководитель</SelectItem>
                <SelectItem value="Управляющий">Управляющий</SelectItem>
                <SelectItem value="Повар">Повар</SelectItem>
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
                {props.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
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
                    title: docTitle.trim() || CLEANING_PAGE_TITLE,
                    dateFrom,
                    ventilationEnabled,
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

/* ─── Add Row Dialog ─── */

function AddRowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  defaultUserId: string;
  onAdd: (data: { date: string; responsibleUserId: string }) => void;
}) {
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [userId, setUserId] = useState(props.defaultUserId);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Добавление новой строки
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Ответственное лицо</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              onClick={() => {
                props.onAdd({ date, responsibleUserId: userId });
                props.onOpenChange(false);
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Responsible Person Dialog ─── */

function AddResponsibleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  existingUserIds: Set<string>;
  onAdd: (person: CleaningResponsiblePerson) => void;
}) {
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("Повар");

  const availableUsers = props.users.filter((u) => !props.existingUserIds.has(u.id));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Добавление ответственного лица
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Руководитель">Руководитель</SelectItem>
                <SelectItem value="Управляющий">Управляющий</SelectItem>
                <SelectItem value="Шеф-повар">Шеф-повар</SelectItem>
                <SelectItem value="Повар">Повар</SelectItem>
                <SelectItem value="Официант">Официант</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите сотрудника -" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={!userId}
              onClick={() => {
                if (userId) {
                  props.onAdd({ userId, title });
                  props.onOpenChange(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Responsible Person Dialog ─── */

function EditResponsibleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: CleaningResponsiblePerson | null;
  users: UserItem[];
  onSave: (person: CleaningResponsiblePerson) => void;
  onDelete: (userId: string) => void;
}) {
  const [userId, setUserId] = useState(props.person?.userId || "");
  const [title, setTitle] = useState(props.person?.title || "");
  const [wantDelete, setWantDelete] = useState(false);

  if (!props.person) return null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Редактирование ответственного лица
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Руководитель">Руководитель</SelectItem>
                <SelectItem value="Управляющий">Управляющий</SelectItem>
                <SelectItem value="Шеф-повар">Шеф-повар</SelectItem>
                <SelectItem value="Повар">Повар</SelectItem>
                <SelectItem value="Официант">Официант</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="delete-responsible"
              checked={wantDelete}
              onCheckedChange={(v) => setWantDelete(v === true)}
            />
            <Label htmlFor="delete-responsible" className="text-[16px] text-[#ff3b30]">
              Удалить ответственного
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            {wantDelete ? (
              <Button
                type="button"
                onClick={() => {
                  props.onDelete(props.person!.userId);
                  props.onOpenChange(false);
                }}
                className="h-14 rounded-xl bg-[#ff3b30] px-7 text-[20px] font-medium text-white hover:bg-[#e0352c]"
              >
                Удалить
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  props.onSave({ userId, title });
                  props.onOpenChange(false);
                }}
                className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
              >
                Сохранить
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Periodicity Dialog ─── */

function AddPeriodicityDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    surfaces: string;
    rooms: string;
    frequency: number;
    note: string;
  }) => void;
}) {
  const [surfaces, setSurfaces] = useState("");
  const [rooms, setRooms] = useState("");
  const [frequency, setFrequency] = useState("3");
  const [note, setNote] = useState("");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Добавление новой периодичности
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Поверхности</Label>
            <Textarea
              value={surfaces}
              onChange={(e) => setSurfaces(e.target.value)}
              className="min-h-[80px] rounded-2xl border-[#dfe1ec] px-4 py-3 text-[16px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Помещения</Label>
            <Textarea
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              className="min-h-[80px] rounded-2xl border-[#dfe1ec] px-4 py-3 text-[16px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Частота (раз в день)</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Примечание</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
              placeholder="*(каждые 2-4 часа)"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              onClick={() => {
                props.onSave({
                  surfaces: surfaces.trim(),
                  rooms: rooms.trim(),
                  frequency: parseInt(frequency, 10) || 3,
                  note: note.trim(),
                });
                props.onOpenChange(false);
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Schedule Row ─── */

function ScheduleActivityRow(props: {
  label: string;
  times: string[];
  responsibleUserId: string | null;
  users: UserItem[];
  disabled: boolean;
  onTimesChange: (times: string[]) => void;
  onResponsibleChange: (userId: string | null) => void;
}) {
  const addTimeSlot = () => {
    props.onTimesChange([...props.times, "12:00"]);
  };

  const removeTimeSlot = (index: number) => {
    props.onTimesChange(props.times.filter((_, i) => i !== index));
  };

  const updateTime = (index: number, value: string) => {
    const next = [...props.times];
    next[index] = value;
    props.onTimesChange(next);
  };

  return (
    <div className="space-y-3 rounded-2xl bg-white px-5 py-4">
      <div className="text-[16px] font-semibold text-black">{props.label}</div>

      {props.times.map((time, idx) => {
        const { h, m } = parseTime(time);
        return (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex gap-2">
                <Select
                  value={h}
                  onValueChange={(v) => updateTime(idx, `${v}:${m}`)}
                  disabled={props.disabled}
                >
                  <SelectTrigger className="h-11 w-[80px] rounded-xl border-[#dfe1ec] bg-[#f3f4fb] px-3 text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {HOURS.map((hr) => (
                      <SelectItem key={hr} value={hr}>{hr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center text-[16px] text-[#6f7282]">:</span>
                <Select
                  value={m}
                  onValueChange={(v) => updateTime(idx, `${h}:${v}`)}
                  disabled={props.disabled}
                >
                  <SelectTrigger className="h-11 w-[80px] rounded-xl border-[#dfe1ec] bg-[#f3f4fb] px-3 text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {MINUTES.map((mn) => (
                      <SelectItem key={mn} value={mn}>{mn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {props.times.length > 1 && (
              <button
                type="button"
                onClick={() => removeTimeSlot(idx)}
                disabled={props.disabled}
                className="rounded-md p-1 text-[#ff3b30] hover:bg-[#fff3f2]"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addTimeSlot}
        disabled={props.disabled}
        className="text-[14px] font-medium text-[#5b66ff] hover:underline"
      >
        + Добавить время
      </button>

      <div className="space-y-1">
        <Label className="text-[14px] text-[#6f7282]">ФИО отв. лица</Label>
        <Select
          value={props.responsibleUserId || "__none__"}
          onValueChange={(v) => props.onResponsibleChange(v === "__none__" ? null : v)}
          disabled={props.disabled}
        >
          <SelectTrigger className="h-11 rounded-xl border-[#dfe1ec] bg-[#f3f4fb] px-3 text-[15px]">
            <SelectValue placeholder="- Не выбрано -" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">- Не выбрано -</SelectItem>
            {props.users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ─── Print Header ─── */

function PrintHeader(props: {
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  config: CleaningDocumentConfig;
  users: UserItem[];
  onAddResponsible: () => void;
  onEditResponsible: (person: CleaningResponsiblePerson) => void;
}) {
  const { config, users } = props;
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-4">
      {/* Organization header */}
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[220px] border border-black px-4 py-3 text-center text-[15px] font-semibold">
              {props.organizationName}
            </td>
            <td className="border border-black px-4 py-2 text-center uppercase">
              СИСТЕМА ХАССП
            </td>
            <td rowSpan={2} className="w-[160px] border border-black px-4 py-3 text-center text-[13px]">
              <div>Дата: {formatRuDate(props.dateFrom)} - {formatRuDate(props.dateTo)}</div>
              <div className="mt-1">СТР. 1 ИЗ 1</div>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-4 py-2 text-center text-[13px] italic uppercase">
              ЧЕК-ЛИСТ УБОРКИ И ПРОВЕТРИВАНИЯ
            </td>
          </tr>
        </tbody>
      </table>

      {/* Procedure info table */}
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#f0f0f0]">
            <th className="border border-[#ccc] px-3 py-2 text-left font-semibold">Процедура</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Периодичность</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Ответственные лица</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-[#ccc] px-3 py-2 align-top">
              <div className="space-y-1">
                <div><strong>Поверхности:</strong> {config.procedure.surfaces}</div>
                {config.ventilationEnabled && (
                  <div><strong>Проветривание:</strong> {config.procedure.ventilationRooms}</div>
                )}
                <div><strong>Влажная уборка:</strong> {config.procedure.wetCleaningRooms}</div>
                <div><strong>Моющее средство:</strong> {config.procedure.detergent}</div>
              </div>
            </td>
            <td className="border border-[#ccc] px-3 py-2 align-top text-center">
              <div className="space-y-1">
                <div>Дезинфекция: {config.periodicity.disinfectionPerDay} раз(а) в день</div>
                {config.ventilationEnabled && (
                  <div>Проветривание: {config.periodicity.ventilationPerDay} раз(а) в день</div>
                )}
                <div>Влажная уборка: {config.periodicity.wetCleaningPerDay} раз(а) в день</div>
                <div className="text-[11px] italic text-[#666]">*(каждые 2-4 часа)</div>
              </div>
            </td>
            <td className="border border-[#ccc] px-3 py-2 align-top">
              <div className="space-y-1">
                {config.responsiblePersons.map((p) => {
                  const name = userMap[p.userId] || "—";
                  return (
                    <div key={p.userId}>
                      <button
                        type="button"
                        className="text-left hover:text-[#5b66ff] print:pointer-events-none"
                        onClick={() => props.onEditResponsible(p)}
                      >
                        {p.title}: {name}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="text-[12px] font-medium text-[#5b66ff] hover:underline print:hidden"
                  onClick={props.onAddResponsible}
                >
                  + Добавить ответственного
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Title */}
      <div className="text-center text-[22px] font-bold uppercase">
        {CLEANING_PAGE_TITLE}
      </div>
    </div>
  );
}

/* ─── Bulk Delete Bar ─── */

function BulkDeleteBar(props: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (props.count === 0) return null;

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#f3f4fe] px-5 py-3">
      <span className="text-[16px] text-[#6f7282]">Выбрано: {props.count}</span>
      <Button
        type="button"
        variant="outline"
        onClick={props.onDelete}
        className="h-10 rounded-xl border-[#ffd7d3] px-5 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
      >
        <Trash2 className="mr-2 size-4" />
        Удалить
      </Button>
      <button
        type="button"
        onClick={props.onClear}
        className="text-[14px] text-[#6f7282] hover:underline"
      >
        Сбросить
      </button>
    </div>
  );
}

/* ─── Main Component ─── */

export function CleaningDocumentClient(props: Props) {
  const router = useRouter();
  const {
    documentId,
    title,
    organizationName,
    status,
    dateFrom,
    dateTo,
    users,
  } = props;

  const [config, setConfig] = useState<CleaningDocumentConfig>(() =>
    normalizeCleaningDocumentConfig(props.config)
  );
  const [entries, setEntries] = useState<EntryItem[]>(() =>
    props.initialEntries.map((e) => ({
      ...e,
      data: normalizeCleaningEntryData(e.data),
    }))
  );
  const [autoFillEnabled, setAutoFillEnabled] = useState(props.autoFill);
  const [autoFillSwitching, setAutoFillSwitching] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [savingConfig, setSavingConfig] = useState(false);

  // Dialog states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [addResponsibleOpen, setAddResponsibleOpen] = useState(false);
  const [editingResponsible, setEditingResponsible] = useState<CleaningResponsiblePerson | null>(null);
  const [addPeriodicityOpen, setAddPeriodicityOpen] = useState(false);

  const userMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users]
  );

  const fallbackUserId = props.responsibleUserId || users[0]?.id || "";
  const monthLabel = useMemo(() => formatMonthLabel(dateFrom, dateTo), [dateFrom, dateTo]);

  const activityTypes = useMemo(
    () => getActivityTypes(config.ventilationEnabled),
    [config.ventilationEnabled]
  );

  // Sorted entries by date
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  const allSelected = sortedEntries.length > 0 && selectedEntryIds.size === sortedEntries.length;

  // Existing responsible user ids
  const existingResponsibleUserIds = useMemo(
    () => new Set(config.responsiblePersons.map((p) => p.userId)),
    [config.responsiblePersons]
  );

  // Max time columns needed
  const maxTimeCols = useMemo(() => {
    let max = 0;
    for (const entry of entries) {
      for (const activity of entry.data.activities) {
        if (activity.times.length > max) max = activity.times.length;
      }
    }
    // Also check schedule
    for (const type of activityTypes) {
      const schedTimes = config.schedule[type].times.length;
      if (schedTimes > max) max = schedTimes;
    }
    return Math.max(max, 1);
  }, [entries, config.schedule, activityTypes]);

  /* ─── API helpers ─── */

  const persistDocument = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.error || "Ошибка обновления документа");
      return result;
    },
    [documentId]
  );

  const saveConfig = useCallback(
    async (nextConfig: CleaningDocumentConfig, extra: Record<string, unknown> = {}) => {
      const prev = config;
      setConfig(nextConfig);
      setSavingConfig(true);
      try {
        await persistDocument({ config: nextConfig, ...extra });
      } catch (err) {
        setConfig(prev);
        throw err;
      } finally {
        setSavingConfig(false);
      }
    },
    [config, persistDocument]
  );

  /* ─── Handlers ─── */

  async function handleAutoFillToggle(value: boolean) {
    setAutoFillEnabled(value);
    setAutoFillSwitching(true);
    try {
      await persistDocument({ autoFill: value });
      if (value) {
        const res = await fetch(`/api/journal-documents/${documentId}/cleaning`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply_auto_fill" }),
        });
        const result = await res.json().catch(() => null);
        if (!res.ok) throw new Error(result?.error || "Ошибка автозаполнения");
      }
      router.refresh();
    } catch (err) {
      setAutoFillEnabled(!value);
      window.alert(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setAutoFillSwitching(false);
    }
  }

  async function handleScheduleChange(
    type: CleaningActivityType,
    field: "times" | "responsibleUserId",
    value: string[] | string | null
  ) {
    const nextSchedule = { ...config.schedule };
    nextSchedule[type] = { ...nextSchedule[type], [field]: value };
    const nextConfig: CleaningDocumentConfig = { ...config, schedule: nextSchedule };
    try {
      await saveConfig(nextConfig);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  async function handleSkipWeekendsChange(value: boolean) {
    try {
      await saveConfig({ ...config, skipWeekends: value });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleAddEntry(data: { date: string; responsibleUserId: string }) {
    const userName = userMap[data.responsibleUserId] || "";
    const activities: CleaningActivityEntry[] = activityTypes.map((type) => ({
      type,
      times: [...config.schedule[type].times],
      responsibleName: userName,
    }));

    try {
      const res = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "system",
          date: data.date,
          data: { activities },
        }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) throw new Error(result?.error || "Ошибка добавления");

      const newEntry: EntryItem = {
        id: result?.entry?.id || `temp:${data.date}`,
        employeeId: "system",
        date: data.date,
        data: { activities },
      };
      setEntries((curr) => {
        const filtered = curr.filter((e) => e.date !== data.date);
        return [...filtered, newEntry];
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleDeleteSelected() {
    if (selectedEntryIds.size === 0) return;
    const confirmed = window.confirm(`Удалить выбранные строки (${selectedEntryIds.size})?`);
    if (!confirmed) return;

    const ids = Array.from(selectedEntryIds);
    try {
      const res = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || "Ошибка удаления");
      }
      setEntries((curr) => curr.filter((e) => !selectedEntryIds.has(e.id)));
      setSelectedEntryIds(new Set());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleSettingsSave(data: {
    title: string;
    dateFrom: string;
    ventilationEnabled: boolean;
    responsibleTitle: string;
    responsibleUserId: string;
  }) {
    const nextConfig: CleaningDocumentConfig = {
      ...config,
      ventilationEnabled: data.ventilationEnabled,
    };
    await persistDocument({
      title: data.title,
      dateFrom: data.dateFrom,
      config: nextConfig,
      responsibleTitle: data.responsibleTitle,
      responsibleUserId: data.responsibleUserId,
    });
    setConfig(nextConfig);
    router.refresh();
  }

  function handleAddResponsible(person: CleaningResponsiblePerson) {
    const nextConfig: CleaningDocumentConfig = {
      ...config,
      responsiblePersons: [...config.responsiblePersons, person],
    };
    saveConfig(nextConfig).catch((err) => {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    });
  }

  function handleEditResponsible(updated: CleaningResponsiblePerson) {
    const nextConfig: CleaningDocumentConfig = {
      ...config,
      responsiblePersons: config.responsiblePersons.map((p) =>
        p.userId === editingResponsible?.userId ? updated : p
      ),
    };
    saveConfig(nextConfig).catch((err) => {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    });
  }

  function handleDeleteResponsible(userId: string) {
    const nextConfig: CleaningDocumentConfig = {
      ...config,
      responsiblePersons: config.responsiblePersons.filter((p) => p.userId !== userId),
    };
    saveConfig(nextConfig).catch((err) => {
      window.alert(err instanceof Error ? err.message : "Ошибка");
    });
  }

  function toggleEntrySelection(id: string) {
    setSelectedEntryIds((curr) => {
      const next = new Set(curr);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(sortedEntries.map((e) => e.id)));
    }
  }

  const documentTitle = title || CLEANING_PAGE_TITLE;

  return (
    <div className="bg-white text-black">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body {
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .screen-only {
            display: none !important;
          }

          .cleaning-sheet {
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .cleaning-data-table th,
          .cleaning-data-table td {
            font-size: 10px !important;
            line-height: 1.2 !important;
            padding: 3px 4px !important;
          }
        }
      `}</style>

      <div className="cleaning-sheet mx-auto max-w-[1400px] px-8 py-6">
        {/* ─── Screen toolbar ─── */}
        <div className="screen-only mb-8 space-y-6">
          {/* Breadcrumb */}
          <div className="text-[14px] text-[#6f7282]">
            {organizationName}
            <span className="mx-2">/</span>
            <span>{CLEANING_PAGE_TITLE}</span>
            <span className="mx-2">/</span>
            <span className="text-black">{documentTitle}</span>
          </div>

          {/* Title + settings */}
          <div className="flex items-start justify-between gap-6">
            <h1 className="text-[42px] font-semibold tracking-[-0.04em] text-black leading-tight">
              {CLEANING_PAGE_TITLE}
            </h1>

            {status === "active" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-14 shrink-0 rounded-2xl border-[#eef0fb] px-6 text-[16px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                <Settings2 className="mr-2 size-5" />
                Настройки журнала
              </Button>
            )}
          </div>

          {/* Auto-fill toggle */}
          {status === "active" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Switch
                  checked={autoFillEnabled}
                  onCheckedChange={handleAutoFillToggle}
                  disabled={autoFillSwitching}
                  className="h-8 w-14 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
                />
                <span className="text-[18px] font-medium text-black">
                  Автоматически заполнять чек-лист
                </span>
                <button
                  type="button"
                  onClick={() => setScheduleOpen((v) => !v)}
                  className="ml-2 text-[#5b66ff]"
                >
                  {scheduleOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                </button>
              </div>

              {/* Schedule panel */}
              {scheduleOpen && (
                <div className="rounded-[20px] bg-[#f3f4fe] px-6 py-5 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {activityTypes.map((type) => (
                      <ScheduleActivityRow
                        key={type}
                        label={ACTIVITY_LABELS[type]}
                        times={config.schedule[type].times}
                        responsibleUserId={config.schedule[type].responsibleUserId}
                        users={users}
                        disabled={savingConfig}
                        onTimesChange={(times) => handleScheduleChange(type, "times", times)}
                        onResponsibleChange={(userId) => handleScheduleChange(type, "responsibleUserId", userId)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Checkbox
                      id="skip-weekends-cleaning"
                      checked={config.skipWeekends}
                      onCheckedChange={(v) => handleSkipWeekendsChange(v === true)}
                      disabled={savingConfig}
                    />
                    <Label htmlFor="skip-weekends-cleaning" className="text-[16px] text-black">
                      Не заполнять в выходные дни
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Print header ─── */}
        <PrintHeader
          organizationName={organizationName}
          dateFrom={dateFrom}
          dateTo={dateTo}
          config={config}
          users={users}
          onAddResponsible={() => setAddResponsibleOpen(true)}
          onEditResponsible={(p) => setEditingResponsible(p)}
        />

        {/* ─── Data entry area ─── */}
        <div className="mt-6 space-y-4">
          {/* Add + Bulk delete bar */}
          {status === "active" && (
            <div className="screen-only flex items-center gap-4">
              <Button
                type="button"
                onClick={() => setAddRowOpen(true)}
                className="h-[52px] rounded-2xl bg-[#5b66ff] px-7 text-[16px] text-white hover:bg-[#4b57ff]"
              >
                <Plus className="mr-2 size-5" />
                Добавить
              </Button>

              <BulkDeleteBar
                count={selectedEntryIds.size}
                onDelete={handleDeleteSelected}
                onClear={() => setSelectedEntryIds(new Set())}
              />
            </div>
          )}

          {/* Data table */}
          <div className="overflow-x-auto">
            <table className="cleaning-data-table w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#f2f2f2]">
                  <th className="w-[40px] border border-[#ccc] p-2 text-center screen-only">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      disabled={status !== "active" || sortedEntries.length === 0}
                    />
                  </th>
                  <th className="w-[100px] border border-[#ccc] p-2 text-center font-semibold">
                    Дата
                  </th>
                  <th className="w-[140px] border border-[#ccc] p-2 text-center font-semibold">
                    Вид деятельности
                  </th>
                  {Array.from({ length: maxTimeCols }, (_, i) => (
                    <th key={`time-${i}`} className="w-[80px] border border-[#ccc] p-2 text-center font-semibold">
                      Время {i + 1}
                    </th>
                  ))}
                  <th className="border border-[#ccc] p-2 text-center font-semibold">
                    ФИО ответственного лица
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + maxTimeCols + 1}
                      className="border border-[#ccc] p-6 text-center text-[15px] text-[#6f7282]"
                    >
                      Нет записей. Нажмите &quot;Добавить&quot; для создания новой строки.
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry) => {
                    const data = normalizeCleaningEntryData(entry.data);
                    const displayActivities = activityTypes.map((type) => {
                      const found = data.activities.find((a) => a.type === type);
                      return found || { type, times: [], responsibleName: "" };
                    });

                    return displayActivities.map((activity, actIdx) => (
                      <tr
                        key={`${entry.id}:${activity.type}`}
                        className={selectedEntryIds.has(entry.id) ? "bg-[#f0f1ff]" : ""}
                      >
                        {actIdx === 0 && (
                          <>
                            <td
                              rowSpan={displayActivities.length}
                              className="border border-[#ccc] p-2 text-center align-middle screen-only"
                            >
                              {status === "active" && (
                                <Checkbox
                                  checked={selectedEntryIds.has(entry.id)}
                                  onCheckedChange={() => toggleEntrySelection(entry.id)}
                                />
                              )}
                            </td>
                            <td
                              rowSpan={displayActivities.length}
                              className="border border-[#ccc] p-2 text-center align-middle font-medium"
                            >
                              {formatRuDate(entry.date)}
                            </td>
                          </>
                        )}
                        <td className="border border-[#ccc] p-2 font-medium">
                          {ACTIVITY_LABELS[activity.type]}
                        </td>
                        {Array.from({ length: maxTimeCols }, (_, i) => (
                          <td key={i} className="border border-[#ccc] p-2 text-center">
                            {activity.times[i] || ""}
                          </td>
                        ))}
                        <td className="border border-[#ccc] p-2">
                          {activity.responsibleName}
                        </td>
                      </tr>
                    ));
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Dialogs ─── */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        dateFrom={dateFrom}
        ventilationEnabled={config.ventilationEnabled}
        responsibleTitle={props.responsibleTitle || getRoleName(users.find((u) => u.id === fallbackUserId)?.role || "")}
        responsibleUserId={fallbackUserId}
        users={users}
        onSave={handleSettingsSave}
      />

      {addRowOpen && (
        <AddRowDialog
          key={`row-${fallbackUserId}`}
          open={addRowOpen}
          onOpenChange={setAddRowOpen}
          users={users}
          defaultUserId={fallbackUserId}
          onAdd={handleAddEntry}
        />
      )}

      {addResponsibleOpen && (
        <AddResponsibleDialog
          key={`responsible-${users.length}-${existingResponsibleUserIds.size}`}
          open={addResponsibleOpen}
          onOpenChange={setAddResponsibleOpen}
          users={users}
          existingUserIds={existingResponsibleUserIds}
          onAdd={handleAddResponsible}
        />
      )}

      {!!editingResponsible && (
        <EditResponsibleDialog
          key={`edit-${editingResponsible.userId}-${editingResponsible.title}`}
          open={!!editingResponsible}
          onOpenChange={(v) => {
            if (!v) setEditingResponsible(null);
          }}
          person={editingResponsible}
          users={users}
          onSave={handleEditResponsible}
          onDelete={handleDeleteResponsible}
        />
      )}

      {addPeriodicityOpen && (
        <AddPeriodicityDialog
          key="periodicity"
          open={addPeriodicityOpen}
          onOpenChange={setAddPeriodicityOpen}
          onSave={(data) => {
          const nextConfig: CleaningDocumentConfig = {
            ...config,
            procedure: {
              ...config.procedure,
              surfaces: data.surfaces || config.procedure.surfaces,
              wetCleaningRooms: data.rooms || config.procedure.wetCleaningRooms,
            },
          };
          saveConfig(nextConfig).catch((err) => {
            window.alert(err instanceof Error ? err.message : "Ошибка");
          });
          }}
        />
      )}
    </div>
  );
}
