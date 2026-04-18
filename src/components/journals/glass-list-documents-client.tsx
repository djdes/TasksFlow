"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Copy,
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
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, pickPrimaryManager } from "@/lib/user-roles";
import {
  GLASS_LIST_DOCUMENT_TITLE,
  GLASS_LIST_PAGE_TITLE,
  GLASS_LIST_TEMPLATE_CODE,
  formatGlassListDate,
  getDefaultGlassListConfig,
  normalizeGlassListConfig,
  toIsoDate,
  type GlassListConfig,
} from "@/lib/glass-list-document";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
import { PositionNativeOptions } from "@/components/shared/position-select";
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
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  config?: unknown;
};

type FormState = {
  documentName: string;
  location: string;
  documentDate: string;
  responsibleTitle: string;
  responsibleUserId: string;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode?: string;
  templateCode: string;
  templateName: string;
  users: UserItem[];
  documents: DocumentItem[];
};

const RESPONSIBLE_TITLES = USER_ROLE_LABEL_VALUES;

function getDefaultFormState(users: UserItem[]): FormState {
  const defaultConfig = getDefaultGlassListConfig();
  const responsibleUser =
    pickPrimaryManager(users);

  return {
    documentName: defaultConfig.documentName,
    location: defaultConfig.location,
    documentDate: toIsoDate(new Date()),
    responsibleTitle: defaultConfig.responsibleTitle,
    responsibleUserId: responsibleUser?.id || "",
  };
}

function GlassListFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogTitle: string;
  submitLabel: string;
  users: UserItem[];
  initialState: FormState;
  onSubmit: (state: FormState) => Promise<void>;
}) {
  const [state, setState] = useState<FormState>(props.initialState);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setState(props.initialState);
  }, [props.initialState, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[720px] rounded-[32px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-14 py-10">
          <DialogTitle className="text-[22px] font-medium text-black">
            {props.dialogTitle}
          </DialogTitle>
          <button
            type="button"
            className="rounded-full p-2 text-black hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-8" />
          </button>
        </DialogHeader>
        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.documentName}
              onChange={(event) =>
                setState((prev) => ({ ...prev, documentName: event.target.value }))
              }
              placeholder="Введите название документа"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Место расположения (участок)</Label>
            <Input
              value={state.location}
              onChange={(event) =>
                setState((prev) => ({ ...prev, location: event.target.value }))
              }
              placeholder="Введите место расположения (участок)"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата документа</Label>
            <Input
              type="date"
              value={state.documentDate}
              onChange={(event) =>
                setState((prev) => ({ ...prev, documentDate: event.target.value }))
              }
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность</Label>
            <select
              value={state.responsibleTitle}
              onChange={(event) =>
                setState((prev) => ({ ...prev, responsibleTitle: event.target.value }))
              }
              className="h-11 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]"
            >
              <option value="">- Выберите значение -</option>
              <PositionNativeOptions users={props.users} />
            </select>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
            <select
              value={state.responsibleUserId}
              onChange={(event) =>
                setState((prev) => ({ ...prev, responsibleUserId: event.target.value }))
              }
              className="h-11 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]"
            >
              <option value="">- Выберите значение -</option>
              {props.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
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
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : props.submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="flex flex-row items-start justify-between border-b px-14 py-10">
          <DialogTitle className="pr-12 text-[22px] font-medium leading-[1.15] text-black">
            {props.title}
          </DialogTitle>
          <button
            type="button"
            className="rounded-full p-2 text-black hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-8" />
          </button>
        </DialogHeader>
        <div className="flex justify-end px-14 py-12">
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
            className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
          >
            {submitting ? "Сохранение..." : props.submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GlassListDocumentsClient(props: Props) {
  const router = useRouter();
  const routeCode = props.routeCode || props.templateCode;
  const defaultFormState = useMemo(() => getDefaultFormState(props.users), [props.users]);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<DocumentItem | null>(null);
  const [archiveDocument, setArchiveDocument] = useState<DocumentItem | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<DocumentItem | null>(null);

  async function createDocument(state: FormState) {
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: GLASS_LIST_TEMPLATE_CODE,
        title: state.documentName.trim() || GLASS_LIST_DOCUMENT_TITLE,
        dateFrom: state.documentDate,
        dateTo: state.documentDate,
        responsibleTitle: state.responsibleTitle || null,
        responsibleUserId: state.responsibleUserId || null,
        config: {
          ...getDefaultGlassListConfig(new Date(state.documentDate)),
          documentName: state.documentName.trim() || GLASS_LIST_DOCUMENT_TITLE,
          location: state.location.trim() || "Производство",
          documentDate: state.documentDate,
          responsibleTitle: state.responsibleTitle || "Управляющий",
          responsibleUserId: state.responsibleUserId || "",
        },
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось создать документ");
    }

    router.refresh();
    router.push(`/journals/${routeCode}/documents/${result.document.id}`);
  }

  async function saveSettings(state: FormState) {
    if (!settingsDocument) return;
    const currentConfig = normalizeGlassListConfig(settingsDocument.config);
    const nextConfig: GlassListConfig = {
      ...currentConfig,
      documentName: state.documentName.trim() || GLASS_LIST_DOCUMENT_TITLE,
      location: state.location.trim() || currentConfig.location,
      documentDate: state.documentDate,
      responsibleTitle: state.responsibleTitle || currentConfig.responsibleTitle,
      responsibleUserId: state.responsibleUserId || currentConfig.responsibleUserId,
    };

    const response = await fetch(`/api/journal-documents/${settingsDocument.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextConfig.documentName,
        dateFrom: nextConfig.documentDate,
        dateTo: nextConfig.documentDate,
        responsibleTitle: nextConfig.responsibleTitle,
        responsibleUserId: nextConfig.responsibleUserId || null,
        config: nextConfig,
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось сохранить документ");
    }

    setSettingsDocument(null);
    router.refresh();
  }

  async function copyDocument(document: DocumentItem) {
    const config = normalizeGlassListConfig(document.config);
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: GLASS_LIST_TEMPLATE_CODE,
        title: config.documentName || document.title || GLASS_LIST_DOCUMENT_TITLE,
        dateFrom: config.documentDate || document.dateFrom,
        dateTo: config.documentDate || document.dateFrom,
        responsibleTitle:
          config.responsibleTitle || document.responsibleTitle || "Управляющий",
        responsibleUserId:
          config.responsibleUserId || document.responsibleUserId || null,
        config,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сделать копию документа");
      return;
    }

    router.refresh();
  }

  async function archiveCurrentDocument() {
    if (!archiveDocument) return;
    const response = await fetch(`/api/journal-documents/${archiveDocument.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });

    if (!response.ok) {
      throw new Error("Не удалось перенести документ в архив");
    }

    setArchiveDocument(null);
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

  return (
    <>
      <div className="space-y-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
            {GLASS_LIST_PAGE_TITLE}
          </h1>
          {props.activeTab === "active" && (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] font-medium text-white hover:bg-[#4d58f5]"
            >
              <Plus className="size-6" />
              Создать документ
            </Button>
          )}
        </div>

        <div className="border-b border-[#d9dce8]">
          <div className="flex gap-9 text-[15px]">
            <Link
              href={`/journals/${routeCode}`}
              className={`relative pb-4 ${
                props.activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={`relative pb-4 ${
                props.activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {props.documents.length === 0 && <EmptyDocumentsState />}

          {props.documents.map((document) => {
            const href = `/journals/${routeCode}/documents/${document.id}`;
            const config = normalizeGlassListConfig(document.config);
            const responsibleUser = props.users.find(
              (user) => user.id === (config.responsibleUserId || document.responsibleUserId)
            );
            const responsibleTitle =
              config.responsibleTitle || document.responsibleTitle || "—";

            return (
              <div
                key={document.id}
                className="grid grid-cols-[minmax(0,1.4fr)_270px_270px_220px_56px] items-center rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
              >
                <Link href={href} className="min-w-0 text-[17px] font-semibold text-black">
                  {config.documentName || document.title || props.templateName}
                </Link>
                <Link href={href} className="border-l border-[#e6e6f0] px-8">
                  <div className="text-[14px] text-[#84849a]">Место расположения</div>
                  <div className="mt-2 text-[14px] font-semibold text-black">
                    {config.location || "—"}
                  </div>
                </Link>
                <Link href={href} className="border-l border-[#e6e6f0] px-8">
                  <div className="text-[14px] text-[#84849a]">Должность</div>
                  <div className="mt-2 text-[14px] font-semibold text-black">
                    {responsibleUser
                      ? `${responsibleTitle}: ${responsibleUser.name}`
                      : responsibleTitle}
                  </div>
                </Link>
                <Link href={href} className="border-l border-[#e6e6f0] px-8">
                  <div className="text-[14px] text-[#84849a]">Дата документа</div>
                  <div className="mt-2 text-[14px] font-semibold text-black">
                    {formatGlassListDate(config.documentDate || document.dateFrom)}
                  </div>
                </Link>
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-10 items-center justify-center rounded-full text-[#5566f6] hover:bg-[#f5f6ff]"
                      >
                        <Ellipsis className="size-8" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl">
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() => setSettingsDocument(document)}
                      >
                        <Pencil className="mr-4 size-6 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() => copyDocument(document)}
                      >
                        <Copy className="mr-4 size-6 text-[#6f7282]" />
                        Сделать копию
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() =>
                          window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")
                        }
                      >
                        <Printer className="mr-4 size-6 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => setArchiveDocument(document)}
                        >
                          <Archive className="mr-4 size-6 text-[#6f7282]" />
                          Отправить в закрытые
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => setDeleteDocument(document)}
                      >
                        <Trash2 className="mr-4 size-6 text-[#ff3b30]" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <GlassListFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dialogTitle="Создание документа"
        submitLabel="Создать"
        users={props.users}
        initialState={defaultFormState}
        onSubmit={createDocument}
      />

      <GlassListFormDialog
        open={!!settingsDocument}
        onOpenChange={(open) => !open && setSettingsDocument(null)}
        dialogTitle="Настройки документа"
        submitLabel="Сохранить"
        users={props.users}
        initialState={
          settingsDocument
            ? (() => {
                const config = normalizeGlassListConfig(settingsDocument.config);
                return {
                  documentName: config.documentName || settingsDocument.title,
                  location: config.location,
                  documentDate: config.documentDate || settingsDocument.dateFrom,
                  responsibleTitle:
                    config.responsibleTitle ||
                    settingsDocument.responsibleTitle ||
                    "Управляющий",
                  responsibleUserId:
                    config.responsibleUserId ||
                    settingsDocument.responsibleUserId ||
                    defaultFormState.responsibleUserId,
                };
              })()
            : defaultFormState
        }
        onSubmit={saveSettings}
      />

      <ConfirmDialog
        open={!!archiveDocument}
        onOpenChange={(open) => !open && setArchiveDocument(null)}
        title={`Перенести в архив документ "${archiveDocument?.title || GLASS_LIST_DOCUMENT_TITLE}"`}
        submitLabel="В архив"
        onSubmit={archiveCurrentDocument}
      />

      <ConfirmDialog
        open={!!deleteDocument}
        onOpenChange={(open) => !open && setDeleteDocument(null)}
        title={`Удаление документа "${deleteDocument?.title || GLASS_LIST_DOCUMENT_TITLE}"`}
        submitLabel="Удалить"
        onSubmit={deleteCurrentDocument}
      />
    </>
  );
}
