"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  Copy,
  Ellipsis,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDistinctRoleLabels, getUsersForRoleLabel } from "@/lib/user-roles";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import {
  SANITATION_DAY_DOCUMENT_TITLE,
  SANITATION_DAY_HEADING,
  createEmptySanitationRow,
  getSanitationApproveLabel,
  getSanitationDayDefaultConfig,
  getSanitationDocumentDateLabel,
  getSanitationYearLabel,
  normalizeSanitationDayConfig,
  type SanitationDayConfig,
} from "@/lib/sanitation-day-document";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type SanitationDocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  dateTo: string;
  config: unknown;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  users: UserItem[];
  documents: SanitationDocumentItem[];
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

function toUiState(document: SanitationDocumentItem): SettingsState {
  const normalized = normalizeSanitationDayConfig(document.config);
  return {
    title: document.title || SANITATION_DAY_DOCUMENT_TITLE,
    documentDate: normalized.documentDate,
    year: String(normalized.year),
    approveRole: normalized.approveRole,
    approveEmployeeId: normalized.approveEmployeeId || "",
    approveEmployee: normalized.approveEmployee,
    responsibleRole: normalized.responsibleRole,
    responsibleEmployeeId: normalized.responsibleEmployeeId || "",
    responsibleEmployee: normalized.responsibleEmployee,
  };
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  initial: SettingsState | null;
  onSubmit: (value: SettingsState) => Promise<void>;
  submitText: string;
  title: string;
}) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);
  const activeState = state || props.initial;

  async function handleSubmit() {
    if (!activeState) return;
    setSubmitting(true);
    try {
      await props.onSubmit(activeState);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(value) => {
        if (value) setState(props.initial);
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.title}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#0b1024]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        {activeState ? (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[15px] text-[#7a7c8e]">
                Название документа
              </Label>
              <Input
                value={activeState.title}
                onChange={(event) =>
                  setState({ ...activeState, title: event.target.value })
                }
                className="h-11 rounded-2xl border-[#d8dae6] px-5 text-[16px] tracking-[-0.02em]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[15px] text-[#7a7c8e]">
                Дата документа
              </Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.documentDate}
                  onChange={(event) =>
                    setState({
                      ...activeState,
                      documentDate: toIsoDate(event.target.value),
                    })
                  }
                  className="h-11 rounded-2xl border-[#d8dae6] px-5 pr-12 text-[16px] tracking-[-0.02em]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080] sm:right-6 sm:size-8" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[15px] text-[#7a7c8e]">Год</Label>
              <Select
                value={activeState.year}
                onValueChange={(value) =>
                  setState({ ...activeState, year: value })
                }
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-5 text-[16px]">
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
            </div>

            <div className="space-y-2">
              <Label className="text-[15px] text-[#7a7c8e]">
                Должность &quot;Утверждаю&quot;
              </Label>
              <Select
                value={activeState.approveRole}
                onValueChange={(value) => {
                  const firstUser = usersForRole(props.users, value)[0];
                  setState({
                    ...activeState,
                    approveRole: value,
                    approveEmployeeId: firstUser?.id || "",
                    approveEmployee:
                      firstUser?.name || activeState.approveEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-5 text-[16px]">
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
              <Label className="text-[15px] text-[#7a7c8e]">Сотрудник</Label>
              <Select
                value={activeState.approveEmployeeId}
                onValueChange={(value) => {
                  const user = props.users.find((item) => item.id === value);
                  setState({
                    ...activeState,
                    approveEmployeeId: value,
                    approveEmployee: user?.name || activeState.approveEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-5 text-[16px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {usersForRole(props.users, activeState.approveRole).map(
                    (user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {buildStaffOptionLabel(user)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[15px] text-[#7a7c8e]">
                Ответственный
              </Label>
              <Select
                value={activeState.responsibleRole}
                onValueChange={(value) => {
                  const firstUser = usersForRole(props.users, value)[0];
                  setState({
                    ...activeState,
                    responsibleRole: value,
                    responsibleEmployeeId: firstUser?.id || "",
                    responsibleEmployee:
                      firstUser?.name || activeState.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-5 text-[16px]">
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
              <Label className="text-[15px] text-[#7a7c8e]">Сотрудник</Label>
              <Select
                value={activeState.responsibleEmployeeId}
                onValueChange={(value) => {
                  const user = props.users.find((item) => item.id === value);
                  setState({
                    ...activeState,
                    responsibleEmployeeId: value,
                    responsibleEmployee:
                      user?.name || activeState.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-5 text-[16px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {usersForRole(props.users, activeState.responsibleRole).map(
                    (user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {buildStaffOptionLabel(user)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="max-w-[80%] text-[22px] font-semibold tracking-[-0.03em] text-black">
              Удаление документа &quot;{props.title}&quot;
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#0b1024]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex justify-end px-10 py-8">
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
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SanitationDayDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [settingsTarget, setSettingsTarget] =
    useState<SanitationDocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<SanitationDocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function createDocument(payload: SettingsState) {
    const config = {
      ...getSanitationDayDefaultConfig(
        new Date(`${payload.year}-01-01T00:00:00Z`),
      ),
      year: Number(payload.year),
      documentDate: payload.documentDate,
      approveRole: payload.approveRole,
      approveEmployeeId: payload.approveEmployeeId || null,
      approveEmployee: payload.approveEmployee,
      responsibleRole: payload.responsibleRole,
      responsibleEmployeeId: payload.responsibleEmployeeId || null,
      responsibleEmployee: payload.responsibleEmployee,
      rows: [createEmptySanitationRow("Производство 1 этаж")],
    } as SanitationDayConfig;

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || SANITATION_DAY_DOCUMENT_TITLE,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        responsibleTitle: payload.responsibleRole,
        config,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось создать документ");
      return;
    }

    const data = (await response.json()) as { document: { id: string } };
    router.push(`/journals/${routeCode}/documents/${data.document.id}`);
    router.refresh();
  }

  async function saveSettings(documentId: string, payload: SettingsState) {
    const current = documents.find((item) => item.id === documentId);
    if (!current) return;

    const currentConfig = normalizeSanitationDayConfig(current.config);
    const config: SanitationDayConfig = {
      ...currentConfig,
      year: Number(payload.year),
      documentDate: payload.documentDate,
      approveRole: payload.approveRole,
      approveEmployeeId: payload.approveEmployeeId || null,
      approveEmployee: payload.approveEmployee,
      responsibleRole: payload.responsibleRole,
      responsibleEmployeeId: payload.responsibleEmployeeId || null,
      responsibleEmployee: payload.responsibleEmployee,
    };

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || SANITATION_DAY_DOCUMENT_TITLE,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        responsibleTitle: payload.responsibleRole,
        config,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
  }

  async function handleDelete(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  async function moveToClosed(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!response.ok) {
      toast.error("Не удалось закрыть документ");
      return;
    }
    router.refresh();
  }

  async function moveToActive(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (!response.ok) {
      toast.error("Не удалось отправить в активные");
      return;
    }
    router.refresh();
  }

  async function cloneDocument(documentId: string) {
    const current = documents.find((item) => item.id === documentId);
    if (!current) return;

    const cfg = normalizeSanitationDayConfig(current.config);
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: current.title,
        dateFrom: cfg.documentDate,
        dateTo: cfg.documentDate,
        responsibleTitle: cfg.responsibleRole,
        config: cfg,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сделать копию");
      return;
    }

    router.refresh();
  }

  const defaultCreateState = useMemo<SettingsState>(() => {
    const cfg = getSanitationDayDefaultConfig();
    return {
      title: SANITATION_DAY_DOCUMENT_TITLE,
      documentDate: cfg.documentDate,
      year: String(cfg.year),
      approveRole: cfg.approveRole,
      approveEmployeeId: cfg.approveEmployeeId || "",
      approveEmployee: cfg.approveEmployee,
      responsibleRole: cfg.responsibleRole,
      responsibleEmployeeId: cfg.responsibleEmployeeId || "",
      responsibleEmployee: cfg.responsibleEmployee,
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {SANITATION_DAY_HEADING}
          {activeTab === "closed" ? " (Закрытые!!!)" : ""}
        </h1>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl border-[#e8ebf7] px-6 text-[16px] text-[#5b66ff] shadow-none"
            asChild
          >
            <Link href="/sanpin">
              <BookOpenText className="size-5" />
              Инструкция
            </Link>
          </Button>

          {activeTab === "active" ? (
            <Button
              className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-5" />
              Создать документ
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-12 text-[16px]">
          <Link
            href={`/journals/${routeCode}`}
            className={`relative pb-6 ${
              activeTab === "active"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-6 ${
              activeTab === "closed"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 ? (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-6 py-6 text-[15px] text-[#8a8ea4]">
            Документов пока нет
          </div>
        ) : null}

        {documents.map((document) => {
          const cfg = normalizeSanitationDayConfig(document.config);
          const href = `/journals/${routeCode}/documents/${document.id}`;

          return (
            <div
              key={document.id}
              className="grid grid-cols-1 gap-4 rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[1.7fr_180px_280px_280px_220px_64px] sm:items-center sm:gap-0 sm:px-8"
            >
              <Link
                href={href}
                className="text-[17px] font-semibold tracking-[-0.02em] text-black"
              >
                {document.title || SANITATION_DAY_DOCUMENT_TITLE}
              </Link>

              <Link
                href={href}
                className="border-t border-[#e8ebf5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">Год</div>
                <div className="mt-2 text-[14px] font-semibold text-black">
                  {getSanitationYearLabel(cfg.year)}
                </div>
              </Link>

              <Link
                href={href}
                className="border-t border-[#e8ebf5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">
                  Должность &quot;Утверждаю&quot;
                </div>
                <div className="mt-2 text-[18px] font-semibold leading-tight text-black">
                  {getSanitationApproveLabel(
                    cfg.approveRole,
                    cfg.approveEmployee,
                  )}
                </div>
              </Link>

              <Link
                href={href}
                className="border-t border-[#e8ebf5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">Ответственный</div>
                <div className="mt-2 text-[18px] font-semibold leading-tight text-black">
                  {getSanitationApproveLabel(
                    cfg.responsibleRole,
                    cfg.responsibleEmployee,
                  )}
                </div>
              </Link>

              <Link
                href={href}
                className="border-t border-[#e8ebf5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">Дата документа</div>
                <div className="mt-2 text-[14px] font-semibold text-black">
                  {getSanitationDocumentDateLabel(cfg.documentDate)}
                </div>
              </Link>

              <div className="flex justify-start sm:justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                    >
                      <Ellipsis className="size-8" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="end"
                    className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl"
                  >
                    {document.status === "active" ? (
                      <>
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => setSettingsTarget(document)}
                        >
                          <Pencil className="mr-3 size-6 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => cloneDocument(document.id)}
                        >
                          <Copy className="mr-3 size-6 text-[#6f7282]" />
                          Сделать копию
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                      onSelect={() =>
                        window.open(
                          `/api/journal-documents/${document.id}/pdf`,
                          "_blank",
                        )
                      }
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>

                    {document.status === "closed" ? (
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() => moveToActive(document.id)}
                      >
                        <BookOpenText className="mr-3 size-6 text-[#6f7282]" />
                        Отправить в активные
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => moveToClosed(document.id)}
                        >
                          <BookOpenText className="mr-3 size-6 text-[#6f7282]" />
                          Отправить в закрытые
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => setDeleteTarget(document)}
                        >
                          <Trash2 className="mr-3 size-6 text-[#ff3b30]" />
                          Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <SettingsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
        initial={defaultCreateState}
        onSubmit={createDocument}
        submitText="Создать"
        title="Создание документа"
      />

      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        users={users}
        initial={settingsTarget ? toUiState(settingsTarget) : null}
        onSubmit={async (value) => {
          if (!settingsTarget) return;
          await saveSettings(settingsTarget.id, value);
        }}
        submitText="Сохранить"
        title="Настройки документа"
      />

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        title={deleteTarget?.title || SANITATION_DAY_DOCUMENT_TITLE}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget.id);
        }}
      />
    </div>
  );
}
