"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BookOpenText,
  Ellipsis,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
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
import {
  applyCleaningAutoFillToConfig,
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  CLEANING_DOCUMENT_TITLE,
  CLEANING_PAGE_TITLE,
  defaultCleaningDocumentConfig,
  getCleaningCreatePeriodBounds,
  getCleaningPeriodLabel,
  normalizeCleaningDocumentConfig,
  type CleaningDocumentConfig,
} from "@/lib/cleaning-document";
import { getDistinctRoleLabels, getUsersForRoleLabel } from "@/lib/user-roles";

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  dateTo: string;
  config?: unknown;
};

type CreateState = {
  title: string;
  cleaningRole: string;
  controlRole: string;
};

type SettingsState = {
  title: string;
  cleaningRole: string;
  cleaningUserId: string;
  controlRole: string;
  controlUserId: string;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  users: UserItem[];
  documents: DocumentItem[];
};

function getRoleOptions(users: UserItem[]) {
  return getDistinctRoleLabels(users);
}

function pickFirstUserId(users: UserItem[], roleLabel: string) {
  return getUsersForRoleLabel(users, roleLabel)[0]?.id || "";
}

function getUserName(users: UserItem[], userId: string) {
  return users.find((user) => user.id === userId)?.name || "";
}

function buildCreateState(users: UserItem[]): CreateState {
  const baseConfig = defaultCleaningDocumentConfig(users);
  return {
    title: "",
    cleaningRole: baseConfig.cleaningResponsibles[0]?.title || "",
    controlRole: baseConfig.controlResponsibles[0]?.title || "",
  };
}

function buildSettingsState(document: DocumentItem, users: UserItem[]): SettingsState {
  const config = normalizeCleaningDocumentConfig(document.config, { users });
  return {
    title: document.title || CLEANING_DOCUMENT_TITLE,
    cleaningRole: config.cleaningResponsibles[0]?.title || "",
    cleaningUserId: config.cleaningResponsibles[0]?.userId || "",
    controlRole: config.controlResponsibles[0]?.title || "",
    controlUserId: config.controlResponsibles[0]?.userId || "",
  };
}

