"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Printer, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildDailyRange,
  buildUvRuntimeDocumentTitle,
  calculateDurationMinutes,
  calculateMonthlyHours,
  CONTROL_FREQUENCY_OPTIONS,
  formatMonthLabel,
  formatRuDateDash,
  getDisinfectionConditionLabel,
  getDisinfectionObjectLabel,
  getRadiationModeLabel,
  getUvResponsibleTitleOptions,
  normalizeUvRuntimeDocumentConfig,
  normalizeUvRuntimeEntryData,
  toIsoDate,
  type UvRuntimeDocumentConfig,
  type UvRuntimeEntryData,
  type UvSpecification,
} from "@/lib/uv-lamp-runtime-document";
import { getUsersForRoleLabel } from "@/lib/user-roles";
import { DocumentBackLink } from "@/components/journals/document-back-link";

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

type Props = {
  documentId: string;
  routeCode: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  autoFill?: boolean;
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

function isDateInRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function entryToRow(entry: EntryItem): GridRow {
  return {
    id: entry.id,
    date: entry.date,
    employeeId: entry.employeeId,
    data: normalizeUvRuntimeEntryData(entry.data),
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

  const visibleEntries = params.initialEntries.filter((entry) =>
    isDateInRange(entry.date, params.dateFrom, effectiveTo)
  );
  const byDate = new Map(visibleEntries.map((entry) => [entry.date, entry]));
  return days.map((day, index) => {
    const existing = byDate.get(day);
    if (existing) {
      return entryToRow(existing);
    }

    return {
      id: `virtual:${day}:${index}`,
      date: day,
      employeeId: params.fallbackEmployeeId,
      data: { startTime: "", endTime: "" },
    };
  });
}

/* ─── Specification Edit Dialog ─── */

function UvSpecEditDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: UvSpecification;
  onSave: (spec: UvSpecification) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [air, setAir] = useState(props.spec.disinfectionAir);
  const [surface, setSurface] = useState(props.spec.disinfectionSurface);
  const [microorganism, setMicroorganism] = useState(props.spec.microorganismType);
  const [radiationMode, setRadiationMode] = useState(props.spec.radiationMode);
  const [condition, setCondition] = useState(props.spec.disinfectionCondition);
  const [lampHours, setLampHours] = useState(String(props.spec.lampLifetimeHours));
  const [commDate, setCommDate] = useState(props.spec.commissioningDate);
  const [minInterval, setMinInterval] = useState(props.spec.minIntervalBetweenSessions);
  const [frequency, setFrequency] = useState(props.spec.controlFrequency);

  useEffect(() => {
    if (!props.open) return;
    setAir(props.spec.disinfectionAir);
    setSurface(props.spec.disinfectionSurface);
    setMicroorganism(props.spec.microorganismType);
    setRadiationMode(props.spec.radiationMode);
    setCondition(props.spec.disinfectionCondition);
    setLampHours(String(props.spec.lampLifetimeHours));
    setCommDate(props.spec.commissioningDate);
    setMinInterval(props.spec.minIntervalBetweenSessions);
    setFrequency(props.spec.controlFrequency);
  }, [props.open, props.spec]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Редактирование
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
          <div>
            <div className="mb-3 text-[16px] font-medium text-black">Объект обеззараживания</div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[15px]">
                <Switch checked={air} onCheckedChange={setAir} />
                Воздух
              </label>
              <label className="flex items-center gap-2 text-[15px]">
                <Switch checked={surface} onCheckedChange={setSurface} />
                Поверхность
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Вид микроорганизма</Label>
            <Input
              value={microorganism}
              onChange={(e) => setMicroorganism(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[16px]"
            />
          </div>

          <div>
            <div className="mb-3 text-[16px] font-medium text-black">Режим облучения</div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="radio"
                  name="radiationMode"
                  checked={radiationMode === "continuous"}
                  onChange={() => setRadiationMode("continuous")}
                  className="size-4 accent-[#5863f8]"
                />
                Непрерывный
              </label>
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="radio"
                  name="radiationMode"
                  checked={radiationMode === "intermittent"}
                  onChange={() => setRadiationMode("intermittent")}
                  className="size-4 accent-[#5863f8]"
                />
                Повторно-кратковременный
              </label>
            </div>
          </div>

          <div>
            <div className="mb-3 text-[16px] font-medium text-black">Условия обеззараживания</div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="radio"
                  name="condition"
                  checked={condition === "with_people"}
                  onChange={() => setCondition("with_people")}
                  className="size-4 accent-[#5863f8]"
                />
                В присутствии людей
              </label>
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="radio"
                  name="condition"
                  checked={condition === "without_people"}
                  onChange={() => setCondition("without_people")}
                  className="size-4 accent-[#5863f8]"
                />
                В отсутствии людей
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Ресурс рабочего времени лампы, часов</Label>
            <Input
              type="number"
              value={lampHours}
              onChange={(e) => setLampHours(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[16px]"
            />
            <div className="text-[12px] text-[#999]">*срок замены отработавших ламп</div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата ввода установки в эксплуатацию</Label>
            <Input
              type="date"
              value={commDate}
              onChange={(e) => setCommDate(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[16px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Введите минимальный интервал между сеансами</Label>
            <Input
              value={minInterval}
              onChange={(e) => setMinInterval(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[16px]"
            />
            <div className="text-[12px] text-[#999]">*для повторно-кратковременного облучения</div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Частота контроля работы установки</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTROL_FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[12px] text-[#999]">*частота включений</div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave({
                    disinfectionAir: air,
                    disinfectionSurface: surface,
                    microorganismType: microorganism.trim() || "санитарно-показательный",
                    radiationMode,
                    disinfectionCondition: condition,
                    lampLifetimeHours: Math.max(1, parseInt(lampHours, 10) || 10000),
                    commissioningDate: commDate,
                    minIntervalBetweenSessions: minInterval.trim(),
                    controlFrequency: frequency,
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

/* ─── Settings Dialog ─── */

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

  const options = useMemo(() => getUvResponsibleTitleOptions(props.users), [props.users]);

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
            <Label className="text-[16px] text-[#6f7282]">Бактерицидная установка №</Label>
            <Input
              value={lampNumber}
              onChange={(event) => setLampNumber(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[24px] leading-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Наименование цеха/участка применения</Label>
            <Input
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
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
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={(value) => {
              const candidates = getUsersForRoleLabel(props.users, value);
              if (responsibleUserId && !candidates.some((u) => u.id === responsibleUserId)) {
                setResponsibleUserId("");
              }
              setResponsibleTitle(value);
            }}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="- Выберите значение -">- Выберите значение -</SelectItem>
                {options.management.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Руководство</SelectLabel>
                    {options.management.map((title) => (
                      <SelectItem key={`mgmt:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {options.staff.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Сотрудники</SelectLabel>
                    {options.staff.map((title) => (
                      <SelectItem key={`staff:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
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
                {(responsibleTitle && responsibleTitle !== "- Выберите значение -" ? getUsersForRoleLabel(props.users, responsibleTitle) : props.users).map((user) => (
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
                      ...props.initialConfig,
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

/* ─── Add Row Dialog ─── */

function AddRowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  defaultEmployeeId: string;
  defaultResponsibleTitle: string;
  onAdd: (data: {
    date: string;
    startTime: string;
    endTime: string;
    employeeId: string;
    responsibleTitle: string;
  }) => void;
}) {
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [startHour, setStartHour] = useState("10");
  const [startMin, setStartMin] = useState("00");
  const [endHour, setEndHour] = useState("18");
  const [endMin, setEndMin] = useState("00");
  const [responsibleTitle, setResponsibleTitle] = useState(props.defaultResponsibleTitle);
  const [employeeId, setEmployeeId] = useState(props.defaultEmployeeId);

  const options = useMemo(() => getUvResponsibleTitleOptions(props.users), [props.users]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

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

          <div>
            <div className="mb-2 text-[16px] font-medium text-black">Время включения</div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                <Select value={startHour} onValueChange={setStartHour}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                <Select value={startMin} onValueChange={setStartMin}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {minutes.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-[16px] font-medium text-black">Время выключения</div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                <Select value={endHour} onValueChange={setEndHour}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {hours.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                <Select value={endMin} onValueChange={setEndMin}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {minutes.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={(value) => {
              const candidates = getUsersForRoleLabel(props.users, value);
              if (employeeId && !candidates.some((u) => u.id === employeeId)) {
                setEmployeeId("");
              }
              setResponsibleTitle(value);
            }}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {options.management.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Руководство</SelectLabel>
                    {options.management.map((title) => (
                      <SelectItem key={`mgmt:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {options.staff.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Сотрудники</SelectLabel>
                    {options.staff.map((title) => (
                      <SelectItem key={`staff:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {(responsibleTitle ? getUsersForRoleLabel(props.users, responsibleTitle) : props.users).map((user) => (
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
              onClick={() => {
                props.onAdd({
                  date,
                  startTime: `${startHour}:${startMin}`,
                  endTime: `${endHour}:${endMin}`,
                  employeeId,
                  responsibleTitle,
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

/* ─── Specification Display Table ─── */

function SpecificationTable({ config, onEdit }: { config: UvRuntimeDocumentConfig; onEdit: () => void }) {
  const spec = config.spec;

  return (
    <div className="uv-spec-section">
      <div className="mb-3 text-center text-[14px] font-bold">
        Спецификация ультрафиолетовой бактерицидной установки
      </div>
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          <tr>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Объект обеззараживания (воздух или поверхность, или то и другое)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {getDisinfectionObjectLabel(spec)}
            </td>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Ресурс рабочего времени (срок замены отработавших ламп), часов
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {spec.lampLifetimeHours}
            </td>
          </tr>
          <tr>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Вид микроорганизма (санитарно-показательный или иной)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {spec.microorganismType}
            </td>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Дата ввода установки в эксплуатацию
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {spec.commissioningDate ? formatRuDateDash(spec.commissioningDate) : "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Режим облучения (непрерывный или повторно-кратковременный)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {getRadiationModeLabel(spec.radiationMode)}
            </td>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Минимальный интервал между сеансами (для повторно-кратковременной)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {spec.minIntervalBetweenSessions || "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Условия обеззараживания (в присутствии и отсутствии людей)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {getDisinfectionConditionLabel(spec.disinfectionCondition)}
            </td>
            <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">
              Частота контроля работы установки (частота включений)
            </td>
            <td className="border border-[#ccc] px-3 py-2 text-center">
              {spec.controlFrequency}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex justify-end print:hidden">
        <button
          type="button"
          onClick={onEdit}
          className="text-[13px] text-[#5b66ff] underline hover:no-underline"
        >
          Настроить спецификацию
        </button>
      </div>
    </div>
  );
}

/* ─── Monthly Summary Table ─── */

function MonthlySummaryTable({ monthlyData }: { monthlyData: { month: string; hours: number; remaining: number }[] }) {
  if (monthlyData.length === 0) return null;

  const half = Math.ceil(monthlyData.length / 2);
  const leftCol = monthlyData.slice(0, half);
  const rightCol = monthlyData.slice(half);

  return (
    <div className="uv-monthly-section">
      <div className="mb-3 text-center text-[14px] font-bold">
        Суммарное количество отработанных часов бактерицидной установкой по месяцам
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#f0f0f0]">
            <th className="border border-[#ccc] px-3 py-2 text-left font-semibold">Месяц, год</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Количество часов</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Остаточное количество часов</th>
            <th className="border border-[#ccc] px-3 py-2 text-left font-semibold">Месяц, год</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Количество часов</th>
            <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Остаточное количество часов</th>
          </tr>
        </thead>
        <tbody>
          {leftCol.map((left, i) => {
            const right = rightCol[i];
            return (
              <tr key={left.month}>
                <td className="border border-[#ccc] px-3 py-1.5">{formatMonthLabel(left.month)}</td>
                <td className="border border-[#ccc] px-3 py-1.5 text-center">{left.hours.toFixed(2).replace(".", ",")}</td>
                <td className="border border-[#ccc] px-3 py-1.5 text-center">{left.remaining.toFixed(2).replace(".", ",")}</td>
                {right ? (
                  <>
                    <td className="border border-[#ccc] px-3 py-1.5">{formatMonthLabel(right.month)}</td>
                    <td className="border border-[#ccc] px-3 py-1.5 text-center">{right.hours.toFixed(2).replace(".", ",")}</td>
                    <td className="border border-[#ccc] px-3 py-1.5 text-center">{right.remaining.toFixed(2).replace(".", ",")}</td>
                  </>
                ) : (
                  <>
                    <td className="border border-[#ccc] px-3 py-1.5" />
                    <td className="border border-[#ccc] px-3 py-1.5" />
                    <td className="border border-[#ccc] px-3 py-1.5" />
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Document Client ─── */

export function UvLampRuntimeDocumentClient(props: Props) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [specEditOpen, setSpecEditOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [autoFill, setAutoFill] = useState(props.autoFill === true);

  const [config, setConfig] = useState(() => normalizeUvRuntimeDocumentConfig(props.config));
  const fallbackEmployeeId = props.responsibleUserId || props.users[0]?.id || "";
  const [rows, setRows] = useState(() =>
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

  const monthlyData = useMemo(() => {
    const entriesWithData = rows
      .filter((row) => !row.id.startsWith("virtual:") || (row.data.startTime && row.data.endTime))
      .map((row) => ({ date: row.date, data: row.data }));
    return calculateMonthlyHours(entriesWithData, config.spec.lampLifetimeHours);
  }, [rows, config.spec.lampLifetimeHours]);

  const saveRow = useCallback(async (
    row: GridRow,
    previous?: { id: string; employeeId: string }
  ) => {
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

    if (
      previous &&
      !previous.id.startsWith("virtual:") &&
      previous.employeeId &&
      previous.employeeId !== (row.employeeId || fallbackEmployeeId)
    ) {
      await fetch(`/api/journal-documents/${props.documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [previous.id] }),
      });
    }

    const saved: GridRow = {
      id: result.entry.id,
      employeeId: row.employeeId || fallbackEmployeeId,
      date: row.date,
      data: row.data,
    };
    setRows((current) => current.map((item) => (item.date === saved.date ? saved : item)));
  }, [props.documentId, fallbackEmployeeId]);

  async function deleteSelectedRows() {
    const deletable = rows.filter((row) => selectedRowIds.includes(row.id) && !row.id.startsWith("virtual:"));
    if (deletable.length === 0) return;
    const count = deletable.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;

    try {
      const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deletable.map((row) => row.id) }),
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить выбранные строки");
      }

      setRows((current) =>
        current.map((row) =>
          selectedRowIds.includes(row.id)
            ? { ...row, id: `virtual:${row.date}`, data: { startTime: "", endTime: "" } }
            : row
        )
      );
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function handleCloseJournal() {
    if (!window.confirm("Закончить журнал? Документ станет доступен только для чтения.")) return;

    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });

    if (!response.ok) {
      toast.error("Не удалось закрыть журнал");
      return;
    }

    router.refresh();
  }

  async function handleAddRow(data: {
    date: string;
    startTime: string;
    endTime: string;
    employeeId: string;
  }) {
    const newRow: GridRow = {
      id: `virtual:${data.date}:new`,
      date: data.date,
      employeeId: data.employeeId,
      data: { startTime: data.startTime, endTime: data.endTime },
    };

    setRows((current) => {
      const existing = current.find((r) => r.date === data.date);
      if (existing) {
        return current.map((r) =>
          r.date === data.date ? { ...r, data: newRow.data, employeeId: newRow.employeeId } : r
        );
      }
      const updated = [...current, newRow];
      updated.sort((a, b) => a.date.localeCompare(b.date));
      return updated;
    });

    try {
      await saveRow(newRow);
    } catch {
      toast.error("Не удалось сохранить строку");
    }
  }

  async function handleSaveSettings(data: {
    config: UvRuntimeDocumentConfig;
    dateFrom: string;
    responsibleTitle: string;
    responsibleUserId: string;
  }) {
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
      toast.error("Не удалось сохранить настройки");
      return;
    }

    setConfig(data.config);
    router.refresh();
  }

  async function handleSaveSpec(spec: UvSpecification) {
    const nextConfig = { ...config, spec };
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: nextConfig }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить спецификацию");
      return;
    }

    setConfig(nextConfig);
  }

  async function handleAutoFillChange(value: boolean) {
    setAutoFill(value);

    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoFill: value }),
    });

    if (!response.ok) {
      setAutoFill(!value);
      toast.error("Не удалось сохранить настройку автозаполнения");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-4">
      <DocumentBackLink href={`/journals/${props.routeCode}`} documentId={props.documentId} />

      <div className="flex items-start justify-between gap-4 print:hidden">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          Журнал учета работы УФ бактерицидной установки
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="h-11 shrink-0 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
        >
          Настройки журнала
        </Button>
      </div>

      {/* Auto-fill toggle */}
      {props.status === "active" && (
        <div className="flex items-center gap-3 print:hidden">
          <Switch checked={autoFill} onCheckedChange={(checked) => void handleAutoFillChange(checked)} />
          <span className="text-[14px] text-black">Автоматически заполнять журнал</span>
        </div>
      )}

      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {selectedRowIds.length > 0 && (
          <div className="sticky top-0 z-30 -mx-6 flex flex-wrap items-center gap-3 border-b border-[#eef0fb] bg-white/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-2 text-[14px]">
              <button
                type="button"
                onClick={() => setSelectedRowIds([])}
                className="text-[#7c7c93] hover:text-black"
              >
                <X className="size-4" />
              </button>
              <span>Выбранно: {selectedRowIds.length}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]"
              onClick={() => {
                deleteSelectedRows().catch(() => toast.error("Ошибка удаления"));
              }}
            >
              <Trash2 className="mr-1 size-4" />
              Удалить
            </Button>
          </div>
        )}
      </div>

      {/* Print header */}
      <div className="uv-print-header hidden print:block">
        <div className="mb-1 text-right text-[10px]">
          <div>Дата: {formatRuDateDash(props.dateFrom)}</div>
          <div>Стр.: 1 из 1</div>
        </div>
        <div className="text-center text-[11px]">
          <div className="font-bold">{props.organizationName}</div>
          <div className="mt-1">
            ЖУРНАЛ УЧЕТА НАРАБОТКИ И ОБЕЗЗАРАЖИВАНИЯ УЛЬТРАФИОЛЕТОВОЙ УСТАНОВКИ
          </div>
          <div className="mt-0.5 text-[10px]">Журнал учета работы</div>
        </div>
        <div className="mt-2 text-[10px]">
          <div>БАКТЕРИЦИДНАЯ УСТАНОВКА №{config.lampNumber}</div>
          <div>(наименование цеха / участка применения)</div>
        </div>
      </div>

      {/* Specification table */}
      <SpecificationTable config={config} onEdit={() => setSpecEditOpen(true)} />

      {/* Monthly summary */}
      <MonthlySummaryTable monthlyData={monthlyData} />

      {/* Add button + Close journal */}
      {props.status === "active" && (
        <div className="flex items-center justify-between print:hidden">
          <Button
            type="button"
            onClick={() => setAddRowOpen(true)}
            className="h-11 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
          >
            <Plus className="mr-1 size-4" />
            Добавить
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCloseJournal}
            className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
          >
            Закончить журнал
          </Button>
        </div>
      )}

      {/* Data table */}
      <div className="max-w-full overflow-x-auto rounded-[12px] border border-[#eceef5] bg-white print:rounded-none print:border-[#ccc]">
        <table className="w-full min-w-[720px] border-collapse text-[13px] sm:min-w-[900px]">
          <thead>
            <tr className="bg-[#f6f7fb] print:bg-[#f0f0f0]">
              {props.status === "active" && (
                <th className="w-[40px] border border-[#eceef5] px-2 py-2 print:hidden">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? rows.map((row) => row.id) : [])
                    }
                  />
                </th>
              )}
              <th className="border border-[#eceef5] px-3 py-2 text-left font-semibold text-[#5b6075] print:border-[#ccc]">Дата</th>
              <th className="border border-[#eceef5] px-3 py-2 text-center font-semibold text-[#5b6075] print:border-[#ccc]">Время ВКЛ</th>
              <th className="border border-[#eceef5] px-3 py-2 text-center font-semibold text-[#5b6075] print:border-[#ccc]">Время ВЫКЛ</th>
              <th className="border border-[#eceef5] px-3 py-2 text-center font-semibold text-[#5b6075] print:border-[#ccc]">
                Итого продолжительность работы, минут
              </th>
              <th className="border border-[#eceef5] px-3 py-2 text-left font-semibold text-[#5b6075] print:border-[#ccc]">
                ФИО ответственного лица
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const duration = calculateDurationMinutes(row.data.startTime, row.data.endTime);
              return (
                <tr key={row.id} className="hover:bg-[#fafbff] print:hover:bg-transparent">
                  {props.status === "active" && (
                    <td className="border border-[#eceef5] p-2 text-center print:hidden">
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
                  <td className="border border-[#eceef5] p-2 print:border-[#ccc]">
                    <div className="px-2 py-1 text-[14px] text-black">{formatRuDateDash(row.date)}</div>
                  </td>
                  <td className="border border-[#eceef5] p-2 text-center print:border-[#ccc]">
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
                          saveRow(row).catch(() => toast.error("Не удалось сохранить строку"));
                        }}
                        className="mx-auto h-9 w-[110px] rounded-md border-[#dfe1ec] text-center text-[13px]"
                      />
                    ) : (
                      <span className="text-[14px] text-black">{row.data.startTime || "—"}</span>
                    )}
                  </td>
                  <td className="border border-[#eceef5] p-2 text-center print:border-[#ccc]">
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
                          saveRow(row).catch(() => toast.error("Не удалось сохранить строку"));
                        }}
                        className="mx-auto h-9 w-[110px] rounded-md border-[#dfe1ec] text-center text-[13px]"
                      />
                    ) : (
                      <span className="text-[14px] text-black">{row.data.endTime || "—"}</span>
                    )}
                  </td>
                  <td className="border border-[#eceef5] p-2 text-center print:border-[#ccc]">
                    <span className="text-[14px] text-black">{duration !== null ? duration : "—"}</span>
                  </td>
                  <td className="border border-[#eceef5] p-2 print:border-[#ccc]">
                    {props.status === "active" ? (
                      <Select
                        value={row.employeeId || fallbackEmployeeId}
                        onValueChange={(value) => {
                          setRows((current) =>
                            current.map((item) => (item.id === row.id ? { ...item, employeeId: value } : item))
                          );
                          const updated = { ...row, employeeId: value };
                          saveRow(updated, { id: row.id, employeeId: row.employeeId }).catch(() =>
                            toast.error("Не удалось сохранить строку")
                          );
                          return;
                        }}
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
                      <span className="text-[14px] text-black">{userMap[row.employeeId] || "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Settings / Print buttons */}
      <div className="flex items-center justify-end gap-2 print:hidden">
        {props.status === "active" && (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-md border-[#eceef5] px-3 text-[13px]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="mr-1 size-4" />
            Настройки документа
          </Button>
        )}
      </div>

      {/* Dialogs */}
      <UvRuntimeSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={props.users}
        initialConfig={config}
        initialDateFrom={props.dateFrom}
        initialResponsibleTitle={props.responsibleTitle || ""}
        initialResponsibleUserId={props.responsibleUserId || fallbackEmployeeId}
        onSave={handleSaveSettings}
      />

      <UvSpecEditDialog
        open={specEditOpen}
        onOpenChange={setSpecEditOpen}
        spec={config.spec}
        onSave={handleSaveSpec}
      />

      {addRowOpen && (
        <AddRowDialog
          key={`uv-row-${fallbackEmployeeId}-${props.responsibleTitle || "default"}`}
          open={addRowOpen}
          onOpenChange={setAddRowOpen}
          users={props.users}
          defaultEmployeeId={fallbackEmployeeId}
          defaultResponsibleTitle={props.responsibleTitle || "Управляющий"}
          onAdd={(data) => {
            handleAddRow(data).catch(() => toast.error("Ошибка добавления строки"));
          }}
        />
      )}
    </div>
  );
}
