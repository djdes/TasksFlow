"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Plus, Printer, Settings2, Trash2 } from "lucide-react";
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
  COMPLAINT_REGISTER_TEMPLATE_CODE,
  COMPLAINT_REGISTER_TITLE,
  formatComplaintDate,
  type ComplaintDocumentConfig,
} from "@/lib/complaint-document";

type ComplaintListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: ComplaintDocumentConfig | null;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  documents: ComplaintListDocument[];
};

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(COMPLAINT_REGISTER_TITLE);
  const [dateFrom, setDateFrom] = useState(today);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(COMPLAINT_REGISTER_TITLE);
    setDateFrom(today);
  }, [open, today]);

  async function handleCreate() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/journal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode: COMPLAINT_REGISTER_TEMPLATE_CODE,
          title: title.trim() || COMPLAINT_REGISTER_TITLE,
          dateFrom,
          dateTo: dateFrom,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.document?.id) {
        throw new Error(result?.error || "Не удалось создать документ");
      }

      onOpenChange(false);
      onCreated();
      router.push(`/journals/${COMPLAINT_REGISTER_TEMPLATE_CODE}/documents/${result.document.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка создания документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[32px] font-medium text-black">
            Создание документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label className="sr-only" htmlFor="complaint-doc-title">
              Название документа
            </Label>
            <Input
              id="complaint-doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Введите название документа"
              className="h-18 rounded-[22px] border-[#dfe1ec] px-7 text-[20px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]" htmlFor="complaint-doc-start">
              Дата начала
            </Label>
            <Input
              id="complaint-doc-start"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-18 rounded-[22px] border-[#dfe1ec] px-7 text-[20px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  document,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ComplaintListDocument | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !document) return;
    setTitle(document.title);
    setDateFrom(document.dateFrom);
  }, [document, open]);

  async function handleSave() {
    if (!document) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || COMPLAINT_REGISTER_TITLE,
          dateFrom,
          dateTo: dateFrom,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Не удалось сохранить документ");
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка сохранения документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[32px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]" htmlFor="complaint-settings-title">
              Название документа
            </Label>
            <Input
              id="complaint-settings-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-18 rounded-[22px] border-[#dfe1ec] px-7 text-[20px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]" htmlFor="complaint-settings-start">
              Дата начала
            </Label>
            <Input
              id="complaint-settings-start"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-18 rounded-[22px] border-[#dfe1ec] px-7 text-[20px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
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
  document,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ComplaintListDocument | null;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (!document) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить документ");
      }

      onOpenChange(false);
      onDeleted();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Ошибка удаления документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-10">
          <DialogTitle className="pr-14 text-[32px] font-medium leading-[1.15] text-black">
            {`Удаление документа "${document?.title || COMPLAINT_REGISTER_TITLE}"`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end px-14 py-12">
          <Button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ComplaintDocumentsClient({
  activeTab,
  routeCode,
  documents,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<ComplaintListDocument | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<ComplaintListDocument | null>(null);

  return (
    <>
      <div className="space-y-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {activeTab === "closed"
              ? `${COMPLAINT_REGISTER_TITLE} (Закрытые!!!)`
              : COMPLAINT_REGISTER_TITLE}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-[#eef0fb] px-4 text-[14px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
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
                className="h-12 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
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
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={`relative pb-4 ${
                activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {documents.length === 0 && <div className="min-h-[280px] rounded-[16px] bg-white" />}

          {documents.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-[minmax(0,1fr)_210px_56px] items-center rounded-[16px] border border-[#eef0f6] bg-white px-7 py-5"
            >
              <Link
                href={`/journals/${routeCode}/documents/${document.id}`}
                className="text-[16px] font-semibold text-black"
              >
                {document.title}
              </Link>
              <Link
                href={`/journals/${routeCode}/documents/${document.id}`}
                className="justify-self-end text-right"
              >
                <div className="text-[11px] text-[#979aab]">Дата начала</div>
                <div className="mt-1 text-[12px] font-semibold text-black">
                  {formatComplaintDate(document.dateFrom)}
                </div>
              </Link>
              <div className="justify-self-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                    >
                      <Ellipsis className="size-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[280px] rounded-[24px] border-0 p-4 shadow-xl">
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                        onSelect={() => setSettingsDocument(document)}
                      >
                        <Settings2 className="mr-3 size-5 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                      onSelect={() =>
                        window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")
                      }
                    >
                      <Printer className="mr-3 size-5 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
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
          ))}
        </div>
      </div>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />

      <SettingsDialog
        open={!!settingsDocument}
        onOpenChange={(open) => {
          if (!open) setSettingsDocument(null);
        }}
        document={settingsDocument}
        onSaved={() => router.refresh()}
      />

      <DeleteDialog
        open={!!deleteDocument}
        onOpenChange={(open) => {
          if (!open) setDeleteDocument(null);
        }}
        document={deleteDocument}
        onDeleted={() => router.refresh()}
      />
    </>
  );
}
