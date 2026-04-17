"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  PositionCategory,
  StaffEmployee,
  StaffPosition,
} from "@/components/staff/staff-types";

type Close = { onClose: () => void; open: boolean };

function shell(title: string, body: React.ReactNode, footer?: React.ReactNode) {
  return (
    <>
      <DialogHeader className="border-b px-6 py-5">
        <DialogTitle className="text-[18px] font-semibold text-[#0b1024]">
          {title}
        </DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
      </DialogHeader>
      <div className="px-6 py-6">{body}</div>
      {footer ? (
        <DialogFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          {footer}
        </DialogFooter>
      ) : null}
    </>
  );
}

function primaryBtn(
  label: string,
  onClick: () => void,
  pending?: boolean,
  disabled?: boolean
) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="h-11 min-w-[130px] rounded-xl bg-[#5566f6] text-[14px] font-medium text-white shadow-[0_10px_26px_-12px_rgba(85,102,246,0.55)] hover:bg-[#4a5bf0] disabled:opacity-70"
    >
      {pending ? "..." : label}
    </Button>
  );
}

function floatingLabel({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="absolute left-4 top-2 text-[11px] font-medium text-[#9b9fb3]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function StaffAddPositionDialog(props: {
  categoryKey: PositionCategory;
  onCreated: () => void;
} & Close) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (name.trim().length < 2) {
      toast.error("Введите название");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), categoryKey: props.categoryKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось создать");
        return;
      }
      toast.success("Должность создана");
      props.onCreated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          "Добавление должности",
          floatingLabel({
            id: "pos-name",
            label: "Должность",
            children: (
              <Input
                id="pos-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, «Повар холодного цеха»"
                className="h-12 rounded-xl border-[#dcdfed] bg-[#f5f6ff] pl-4 pr-4 pt-6 text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
              />
            ),
          }),
          primaryBtn("Добавить", submit, pending)
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffEditPositionDialog(props: {
  position: StaffPosition;
  onUpdated: () => void;
} & Close) {
  const [name, setName] = useState(props.position.name);
  const [categoryKey, setCategoryKey] = useState<PositionCategory>(
    props.position.categoryKey
  );
  const [pending, setPending] = useState(false);

  async function submit() {
    if (name.trim().length < 2) {
      toast.error("Введите название");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/positions/${props.position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), categoryKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось сохранить");
        return;
      }
      toast.success("Должность обновлена");
      props.onUpdated();
    } finally {
      setPending(false);
    }
  }

  async function deletePos() {
    if (!confirm("Удалить должность? Она должна быть пустой.")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/positions/${props.position.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось удалить");
        return;
      }
      toast.success("Должность удалена");
      props.onUpdated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          "Редактирование должности",
          <div className="space-y-4">
            {floatingLabel({
              id: "edit-parent",
              label: "Родительская рубрика",
              children: (
                <select
                  id="edit-parent"
                  value={categoryKey}
                  onChange={(e) => setCategoryKey(e.target.value as PositionCategory)}
                  className="h-12 w-full rounded-xl border border-[#dcdfed] bg-[#f5f6ff] px-4 pt-6 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
                >
                  <option value="management">Руководство</option>
                  <option value="staff">Сотрудники</option>
                </select>
              ),
            })}
            {floatingLabel({
              id: "edit-pos-name",
              label: "Должность",
              children: (
                <Input
                  id="edit-pos-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 rounded-xl border-[#dcdfed] bg-white pl-4 pr-4 pt-6 text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
                />
              ),
            })}
          </div>,
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={deletePos}
              disabled={pending}
              className="text-[13px] font-medium text-[#d2453d] hover:underline disabled:opacity-50"
            >
              Удалить должность
            </button>
            {primaryBtn("Сохранить", submit, pending)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffAddEmployeeDialog(props: {
  position: StaffPosition;
  positions: StaffPosition[];
  onCreated: () => void;
} & Close) {
  const [fullName, setFullName] = useState("");
  const [positionId, setPositionId] = useState(props.position.id);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (fullName.trim().length < 2) {
      toast.error("Введите ФИО");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobPositionId: positionId, fullName: fullName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось создать");
        return;
      }
      toast.success("Сотрудник добавлен");
      props.onCreated();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          "Добавление сотрудника",
          <div className="space-y-4">
            {floatingLabel({
              id: "add-emp-pos",
              label: "Должность",
              children: (
                <select
                  id="add-emp-pos"
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className="h-12 w-full rounded-xl border border-[#dcdfed] bg-[#f5f6ff] px-4 pt-6 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
                >
                  {props.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.categoryKey === "management" ? "Руководство · " : "Сотрудники · "}
                      {p.name}
                    </option>
                  ))}
                </select>
              ),
            })}
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Введите ФИО сотрудника"
              className="h-12 rounded-xl border-[#dcdfed] bg-white text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
            />
          </div>,
          primaryBtn("Добавить", submit, pending)
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffArchiveDialog(props: {
  employee: StaffEmployee;
  onConfirm: () => void;
} & Close) {
  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          `Архивирование сотрудника "${props.employee.name}"`,
          <p className="text-[13px] text-[#6f7282]">
            Сотрудник исчезнет из активных списков и графиков, но останется
            привязан к прежним записям в журналах.
          </p>,
          primaryBtn("В архив", props.onConfirm)
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffDeleteBlockedDialog(props: {
  employee: StaffEmployee;
} & Close) {
  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[480px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          `Удаление сотрудника "${props.employee.name}"`,
          <div className="space-y-2 text-[13px] text-[#6f7282]">
            <p>Данный сотрудник участвует в журналах. Удаление не возможно.</p>
            <p>Если сотрудник уволился, то перенесите его в архив.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffIikoDialog(props: Close) {
  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          "Заполнение выходных дней из iiko",
          <p className="text-[13px] text-[#6f7282]">
            Для настройки синхронизации с iiko обратитесь к разработчикам сервиса HACCP-Online.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffInstructionDialog(props: Close) {
  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[560px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          "Инструкция по странице «Сотрудники»",
          <div className="space-y-3 text-[13px] leading-[1.55] text-[#3c4053]">
            <p>
              На этой странице вы можете управлять штатом организации: добавлять
              должности, сотрудников, а также вести графики выходных дней,
              отпусков, больничных и увольнений.
            </p>
            <p>
              Все заполненные графики используются <b>только для автозаполнения
              Гигиенического журнала</b> — в соответствующие ячейки журнала
              будут подставляться значения «В», «Отп» или «Б/л».
            </p>
            <p>
              Если сотрудник участвует в уже существующих записях журналов, его
              нельзя удалить — но можно перевести в <b>Архив</b>: запись в
              прежних журналах сохранится, а в активных списках его не будет.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffAddPeriodDialog(props: {
  kind: "vacation" | "sick_leave" | "dismissal";
  positions: StaffPosition[];
  employees: StaffEmployee[];
  onConfirm: (payload: {
    kind: "vacation" | "sick_leave" | "dismissal";
    userId: string;
    dateFrom: string;
    dateTo?: string;
  }) => void;
} & Close) {
  const [positionId, setPositionId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState<string>("");
  const [pending, setPending] = useState(false);

  const employeesForPosition = useMemo(() => {
    if (!positionId) return [] as StaffEmployee[];
    return props.employees.filter((e) => e.jobPositionId === positionId);
  }, [props.employees, positionId]);

  function addDays(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function submit() {
    if (!userId) {
      toast.error("Выберите сотрудника");
      return;
    }
    if (!dateFrom) {
      toast.error("Укажите дату");
      return;
    }
    if (props.kind !== "dismissal") {
      if (!dateTo) {
        toast.error("Укажите дату окончания");
        return;
      }
      if (dateTo < dateFrom) {
        toast.error("Дата ПО не может быть раньше С");
        return;
      }
    }
    setPending(true);
    try {
      await props.onConfirm({
        kind: props.kind,
        userId,
        dateFrom,
        dateTo: props.kind === "dismissal" ? undefined : dateTo,
      });
    } finally {
      setPending(false);
    }
  }

  const title =
    props.kind === "dismissal"
      ? "Добавление увольнения"
      : "Добавление новой строки";
  const fromLabel =
    props.kind === "vacation"
      ? "Дата отпуска С"
      : props.kind === "sick_leave"
        ? "Дата больничного С"
        : "Дата увольнения С";
  const toLabel =
    props.kind === "vacation"
      ? "Дата отпуска ПО"
      : "Дата больничного ПО";

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden rounded-2xl p-0">
        {shell(
          title,
          <div className="space-y-4">
            {floatingLabel({
              id: "period-pos",
              label: "Должность",
              children: (
                <select
                  id="period-pos"
                  value={positionId}
                  onChange={(e) => {
                    setPositionId(e.target.value);
                    setUserId("");
                  }}
                  className="h-12 w-full rounded-xl border border-[#dcdfed] bg-[#f5f6ff] px-4 pt-6 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
                >
                  <option value="">- Выберите значение -</option>
                  {props.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ),
            })}
            {positionId ? (
              floatingLabel({
                id: "period-user",
                label: "Сотрудник",
                children: (
                  <select
                    id="period-user"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="h-12 w-full rounded-xl border border-[#dcdfed] bg-white px-4 pt-6 text-[14px] text-[#0b1024] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
                  >
                    <option value="">- Выберите значение -</option>
                    {employeesForPosition.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                ),
              })
            ) : null}

            {floatingLabel({
              id: "period-from",
              label: fromLabel,
              children: (
                <Input
                  id="period-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-12 rounded-xl border-[#dcdfed] bg-white px-4 pt-6 text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
                />
              ),
            })}
            {props.kind !== "dismissal" ? (
              <>
                {floatingLabel({
                  id: "period-to",
                  label: toLabel,
                  children: (
                    <Input
                      id="period-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-12 rounded-xl border-[#dcdfed] bg-white px-4 pt-6 text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
                    />
                  ),
                })}
                <div className="flex flex-wrap gap-3 text-[13px] text-[#5566f6]">
                  {[7, 14, 21, 28].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDateTo(addDays(dateFrom, d))}
                      className="hover:underline"
                    >
                      +{d} дней
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>,
          primaryBtn("Добавить", submit, pending)
        )}
      </DialogContent>
    </Dialog>
  );
}