function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-start justify-between gap-6">
            <DialogTitle className="text-[24px] font-semibold leading-[1.2] text-black">
              {props.title}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-black hover:bg-black/5"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
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
                await props.onSubmit();
                props.onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
          >
            {submitting ? "Сохранение..." : props.submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  onSubmit: (state: CreateState) => Promise<void>;
}) {
  const [state, setState] = useState<CreateState>(buildCreateState(props.users));
  const [submitting, setSubmitting] = useState(false);
  const roleOptions = useMemo(() => getRoleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.open) return;
    setState(buildCreateState(props.users));
  }, [props.open, props.users]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[720px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold text-black">
              Создание документа
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-black hover:bg-black/5"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-10 py-8">
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Введите название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState((current) => ({ ...current, title: event.target.value }))}
              placeholder="Введите название документа"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Должность ответственного за уборку</Label>
            <Select
              value={state.cleaningRole}
              onValueChange={(value) => setState((current) => ({ ...current, cleaningRole: value }))}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Должность ответственного за контроль</Label>
            <Select
              value={state.controlRole}
              onValueChange={(value) => setState((current) => ({ ...current, controlRole: value }))}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
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
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  initialState: SettingsState | null;
  onSubmit: (state: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState<SettingsState | null>(props.initialState);
  const [submitting, setSubmitting] = useState(false);
  const roleOptions = useMemo(() => getRoleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.open) return;
    setState(props.initialState);
  }, [props.initialState, props.open]);

  if (!state) return null;

  const cleaningUsers = getUsersForRoleLabel(props.users, state.cleaningRole);
  const controlUsers = getUsersForRoleLabel(props.users, state.controlRole);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold text-black">
              Настройки документа
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-black hover:bg-black/5"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-5 px-10 py-8">
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState((current) => current ? { ...current, title: event.target.value } : current)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Должность ответственного за уборку</Label>
            <Select
              value={state.cleaningRole}
              onValueChange={(value) =>
                setState((current) =>
                  current
                    ? {
                        ...current,
                        cleaningRole: value,
                        cleaningUserId: pickFirstUserId(props.users, value),
                      }
                    : current
                )
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={state.cleaningUserId}
              onValueChange={(value) =>
                setState((current) => (current ? { ...current, cleaningUserId: value } : current))
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {cleaningUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Должность ответственного за контроль</Label>
            <Select
              value={state.controlRole}
              onValueChange={(value) =>
                setState((current) =>
                  current
                    ? {
                        ...current,
                        controlRole: value,
                        controlUserId: pickFirstUserId(props.users, value),
                      }
                    : current
                )
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[16px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={state.controlUserId}
              onValueChange={(value) =>
                setState((current) => (current ? { ...current, controlUserId: value } : current))
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {controlUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
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

export function CleaningDocumentsClient(props: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<DocumentItem | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<DocumentItem | null>(null);
  const [archiveDocument, setArchiveDocument] = useState<DocumentItem | null>(null);

  async function createDocument(state: CreateState) {
    const period = getCleaningCreatePeriodBounds();
    const baseConfig = defaultCleaningDocumentConfig(props.users);
    const cleaningUserId = pickFirstUserId(props.users, state.cleaningRole);
    const controlUserId = pickFirstUserId(props.users, state.controlRole);

    const nextConfig: CleaningDocumentConfig = normalizeCleaningDocumentConfig(
      {
        ...baseConfig,
        cleaningResponsibles: [
          {
            ...baseConfig.cleaningResponsibles[0],
            title: state.cleaningRole,
            userId: cleaningUserId,
            userName: getUserName(props.users, cleaningUserId),
          },
        ],
        controlResponsibles: [
          {
            ...baseConfig.controlResponsibles[0],
            title: state.controlRole,
            userId: controlUserId,
            userName: getUserName(props.users, controlUserId),
          },
        ],
      },
      { users: props.users }
    );

    const filledConfig = applyCleaningAutoFillToConfig({
      config: nextConfig,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    });

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: CLEANING_DOCUMENT_TEMPLATE_CODE,
        title: state.title.trim() || CLEANING_DOCUMENT_TITLE,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        responsibleTitle: state.controlRole || null,
        responsibleUserId: controlUserId || null,
        config: filledConfig,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось создать документ");
    }

    router.push(`/journals/${props.routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function saveSettings(state: SettingsState) {
    if (!settingsDocument) return;

    const config = normalizeCleaningDocumentConfig(settingsDocument.config, {
      users: props.users,
    });

    const nextConfig = normalizeCleaningDocumentConfig(
      {
        ...config,
        cleaningResponsibles: [
          {
            ...(config.cleaningResponsibles[0] || {}),
            id: config.cleaningResponsibles[0]?.id || "cleaning-primary",
            kind: "cleaning",
            title: state.cleaningRole,
            userId: state.cleaningUserId,
            userName: getUserName(props.users, state.cleaningUserId),
            code: "С1",
          },
          ...config.cleaningResponsibles.slice(1),
        ],
        controlResponsibles: [
          {
            ...(config.controlResponsibles[0] || {}),
            id: config.controlResponsibles[0]?.id || "control-primary",
            kind: "control",
            title: state.controlRole,
            userId: state.controlUserId,
            userName: getUserName(props.users, state.controlUserId),
            code: "С1",
          },
          ...config.controlResponsibles.slice(1),
        ],
      },
      { users: props.users }
    );

    const response = await fetch(`/api/journal-documents/${settingsDocument.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: state.title.trim() || CLEANING_DOCUMENT_TITLE,
        responsibleTitle: state.controlRole || null,
        responsibleUserId: state.controlUserId || null,
        config: nextConfig,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось сохранить документ");
    }

    setSettingsDocument(null);
    router.refresh();
  }

  async function deleteCurrentDocument() {
    if (!deleteDocument) return;
    const response = await fetch(`/api/journal-documents/${deleteDocument.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Не удалось удалить документ");
    }
    setDeleteDocument(null);
    router.refresh();
  }

  async function toggleDocumentStatus() {
    if (!archiveDocument) return;
    const nextStatus = archiveDocument.status === "active" ? "closed" : "active";
    const response = await fetch(`/api/journal-documents/${archiveDocument.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      throw new Error("Не удалось изменить статус документа");
    }
    setArchiveDocument(null);
    router.refresh();
  }

  return (
    <>
      <div className="space-y-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {CLEANING_PAGE_TITLE}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-16 rounded-[16px] border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-5" />
                Инструкция
              </Link>
            </Button>
            {props.activeTab === "active" ? (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-16 rounded-[16px] bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4d58f5]"
              >
                <Plus className="size-6" />
                Создать документ
              </Button>
            ) : null}
          </div>
        </div>

        <div className="border-b border-[#d9dce8]">
          <div className="flex gap-11 text-[18px]">
            <Link
              href={`/journals/${props.routeCode}`}
              className={`relative pb-6 ${
                props.activeTab === "active"
                  ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#8a8ea4]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${props.routeCode}?tab=closed`}
              className={`relative pb-6 ${
                props.activeTab === "closed"
                  ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#8a8ea4]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {props.documents.length === 0 ? (
            <div className="rounded-[18px] border border-[#eaedf7] bg-white px-8 py-10 text-[22px] text-[#8a8ea4]">
              Документов пока нет
            </div>
          ) : null}

          {props.documents.map((document) => {
            const config = normalizeCleaningDocumentConfig(document.config, {
              users: props.users,
            });
            const cleaningLines = config.cleaningResponsibles
              .filter((item) => item.userName || (item.title && item.title !== "Ответственный за уборку"))
              .map((item) => `${item.title}: ${item.userName || "—"}`);
            if (cleaningLines.length === 0) cleaningLines.push("—");
            const controlLine =
              config.controlResponsibles[0] && (config.controlResponsibles[0].userName || (config.controlResponsibles[0].title && config.controlResponsibles[0].title !== "Ответственный за контроль"))
                ? `${config.controlResponsibles[0].title}: ${config.controlResponsibles[0].userName || "—"}`
                : "—";
            const href = `/journals/${props.routeCode}/documents/${document.id}`;

            return (
              <div
                key={document.id}
                className="grid grid-cols-1 gap-4 rounded-[18px] border border-[#eaedf7] bg-white px-5 py-5 sm:grid-cols-[minmax(0,1.5fr)_360px_360px_240px_56px] sm:items-center sm:gap-0 sm:px-7"
              >
                <Link href={href} className="min-w-0 text-[18px] font-semibold text-black sm:text-[24px]">
                  {document.title || CLEANING_DOCUMENT_TITLE}
                </Link>
                <Link href={href} className="border-t border-[#eceef5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0">
                  <div className="text-[16px] text-[#85889b]">Ответственный за уборку</div>
                  <div className="mt-2 space-y-1 text-[20px] font-semibold leading-[1.3] text-black">
                    {cleaningLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </Link>
                <Link href={href} className="border-t border-[#eceef5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0">
                  <div className="text-[16px] text-[#85889b]">Ответственный за контроль</div>
                  <div className="mt-2 text-[20px] font-semibold leading-[1.3] text-black">
                    {controlLine}
                  </div>
                </Link>
                <Link href={href} className="border-t border-[#eceef5] pt-4 sm:border-l sm:border-t-0 sm:px-8 sm:pt-0">
                  <div className="text-[16px] text-[#85889b]">Период</div>
                  <div className="mt-2 text-[20px] font-semibold leading-[1.3] text-black">
                    {getCleaningPeriodLabel(document.dateFrom, document.dateTo)}
                  </div>
                </Link>
                <div className="flex justify-start sm:justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                      >
                        <Ellipsis className="size-8" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl">
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[20px]"
                        onSelect={() => setArchiveDocument(document)}
                      >
                        {document.status === "active" ? (
                          <Archive className="mr-4 size-6 text-[#6f7282]" />
                        ) : (
                          <ArchiveRestore className="mr-4 size-6 text-[#6f7282]" />
                        )}
                        {document.status === "active" ? "Закрыть" : "Восстановить"}
                      </DropdownMenuItem>
                      {document.status === "active" ? (
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[20px]"
                          onSelect={() => setSettingsDocument(document)}
                        >
                          <Pencil className="mr-4 size-6 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[20px]"
                        onSelect={() =>
                          window.open(
                            `/api/journal-documents/${document.id}/pdf`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        <Printer className="mr-4 size-6 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" ? (
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-4 text-[20px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => setDeleteDocument(document)}
                        >
                          <Trash2 className="mr-4 size-6 text-[#ff3b30]" />
                          Удалить
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={props.users}
        onSubmit={createDocument}
      />

      <SettingsDialog
        open={!!settingsDocument}
        onOpenChange={(open) => {
          if (!open) setSettingsDocument(null);
        }}
        users={props.users}
        initialState={settingsDocument ? buildSettingsState(settingsDocument, props.users) : null}
        onSubmit={saveSettings}
      />

      <ConfirmDialog
        open={!!archiveDocument}
        onOpenChange={(open) => {
          if (!open) setArchiveDocument(null);
        }}
        title={
          archiveDocument?.status === "active"
            ? `Закрыть документ "${archiveDocument?.title || CLEANING_DOCUMENT_TITLE}"`
            : `Восстановить документ "${archiveDocument?.title || CLEANING_DOCUMENT_TITLE}"`
        }
        submitLabel={archiveDocument?.status === "active" ? "Закрыть" : "Восстановить"}
        onSubmit={toggleDocumentStatus}
      />

      <ConfirmDialog
        open={!!deleteDocument}
        onOpenChange={(open) => {
          if (!open) setDeleteDocument(null);
        }}
        title={`Удаление документа "${deleteDocument?.title || CLEANING_DOCUMENT_TITLE}"`}
        submitLabel="Удалить"
        onSubmit={deleteCurrentDocument}
      />
    </>
  );
}
