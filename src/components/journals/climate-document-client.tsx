"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Printer,
  Settings2,
  Trash2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createClimateRoomConfig,
  createEmptyClimateEntryData,
  getClimateDateLabel,
  getClimatePeriodicityText,
  normalizeClimateDocumentConfig,
  syncClimateEntryDataWithConfig,
  type ClimateDocumentConfig,
  type ClimateEntryData,
  type ClimateRoomConfig,
} from "@/lib/climate-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

import { toast } from "sonner";
import { StickyActionBar } from "@/components/journals/sticky-action-bar";
type EmployeeItem = {
  id: string;
  name: string;
  role: string;
};

type RowItem = {
  id: string;
  employeeId: string;
  date: string;
  data: ClimateEntryData;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  status: string;
  autoFill?: boolean;
  employees: EmployeeItem[];
  config: ClimateDocumentConfig;
  initialEntries: RowItem[];
};

function formatRange(min: number | null, max: number | null, unit: string) {
  if (min == null && max == null) return "Не задано";
  if (min != null && max != null) return `от ${min}${unit} до ${max}${unit}`;
  if (min != null) return `от ${min}${unit}`;
  return `до ${max}${unit}`;
}

function getRoomMetricColumnCount(room: ClimateRoomConfig) {
  return Number(room.temperature.enabled) + Number(room.humidity.enabled);
}

function getSortedRows(rows: RowItem[]) {
  return [...rows].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return left.employeeId.localeCompare(right.employeeId);
  });
}

