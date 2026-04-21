"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Copy, ExternalLink, Send } from "lucide-react";
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
      <DialogHeader className="border-b px-4 py-5 sm:px-6">
        <DialogTitle className="text-[18px] font-semibold text-[#0b1024]">
          {title}
        </DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
      </DialogHeader>
      <div className="px-4 py-5 sm:px-6 sm:py-6">{body}</div>
      {footer ? (
        <DialogFooter className="flex-row justify-end gap-2 border-t px-4 py-4 sm:px-6">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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

type TgInvitePayload = {
  inviteUrl: string;
  qrPngDataUrl: string;
  expiresAt: string;
};

type AddStep =
  | { kind: "form" }
  | { kind: "created"; userId: string; userName: string }
  | {
      kind: "tg-ready";
      userName: string;
      invite: TgInvitePayload;
    };

export function StaffAddEmployeeDialog(props: {
  position: StaffPosition;
  positions: StaffPosition[];
  onCreated: () => void;
} & Close) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [positionId, setPositionId] = useState(props.position.id);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<AddStep>({ kind: "form" });
  const [copied, setCopied] = useState(false);

  function closeAll() {
    // Reset local state so the next open starts clean.
    setFullName("");
    setPhone("");
    setPositionId(props.position.id);
    setPending(false);
    setStep({ kind: "form" });
    setCopied(false);
    props.onClose();
  }

  async function submit() {
    if (fullName.trim().length < 2) {
      toast.error("Введите ФИО");
      return;
    }
    if (phone.trim().length < 10) {
      toast.error("Укажите телефон — нужен для связи с TasksFlow");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobPositionId: positionId,
          fullName: fullName.trim(),
          phone: phone.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { user?: { id: string; name: string }; error?: string }
        | null;
      if (!res.ok || !data?.user) {
        toast.error(data?.error ?? "Не удалось создать");
        return;
      }
      toast.success("Сотрудник добавлен");
      // Tell the parent to refresh the list, but stay open so the manager
      // can immediately issue a Telegram invite without hunting for the row.
      props.onCreated();
      setStep({
        kind: "created",
        userId: data.user.id,
        userName: data.user.name,
      });
    } finally {
      setPending(false);
    }
  }

  async function issueTgInvite(userId: string, userName: string) {
    setPending(true);
    try {
      const res = await fetch(`/api/staff/${userId}/invite-tg`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | (TgInvitePayload & { error?: string })
        | null;
      if (!res.ok || !data?.inviteUrl) {
        toast.error(data?.error ?? "Не удалось создать приглашение");
        return;
      }
      setStep({
        kind: "tg-ready",
        userName,
        invite: {
          inviteUrl: data.inviteUrl,
          qrPngDataUrl: data.qrPngDataUrl,
          expiresAt: data.expiresAt,
        },
      });
    } finally {
      setPending(false);
    }
  }

  async function copyInviteUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать — выделите ссылку вручную");
    }
  }

  if (step.kind === "tg-ready") {
    return (
      <Dialog open={props.open} onOpenChange={(v) => !v && closeAll()}>
        <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
          {shell(
            `Приглашение для ${step.userName}`,
            <div className="space-y-4">
              <div className="rounded-lg border border-[#eef0fb] bg-[#f8f9ff] p-3 text-[13px] leading-5 text-[#5464ff]">
                Отправьте ссылку сотруднику любым способом или покажите QR.
                При первом открытии в Telegram кабинет активируется
                автоматически. Ссылка действительна 7 дней.
              </div>
              <div className="flex justify-center">
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                  <Image
                    src={step.invite.qrPngDataUrl}
                    alt="QR-код приглашения"
                    width={220}
                    height={220}
                    unoptimized
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={step.invite.inviteUrl}
                  className="h-11 rounded-xl border-[#dcdfed] bg-white text-[13px] text-[#0b1024]"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyInviteUrl(step.invite.inviteUrl)}
                  className="h-11 rounded-xl px-3"
                  aria-label="Скопировать ссылку"
                >
                  <Copy className="size-4" />
                  {copied ? "Скопировано" : "Копировать"}
                </Button>
              </div>
            </div>,
            primaryBtn("Готово", closeAll)
          )}
        </DialogContent>
      </Dialog>
    );
  }

  if (step.kind === "created") {
    return (
      <Dialog open={props.open} onOpenChange={(v) => !v && closeAll()}>
        <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
          {shell(
            "Сотрудник добавлен",
            <div className="space-y-3 text-[14px] leading-5 text-[#0b1024]">
              <p>
                <b>{step.userName}</b> добавлен в штат. Можно сразу выдать
                ссылку-приглашение в Telegram — сотрудник тапнет её с телефона
                и без пароля попадёт в рабочий кабинет бота.
              </p>
              <p className="text-[#6f7282]">
                Если TG-бот пока не нужен, просто нажмите «Готово» — ссылку
                можно будет сгенерировать позже.
              </p>
            </div>,
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={closeAll}
                disabled={pending}
                className="h-11 rounded-xl"
              >
                Готово
              </Button>
              <Button
                type="button"
                onClick={() => issueTgInvite(step.userId, step.userName)}
                disabled={pending}
                className="h-11 min-w-[180px] rounded-xl bg-[#5566f6] text-[14px] font-medium text-white shadow-[0_10px_26px_-12px_rgba(85,102,246,0.55)] hover:bg-[#4a5bf0] disabled:opacity-70"
              >
                <Send className="mr-1.5 size-4" />
                {pending ? "..." : "Выдать ссылку в Telegram"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && closeAll()}>
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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
            <div>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон · +7 985 123-45-67"
                autoComplete="tel"
                className="h-12 rounded-xl border-[#dcdfed] bg-white text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
              />
              <p className="mt-1 text-[11px] leading-snug text-[#6f7282]">
                Если у сотрудника есть TasksFlow с этим номером — автоматически свяжем аккаунты.
              </p>
            </div>
          </div>,
          primaryBtn("Добавить", submit, pending)
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Диалог редактирования ФИО и телефона сотрудника. Пароль / почта /
 * роль / должность тут не трогаются — это отдельные более глубокие
 * действия через /settings/users/[id] (TBD). Этот диалог закрывает
 * частый кейс «опечатался в ФИО — надо исправить» одним кликом.
 */
export function StaffEditEmployeeDialog(props: {
  employee: StaffEmployee;
  pending: boolean;
  onSave: (patch: { name?: string; phone?: string | null }) => void;
} & Close) {
  const { employee, open, onClose, pending, onSave } = props;
  const [name, setName] = useState(employee.name);
  const [phone, setPhone] = useState(employee.phone ?? "");

  // Reset local state when dialog opens on a different employee.
  useEffect(() => {
    if (open) {
      setName(employee.name);
      setPhone(employee.phone ?? "");
    }
  }, [open, employee.id, employee.name, employee.phone]);

  function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast.error("Введите ФИО (минимум 2 символа)");
      return;
    }
    const patch: { name?: string; phone?: string | null } = {};
    if (trimmedName !== employee.name) patch.name = trimmedName;
    const trimmedPhone = phone.trim();
    const currentPhone = employee.phone ?? "";
    if (trimmedPhone !== currentPhone) {
      patch.phone = trimmedPhone === "" ? null : trimmedPhone;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSave(patch);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
        {shell(
          `Редактировать: ${employee.name}`,
          <div className="space-y-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ФИО"
              className="h-12 rounded-xl border-[#dcdfed] bg-white text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
            />
            <div>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон · +7 985 123-45-67"
                autoComplete="tel"
                className="h-12 rounded-xl border-[#dcdfed] bg-white text-[14px] text-[#0b1024] focus-visible:border-[#5566f6] focus-visible:ring-4 focus-visible:ring-[#5566f6]/15"
              />
              <p className="mt-1 text-[11px] leading-snug text-[#6f7282]">
                Меняется номер — запустится автосвязка с TasksFlow по
                совпадению телефона. Чтобы очистить телефон, оставьте
                поле пустым.
              </p>
            </div>
          </div>,
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Отмена
            </Button>
            {primaryBtn("Сохранить", submit, pending)}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffTelegramInviteDialog(props: {
  employee: StaffEmployee;
  mode: "invite" | "rebind";
  botUrl: string | null;
  pending: boolean;
  error: string | null;
  invite: TgInvitePayload | null;
} & Close) {
  const { employee, mode, botUrl, onClose, open, pending, error, invite } = props;
  const [copied, setCopied] = useState(false);
  const setPending = (_value: boolean) => {};
  const setError = (_value: string | null) => {};
  const setInvite = (_value: TgInvitePayload | null) => {};
  const onIssued = () => {};

  useEffect(() => {
    let cancelled = false;

    async function issue() {
      setPending(true);
      setError(null);
      setInvite(null);
      try {
        const res = await fetch(`/api/staff/${employee.id}/invite-tg`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = (await res.json().catch(() => null)) as
          | (TgInvitePayload & { error?: string })
          | null;
        if (!res.ok || !data?.inviteUrl) {
          throw new Error(data?.error || "Не удалось создать приглашение");
        }
        if (cancelled) return;
        setInvite({
          inviteUrl: data.inviteUrl,
          qrPngDataUrl: data.qrPngDataUrl,
          expiresAt: data.expiresAt,
        });
        onIssued();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Не удалось создать приглашение"
          );
        }
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    }

    if (open) {
      void issue();
    }

    return () => {
      cancelled = true;
    };
  }, [employee.id, mode, onIssued, open]);

  async function copyInviteUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  }

  const title =
    mode === "rebind"
      ? `Перепривязать TG для ${employee.name}`
      : `Пригласить в TG: ${employee.name}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
        {shell(
          title,
          pending ? (
            <div className="py-8 text-center text-[14px] text-[#6f7282]">
              Готовим ссылку Telegram…
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#ffd2cd] bg-[#fff4f2] p-3 text-[13px] text-[#d2453d]">
                {error}
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={onClose} className="h-11 rounded-xl">
                  Закрыть
                </Button>
              </div>
            </div>
          ) : invite ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#eef0fb] bg-[#f8f9ff] p-3 text-[13px] leading-5 text-[#5464ff]">
                {mode === "rebind"
                  ? "Ссылка обновлена. Сотрудник увидит ее в уведомлениях сайта, а если Telegram уже был привязан — еще и в сообщении Telegram."
                  : "Ссылка готова. Сотрудник увидит ее в уведомлениях сайта, а вы можете сразу передать ее вручную или показать QR."}
              </div>
              <div className="flex justify-center">
                <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                  <Image
                    src={invite.qrPngDataUrl}
                    alt="QR-код приглашения в Telegram"
                    width={220}
                    height={220}
                    unoptimized
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={invite.inviteUrl}
                  className="h-11 rounded-xl border-[#dcdfed] bg-white text-[13px] text-[#0b1024]"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyInviteUrl(invite.inviteUrl)}
                  className="h-11 rounded-xl px-3"
                >
                  <Copy className="size-4" />
                  {copied ? "Скопировано" : "Копировать"}
                </Button>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="h-11 rounded-xl"
                >
                  Готово
                </Button>
                <Button
                  type="button"
                  asChild
                  className="h-11 rounded-xl bg-[#5566f6] text-white hover:bg-[#4a5bf0]"
                >
                  <a href={invite.inviteUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-4" />
                    Открыть Telegram
                  </a>
                </Button>
                {employee.telegramLinked && botUrl ? (
                  <Button type="button" variant="outline" asChild className="h-11 rounded-xl">
                    <a href={botUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1.5 size-4" />
                      Открыть чат бота
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[480px]">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
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
      <DialogContent className="max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[460px]">
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
