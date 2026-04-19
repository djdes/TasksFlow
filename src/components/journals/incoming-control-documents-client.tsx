"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  getAcceptanceDocumentTitle,
  getAcceptancePageTitle,
  buildAcceptanceDocumentConfigFromData,
  normalizeAcceptanceDocumentConfig,
  type AcceptanceDocumentConfig,
} from "@/lib/acceptance-document";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel } from "@/lib/user-roles";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
import {
  JOURNAL_CARD_LABEL_CLASS,
  JOURNAL_CARD_TITLE_CLASS,
  JOURNAL_CARD_VALUE_CLASS,
} from "@/components/journals/journal-responsive";
import { PositionSelectItems } from "@/components/shared/position-select";

type User = { id: string; name: string; role: string };

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  documents: DocumentItem[];
  users: User[];
  availableProducts: string[];
  availableManufacturers: string[];
  availableSuppliers: string[];
};

type DialogState = {
  title: string;
  startDate: string;
  expiryFieldLabel: AcceptanceDocumentConfig["expiryFieldLabel"];
  responsibleTitle: string;
  responsibleUserId: string;
};

function formatRuDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function getUsersForRole(users: User[], roleLabel: string) {
  return users.filter((user) => getUserRoleLabel(user.role) === roleLabel);
}

function getDefaultDialogState(
  templateCode: string,
  users: User[],
  availableProducts: string[],
  availableManufacturers: string[],
  availableSuppliers: string[]
): DialogState {
  const config = buildAcceptanceDocumentConfigFromData({
    users,
    products: availableProducts,
    manufacturers: availableManufacturers,
    suppliers: availableSuppliers,
    date: new Date().toISOString().slice(0, 10),
  });

  return {
    title: getAcceptanceDocumentTitle(templateCode),
    startDate: new Date().toISOString().slice(0, 10),
    expiryFieldLabel: config.expiryFieldLabel,
    responsibleTitle: config.defaultResponsibleTitle || USER_ROLE_LABEL_VALUES[0],
    responsibleUserId: config.defaultResponsibleUserId || users[0]?.id || "",
  };
}

function SettingsDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initial,
  users,
  showEmployeeField,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initial: DialogState;
  users: User[];
  showEmployeeField: boolean;
  onSubmit: (value: DialogState) => Promise<void>;
}) {
  const [state, setState] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const employeeOptions = useMemo(() => {
    const options = getUsersForRole(users, state.responsibleTitle);
    if (options.length > 0) return options;
    return users;
  }, [state.responsibleTitle, users]);

  useEffect(() => {
    if (!open) return;
    setState(initial);
    setSubmitting(false);
  }, [initial, open]);

  useEffect(() => {
    if (!open || !showEmployeeField) return;
    if (!employeeOptions.some((user) => user.id === state.responsibleUserId)) {
      setState((current) => ({
        ...current,
        responsibleUserId: employeeOptions[0]?.id || "",
      }));
    }
  }, [employeeOptions, open, showEmployeeField, state.responsibleUserId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[22px] font-medium text-black">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-12 py-10">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState({ ...state, title: event.target.value })}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              placeholder="Введите название документа"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата начала</Label>
            <Input
              type="date"
              value={state.startDate}
              onChange={(event) => setState({ ...state, startDate: event.target.value })}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-4">
            <div className="text-[18px] font-semibold text-black">Название поля</div>
            <label className="flex items-center gap-3 text-[18px] text-black">
              <input
                type="radio"
                name="incoming-control-expiry-label"
                checked={state.expiryFieldLabel === "expiry_deadline"}
                onChange={() => setState({ ...state, expiryFieldLabel: "expiry_deadline" })}
                className="size-5 accent-[#5566f6]"
              />
              &quot;Предельный срок реализации&quot;
            </label>
            <label className="flex items-center gap-3 text-[18px] text-black">
              <input
                type="radio"
                name="incoming-control-expiry-label"
                checked={state.expiryFieldLabel === "shelf_life"}
                onChange={() => setState({ ...state, expiryFieldLabel: "shelf_life" })}
                className="size-5 accent-[#5566f6]"
              />
              &quot;Срок годности&quot;
            </label>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select
              value={state.responsibleTitle}
              onValueChange={(value) =>
                setState({
                  ...state,
                  responsibleTitle: value,
                  responsibleUserId: getUsersForRole(users, value)[0]?.id || state.responsibleUserId,
                })
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={users} />
              </SelectContent>
            </Select>
          </div>
          {showEmployeeField && (
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
              <Select
                value={state.responsibleUserId}
                onValueChange={(value) => setState({ ...state, responsibleUserId: value })}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {employeeOptions.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit(state);
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  title,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onDelete: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[680px]">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="pr-10 text-[22px] font-medium text-black">
            {`Удаление документа "${title}"`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end px-12 py-10">
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onDelete();
                onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IncomingControlDocumentsClient({
  activeTab,
  routeCode,
  templateCode,
  documents,
  users,
  availableProducts,
  availableManufacturers,
  availableSuppliers,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<DocumentItem | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<DocumentItem | null>(null);
  const defaultDocumentTitle = getAcceptanceDocumentTitle(templateCode);
  const pageTitle = getAcceptancePageTitle(templateCode);
  const createState = useMemo(
    () =>
      getDefaultDialogState(
        templateCode,
        users,
        availableProducts,
        availableManufacturers,
        availableSuppliers
      ),
    [availableManufacturers, availableProducts, availableSuppliers, templateCode, users]
  );

  function buildConfigFromPayload(payload: DialogState, includeSampleRows = false) {
    return buildAcceptanceDocumentConfigFromData({
      users,
      products: availableProducts,
      manufacturers: availableManufacturers,
      suppliers: availableSuppliers,
      date: payload.startDate,
      responsibleTitle: payload.responsibleTitle,
      responsibleUserId: payload.responsibleUserId,
      includeSampleRows,
    });
  }

  async function createDocument(payload: DialogState) {
    const responsibleUserId =
      getUsersForRole(users, payload.responsibleTitle)[0]?.id ||
      payload.responsibleUserId ||
      users[0]?.id ||
      "";
    const config = {
      ...buildConfigFromPayload({ ...payload, responsibleUserId }, true),
      expiryFieldLabel: payload.expiryFieldLabel,
    };
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || defaultDocumentTitle,
        dateFrom: payload.startDate,
        dateTo: payload.startDate,
        responsibleTitle: payload.responsibleTitle,
        responsibleUserId,
        config,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось создать документ");
    }
    router.push(`/journals/${routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function saveSettings(document: DocumentItem, payload: DialogState) {
    const current = normalizeAcceptanceDocumentConfig(document.config, users);
    const response = await fetch(`/api/journal-documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || defaultDocumentTitle,
        dateFrom: payload.startDate,
        responsibleTitle: payload.responsibleTitle,
        responsibleUserId: payload.responsibleUserId || null,
        config: {
          ...current,
          expiryFieldLabel: payload.expiryFieldLabel,
          defaultResponsibleTitle: payload.responsibleTitle || null,
          defaultResponsibleUserId: payload.responsibleUserId || null,
        },
      }),
    });
    if (!response.ok) {
      throw new Error("Не удалось сохранить документ");
    }
    router.refresh();
  }

  async function deleteById(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Не удалось удалить документ");
    }
    router.refresh();
  }

  const heading =
    activeTab === "closed" && routeCode === "incoming_control"
      ? `${pageTitle} (Закрытые!!!)`
      : pageTitle;

  return (
    <>
      <div className="space-y-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="max-w-[1100px] text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
            {heading}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-[#dcdfed] px-4 text-[14px] text-[#3848c7] shadow-none"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-4" />
                Инструкция
              </Link>
            </Button>
            {activeTab === "active" && (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-12 rounded-xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0]"
              >
                <Plus className="size-4" />
                Создать документ
              </Button>
            )}
          </div>
        </div>

        <div className="border-b border-[#d9dce8]">
          <div className="flex gap-9 text-[15px]">
            <Link
              href={`/journals/${routeCode}`}
              className={`relative pb-4 ${
                activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={`relative pb-4 ${
                activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {documents.length === 0 && (
            <EmptyDocumentsState />
          )}
          {documents.map((document) => {
            const config = normalizeAcceptanceDocumentConfig(document.config, users);
            const responsibleUser = users.find(
              (user) => user.id === config.defaultResponsibleUserId
            );
            return (
              <div
                key={document.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[minmax(0,1fr)_320px_210px_56px] sm:items-center sm:gap-0 sm:px-6 sm:py-5"
              >
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className={JOURNAL_CARD_TITLE_CLASS}
                >
                  {document.title || defaultDocumentTitle}
                </Link>
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className="border-l border-[#eef0f6] px-6"
                >
                  <div className={JOURNAL_CARD_LABEL_CLASS}>Ответственный</div>
                  <div className={JOURNAL_CARD_VALUE_CLASS}>
                    {(config.defaultResponsibleTitle || "Управляющий") +
                      (responsibleUser?.name ? `: ${responsibleUser.name}` : "")}
                  </div>
                </Link>
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className="border-l border-[#eef0f6] px-6 text-right"
                >
                  <div className={JOURNAL_CARD_LABEL_CLASS}>Дата начала</div>
                  <div className={JOURNAL_CARD_VALUE_CLASS}>
                    {formatRuDate(document.dateFrom)}
                  </div>
                </Link>
                <div className="justify-self-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full text-[#5566f6] hover:bg-[#f5f6ff]"
                      >
                        <Ellipsis className="size-6" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[280px] rounded-[24px] border-0 p-4 shadow-xl"
                    >
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => setSettingsDocument(document)}
                        >
                          Настройки
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() =>
                          window.open(
                            `/api/journal-documents/${document.id}/pdf`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        <Printer className="mr-3 size-5 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => setDeleteDocument(document)}
                        >
                          <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
                          Удалить
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SettingsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Создание документа"
        submitLabel="Создать"
        initial={createState}
        users={users}
        showEmployeeField={false}
        onSubmit={createDocument}
      />

      <SettingsDialog
        open={!!settingsDocument}
        onOpenChange={(open) => {
          if (!open) setSettingsDocument(null);
        }}
        title="Настройки документа"
        submitLabel="Сохранить"
        initial={
          settingsDocument
            ? {
                title: settingsDocument.title || defaultDocumentTitle,
                startDate: settingsDocument.dateFrom,
                ...(() => {
                  const config = normalizeAcceptanceDocumentConfig(settingsDocument.config, users);
                  return {
                    expiryFieldLabel: config.expiryFieldLabel,
                    responsibleTitle:
                      config.defaultResponsibleTitle || USER_ROLE_LABEL_VALUES[0],
                    responsibleUserId:
                      config.defaultResponsibleUserId || users[0]?.id || "",
                  };
                })(),
              }
            : createState
        }
        users={users}
        showEmployeeField={true}
        onSubmit={async (value) => {
          if (!settingsDocument) return;
          await saveSettings(settingsDocument, value);
        }}
      />

      <DeleteDialog
        open={!!deleteDocument}
        onOpenChange={(open) => {
          if (!open) setDeleteDocument(null);
        }}
        title={deleteDocument?.title || defaultDocumentTitle}
        onDelete={async () => {
          if (!deleteDocument) return;
          await deleteById(deleteDocument.id);
        }}
      />
    </>
  );
}
