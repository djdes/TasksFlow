"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
import {
  JOURNAL_CARD_LABEL_CLASS,
  JOURNAL_CARD_SECTION_CLASS,
  JOURNAL_CARD_TITLE_CLASS,
  JOURNAL_CARD_VALUE_CLASS,
} from "@/components/journals/journal-responsive";
import { PositionSelectItems } from "@/components/shared/position-select";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  responsibleUserName: string | null;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  templateName: string;
  users: UserItem[];
  documents: JournalListDocument[];
};

function EditDocumentDialog({
  open,
  onOpenChange,
  document,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: JournalListDocument | null;
  users: UserItem[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleOptions = useMemo(
    () => [...new Set(users.map((user) => getHygienePositionLabel(user.role)))],
    [users]
  );

  useEffect(() => {
    if (!open || !document) return;
    setTitle(document.title);
    setResponsibleTitle(document.responsibleTitle || titleOptions[0] || "");
    setResponsibleUserId(users[0]?.id || "");
  }, [document, open, titleOptions, users]);

  async function handleSave() {
    if (!document) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          responsibleTitle: responsibleTitle || null,
          responsibleUserId: responsibleUserId || null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось сохранить настройки документа");
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить настройки документа"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[38px] border-0 p-0 shadow-[0_40px_140px_rgba(40,45,86,0.18)] sm:max-w-[970px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-[#d7dbe8] px-18 py-12">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки документа
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-black transition hover:bg-[#f3f4fb]"
          >
            <X className="size-10" />
          </button>
        </DialogHeader>

        <div className="space-y-10 px-18 py-12">
          <div className="space-y-3">
            <Label htmlFor="cold-document-title" className="text-[15px] text-[#8b8fa3]">
              Название документа
            </Label>
            <Input
              id="cold-document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#d7dbe8] px-4 text-[15px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[15px] text-[#8b8fa3]">
              Должность ответственного за снятие показателей
            </Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d7dbe8] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="Выберите должность" />
              </SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={users} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[15px] text-[#8b8fa3]">Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d7dbe8] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
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
              onClick={handleSave}
              disabled={isSubmitting || title.trim() === ""}
              className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4858eb]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ColdEquipmentDocumentsClient({
  activeTab,
  routeCode,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<JournalListDocument | null>(null);

  async function handleDelete(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(payload?.error || "Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  async function handlePrint(documentId: string) {
    try {
      await openDocumentPdf(documentId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть PDF");
    }
  }

  return (
    <>
      <div className="space-y-14">
        <div className="flex flex-col gap-10 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-[1100px]">
            <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              {templateName}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#5566f6] shadow-none hover:bg-[#f7f8ff]"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-6" />
                Инструкция
              </Link>
            </Button>

            {activeTab === "active" ? (
              <CreateDocumentDialog
                templateCode={templateCode}
                templateName={templateName}
                users={users}
                triggerClassName="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] font-medium text-white hover:bg-[#4959eb]"
                triggerLabel="Создать документ"
                triggerIcon={<Plus className="size-7" />}
              />
            ) : null}
          </div>
        </div>

        <div className="border-b border-[#d5d8e3]">
          <div className="flex gap-6 text-[15px] sm:gap-12 sm:text-[16px]">
            <Link
              href={`/journals/${routeCode}`}
              className={`relative pb-6 ${
                activeTab === "active"
                  ? "text-black after:absolute after:bottom-[-2px] after:left-0 after:h-[4px] after:w-full after:bg-[#5566f6]"
                  : "text-[#7b7f93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={`relative pb-6 ${
                activeTab === "closed"
                  ? "text-black after:absolute after:bottom-[-2px] after:left-0 after:h-[4px] after:w-full after:bg-[#5566f6]"
                  : "text-[#7b7f93]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {documents.length === 0 ? (
            <EmptyDocumentsState />
          ) : null}

          {documents.map((document) => {
            const href = `/journals/${routeCode}/documents/${document.id}`;

            return (
              <div
                key={document.id}
                className="grid grid-cols-1 gap-3 rounded-[30px] border border-[#e7eaf3] bg-white sm:grid-cols-[minmax(0,1.6fr)_340px_260px_84px] sm:items-center sm:gap-0"
              >
                <Link
                  href={href}
                  className={`${JOURNAL_CARD_TITLE_CLASS} px-8 py-6`}
                >
                  {document.title}
                </Link>

                <Link href={href} className={JOURNAL_CARD_SECTION_CLASS}>
                  <div className={JOURNAL_CARD_LABEL_CLASS}>Ответственный</div>
                  <div className={JOURNAL_CARD_VALUE_CLASS}>
                    {document.responsibleTitle && document.responsibleUserName
                      ? `${document.responsibleTitle}: ${document.responsibleUserName}`
                      : document.responsibleTitle || document.responsibleUserName || "Не назначен"}
                  </div>
                </Link>

                <Link href={href} className={JOURNAL_CARD_SECTION_CLASS}>
                  <div className={JOURNAL_CARD_LABEL_CLASS}>Период</div>
                  <div className={JOURNAL_CARD_VALUE_CLASS}>
                    {document.periodLabel}
                  </div>
                </Link>

                <div className="flex justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-14 items-center justify-center rounded-full text-[#5566f6] transition hover:bg-[#f6f7ff]"
                      >
                        <Ellipsis className="size-9" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[320px] rounded-[28px] border-0 p-4 shadow-[0_24px_80px_rgba(54,61,112,0.18)]"
                    >
                      {document.status === "active" ? (
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-5 text-[15px]"
                          onSelect={() => setEditingDocument(document)}
                        >
                          <Pencil className="mr-3 size-5 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-5 text-[15px]"
                        onSelect={() => {
                          handlePrint(document.id).catch(() => undefined);
                        }}
                      >
                        <Printer className="mr-3 size-5 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" ? (
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-5 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => handleDelete(document.id, document.title)}
                        >
                          <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
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

      <EditDocumentDialog
        open={!!editingDocument}
        onOpenChange={(open) => {
          if (!open) setEditingDocument(null);
        }}
        document={editingDocument}
        users={users}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
