"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Settings2, Trash2, X } from "lucide-react";
import { DocumentPageHeader } from "@/components/journals/document-page-header";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDistinctRoleLabels, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import {
  DISINFECTANT_HEADING,
  DISINFECTANT_DOCUMENT_TITLE,
  MEASURE_UNIT_LABELS,
  normalizeDisinfectantConfig,
  computeNeedPerTreatment,
  computeNeedPerMonth,
  computeNeedPerYear,
  formatNumber,
  formatQuantityWithUnit,
  createEmptySubdivision,
  createEmptyReceipt,
  createEmptyConsumption,
  type DisinfectantDocumentConfig,
  type SubdivisionRow,
  type ReceiptRow,
  type ConsumptionRow,
  type MeasureUnit,
} from "@/lib/disinfectant-document";

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

function formatDateRu(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

// ---------- Subdivision Add Dialog ----------
function AddSubdivisionDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (row: SubdivisionRow) => Promise<void>;
}) {
  const [row, setRow] = useState(createEmptySubdivision);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRow(createEmptySubdivision());
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) reset();
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[660px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              Добавление новой строки
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">
              Наименование подразделения / объекта
            </Label>
            <textarea
              value={row.name}
              onChange={(e) => setRow({ ...row, name: e.target.value })}
              placeholder="Наименование подразделения / объекта"
              className="min-h-[100px] w-full rounded-2xl border border-[#d8dae6] px-4 py-3 text-[18px] outline-none focus:border-[#5566f6]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">
              Площадь объекта (кв.м)
            </Label>
            <Input
              type="number"
              value={row.byCapacity ? "" : row.area ?? ""}
              onChange={(e) =>
                setRow({
                  ...row,
                  area: e.target.value ? Number(e.target.value) : null,
                })
              }
              disabled={row.byCapacity}
              placeholder="Введите площадь объекта (кв.м)"
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={row.byCapacity}
              onCheckedChange={(c) =>
                setRow({ ...row, byCapacity: c, area: c ? null : row.area })
              }
            />
            <span className="text-[16px]">На ёмкость</span>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Вид обработки</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[16px]">
                <input
                  type="radio"
                  name="treatmentType"
                  checked={row.treatmentType === "current"}
                  onChange={() =>
                    setRow({ ...row, treatmentType: "current" })
                  }
                  className="size-5 accent-[#5566f6]"
                />
                Текущая
              </label>
              <label className="flex items-center gap-2 text-[16px]">
                <input
                  type="radio"
                  name="treatmentType"
                  checked={row.treatmentType === "general"}
                  onChange={() =>
                    setRow({ ...row, treatmentType: "general" })
                  }
                  className="size-5 accent-[#5566f6]"
                />
                Генеральная
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">
              Кратность обработок в месяц
            </Label>
            <Input
              type="number"
              value={row.frequencyPerMonth || ""}
              onChange={(e) =>
                setRow({
                  ...row,
                  frequencyPerMonth: Number(e.target.value) || 0,
                })
              }
              placeholder="Введите кратность обработок в месяц"
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={submitting || !row.name.trim()}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit(row);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Subdivision Edit Dialog ----------
function EditSubdivisionDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: SubdivisionRow | null;
  onSubmit: (row: SubdivisionRow) => Promise<void>;
}) {
  const [row, setRow] = useState<SubdivisionRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const active = row || props.initial;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setRow(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[660px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              Редактирование строки
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        {active && (
          <div className="space-y-4 px-8 py-6">
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Наименование подразделения / объекта
              </Label>
              <textarea
                value={active.name}
                onChange={(e) =>
                  setRow({ ...active, name: e.target.value })
                }
                className="min-h-[80px] w-full rounded-2xl border border-[#d8dae6] px-4 py-3 text-[18px] outline-none focus:border-[#5566f6]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Площадь объекта (кв.м)
              </Label>
              <Input
                type="number"
                value={active.byCapacity ? "" : active.area ?? ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    area: e.target.value ? Number(e.target.value) : null,
                  })
                }
                disabled={active.byCapacity}
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={active.byCapacity}
                onCheckedChange={(c) =>
                  setRow({
                    ...active,
                    byCapacity: c,
                    area: c ? null : active.area,
                  })
                }
              />
              <span className="text-[16px]">На ёмкость</span>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Вид обработки
              </Label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-[16px]">
                  <input
                    type="radio"
                    name="editTreatmentType"
                    checked={active.treatmentType === "current"}
                    onChange={() =>
                      setRow({ ...active, treatmentType: "current" })
                    }
                    className="size-5 accent-[#5566f6]"
                  />
                  Текущая
                </label>
                <label className="flex items-center gap-2 text-[16px]">
                  <input
                    type="radio"
                    name="editTreatmentType"
                    checked={active.treatmentType === "general"}
                    onChange={() =>
                      setRow({ ...active, treatmentType: "general" })
                    }
                    className="size-5 accent-[#5566f6]"
                  />
                  Генеральная
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Кратность обработок в месяц
              </Label>
              <Input
                type="number"
                value={active.frequencyPerMonth || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    frequencyPerMonth: Number(e.target.value) || 0,
                  })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <h3 className="pt-2 text-[18px] font-semibold">
              Дезинфицирующее средство
            </h3>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Наименование
              </Label>
              <Input
                value={active.disinfectantName}
                onChange={(e) =>
                  setRow({ ...active, disinfectantName: e.target.value })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Концентрация (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={active.concentration || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    concentration: Number(e.target.value) || 0,
                  })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Расход рабочего раствора на один кв. м. (л)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={active.solutionConsumptionPerSqm || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    solutionConsumptionPerSqm: Number(e.target.value) || 0,
                  })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Кол-во раб. р-ра для одн.обр. объекта (л)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={active.solutionPerTreatment || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    solutionPerTreatment: Number(e.target.value) || 0,
                  })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <h3 className="pt-2 text-[18px] font-semibold">
              Потребность в дезинфицирующем средстве
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-[14px] text-[#73738a]">
                  На одну обработку (кг, л)
                </Label>
                <div className="h-11 rounded-2xl border border-[#d8dae6] bg-[#f1f2f8] px-4 py-4 text-[15px]">
                  {formatNumber(computeNeedPerTreatment(active))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[14px] text-[#73738a]">
                  На один месяц (кг, л)
                </Label>
                <div className="h-11 rounded-2xl border border-[#d8dae6] bg-[#f1f2f8] px-4 py-4 text-[15px]">
                  {formatNumber(computeNeedPerMonth(active))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[14px] text-[#73738a]">
                  На один год (кг, л)
                </Label>
                <div className="h-11 rounded-2xl border border-[#d8dae6] bg-[#f1f2f8] px-4 py-4 text-[15px]">
                  {formatNumber(computeNeedPerYear(active))}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  if (!active) return;
                  setSubmitting(true);
                  try {
                    await props.onSubmit(active);
                    props.onOpenChange(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Receipt Add/Edit Dialog ----------
function ReceiptDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: UserItem[];
  initial: ReceiptRow | null;
  onSubmit: (row: ReceiptRow) => Promise<void>;
  dialogTitle: string;
}) {
  const [row, setRow] = useState<ReceiptRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);
  const active = row || props.initial;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setRow(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[660px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.dialogTitle}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        {active && (
          <div className="space-y-4 px-8 py-6">
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Дата получения
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  value={active.date}
                  onChange={(e) =>
                    setRow({ ...active, date: toIsoDate(e.target.value) })
                  }
                  className="h-11 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[15px]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Наименование дез. средства
              </Label>
              <Input
                value={active.disinfectantName}
                onChange={(e) =>
                  setRow({ ...active, disinfectantName: e.target.value })
                }
                placeholder="Введите наименование дез. средства"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Количество полученного дез. средства
              </Label>
              <Input
                type="number"
                value={active.quantity || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    quantity: Number(e.target.value) || 0,
                  })
                }
                placeholder="Введите количество"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
              <div className="flex gap-6 pt-1">
                {(["kg", "l", "bottle"] as MeasureUnit[]).map((u) => (
                  <label
                    key={u}
                    className="flex items-center gap-2 text-[16px]"
                  >
                    <input
                      type="radio"
                      checked={active.unit === u}
                      onChange={() => setRow({ ...active, unit: u })}
                      className="size-5 accent-[#5566f6]"
                    />
                    {MEASURE_UNIT_LABELS[u]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Срок годности до
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  value={active.expiryDate}
                  onChange={(e) =>
                    setRow({
                      ...active,
                      expiryDate: toIsoDate(e.target.value),
                    })
                  }
                  className="h-11 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[15px]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Должность ответственного
              </Label>
              <Select
                value={active.responsibleRole}
                onValueChange={(v) => {
                  const user = usersForRole(props.users, v)[0];
                  setRow({
                    ...active,
                    responsibleRole: v,
                    responsibleEmployeeId: user?.id || null,
                    responsibleEmployee:
                      user?.name || active.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">Сотрудник</Label>
              <Select
                value={active.responsibleEmployeeId || "__empty__"}
                onValueChange={(v) => {
                  if (v === "__empty__") {
                    setRow({ ...active, responsibleEmployeeId: null, responsibleEmployee: "" });
                    return;
                  }
                  const user = props.users.find((item) => item.id === v);
                  setRow({ ...active, responsibleEmployeeId: v, responsibleEmployee: user?.name || "" });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                  {usersForRole(props.users, active.responsibleRole).map(
                    (u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {buildStaffOptionLabel(u)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  if (!active) return;
                  setSubmitting(true);
                  try {
                    await props.onSubmit(active);
                    props.onOpenChange(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Consumption Add/Edit Dialog ----------
function ConsumptionDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: UserItem[];
  initial: ConsumptionRow | null;
  onSubmit: (row: ConsumptionRow) => Promise<void>;
  dialogTitle: string;
}) {
  const [row, setRow] = useState<ConsumptionRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);
  const active = row || props.initial;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setRow(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[660px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.dialogTitle}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        {active && (
          <div className="space-y-4 px-8 py-6">
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Наименование дез. средства
              </Label>
              <Input
                value={active.disinfectantName}
                onChange={(e) =>
                  setRow({ ...active, disinfectantName: e.target.value })
                }
                placeholder="Введите наименование дез. средства"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Общее количество полученного дез. средства
              </Label>
              <Input
                type="number"
                value={active.totalReceived || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    totalReceived: Number(e.target.value) || 0,
                  })
                }
                placeholder="Количество"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
              <div className="flex gap-6 pt-1">
                {(["kg", "l", "bottle"] as MeasureUnit[]).map((u) => (
                  <label
                    key={u}
                    className="flex items-center gap-2 text-[16px]"
                  >
                    <input
                      type="radio"
                      checked={active.totalReceivedUnit === u}
                      onChange={() =>
                        setRow({ ...active, totalReceivedUnit: u })
                      }
                      className="size-5 accent-[#5566f6]"
                    />
                    {MEASURE_UNIT_LABELS[u]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Общее количество израсход. дез. средства
              </Label>
              <Input
                type="number"
                value={active.totalConsumed || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    totalConsumed: Number(e.target.value) || 0,
                  })
                }
                placeholder="Количество"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
              <div className="flex gap-6 pt-1">
                {(["kg", "l", "bottle"] as MeasureUnit[]).map((u) => (
                  <label
                    key={u}
                    className="flex items-center gap-2 text-[16px]"
                  >
                    <input
                      type="radio"
                      checked={active.totalConsumedUnit === u}
                      onChange={() =>
                        setRow({ ...active, totalConsumedUnit: u })
                      }
                      className="size-5 accent-[#5566f6]"
                    />
                    {MEASURE_UNIT_LABELS[u]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Остаток на конец периода дез. средства
              </Label>
              <Input
                type="number"
                value={active.remainder || ""}
                onChange={(e) =>
                  setRow({
                    ...active,
                    remainder: Number(e.target.value) || 0,
                  })
                }
                placeholder="Количество"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
              <div className="flex gap-6 pt-1">
                {(["kg", "l", "bottle"] as MeasureUnit[]).map((u) => (
                  <label
                    key={u}
                    className="flex items-center gap-2 text-[16px]"
                  >
                    <input
                      type="radio"
                      checked={active.remainderUnit === u}
                      onChange={() =>
                        setRow({ ...active, remainderUnit: u })
                      }
                      className="size-5 accent-[#5566f6]"
                    />
                    {MEASURE_UNIT_LABELS[u]}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">
                Должность ответственного
              </Label>
              <Select
                value={active.responsibleRole}
                onValueChange={(v) => {
                  const user = usersForRole(props.users, v)[0];
                  setRow({
                    ...active,
                    responsibleRole: v,
                    responsibleEmployeeId: user?.id || null,
                    responsibleEmployee:
                      user?.name || active.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[16px] text-[#73738a]">Сотрудник</Label>
              <Select
                value={active.responsibleEmployeeId || "__empty__"}
                onValueChange={(v) => {
                  if (v === "__empty__") {
                    setRow({ ...active, responsibleEmployeeId: null, responsibleEmployee: "" });
                    return;
                  }
                  const user = props.users.find((item) => item.id === v);
                  setRow({ ...active, responsibleEmployeeId: v, responsibleEmployee: user?.name || "" });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                  {usersForRole(props.users, active.responsibleRole).map(
                    (u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {buildStaffOptionLabel(u)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  if (!active) return;
                  setSubmitting(true);
                  try {
                    await props.onSubmit(active);
                    props.onOpenChange(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Settings Dialog ----------
function DocumentSettingsDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: UserItem[];
  initial: {
    title: string;
    responsibleRole: string;
    responsibleEmployeeId: string;
    responsibleEmployee: string;
  };
  onSubmit: (value: {
    title: string;
    responsibleRole: string;
    responsibleEmployeeId: string;
    responsibleEmployee: string;
  }) => Promise<void>;
}) {
  const [state, setState] = useState(props.initial);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setState(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
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
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">
              Название документа
            </Label>
            <Input
              value={state.title}
              onChange={(e) =>
                setState({ ...state, title: e.target.value })
              }
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">
              Должность ответственного
            </Label>
            <Select
              value={state.responsibleRole}
              onValueChange={(v) => {
                const user = usersForRole(props.users, v)[0];
                setState({
                  ...state,
                  responsibleRole: v,
                  responsibleEmployeeId: user?.id || "",
                  responsibleEmployee:
                    user?.name || state.responsibleEmployee,
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={state.responsibleEmployeeId || "__empty__"}
              onValueChange={(v) => {
                if (v === "__empty__") {
                  setState({ ...state, responsibleEmployeeId: "", responsibleEmployee: "" });
                  return;
                }
                const user = props.users.find((item) => item.id === v);
                setState({ ...state, responsibleEmployeeId: v, responsibleEmployee: user?.name || "" });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {usersForRole(props.users, state.responsibleRole).map(
                  (u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {buildStaffOptionLabel(u)}
                    </SelectItem>
                  )
                )}
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
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Component ----------
export function DisinfectantDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  users,
  config,
}: Props) {
  const router = useRouter();
  const normalized = normalizeDisinfectantConfig(config);
  const readOnly = status === "closed";

  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [selectedRecIds, setSelectedRecIds] = useState<string[]>([]);
  const [selectedConIds, setSelectedConIds] = useState<string[]>([]);

  const [addSubOpen, setAddSubOpen] = useState(false);
  const [editSubTarget, setEditSubTarget] = useState<SubdivisionRow | null>(
    null
  );
  const [addRecOpen, setAddRecOpen] = useState(false);
  const [editRecTarget, setEditRecTarget] = useState<ReceiptRow | null>(null);
  const [addConOpen, setAddConOpen] = useState(false);
  const [editConTarget, setEditConTarget] = useState<ConsumptionRow | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function patchConfig(
    nextConfig: DisinfectantDocumentConfig,
    nextTitle = title
  ) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle, config: nextConfig }),
    });
    if (!response.ok) {
      toast.error("Не удалось сохранить документ");
      return;
    }
    router.refresh();
  }

  // --- Subdivision CRUD ---
  async function addSubdivision(row: SubdivisionRow) {
    await patchConfig({
      ...normalized,
      subdivisions: [...normalized.subdivisions, row],
    });
  }

  async function updateSubdivision(row: SubdivisionRow) {
    const next = normalized.subdivisions.map((s) =>
      s.id === row.id ? row : s
    );
    await patchConfig({ ...normalized, subdivisions: next });
  }

  async function deleteSelectedSubs() {
    if (selectedSubIds.length === 0) return;
    if (
      !window.confirm(
        `Удалить выбранные строки (${selectedSubIds.length})?`
      )
    )
      return;
    const next = normalized.subdivisions.filter(
      (s) => !selectedSubIds.includes(s.id)
    );
    setSelectedSubIds([]);
    await patchConfig({ ...normalized, subdivisions: next });
  }

  // --- Receipt CRUD ---
  async function addReceipt(row: ReceiptRow) {
    await patchConfig({
      ...normalized,
      receipts: [...normalized.receipts, row],
    });
  }

  async function updateReceipt(row: ReceiptRow) {
    const next = normalized.receipts.map((r) => (r.id === row.id ? row : r));
    await patchConfig({ ...normalized, receipts: next });
  }

  async function deleteSelectedReceipts() {
    if (selectedRecIds.length === 0) return;
    if (
      !window.confirm(
        `Удалить выбранные строки (${selectedRecIds.length})?`
      )
    )
      return;
    const next = normalized.receipts.filter(
      (r) => !selectedRecIds.includes(r.id)
    );
    setSelectedRecIds([]);
    await patchConfig({ ...normalized, receipts: next });
  }

  // --- Consumption CRUD ---
  async function addConsumption(row: ConsumptionRow) {
    await patchConfig({
      ...normalized,
      consumptions: [...normalized.consumptions, row],
    });
  }

  async function updateConsumption(row: ConsumptionRow) {
    const next = normalized.consumptions.map((c) =>
      c.id === row.id ? row : c
    );
    await patchConfig({ ...normalized, consumptions: next });
  }

  async function deleteSelectedConsumptions() {
    if (selectedConIds.length === 0) return;
    if (
      !window.confirm(
        `Удалить выбранные строки (${selectedConIds.length})?`
      )
    )
      return;
    const next = normalized.consumptions.filter(
      (c) => !selectedConIds.includes(c.id)
    );
    setSelectedConIds([]);
    await patchConfig({ ...normalized, consumptions: next });
  }

  // --- Totals ---
  const totalNeedPerTreatment = normalized.subdivisions.reduce(
    (sum, s) => sum + computeNeedPerTreatment(s),
    0
  );
  const totalNeedPerMonth = normalized.subdivisions.reduce(
    (sum, s) => sum + computeNeedPerMonth(s),
    0
  );
  const totalNeedPerYear = normalized.subdivisions.reduce(
    (sum, s) => sum + computeNeedPerYear(s),
    0
  );
  const totalReceiptQuantity = normalized.receipts.reduce(
    (sum, r) => sum + r.quantity,
    0
  );

  const allSubsSelected =
    normalized.subdivisions.length > 0 &&
    selectedSubIds.length === normalized.subdivisions.length;
  const allRecsSelected =
    normalized.receipts.length > 0 &&
    selectedRecIds.length === normalized.receipts.length;
  const allConsSelected =
    normalized.consumptions.length > 0 &&
    selectedConIds.length === normalized.consumptions.length;

  const anySelected =
    selectedSubIds.length > 0 ||
    selectedRecIds.length > 0 ||
    selectedConIds.length > 0;

  return (
    <div className="space-y-8">
      <DocumentPageHeader
        backHref="/journals/disinfectant_usage"
        documentId={documentId}
        rightActions={
          !readOnly ? (
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="size-4" /> Настройки журнала
            </Button>
          ) : null
        }
      />

      <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
        {title}
      </h1>

      {/* Selection bar */}
      {anySelected && !readOnly && (
        <div className="flex items-center gap-4 rounded-2xl bg-[#f3f4fe] px-6 py-3">
          <button
            type="button"
            className="flex items-center gap-1 text-[16px] text-[#5566f6]"
            onClick={() => {
              setSelectedSubIds([]);
              setSelectedRecIds([]);
              setSelectedConIds([]);
            }}
          >
            <X className="size-4" /> Выбранно:{" "}
            {selectedSubIds.length +
              selectedRecIds.length +
              selectedConIds.length}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 text-[16px] text-[#ff3b30]"
            onClick={() => {
              if (selectedSubIds.length > 0) deleteSelectedSubs();
              if (selectedRecIds.length > 0) deleteSelectedReceipts();
              if (selectedConIds.length > 0) deleteSelectedConsumptions();
            }}
          >
            <Trash2 className="size-4" /> Удалить
          </button>
        </div>
      )}

      {/* Document Header */}
      <section className="space-y-4 rounded-[18px] border border-[#dadde9] bg-white p-8">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr_220px] border border-black/70">
          <div className="flex items-center justify-center border-r border-black/70 py-10 text-[16px] font-semibold">
            {organizationName}
          </div>
          <div className="grid grid-rows-2">
            <div className="flex items-center justify-center border-b border-black/70 py-4 text-[14px]">
              СИСТЕМА ХАССП
            </div>
            <div className="flex items-center justify-center px-4 py-4 text-center text-[14px] font-semibold uppercase">
              ЖУРНАЛ УЧЕТА ПОЛУЧЕНИЯ, РАСХОДА ДЕЗИНФИЦИРУЮЩИХ СРЕДСТВ И
              ПРОВЕДЕНИЯ ДЕЗИНФЕКЦИОННЫХ РАБОТ НА ОБЪЕКТЕ
            </div>
          </div>
          <div className="flex items-center justify-center border-l border-black/70 text-[14px]">
            СТР. 1 ИЗ 1
          </div>
        </div>

        {/* === Section 1: Needs Calculation === */}
        <h2 className="pt-4 text-center text-[20px] font-semibold uppercase">
          РАСЧЕТ ПОТРЕБНОСТИ В ДЕЗИНФИЦИРУЮЩИХ СРЕДСТВАХ
        </h2>

        {!readOnly && (
          <Button
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            onClick={() => setAddSubOpen(true)}
          >
            <Plus className="size-5" /> Добавить подразделение
          </Button>
        )}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[13px]">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="w-12 border border-black/70 px-1 py-2"
                >
                  {!readOnly && (
                    <Checkbox
                      checked={allSubsSelected}
                      onCheckedChange={(c) =>
                        setSelectedSubIds(
                          c === true
                            ? normalized.subdivisions.map((s) => s.id)
                            : []
                        )
                      }
                    />
                  )}
                </th>
                <th
                  rowSpan={2}
                  className="min-w-[200px] border border-black/70 px-2 py-2"
                >
                  Наименование подразделения / объекта подлежащего дезинфекции
                </th>
                <th
                  rowSpan={2}
                  className="w-[80px] border border-black/70 px-1 py-2"
                >
                  Площадь объекта (кв.м)
                </th>
                <th
                  rowSpan={2}
                  className="w-[60px] border border-black/70 px-1 py-2"
                >
                  Вид обработки (Т, Г)
                </th>
                <th
                  rowSpan={2}
                  className="w-[80px] border border-black/70 px-1 py-2"
                >
                  Кратность обработок в месяц
                </th>
                <th
                  colSpan={2}
                  className="border border-black/70 px-2 py-2"
                >
                  Дезинфицирующее средство
                </th>
                <th
                  rowSpan={2}
                  className="w-[80px] border border-black/70 px-1 py-2"
                >
                  Расход рабочего раствора на один кв. м. (л)
                </th>
                <th
                  rowSpan={2}
                  className="w-[100px] border border-black/70 px-1 py-2"
                >
                  Количество рабочего раствора для однократной обработки объекта
                  (л)
                </th>
                <th
                  colSpan={3}
                  className="border border-black/70 px-2 py-2"
                >
                  Потребность в дезинфицирующем средстве
                </th>
              </tr>
              <tr>
                <th className="w-[120px] border border-black/70 px-1 py-2">
                  Наименование
                </th>
                <th className="w-[80px] border border-black/70 px-1 py-2">
                  Концентрация (%)
                </th>
                <th className="w-[80px] border border-black/70 px-1 py-2">
                  На одну обработку (кг, л)
                </th>
                <th className="w-[80px] border border-black/70 px-1 py-2">
                  На один месяц (кг, л)
                </th>
                <th className="w-[80px] border border-black/70 px-1 py-2">
                  На один год (кг, л)
                </th>
              </tr>
            </thead>
            <tbody>
              {normalized.subdivisions.map((sub) => (
                <tr
                  key={sub.id}
                  className={
                    !readOnly ? "cursor-pointer hover:bg-[#f5f6ff]" : ""
                  }
                  onClick={() => !readOnly && setEditSubTarget(sub)}
                >
                  <td
                    className="border border-black/70 px-1 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!readOnly && (
                      <Checkbox
                        checked={selectedSubIds.includes(sub.id)}
                        onCheckedChange={(c) =>
                          setSelectedSubIds((cur) =>
                            c === true
                              ? [...new Set([...cur, sub.id])]
                              : cur.filter((id) => id !== sub.id)
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {sub.name}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.byCapacity ? "На ёмк." : sub.area}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.treatmentType === "current" ? "Т" : "Г"}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.frequencyPerMonth}
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {sub.disinfectantName}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.concentration || ""}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.solutionConsumptionPerSqm || ""}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {sub.solutionPerTreatment || ""}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {formatNumber(computeNeedPerTreatment(sub))}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {formatNumber(computeNeedPerMonth(sub))}
                  </td>
                  <td className="border border-black/70 px-1 py-2 text-center">
                    {formatNumber(computeNeedPerYear(sub))}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td
                  colSpan={9}
                  className="border border-black/70 px-2 py-2 text-right"
                >
                  Общая потребность дез. средства
                </td>
                <td className="border border-black/70 px-1 py-2 text-center">
                  {formatNumber(totalNeedPerTreatment)}
                </td>
                <td className="border border-black/70 px-1 py-2 text-center">
                  {formatNumber(totalNeedPerMonth)}
                </td>
                <td className="border border-black/70 px-1 py-2 text-center">
                  {formatNumber(totalNeedPerYear)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* === Section 2: Receipts === */}
        <h2 className="pt-8 text-center text-[20px] font-semibold uppercase">
          СВЕДЕНИЯ О ПОСТУПЛЕНИИ ДЕЗИНФИЦИРУЮЩИХ СРЕДСТВ
        </h2>

        {!readOnly && (
          <Button
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            onClick={() => setAddRecOpen(true)}
          >
            <Plus className="size-5" /> Добавить поступление
          </Button>
        )}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[13px]">
            <thead>
              <tr>
                <th className="w-12 border border-black/70 px-1 py-2">
                  {!readOnly && (
                    <Checkbox
                      checked={allRecsSelected}
                      onCheckedChange={(c) =>
                        setSelectedRecIds(
                          c === true
                            ? normalized.receipts.map((r) => r.id)
                            : []
                        )
                      }
                    />
                  )}
                </th>
                <th className="w-[120px] border border-black/70 px-2 py-2">
                  Дата получения
                </th>
                <th className="min-w-[200px] border border-black/70 px-2 py-2">
                  Наименование дез. средства
                </th>
                <th className="w-[160px] border border-black/70 px-2 py-2">
                  Количество полученного дез. средства (кг, литр, флакон)
                </th>
                <th className="w-[120px] border border-black/70 px-2 py-2">
                  Срок годности до
                </th>
                <th className="w-[160px] border border-black/70 px-2 py-2">
                  Ответственный за получение
                </th>
              </tr>
            </thead>
            <tbody>
              {normalized.receipts.map((rec) => (
                <tr
                  key={rec.id}
                  className={
                    !readOnly ? "cursor-pointer hover:bg-[#f5f6ff]" : ""
                  }
                  onClick={() => !readOnly && setEditRecTarget(rec)}
                >
                  <td
                    className="border border-black/70 px-1 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!readOnly && (
                      <Checkbox
                        checked={selectedRecIds.includes(rec.id)}
                        onCheckedChange={(c) =>
                          setSelectedRecIds((cur) =>
                            c === true
                              ? [...new Set([...cur, rec.id])]
                              : cur.filter((id) => id !== rec.id)
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatDateRu(rec.date)}
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {rec.disinfectantName}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatQuantityWithUnit(rec.quantity, rec.unit)}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatDateRu(rec.expiryDate)}
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {rec.responsibleEmployee}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td
                  colSpan={3}
                  className="border border-black/70 px-2 py-2 text-right"
                >
                  Итого:
                </td>
                <td className="border border-black/70 px-2 py-2 text-center">
                  {totalReceiptQuantity}
                </td>
                <td
                  colSpan={2}
                  className="border border-black/70 px-2 py-2"
                />
              </tr>
            </tbody>
          </table>
        </div>

        {/* === Section 3: Consumption === */}
        <h2 className="pt-8 text-center text-[20px] font-semibold uppercase">
          СВЕДЕНИЯ О РАСХОДОВАНИИ ДЕЗИНФИЦИРУЮЩИХ СРЕДСТВ
        </h2>

        {!readOnly && (
          <Button
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            onClick={() => setAddConOpen(true)}
          >
            <Plus className="size-5" /> Добавить расход
          </Button>
        )}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[13px]">
            <thead>
              <tr>
                <th className="w-12 border border-black/70 px-1 py-2">
                  {!readOnly && (
                    <Checkbox
                      checked={allConsSelected}
                      onCheckedChange={(c) =>
                        setSelectedConIds(
                          c === true
                            ? normalized.consumptions.map((c2) => c2.id)
                            : []
                        )
                      }
                    />
                  )}
                </th>
                <th className="w-[130px] border border-black/70 px-2 py-2">
                  За период с_____ по_____
                </th>
                <th className="min-w-[180px] border border-black/70 px-2 py-2">
                  Наименование дез. средства
                </th>
                <th className="w-[160px] border border-black/70 px-2 py-2">
                  Общее количество полученного дез. средства (кг, литр, флакон),
                  в том числе остаток с прошлого периода
                </th>
                <th className="w-[160px] border border-black/70 px-2 py-2">
                  Общее количество израсходованного за период дез. средства (кг,
                  литр, флакон)
                </th>
                <th className="w-[140px] border border-black/70 px-2 py-2">
                  Остаток на конец периода дез. средства (кг, литр, флакон)
                </th>
                <th className="w-[140px] border border-black/70 px-2 py-2">
                  Ответственный за получение
                </th>
              </tr>
            </thead>
            <tbody>
              {normalized.consumptions.map((con) => (
                <tr
                  key={con.id}
                  className={
                    !readOnly ? "cursor-pointer hover:bg-[#f5f6ff]" : ""
                  }
                  onClick={() => !readOnly && setEditConTarget(con)}
                >
                  <td
                    className="border border-black/70 px-1 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!readOnly && (
                      <Checkbox
                        checked={selectedConIds.includes(con.id)}
                        onCheckedChange={(c) =>
                          setSelectedConIds((cur) =>
                            c === true
                              ? [...new Set([...cur, con.id])]
                              : cur.filter((id) => id !== con.id)
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    <div>{formatDateRu(con.periodFrom)}</div>
                    <div className="my-1 text-[13px] text-[#999]">—</div>
                    <div>{formatDateRu(con.periodTo)}</div>
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {con.disinfectantName}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatQuantityWithUnit(
                      con.totalReceived,
                      con.totalReceivedUnit
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatQuantityWithUnit(
                      con.totalConsumed,
                      con.totalConsumedUnit
                    )}
                  </td>
                  <td className="border border-black/70 px-2 py-2 text-center">
                    {formatQuantityWithUnit(con.remainder, con.remainderUnit)}
                  </td>
                  <td className="border border-black/70 px-2 py-2">
                    {con.responsibleEmployee}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialogs */}
      <AddSubdivisionDialog
        open={addSubOpen}
        onOpenChange={setAddSubOpen}
        onSubmit={addSubdivision}
      />
      <EditSubdivisionDialog
        open={!!editSubTarget}
        onOpenChange={(v) => {
          if (!v) setEditSubTarget(null);
        }}
        initial={editSubTarget}
        onSubmit={updateSubdivision}
      />
      <ReceiptDialog
        open={addRecOpen}
        onOpenChange={setAddRecOpen}
        users={users}
        initial={createEmptyReceipt(
          normalized.responsibleRole,
          normalized.responsibleEmployee,
          normalized.responsibleEmployeeId
        )}
        onSubmit={addReceipt}
        dialogTitle="Добавление новой строки"
      />
      <ReceiptDialog
        open={!!editRecTarget}
        onOpenChange={(v) => {
          if (!v) setEditRecTarget(null);
        }}
        users={users}
        initial={editRecTarget}
        onSubmit={updateReceipt}
        dialogTitle="Редактирование строки"
      />
      <ConsumptionDialog
        open={addConOpen}
        onOpenChange={setAddConOpen}
        users={users}
        initial={createEmptyConsumption(
          normalized.responsibleRole,
          normalized.responsibleEmployee,
          normalized.responsibleEmployeeId
        )}
        onSubmit={addConsumption}
        dialogTitle="Добавление новой строки"
      />
      <ConsumptionDialog
        open={!!editConTarget}
        onOpenChange={(v) => {
          if (!v) setEditConTarget(null);
        }}
        users={users}
        initial={editConTarget}
        onSubmit={updateConsumption}
        dialogTitle="Редактирование строки"
      />
      <DocumentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        users={users}
        initial={{
          title,
          responsibleRole: normalized.responsibleRole,
          responsibleEmployeeId: normalized.responsibleEmployeeId || "",
          responsibleEmployee: normalized.responsibleEmployee,
        }}
        onSubmit={async (value) => {
          await patchConfig(
            {
              ...normalized,
              responsibleRole: value.responsibleRole,
              responsibleEmployeeId: value.responsibleEmployeeId || null,
              responsibleEmployee: value.responsibleEmployee,
            },
            value.title.trim() || title
          );
        }}
      />
    </div>
  );
}
