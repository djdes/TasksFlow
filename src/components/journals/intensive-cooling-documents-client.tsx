"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
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
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_DOCUMENT_TITLE,
  INTENSIVE_COOLING_TEMPLATE_CODE,
  getDefaultIntensiveCoolingConfig,
} from "@/lib/intensive-cooling-document";

import { toast } from "sonner";
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
  config?: unknown;
};

type Props = {
  routeCode: string;
  activeTab: "active" | "closed";
  documents: DocumentItem[];
  users: UserItem[];
  dishSuggestions: string[];
};

type DialogState = {
  title: string;
  dateFrom: string;
};

function formatDateDMY(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

function DocumentDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initial: DialogState | null;
  dialogTitle: string;
  submitText: string;
  onSubmit: (value: DialogState) => Promise<void>;
}) {
  const [state, setState] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-7">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[22px] font-medium text-black">
              {props.dialogTitle}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#101425]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        {activeState ? (
          <div className="space-y-6 px-8 py-7">
            <div className="space-y-2">
              <Label className="text-base text-[#6e7387]">
                Название документа
              </Label>
              <Input
                value={activeState.title}
                onChange={(event) =>
                  setState({ ...activeState, title: event.target.value })
                }
                placeholder="Введите название документа"
                className="h-11 rounded-2xl border-[#d7dbea] px-6 text-[26px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-base text-[#6e7387]">Дата начала</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.dateFrom}
                  onChange={(event) =>
                    setState({ ...activeState, dateFrom: event.target.value })
                  }
                  className="h-11 rounded-2xl border-[#d7dbea] px-6 pr-14 text-[26px]"
                />
                <CalendarDays className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#6e7387]" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-11 rounded-2xl bg-[#5563ff] px-10 text-lg text-white hover:bg-[#4452ee]"
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

  async function handleDelete() {
    setSubmitting(true);
    try {
      await props.onConfirm();
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-7">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[22px] font-medium text-black">
              Удаление документа &quot;{props.title}&quot;
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#101425]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="flex justify-end px-8 py-7">
          <Button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="h-11 rounded-2xl bg-[#5563ff] px-10 text-lg text-white hover:bg-[#4452ee]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IntensiveCoolingDocumentsClient({
  routeCode,
  activeTab,
  documents,
  users,
  dishSuggestions,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  const createInitialState = useMemo<DialogState>(
    () => ({
      title: INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
      dateFrom: new Date().toISOString().slice(0, 10),
    }),
    []
  );

  async function createDocument(payload: DialogState) {
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: INTENSIVE_COOLING_TEMPLATE_CODE,
        title: payload.title.trim() || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
        config: getDefaultIntensiveCoolingConfig(users, dishSuggestions),
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

  async function saveSettings(documentId: string, payload: DialogState) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
  }

  async function deleteDocument(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="max-w-[980px] text-[48px] font-semibold tracking-[-0.04em] text-black">
          {INTENSIVE_COOLING_DOCUMENT_TITLE}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl border-[#edf0fb] bg-[#fafbff] px-6 text-base text-[#5b66ff] shadow-none"
            asChild
          >
            <Link href="/sanpin">
              <BookOpenText className="size-5" />
              Инструкция
            </Link>
          </Button>
          {activeTab === "active" ? (
            <Button
              className="h-12 rounded-2xl bg-[#5563ff] px-8 text-base text-white hover:bg-[#4452ee]"
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
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-8 py-8 text-[28px] text-[#8a8ea4]">
            Документов пока нет
          </div>
        ) : null}

        {documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-[1fr_240px_64px] items-center rounded-[18px] border border-[#eaedf7] bg-white px-8 py-5"
            >
              <Link href={href} className="text-[18px] font-semibold text-black">
                {document.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
              </Link>
              <Link href={href} className="px-8 text-right">
                <div className="text-[14px] text-[#7c8094]">Дата начала</div>
                <div className="mt-2 text-[18px] font-semibold text-black">
                  {formatDateDMY(document.dateFrom)}
                </div>
              </Link>
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Ellipsis className="size-8" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl"
                  >
                    {document.status === "active" ? (
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                        onSelect={() => setSettingsTarget(document)}
                      >
                        <Pencil className="mr-3 size-6 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                      onSelect={() =>
                        window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")
                      }
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "active" ? (
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => setDeleteTarget(document)}
                      >
                        <Trash2 className="mr-3 size-6 text-[#ff3b30]" />
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

      <DocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={createInitialState}
        onSubmit={createDocument}
        submitText="Создать"
        dialogTitle="Создание документа"
      />

      <DocumentDialog
        open={!!settingsTarget}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        initial={
          settingsTarget
            ? {
                title:
                  settingsTarget.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
                dateFrom: settingsTarget.dateFrom,
              }
            : null
        }
        onSubmit={async (payload) => {
          if (!settingsTarget) return;
          await saveSettings(settingsTarget.id, payload);
        }}
        submitText="Сохранить"
        dialogTitle="Настройки документа"
      />

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        title={deleteTarget?.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteDocument(deleteTarget.id);
        }}
      />
    </div>
  );
}