function parseMetricInput(rawValue: string) {
  if (rawValue.trim() === "") return null;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDateWithinDocumentPeriod(dateKey: string, dateFrom: string, dateTo: string) {
  return dateKey >= dateFrom && dateKey <= dateTo;
}

function RoomDialog({
  open,
  onOpenChange,
  initialRoom,
  canDelete,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialRoom: ClimateRoomConfig | null;
  canDelete: boolean;
  onSave: (room: ClimateRoomConfig) => Promise<void>;
  onDelete: (roomId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [temperatureEnabled, setTemperatureEnabled] = useState(true);
  const [temperatureMin, setTemperatureMin] = useState("18");
  const [temperatureMax, setTemperatureMax] = useState("25");
  const [humidityEnabled, setHumidityEnabled] = useState(true);
  const [humidityMin, setHumidityMin] = useState("15");
  const [humidityMax, setHumidityMax] = useState("75");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const room =
      initialRoom ||
      createClimateRoomConfig({
        temperature: { enabled: false, min: 18, max: 25 },
        humidity: { enabled: false, min: 15, max: 75 },
      });
    setName(room.name);
    setTemperatureEnabled(room.temperature.enabled);
    setTemperatureMin(room.temperature.min?.toString() || "");
    setTemperatureMax(room.temperature.max?.toString() || "");
    setHumidityEnabled(room.humidity.enabled);
    setHumidityMin(room.humidity.min?.toString() || "");
    setHumidityMax(room.humidity.max?.toString() || "");
  }, [initialRoom, open]);

  async function handleSave() {
    if (!temperatureEnabled && !humidityEnabled) {
      toast.error("Нужно оставить включённой хотя бы одну норму для помещения.");
      return;
    }

    const room = createClimateRoomConfig({
      id: initialRoom?.id,
      name,
      temperature: {
        enabled: temperatureEnabled,
        min: temperatureMin === "" ? null : Number(temperatureMin),
        max: temperatureMax === "" ? null : Number(temperatureMax),
      },
      humidity: {
        enabled: humidityEnabled,
        min: humidityMin === "" ? null : Number(humidityMin),
        max: humidityMax === "" ? null : Number(humidityMax),
      },
    });

    setIsSubmitting(true);
    try {
      await onSave(room);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения помещения");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!initialRoom) return;
    setIsSubmitting(true);
    try {
      await onDelete(initialRoom.id);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка удаления помещения");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[640px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[24px] font-medium text-black">
            {initialRoom ? "Редактирование помещения" : "Добавление нового помещения"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <div className="space-y-3">
            <Label htmlFor="room-name" className="sr-only">
              Название помещения
            </Label>
            <Input
              id="room-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Введите название помещения"
              className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]"
            />
          </div>

          <div className="space-y-6">
            <div className="text-[18px] font-medium text-black">Нормы условий</div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  checked={temperatureEnabled}
                  onCheckedChange={setTemperatureEnabled}
                  className="h-8 w-14 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
                />
                <div className="text-[20px] text-black">Температура (T)</div>
                <Input
                  type="number"
                  value={temperatureMin}
                  onChange={(event) => setTemperatureMin(event.target.value)}
                  className="h-11 w-[96px] rounded-2xl border-[#dfe1ec] px-3 text-[15px]"
                  disabled={!temperatureEnabled}
                />
                <span className="text-[18px]">°C</span>
                <Input
                  type="number"
                  value={temperatureMax}
                  onChange={(event) => setTemperatureMax(event.target.value)}
                  className="h-11 w-[96px] rounded-2xl border-[#dfe1ec] px-3 text-[15px]"
                  disabled={!temperatureEnabled}
                />
                <span className="text-[18px]">°C</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  checked={humidityEnabled}
                  onCheckedChange={setHumidityEnabled}
                  className="h-8 w-14 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
                />
                <div className="text-[20px] text-black">Влажность воздуха (ВВ)</div>
                <Input
                  type="number"
                  value={humidityMin}
                  onChange={(event) => setHumidityMin(event.target.value)}
                  className="h-11 w-[96px] rounded-2xl border-[#dfe1ec] px-3 text-[15px]"
                  disabled={!humidityEnabled}
                />
                <span className="text-[18px]">%</span>
                <Input
                  type="number"
                  value={humidityMax}
                  onChange={(event) => setHumidityMax(event.target.value)}
                  className="h-11 w-[96px] rounded-2xl border-[#dfe1ec] px-3 text-[15px]"
                  disabled={!humidityEnabled}
                />
                <span className="text-[18px]">%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {initialRoom && canDelete && (
                <>
                  <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="h-11 rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff3f2]"
                >
                  Удалить помещение
                </Button>
                </>
              )}
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || name.trim() === ""}
              className="h-11 rounded-2xl bg-[#5b66ff] px-5 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : initialRoom ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResponsibleDialog({
  open,
  onOpenChange,
  row,
  employees,
  defaultResponsibleTitle,
  defaultResponsibleUserId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  row: RowItem | null;
  employees: EmployeeItem[];
  defaultResponsibleTitle: string | null;
  defaultResponsibleUserId: string | null;
  onSave: (params: {
    rowId: string;
    employeeId: string;
    responsibleTitle: string | null;
  }) => Promise<void>;
}) {
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleOptions = useMemo(
    () => [...new Set(employees.map((employee) => getHygienePositionLabel(employee.role)))],
    [employees]
  );

  useEffect(() => {
    if (!open || !row) return;
    setResponsibleTitle(row.data.responsibleTitle || defaultResponsibleTitle || titleOptions[0] || "");
    setEmployeeId(row.employeeId || defaultResponsibleUserId || employees[0]?.id || "");
  }, [defaultResponsibleTitle, defaultResponsibleUserId, employees, open, row, titleOptions]);

  async function handleSubmit() {
    if (!row) return;
    setIsSubmitting(true);
    try {
      await onSave({
        rowId: row.id,
        employeeId,
        responsibleTitle: responsibleTitle || null,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить ответственного");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[32px] font-medium text-black">
            Редактирование ответственного лица
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-7 px-12 py-10">
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                <SelectValue placeholder="Выберите должность" />
              </SelectTrigger>
              <SelectContent>
                {titleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Сотрудник</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !employeeId}
              className="h-16 rounded-3xl bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddRowDialog({
  open,
  onOpenChange,
  employees,
  defaultResponsibleTitle,
  defaultResponsibleUserId,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  employees: EmployeeItem[];
  defaultResponsibleTitle: string | null;
  defaultResponsibleUserId: string | null;
  onCreate: (params: {
    employeeId: string;
    date: string;
    responsibleTitle: string | null;
  }) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleOptions = useMemo(
    () => [...new Set(employees.map((employee) => getHygienePositionLabel(employee.role)))],
    [employees]
  );

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const todayLabel = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setDate(todayLabel);
    setResponsibleTitle(defaultResponsibleTitle || titleOptions[0] || "");
    setEmployeeId(defaultResponsibleUserId || employees[0]?.id || "");
  }, [defaultResponsibleTitle, defaultResponsibleUserId, employees, open, titleOptions]);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await onCreate({
        employeeId,
        date,
        responsibleTitle: responsibleTitle || null,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка создания строки");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[32px] font-medium text-black">
            Добавление новой строки
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-7 px-12 py-10">
          <div className="space-y-3">
            <Label htmlFor="row-date" className="text-[18px] text-[#73738a]">
              Дата
            </Label>
            <Input
              id="row-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                <SelectValue placeholder="Выберите должность" />
              </SelectTrigger>
              <SelectContent>
                {titleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Сотрудник</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !date || !employeeId}
              className="h-16 rounded-3xl bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JournalSettingsDialog({
  open,
  onOpenChange,
  title,
  responsibleTitle,
  responsibleUserId,
  employees,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  employees: EmployeeItem[];
  config: ClimateDocumentConfig;
  onSave: (params: {
    title: string;
    responsibleTitle: string | null;
    responsibleUserId: string | null;
    config: ClimateDocumentConfig;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(title);
  const [position, setPosition] = useState(responsibleTitle || "");
  const [userId, setUserId] = useState(responsibleUserId || "");
  const [timeOne, setTimeOne] = useState(config.controlTimes[0] || "10:00");
  const [timeTwo, setTimeTwo] = useState(config.controlTimes[1] || "17:00");
  const [skipWeekends, setSkipWeekends] = useState(config.skipWeekends);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleOptions = useMemo(
    () => [...new Set(employees.map((employee) => getHygienePositionLabel(employee.role)))],
    [employees]
  );

  useEffect(() => {
    if (!open) return;
    setName(title);
    setPosition(responsibleTitle || titleOptions[0] || "");
    setUserId(responsibleUserId || employees[0]?.id || "");
    setTimeOne(config.controlTimes[0] || "10:00");
    setTimeTwo(config.controlTimes[1] || "17:00");
    setSkipWeekends(config.skipWeekends);
  }, [config.controlTimes, config.skipWeekends, employees, open, responsibleTitle, responsibleUserId, title, titleOptions]);

  async function handleSave() {
    if (!timeOne && !timeTwo) {
      toast.error("Нужно указать хотя бы одно время контроля.");
      return;
    }

    const nextConfig = normalizeClimateDocumentConfig({
      ...config,
      controlTimes: [timeOne, timeTwo].filter(Boolean),
      skipWeekends,
    });

    setIsSubmitting(true);
    try {
      await onSave({
        title: name.trim(),
        responsibleTitle: position || null,
        responsibleUserId: userId || null,
        config: nextConfig,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[32px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label htmlFor="journal-title" className="sr-only">
              Название журнала
            </Label>
            <Input
              id="journal-title"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-22 rounded-3xl border-[#dfe1ec] px-8 text-[24px]"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-[18px] text-[#73738a]">Должность ответственного</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                  <SelectValue placeholder="Выберите должность" />
                </SelectTrigger>
                <SelectContent>
                  {titleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[18px] text-[#73738a]">Сотрудник по умолчанию</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="h-18 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[20px]">
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="time-one" className="text-[18px] text-[#73738a]">
                Время контроля 1
              </Label>
              <Input
                id="time-one"
                type="time"
                value={timeOne}
                onChange={(event) => setTimeOne(event.target.value)}
                className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="time-two" className="text-[18px] text-[#73738a]">
                Время контроля 2
              </Label>
              <Input
                id="time-two"
                type="time"
                value={timeTwo}
                onChange={(event) => setTimeTwo(event.target.value)}
                className="h-18 rounded-3xl border-[#dfe1ec] px-6 text-[20px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl border border-[#dfe1ec] px-8 py-6">
            <Checkbox
              id="skip-weekends"
              checked={skipWeekends}
              onCheckedChange={(checked) => setSkipWeekends(checked === true)}
              className="size-6"
            />
            <Label htmlFor="skip-weekends" className="text-[20px] text-black">
              Не заполнять в выходные дни
            </Label>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || name.trim() === ""}
              className="h-18 rounded-3xl bg-[#5b66ff] px-10 text-[20px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClimateDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  responsibleTitle,
  responsibleUserId,
  status,
  autoFill = false,
  employees,
  config: initialConfig,
  initialEntries,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [rows, setRows] = useState(getSortedRows(initialEntries));
  const [documentTitle, setDocumentTitle] = useState(title);
  const [defaultResponsibleTitle, setDefaultResponsibleTitle] = useState(
    responsibleTitle
  );
  const [defaultResponsibleUserId, setDefaultResponsibleUserId] = useState(
    responsibleUserId
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [responsibleDialogOpen, setResponsibleDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ClimateRoomConfig | null>(null);
  const [editingResponsibleRow, setEditingResponsibleRow] = useState<RowItem | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [checkedAutoFill, setCheckedAutoFill] = useState(autoFill);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  useEffect(() => {
    setRows(getSortedRows(initialEntries));
  }, [initialEntries]);

  useEffect(() => {
    setDocumentTitle(title);
  }, [title]);

  useEffect(() => {
    setDefaultResponsibleTitle(responsibleTitle);
  }, [responsibleTitle]);

  useEffect(() => {
    setDefaultResponsibleUserId(responsibleUserId);
  }, [responsibleUserId]);

  useEffect(() => {
    setCheckedAutoFill(autoFill);
  }, [autoFill]);

  const employeeMap = useMemo(
    () =>
      Object.fromEntries(
        employees.map((employee) => [employee.id, employee])
      ) as Record<string, EmployeeItem>,
    [employees]
  );

  const visibleRooms = useMemo(
    () => config.rooms.filter((room) => getRoomMetricColumnCount(room) > 0),
    [config.rooms]
  );

  const totalMeasurementColumns = useMemo(
    () =>
      visibleRooms.reduce(
        (total, room) =>
          total + config.controlTimes.length * getRoomMetricColumnCount(room),
        0
      ),
    [config.controlTimes.length, visibleRooms]
  );

  const allSelected =
    rows.length > 0 && selectedRowIds.length > 0 && selectedRowIds.length === rows.length;

  async function persistDocument(params: {
    title?: string;
    responsibleTitle?: string | null;
    responsibleUserId?: string | null;
    autoFill?: boolean;
    config?: ClimateDocumentConfig;
  }) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Не удалось обновить документ");
    }
  }

  async function syncEntriesWithConfig(nextConfig: ClimateDocumentConfig) {
    const response = await fetch(`/api/journal-documents/${documentId}/climate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_entries" }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Не удалось синхронизировать строки");
    }

    setConfig(nextConfig);
    setRows((currentRows) =>
      currentRows.map((row) => ({
        ...row,
        data: syncClimateEntryDataWithConfig(row.data, nextConfig),
      }))
    );
  }

  async function handleSaveSettings(params: {
    title: string;
    responsibleTitle: string | null;
    responsibleUserId: string | null;
    config: ClimateDocumentConfig;
  }) {
    await persistDocument({
      title: params.title,
      responsibleTitle: params.responsibleTitle,
      responsibleUserId: params.responsibleUserId,
      config: params.config,
    });

    setDocumentTitle(params.title);
    setDefaultResponsibleTitle(params.responsibleTitle);
    setDefaultResponsibleUserId(params.responsibleUserId);
    await syncEntriesWithConfig(params.config);
  }

  async function handleSaveRoom(room: ClimateRoomConfig) {
    const nextRooms = editingRoom
      ? config.rooms.map((item) => (item.id === room.id ? room : item))
      : [...config.rooms, room];
    const nextConfig = normalizeClimateDocumentConfig({
      ...config,
      rooms: nextRooms,
    });

    await persistDocument({ config: nextConfig });
    await syncEntriesWithConfig(nextConfig);
  }

  async function handleDeleteRoom(roomId: string) {
    const nextConfig = normalizeClimateDocumentConfig({
      ...config,
      rooms: config.rooms.filter((room) => room.id !== roomId),
    });

    await persistDocument({ config: nextConfig });
    await syncEntriesWithConfig(nextConfig);
  }

  async function handleCreateRow(params: {
    employeeId: string;
    date: string;
    responsibleTitle: string | null;
  }) {
    if (!isDateWithinDocumentPeriod(params.date, dateFrom, dateTo)) {
      toast.error("Дата строки должна попадать в период документа.");
      return;
    }

    const duplicate = rows.some(
      (row) => row.employeeId === params.employeeId && row.date === params.date
    );
    if (duplicate) {
      toast.error("Для выбранной даты и сотрудника строка уже существует.");
      return;
    }

    const data = createEmptyClimateEntryData(config, params.responsibleTitle);
    const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: params.employeeId,
        date: params.date,
        data,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) {
      throw new Error(result?.error || "Не удалось создать строку");
    }

    setRows((currentRows) =>
      getSortedRows([
        ...currentRows,
        {
          id: result.entry.id,
          employeeId: params.employeeId,
          date: params.date,
          data,
        },
      ])
    );
  }

  async function handleSaveResponsible(params: {
    rowId: string;
    employeeId: string;
    responsibleTitle: string | null;
  }) {
    const row = rows.find((item) => item.id === params.rowId);
    if (!row) return;

    const duplicate = rows.some(
      (item) =>
        item.id !== row.id &&
        item.employeeId === params.employeeId &&
        item.date === row.date
    );
    if (duplicate) {
      throw new Error("Для выбранной даты и сотрудника строка уже существует.");
    }

    const nextRow: RowItem = {
      ...row,
      employeeId: params.employeeId,
      data: {
        ...row.data,
        responsibleTitle: params.responsibleTitle,
      },
    };

    setRows((currentRows) =>
      currentRows.map((item) => (item.id === row.id ? nextRow : item))
    );

    try {
      await saveRow(nextRow);
    } catch (error) {
      setRows((currentRows) =>
        currentRows.map((item) => (item.id === row.id ? row : item))
      );
      throw error;
    }
  }

  async function saveRow(nextRow: RowItem) {
    const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
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
      throw new Error(result?.error || "Не удалось сохранить строку");
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === nextRow.id
          ? { ...nextRow, id: result.entry.id }
          : row
      )
    );
  }

  async function handleMeasurementBlur(
    rowId: string,
    roomId: string,
    time: string,
    field: "temperature" | "humidity",
    rawValue: string
  ) {
    const nextValue = parseMetricInput(rawValue);
    const row = rows.find((item) => item.id === rowId);
    if (!row) return;
    const previousRow = row;

    const nextRow: RowItem = {
      ...row,
      data: {
        ...row.data,
        measurements: {
          ...row.data.measurements,
          [roomId]: {
            ...row.data.measurements[roomId],
            [time]: {
              temperature:
                field === "temperature"
                  ? nextValue
                  : row.data.measurements[roomId]?.[time]?.temperature ?? null,
              humidity:
                field === "humidity"
                  ? nextValue
                  : row.data.measurements[roomId]?.[time]?.humidity ?? null,
            },
          },
        },
      },
    };

    setRows((currentRows) =>
      currentRows.map((item) => (item.id === rowId ? nextRow : item))
    );

    try {
      await saveRow(nextRow);
    } catch (error) {
      setRows((currentRows) =>
        currentRows.map((item) => (item.id === rowId ? previousRow : item))
      );
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    }
  }

  function handleMeasurementChange(
    rowId: string,
    roomId: string,
    time: string,
    field: "temperature" | "humidity",
    rawValue: string
  ) {
    const nextValue = parseMetricInput(rawValue);

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id !== rowId) return row;

        return {
          ...row,
          data: {
            ...row.data,
            measurements: {
              ...row.data.measurements,
              [roomId]: {
                ...row.data.measurements[roomId],
                [time]: {
                  temperature:
                    field === "temperature"
                      ? nextValue
                      : row.data.measurements[roomId]?.[time]?.temperature ?? null,
                  humidity:
                    field === "humidity"
                      ? nextValue
                      : row.data.measurements[roomId]?.[time]?.humidity ?? null,
                },
              },
            },
          },
        };
      })
    );
  }

  async function handleSkipWeekendsChange(checked: boolean) {
    const nextConfig = normalizeClimateDocumentConfig({
      ...config,
      skipWeekends: checked,
    });

    try {
      await persistDocument({ config: nextConfig });
      setConfig(nextConfig);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить настройки");
    }
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    const confirmed = window.confirm(`Удалить выбранные строки (${count})?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/journal-documents/${documentId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRowIds }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Не удалось удалить строки");
      }

      setRows((currentRows) =>
        currentRows.filter((row) => !selectedRowIds.includes(row.id))
      );
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function handleAutoFillChange(value: boolean) {
    setCheckedAutoFill(value);
    setIsSwitching(true);

    try {
      await persistDocument({ autoFill: value });

      if (value) {
        const response = await fetch(`/api/journal-documents/${documentId}/climate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply_auto_fill" }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error || "Не удалось применить автозаполнение");
        }
      }

      router.refresh();
    } catch (error) {
      setCheckedAutoFill(!value);
      toast.error(
        error instanceof Error ? error.message : "Ошибка обновления автозаполнения"
      );
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1840px] px-6 py-8">
        <DocumentBackLink href="/journals/climate_control" />
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="mt-2 text-[56px] font-semibold tracking-[-0.04em] text-black">
              {documentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(`/api/journal-documents/${documentId}/pdf`, "_blank")}
              className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            >
              <Printer className="size-6" />
              Печать
            </Button>
            {status === "active" && (
              <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                <Settings2 className="size-6" />
                Настройки документа
              </Button>
              <DocumentCloseButton
                documentId={documentId}
                title={documentTitle}
                variant="outline"
                className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              />
              </>
            )}
          </div>
        </div>

        <div className="mb-10 rounded-[24px] bg-[#f3f4fe] px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Switch
                checked={checkedAutoFill}
                onCheckedChange={handleAutoFillChange}
                disabled={status !== "active" || isSwitching}
                className="h-10 w-16 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
              />
              <span className="text-[20px] font-medium text-black">
                Автоматически заполнять журнал
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSummaryOpen((value) => !value)}
              className="flex size-11 items-center justify-center rounded-full text-[#5b66ff] hover:bg-white/70"
            >
              {summaryOpen ? <ChevronUp className="size-7" /> : <ChevronDown className="size-7" />}
            </button>
          </div>

          {summaryOpen && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-4 rounded-3xl border border-white/60 bg-white/70 px-6 py-4">
                <Checkbox
                  id="climate-skip-weekends"
                  checked={config.skipWeekends}
                  onCheckedChange={(checked) => handleSkipWeekendsChange(checked === true)}
                  disabled={status !== "active"}
                  className="size-5"
                />
                <Label htmlFor="climate-skip-weekends" className="text-[18px] text-black">
                  Не заполнять в выходные дни
                </Label>
              </div>

              <div className="overflow-x-auto rounded-[18px] bg-white p-6">
                <table className="min-w-[1080px] w-full border-collapse text-[16px]">
                  <tbody>
                    <tr>
                      <td rowSpan={2} className="w-[220px] border border-black px-4 py-4 text-center font-semibold">
                        {organizationName}
                      </td>
                      <td className="border border-black px-4 py-4 text-center text-[18px]">
                        СИСТЕМА ХАССП
                      </td>
                      <td rowSpan={2} className="w-[220px] border border-black px-4 py-3 align-top">
                        <div className="space-y-2 text-[17px] font-semibold">
                          <div>Начат {getClimateDateLabel(dateFrom)}</div>
                          <div>Окончен {status === "closed" ? getClimateDateLabel(dateTo) : "__________"}</div>
                        </div>
                        <div className="mt-4 text-center text-[16px]">СТР. 1 ИЗ 1</div>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-4 py-4 text-center italic">
                        БЛАНК КОНТРОЛЯ ТЕМПЕРАТУРЫ И ВЛАЖНОСТИ
                      </td>
                    </tr>
                    <tr>
                      <td rowSpan={status === "active" ? 2 : 1} className="border border-black px-4 py-6 text-center font-semibold">
                        Нормы условий
                      </td>
                      <td colSpan={2} className="border border-black p-0">
                        <table className="w-full border-collapse">
                          <tbody>
                            {visibleRooms.map((room) => (
                              <tr key={room.id}>
                                <td className="w-[220px] border border-black px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <Checkbox checked />
                                    <span className="font-medium lowercase">{room.name}</span>
                                    {status === "active" && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingRoom(room);
                                          setRoomDialogOpen(true);
                                        }}
                                        className="text-[#5b66ff] hover:text-[#3f49d8]"
                                      >
                                        <Pencil className="size-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="w-1/2 border border-black px-4 py-4 text-center">
                                  {room.temperature.enabled
                                    ? formatRange(room.temperature.min, room.temperature.max, "°C")
                                    : "—"}
                                </td>
                                <td className="w-1/2 border border-black px-4 py-4 text-center">
                                  {room.humidity.enabled
                                    ? formatRange(room.humidity.min, room.humidity.max, "%")
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                            {status === "active" && (
                              <tr>
                                <td colSpan={3} className="border border-black p-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRoom(null);
                                      setRoomDialogOpen(true);
                                    }}
                                    className="flex h-16 w-full items-center justify-center gap-3 bg-[#5661f6] px-6 text-[18px] font-medium text-white hover:bg-[#4854ee]"
                                  >
                                    <Plus className="size-6" />
                                    Добавить помещение
                                  </button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black px-4 py-4 font-semibold">Частота контроля</td>
                      <td colSpan={2} className="border border-black px-4 py-4 text-right">
                        {getClimatePeriodicityText(config)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {status === "active" && (
          <StickyActionBar>
            <Button
              type="button"
              onClick={() => setRowDialogOpen(true)}
              className="h-16 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              <Plus className="size-7" />
              Добавить строку
            </Button>

            {selectedRowIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteSelected}
                className="h-16 rounded-2xl border-[#ffd7d3] px-8 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
              >
                <Trash2 className="size-6" />
                Удалить выбранные
              </Button>
            )}
          </StickyActionBar>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2 text-center" rowSpan={4}>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(
                        checked === true ? rows.map((row) => row.id) : []
                      )
                    }
                    disabled={status !== "active" || rows.length === 0}
                  />
                </th>
                <th className="w-[140px] border border-black p-2 text-center font-semibold" rowSpan={4}>
                  Дата
                </th>
                <th className="border border-black p-2 text-center font-semibold" colSpan={totalMeasurementColumns}>
                  Точки контроля
                </th>
                <th className="w-[260px] border border-black p-2 text-center font-semibold" rowSpan={4}>
                  Фамилия ответственного лица
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                {visibleRooms.map((room) => (
                  <th
                    key={room.id}
                    className="border border-black p-2 text-center font-semibold"
                    colSpan={config.controlTimes.length * getRoomMetricColumnCount(room)}
                  >
                    {room.name}
                  </th>
                ))}
              </tr>
              <tr className="bg-[#f2f2f2]">
                {visibleRooms.flatMap((room) =>
                  config.controlTimes.map((time) => (
                    <th
                      key={`${room.id}:${time}`}
                      className="border border-black p-2 text-center font-semibold"
                      colSpan={getRoomMetricColumnCount(room)}
                    >
                      {time}
                    </th>
                  ))
                )}
              </tr>
              <tr className="bg-[#f2f2f2]">
                {visibleRooms.flatMap((room) =>
                  config.controlTimes.flatMap((time) => [
                    room.temperature.enabled ? (
                      <th
                        key={`${room.id}:${time}:temperature`}
                        className="w-[110px] border border-black p-2 text-center font-semibold"
                      >
                        T, °C
                      </th>
                    ) : null,
                    room.humidity.enabled ? (
                      <th
                        key={`${room.id}:${time}:humidity`}
                        className="w-[110px] border border-black p-2 text-center font-semibold"
                      >
                        ВВ, %
                      </th>
                    ) : null,
                  ])
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const employee = employeeMap[row.employeeId];
                return (
                  <tr key={row.id}>
                    <td className="border border-black p-2 text-center">
                      <Checkbox
                        checked={selectedRowIds.includes(row.id)}
                        onCheckedChange={(checked) =>
                          setSelectedRowIds((current) =>
                            checked === true
                              ? [...new Set([...current, row.id])]
                              : current.filter((value) => value !== row.id)
                          )
                        }
                        disabled={status !== "active"}
                      />
                    </td>
                    <td className="border border-black p-2 text-center">{getClimateDateLabel(row.date)}</td>
                    {visibleRooms.flatMap((room) =>
                      config.controlTimes.flatMap((time) => [
                        room.temperature.enabled ? (
                          <td
                            key={`${row.id}:${room.id}:${time}:temperature`}
                            className="border border-black p-1 text-center"
                          >
                            {status === "active" ? (
                              <Input
                                type="number"
                                step="0.1"
                                value={row.data.measurements[room.id]?.[time]?.temperature ?? ""}
                                onChange={(event) =>
                                  handleMeasurementChange(
                                    row.id,
                                    room.id,
                                    time,
                                    "temperature",
                                    event.target.value
                                  )
                                }
                                onBlur={(event) =>
                                  handleMeasurementBlur(
                                    row.id,
                                    room.id,
                                    time,
                                    "temperature",
                                    event.target.value
                                  )
                                }
                                className="h-10 min-w-[88px] border-0 px-2 text-center shadow-none focus-visible:ring-1"
                              />
                            ) : (
                              row.data.measurements[room.id]?.[time]?.temperature ?? ""
                            )}
                          </td>
                        ) : null,
                        room.humidity.enabled ? (
                          <td
                            key={`${row.id}:${room.id}:${time}:humidity`}
                            className="border border-black p-1 text-center"
                          >
                            {status === "active" ? (
                              <Input
                                type="number"
                                step="0.1"
                                value={row.data.measurements[room.id]?.[time]?.humidity ?? ""}
                                onChange={(event) =>
                                  handleMeasurementChange(
                                    row.id,
                                    room.id,
                                    time,
                                    "humidity",
                                    event.target.value
                                  )
                                }
                                onBlur={(event) =>
                                  handleMeasurementBlur(
                                    row.id,
                                    room.id,
                                    time,
                                    "humidity",
                                    event.target.value
                                  )
                                }
                                className="h-10 min-w-[88px] border-0 px-2 text-center shadow-none focus-visible:ring-1"
                              />
                            ) : (
                              row.data.measurements[room.id]?.[time]?.humidity ?? ""
                            )}
                          </td>
                        ) : null,
                      ])
                    )}
                    <td className="border border-black p-2 text-center">
                      <button
                        type="button"
                        disabled={status !== "active"}
                        onClick={() => {
                          setEditingResponsibleRow(row);
                          setResponsibleDialogOpen(true);
                        }}
                        className={`w-full text-center ${status === "active" ? "cursor-pointer hover:text-[#5661f6]" : ""}`}
                      >
                        <div className="font-medium">{employee?.name || "—"}</div>
                        <div className="text-[13px] text-[#666a80]">
                          {row.data.responsibleTitle || defaultResponsibleTitle || ""}
                        </div>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + totalMeasurementColumns}
                    className="border border-black px-4 py-10 text-center text-[18px] text-[#666a80]"
                  >
                    Пока нет строк. Добавь первую запись вручную или включи автозаполнение.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <JournalSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        responsibleTitle={defaultResponsibleTitle}
        responsibleUserId={defaultResponsibleUserId}
        employees={employees}
        config={config}
        onSave={handleSaveSettings}
      />

      <RoomDialog
        open={roomDialogOpen}
        onOpenChange={(value) => {
          setRoomDialogOpen(value);
          if (!value) setEditingRoom(null);
        }}
        initialRoom={editingRoom}
        canDelete={config.rooms.length > 1}
        onSave={handleSaveRoom}
        onDelete={handleDeleteRoom}
      />

      <AddRowDialog
        open={rowDialogOpen}
        onOpenChange={setRowDialogOpen}
        employees={employees}
        defaultResponsibleTitle={defaultResponsibleTitle}
        defaultResponsibleUserId={defaultResponsibleUserId}
        onCreate={handleCreateRow}
      />

      <ResponsibleDialog
        open={responsibleDialogOpen}
        onOpenChange={(value) => {
          setResponsibleDialogOpen(value);
          if (!value) setEditingResponsibleRow(null);
        }}
        row={editingResponsibleRow}
        employees={employees}
        defaultResponsibleTitle={defaultResponsibleTitle}
        defaultResponsibleUserId={defaultResponsibleUserId}
        onSave={handleSaveResponsible}
      />
    </div>
  );
}
