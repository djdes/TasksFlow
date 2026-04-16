"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Printer, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DocumentCloseButton } from "@/components/journals/document-close-button";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import {
  getHygienePositionLabel,
  getStaffJournalResponsibleTitleOptions,
  HYGIENE_PERIODICITY_TEXT,
} from "@/lib/hygiene-document";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  heading: string;
  title: string;
  status: string;
  autoFill: boolean;
  responsibleTitle: string | null;
  users: UserItem[];
  includedEmployeeIds: string[];
  routeCode?: string;
  organizationName?: string;
  showHeaderActions?: boolean;
  hideHeading?: boolean;
  hidePrint?: boolean;
  hideAutoFill?: boolean;
  onSettingsClick?: () => void;
};

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (result && typeof result.error === "string" && result.error) ||
        "Операция не выполнена"
    );
  }
  return result;
}

function AddEmployeeDialog({
  open,
  onOpenChange,
  users,
  includedEmployeeIds,
  documentId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  includedEmployeeIds: string[];
  documentId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableUsers = useMemo(
    () => users.filter((user) => !includedEmployeeIds.includes(user.id)),
    [includedEmployeeIds, users]
  );

  useEffect(() => {
    if (!open) return;
    setValue(availableUsers[0]?.id || "");
  }, [availableUsers, open]);

  async function handleSubmit() {
    if (!value) return;

    setIsSubmitting(true);
    try {
      await requestJson(`/api/journal-documents/${documentId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_employee",
          employeeId: value,
        }),
      });

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка добавления сотрудника");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[670px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <DialogTitle className="text-[30px] font-medium text-black">
            Добавление новой строки
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-10 py-8">
          <p className="text-[18px] text-black">
            Выберите соответствующую должность и сотрудника.
          </p>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность</Label>
            <Select value={value} onValueChange={setValue} disabled={availableUsers.length === 0}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {getHygienePositionLabel(user.role)} — {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !value}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Добавление..." : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FillFromStaffDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  users,
  includedEmployeeIds,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  documentId: string;
  documentTitle: string;
  users: UserItem[];
  includedEmployeeIds: string[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleOptions = useMemo(() => {
    const roles = [...new Set(users.map((user) => user.role))];
    const items = [{ value: "all", label: "Добавить всех" }];

    roles.forEach((role) => {
      const prefix = role === "owner" ? "Руководство" : "Сотрудники";
      items.push({
        value: `role:${role}`,
        label: `${prefix} — ${getHygienePositionLabel(role)}`,
      });
    });

    return items;
  }, [users]);

  const remainingCount = useMemo(() => {
    if (category === "all") {
      return users.filter((user) => !includedEmployeeIds.includes(user.id)).length;
    }

    const role = category.replace("role:", "");
    return users.filter(
      (user) => user.role === role && !includedEmployeeIds.includes(user.id)
    ).length;
  }, [category, includedEmployeeIds, users]);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await requestJson(`/api/journal-documents/${documentId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fill_from_list",
          category,
        }),
      });

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка заполнения из списка");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[690px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <DialogTitle className="text-[22px] font-medium leading-[1.2] text-black">
            Заполнение документа:
            <br />
            &quot;{documentTitle}&quot;
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-10 py-8">
          <div className="text-[18px] text-black">Добавить из категории:</div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {remainingCount === 0 && (
            <div className="text-[16px] text-[#ff3b30]">Все сотрудники внесены в список.</div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || remainingCount === 0}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Добавление..." : "Добавить"}
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
  documentId,
  title,
  responsibleTitle,
  users,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  documentId: string;
  title: string;
  responsibleTitle: string | null;
  users: UserItem[];
}) {
  const router = useRouter();
  const [name, setName] = useState(title);
  const [responsible, setResponsible] = useState(responsibleTitle || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const options = useMemo(() => getStaffJournalResponsibleTitleOptions(users), [users]);

  useEffect(() => {
    if (!open) return;
    setName(title);
    setResponsible(responsibleTitle || options[0] || "");
  }, [open, options, responsibleTitle, title]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await requestJson(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: name.trim(),
          responsibleTitle: responsible,
        }),
      });

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения настроек журнала");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[765px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label htmlFor="journal-title" className="sr-only">
              Название документа
            </Label>
            <Input
              id="journal-title"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Введите название документа"
              className="h-22 rounded-3xl border-[#dfe1ec] px-8 text-[24px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select value={responsible} onValueChange={setResponsible}>
              <SelectTrigger className="h-22 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-8 text-[24px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-2xl border border-[#dfe1ec] px-5 py-4">
            <div className="text-[18px] text-[#73738a]">Периодичность контроля</div>
            <div className="text-[22px] leading-[1.35] text-black">{HYGIENE_PERIODICITY_TEXT}</div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StaffJournalToolbar({
  documentId,
  heading,
  title,
  status,
  autoFill,
  responsibleTitle,
  users,
  includedEmployeeIds,
  routeCode,
  showHeaderActions = false,
  hideHeading = false,
  hidePrint = false,
  hideAutoFill = false,
  onSettingsClick,
}: Props) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [checked, setChecked] = useState(autoFill);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    setChecked(autoFill);
  }, [autoFill]);

  async function handleAutoFill(value: boolean) {
    const previous = checked;
    setChecked(value);
    setIsSwitching(true);

    try {
      await requestJson(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFill: value }),
      });

      if (value) {
        await requestJson(`/api/journal-documents/${documentId}/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply_auto_fill" }),
        });
      }

      router.refresh();
    } catch (error) {
      setChecked(previous);
      toast.error(error instanceof Error ? error.message : "Ошибка автозаполнения");
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <>
      <div className="space-y-8">
        {showHeaderActions && routeCode ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <DocumentBackLink href={`/journals/${routeCode}`} className="mb-0" />
            <div className="flex flex-wrap items-center gap-3">
              {!hidePrint && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(`/api/journal-documents/${documentId}/pdf`, "_blank", "noopener,noreferrer")
                  }
                  className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                >
                  <Printer className="size-4" />
                  Печать
                </Button>
              )}
              {status === "active" && (
                <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (onSettingsClick) {
                      onSettingsClick();
                    } else {
                      setSettingsOpen(true);
                    }
                  }}
                  className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
                >
                  Настройки журнала
                </Button>
                <DocumentCloseButton
                  documentId={documentId}
                  title={title}
                  variant="outline"
                  className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
                >
                  Закончить журнал
                </DocumentCloseButton>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-6">
          {!hideHeading ? (
            <h1 className="text-[62px] font-semibold tracking-[-0.04em] text-black">{heading}</h1>
          ) : (
            <div />
          )}
          {!showHeaderActions && status === "active" && (
            <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            >
              Настройки журнала
            </Button>
            <DocumentCloseButton
              documentId={documentId}
              title={title}
              variant="outline"
              className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            >
              Закончить журнал
            </DocumentCloseButton>
            </>
          )}
        </div>

        {status === "active" && (
          <>
            {!hideAutoFill && (
              <div className="rounded-[22px] bg-[#f3f4fe] px-6 py-5">
                <div className="flex items-center gap-4">
                  <Switch
                    checked={checked}
                    onCheckedChange={handleAutoFill}
                    disabled={isSwitching}
                    className="h-10 w-16 data-[state=checked]:bg-[#5b66ff] data-[state=unchecked]:bg-[#d6d9ee]"
                  />
                  <span className="text-[20px] font-medium text-black">
                    Автоматически заполнять журнал
                  </span>
                </div>
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-[58px] w-fit rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4b57ff]">
                  <Plus className="size-7" />
                  Добавить
                  <ChevronDown className="size-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[360px] rounded-[24px] border-0 p-4 shadow-xl">
                <DropdownMenuItem
                  className="h-16 rounded-2xl px-4 text-[18px] text-[#5464ff]"
                  onSelect={() => setAddOpen(true)}
                >
                  <UserPlus className="mr-4 size-6 text-[#5464ff]" />
                  Добавить сотрудника
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-16 rounded-2xl px-4 text-[18px] text-[#5464ff]"
                  onSelect={() => setFillOpen(true)}
                >
                  <Users className="mr-4 size-6 text-[#5464ff]" />
                  Заполнить из списка сотрудников
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <JournalSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        documentId={documentId}
        title={title}
        responsibleTitle={responsibleTitle}
        users={users}
      />

      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        users={users}
        includedEmployeeIds={includedEmployeeIds}
        documentId={documentId}
      />

      <FillFromStaffDialog
        open={fillOpen}
        onOpenChange={setFillOpen}
        documentId={documentId}
        documentTitle={title}
        users={users}
        includedEmployeeIds={includedEmployeeIds}
      />
    </>
  );
}
