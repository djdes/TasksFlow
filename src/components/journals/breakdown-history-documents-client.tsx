"use client";

import Link from "next/link";
import { useState } from "react";
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
  BREAKDOWN_HISTORY_HEADING,
  BREAKDOWN_HISTORY_DOCUMENT_TITLE,
} from "@/lib/breakdown-history-document";

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: unknown;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  documents: DocumentItem[];
};

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDateDMY(iso: string) {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/* ---------- Create / Settings Dialog ---------- */

type DialogState = {
  title: string;
  dateFrom: string;
};

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initial: DialogState | null;
  onSubmit: (value: DialogState) => Promise<void>;
  submitText: string;
  dialogTitle: string;
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
        if (value) {
          setState(props.initial);
        }
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-3xl font-semibold tracking-[-0.03em] text-black sm:text-[42px]">
              {props.dialogTitle}
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
        {activeState && (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[22px] text-[#7a7c8e]">Название документа</Label>
              <Input
                value={activeState.title}
                onChange={(e) => setState({ ...activeState, title: e.target.value })}
                className="h-14 rounded-3xl border-[#d8dae6] px-5 text-[16px] tracking-[-0.02em] sm:h-20 sm:px-7 sm:text-[28px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[22px] text-[#7a7c8e]">Дата начала</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.dateFrom}
                  onChange={(e) =>
                    setState({ ...activeState, dateFrom: toIsoDate(e.target.value) })
                  }
                  className="h-14 rounded-3xl border-[#d8dae6] px-5 pr-12 text-[16px] tracking-[-0.02em] sm:h-20 sm:px-7 sm:pr-14 sm:text-[28px]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080] sm:right-6 sm:size-8" />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-12 rounded-3xl bg-[#5563ff] px-8 text-[18px] text-white hover:bg-[#4554ff] sm:h-14 sm:px-10 sm:text-[24px]"
              >
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Delete Dialog ---------- */

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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-3xl font-semibold tracking-[-0.03em] text-black sm:text-[42px]">
              Удаление документа &laquo;{props.title}&raquo;
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
        <div className="space-y-5 px-10 py-8">
          <p className="text-[22px] text-[#7a7c8e]">
            Вы уверены, что хотите удалить этот документ? Это действие нельзя отменить.
          </p>
          <div className="flex justify-end pt-3">
            <Button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="h-12 rounded-3xl bg-[#ff3b30] px-8 text-[18px] text-white hover:bg-[#e0342a] sm:h-14 sm:px-10 sm:text-[24px]"
            >
              {submitting ? "Удаление..." : "Удалить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Main Component ---------- */

export function BreakdownHistoryDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  documents,
}: Props) {
  const router = useRouter();
  const [settingsTarget, setSettingsTarget] = useState<DocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  const defaultCreateState: DialogState = {
    title: BREAKDOWN_HISTORY_DOCUMENT_TITLE,
    dateFrom: new Date().toISOString().slice(0, 10),
  };

  async function createDocument(payload: DialogState) {
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || BREAKDOWN_HISTORY_DOCUMENT_TITLE,
        dateFrom: payload.dateFrom,
        config: { rows: [] },
      }),
    });

    if (!response.ok) {
      window.alert("Не удалось создать документ");
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
        title: payload.title.trim() || BREAKDOWN_HISTORY_DOCUMENT_TITLE,
        dateFrom: payload.dateFrom,
      }),
    });

    if (!response.ok) {
      window.alert("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
  }

  async function handleDelete(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      window.alert("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {BREAKDOWN_HISTORY_HEADING}
          {activeTab === "closed" && " (Закрытые)"}
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
          {activeTab === "active" && (
            <Button
              className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-5" />
              Создать документ
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-12 text-[18px]">
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

      {/* Document Cards */}
      <div className="space-y-4">
        {documents.length === 0 && (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-4 py-5 text-lg text-[#8a8ea4] sm:px-8 sm:py-8 sm:text-[28px]">
            Документов пока нет
          </div>
        )}

        {documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-[1fr_300px_64px] items-center rounded-[18px] border border-[#eaedf7] bg-white px-8 py-5"
            >
              <Link href={href} className="text-[18px] font-semibold tracking-[-0.02em] text-black">
                {document.title || BREAKDOWN_HISTORY_DOCUMENT_TITLE}
              </Link>

              <Link href={href} className="border-l border-[#e8ebf5] px-8">
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
                    >
                      <Ellipsis className="size-8" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl">
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                        onSelect={() => setSettingsTarget(document)}
                      >
                        <Pencil className="mr-3 size-6 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                      onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => setDeleteTarget(document)}
                      >
                        <Trash2 className="mr-3 size-6 text-[#ff3b30]" />
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

      {/* Create Dialog */}
      <SettingsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={defaultCreateState}
        onSubmit={createDocument}
        submitText="Создать"
        dialogTitle="Создание документа"
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        initial={
          settingsTarget
            ? {
                title: settingsTarget.title || BREAKDOWN_HISTORY_DOCUMENT_TITLE,
                dateFrom: settingsTarget.dateFrom,
              }
            : null
        }
        onSubmit={async (value) => {
          if (!settingsTarget) return;
          await saveSettings(settingsTarget.id, value);
        }}
        submitText="Сохранить"
        dialogTitle="Настройки документа"
      />

      {/* Delete Dialog */}
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        title={deleteTarget?.title || BREAKDOWN_HISTORY_DOCUMENT_TITLE}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget.id);
        }}
      />
    </div>
  );
}
