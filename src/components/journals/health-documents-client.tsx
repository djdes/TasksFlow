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

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
import {
  JOURNAL_CARD_LABEL_CLASS,
  JOURNAL_CARD_SECTION_CLASS,
  JOURNAL_CARD_TITLE_CLASS,
  JOURNAL_CARD_VALUE_CLASS,
} from "@/components/journals/journal-responsive";
type HealthListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  periodLabel: string;
  printEmptyRows?: number;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: HealthListDocument[];
};

function EditDocumentDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  document: HealthListDocument | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [emptyRows, setEmptyRows] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!props.document || !props.open) return;
    setTitle(props.document.title);
    setEmptyRows(String(props.document.printEmptyRows ?? 0));
  }, [props.document, props.open]);

  async function handleSave() {
    if (!props.document) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${props.document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Журнал здоровья",
          config: {
            printEmptyRows: Math.max(0, Number(emptyRows) || 0),
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Не удалось сохранить настройки документа");
      }

      props.onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить настройки документа"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-3">
            <Label htmlFor="edit-health-doc-title">Название документа</Label>
            <Input
              id="edit-health-doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Введите название документа"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Добавлять пустых строк при печати</Label>
            <select
              value={emptyRows}
              onChange={(event) => setEmptyRows(event.target.value)}
              className="h-11 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[18px]"
            >
              {[0, 1, 2, 3, 4, 5, 10, 15, 20].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSave}
              className="h-11 rounded-2xl bg-[#5566f6] px-6 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HealthDocumentRow(props: {
  document: HealthListDocument;
  templateCode: string;
  onEdit: (document: HealthListDocument) => void;
  onDelete: (document: HealthListDocument) => void;
}) {
  const href = `/journals/${props.templateCode}/documents/${props.document.id}`;
  const canManage = props.document.status === "active";

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[minmax(0,1fr)_240px_40px] sm:items-center sm:gap-0 sm:px-6 sm:py-5">
      <Link href={href} className="min-w-0 pr-4">
        <div className={`${JOURNAL_CARD_TITLE_CLASS} truncate`}>
          {props.document.title}
        </div>
      </Link>
      <Link href={href} className={`${JOURNAL_CARD_SECTION_CLASS} min-w-0`}>
        <div className={JOURNAL_CARD_LABEL_CLASS}>Период</div>
        <div className={`${JOURNAL_CARD_VALUE_CLASS} truncate`}>
          {props.document.periodLabel}
        </div>
      </Link>
      <div className="flex items-center justify-center text-[#5566f6]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full hover:bg-[#f5f6ff]"
            >
              <Ellipsis className="size-7" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px] rounded-[24px] border-0 p-4 shadow-xl">
            {canManage ? (
              <DropdownMenuItem
                className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                onSelect={() => props.onEdit(props.document)}
              >
                <Pencil className="mr-3 size-5 text-[#6f7282]" />
                Настройки
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
              onSelect={() => window.open(`/api/journal-documents/${props.document.id}/pdf`, "_blank")}
            >
              <Printer className="mr-3 size-5 text-[#6f7282]" />
              Печать
            </DropdownMenuItem>
            {canManage ? (
              <DropdownMenuItem
                className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                onSelect={() => props.onDelete(props.document)}
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
}

export function HealthDocumentsClient(props: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<HealthListDocument | null>(null);
  const heading =
    props.activeTab === "closed" ? "Журнал здоровья (Закрытые!!!)" : "Журнал здоровья";

  async function handleDelete(document: HealthListDocument) {
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
      <div className="space-y-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              {heading}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-6" />
                Инструкция
              </Link>
            </Button>
            {props.activeTab === "active" ? (
              <CreateDocumentDialog
                templateCode={props.templateCode}
                templateName={props.templateName}
                users={props.users}
                triggerClassName="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] font-medium text-white hover:bg-[#4a5bf0]"
                triggerLabel="Создать документ"
                triggerIcon={<Plus className="size-7" />}
              />
            ) : null}
          </div>
        </div>

        <div className="border-b border-[#ececf4]">
          <div className="flex gap-6 text-[15px] sm:gap-12 sm:text-[16px]">
            <Link
              href={`/journals/${props.templateCode}`}
              className={`relative pb-5 ${
                props.activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${props.templateCode}?tab=closed`}
              className={`relative pb-5 ${
                props.activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
                  : "text-[#6f7282]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {props.documents.length === 0 && <EmptyDocumentsState />}
          {props.documents.map((document) => (
            <HealthDocumentRow
              key={document.id}
              document={document}
              templateCode={props.templateCode}
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
      />
    </>
  );
}
