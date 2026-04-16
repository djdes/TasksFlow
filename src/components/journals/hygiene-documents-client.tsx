"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  getStaffJournalResponsibleTitleOptions,
  HYGIENE_PERIODICITY_TEXT,
} from "@/lib/hygiene-document";
import {
  getJournalDocumentHeading,
  isStaffDocumentTemplate,
} from "@/lib/journal-document-helpers";
import { openDocumentPdf } from "@/lib/open-document-pdf";

import { toast } from "sonner";
type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  periodLabel: string;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

function EditDocumentDialog({
  open,
  onOpenChange,
  document,
  responsibleOptions,
  templateCode,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  document: JournalListDocument | null;
  responsibleOptions: string[];
  templateCode: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!document || !open) return;
    setTitle(document.title);
    setResponsibleTitle(document.responsibleTitle || responsibleOptions[0] || "");
  }, [document, open, responsibleOptions]);

  async function handleSave() {
    if (!document) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          responsibleTitle,
        }),
      });
      if (!response.ok) {
        throw new Error("Не удалось сохранить настройки документа");
      }

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки документа");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <DialogTitle className="text-[22px] font-medium text-black">Настройки документа</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 px-10 py-8">
          <div className="space-y-3">
            <Label htmlFor="edit-doc-title" className="sr-only">
              Название документа
            </Label>
            <Input
              id="edit-doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите название документа"
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {responsibleOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isStaffDocumentTemplate(templateCode) && templateCode !== "health_check" && (
            <div className="space-y-2 rounded-3xl border border-[#dfe1ec] px-6 py-5">
              <div className="text-[18px] text-[#73738a]">Периодичность контроля</div>
              <div className="text-lg leading-[1.35] text-black sm:text-[15px]">{HYGIENE_PERIODICITY_TEXT}</div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSave}
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

function DocumentRow({
  templateCode,
  document,
  canManage,
  onEdit,
  onDelete,
}: {
  templateCode: string;
  document: JournalListDocument;
  canManage: boolean;
  onEdit: (document: JournalListDocument) => void;
  onDelete: (document: JournalListDocument) => void;
}) {
  const href = `/journals/${templateCode}/documents/${document.id}`;

  return (
    <div className="grid grid-cols-[1.8fr_320px_290px_48px] items-center rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
      <Link href={href} className="text-[20px] font-semibold tracking-[-0.02em] text-black">
        {document.title}
      </Link>
      <Link href={href} className="border-l border-[#e6e6f0] px-10">
        <div className="text-[14px] text-[#84849a]">Должность ответственного</div>
        <div className="mt-2 text-[18px] font-semibold text-black">{document.responsibleTitle || ""}</div>
      </Link>
      <Link href={href} className="border-l border-[#e6e6f0] px-10">
        <div className="text-[14px] text-[#84849a]">Период</div>
        <div className="mt-2 text-[18px] font-semibold text-black">{document.periodLabel}</div>
      </Link>
      <div className="flex items-center justify-center text-[#5b66ff]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full hover:bg-[#f5f6ff]"
            >
              <Ellipsis className="size-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-6 shadow-xl">
            {canManage && (
              <DropdownMenuItem
                className="mb-3 h-11 rounded-2xl px-4 text-[15px]"
                onSelect={() => onEdit(document)}
              >
                <Pencil className="mr-4 size-7 text-[#6f7282]" />
                Настройки
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="mb-3 h-11 rounded-2xl px-4 text-[15px]"
              onSelect={() => openDocumentPdf(document.id)}
            >
              <Printer className="mr-4 size-7 text-[#6f7282]" />
              Печать
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem
                className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                onSelect={() => onDelete(document)}
              >
                <Trash2 className="mr-4 size-7 text-[#ff3b30]" />
                Удалить
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function HygieneDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<JournalListDocument | null>(null);
  const responsibleOptions = getStaffJournalResponsibleTitleOptions(users);

  async function handleDelete(document: JournalListDocument) {
    const confirmed = window.confirm(`Удалить документ "${document.title}"?`);
    if (!confirmed) return;

    const response = await fetch(`/api/journal-documents/${document.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error || "Ошибка удаления документа");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <div className="space-y-14">
        <div className="flex items-center justify-between">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {getJournalDocumentHeading(templateCode, activeTab === "closed")}
          </h1>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-6" />
                Инструкция
              </Link>
            </Button>
            {activeTab === "active" && (
              <CreateDocumentDialog
                templateCode={templateCode}
                templateName={templateName}
                users={users}
                triggerClassName="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] font-medium text-white hover:bg-[#4c58ff]"
                triggerLabel="Создать документ"
                triggerIcon={<Plus className="size-7" />}
              />
            )}
          </div>
        </div>

        <div className="border-b border-[#d9d9e4]">
          <div className="flex gap-12 text-[16px]">
            <Link
              href={`/journals/${templateCode}`}
              className={`relative pb-5 ${
                activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${templateCode}?tab=closed`}
              className={`relative pb-5 ${
                activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              templateCode={templateCode}
              document={document}
              canManage={document.status === "active"}
              onEdit={setEditingDocument}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      <EditDocumentDialog
        open={!!editingDocument}
        onOpenChange={(value) => {
          if (!value) setEditingDocument(null);
        }}
        document={editingDocument}
        responsibleOptions={responsibleOptions}
        templateCode={templateCode}
      />
    </>
  );
}
