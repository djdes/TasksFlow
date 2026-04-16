"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatProductWriteoffDate,
  getProductWriteoffDocumentListTitle,
  normalizeProductWriteoffConfig,
  type ProductWriteoffConfig,
} from "@/lib/product-writeoff-document";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config?: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

function ProductWriteoffActionsMenu(props: {
  isActive: boolean;
  onEdit: () => void;
  onPrint: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
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
        <DropdownMenuItem className="mb-2 h-11 rounded-2xl px-4 text-[15px]" onSelect={props.onEdit}>
          <Pencil className="mr-4 size-6 text-[#6f7282]" />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuItem className="mb-2 h-11 rounded-2xl px-4 text-[15px]" onSelect={props.onPrint}>
          <Printer className="mr-4 size-6 text-[#6f7282]" />
          Печать
        </DropdownMenuItem>
        {props.isActive && (
          <DropdownMenuItem className="mb-2 h-11 rounded-2xl px-4 text-[15px]" onSelect={props.onArchive}>
            <Archive className="mr-4 size-6 text-[#6f7282]" />
            Отправить в закрытые
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
          onSelect={props.onDelete}
        >
          <Trash2 className="mr-4 size-6 text-[#ff3b30]" />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductWriteoffDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<JournalListDocument | null>(null);
  const [settings, setSettings] = useState<ProductWriteoffConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editingDocument) return;
    setSettings(normalizeProductWriteoffConfig(editingDocument.config));
  }, [editingDocument]);

  const normalizedDocuments = useMemo(
    () =>
      documents.map((document) => {
        const config = normalizeProductWriteoffConfig(document.config);
        return {
          ...document,
          config,
          listTitle: getProductWriteoffDocumentListTitle(config),
        };
      }),
    [documents]
  );

  async function patchDocument(documentId: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error();
    }
  }

  async function handleDelete(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  async function handleArchive(documentId: string) {
    if (!window.confirm("Перенести документ в закрытые?")) return;
    try {
      await patchDocument(documentId, { status: "closed" });
      router.refresh();
    } catch {
      toast.error("Не удалось изменить статус документа");
    }
  }

  async function saveSettings() {
    if (!editingDocument || !settings) return;
    setIsSaving(true);
    try {
      await patchDocument(editingDocument.id, {
        title: settings.documentName,
        dateFrom: settings.documentDate,
        dateTo: settings.documentDate,
        config: settings,
      });
      setEditingDocument(null);
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-[70%] text-[48px] font-semibold tracking-[-0.03em] text-black">Акт забраковки</h1>
          <div className="flex shrink-0 items-center gap-3">
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
              <CreateDocumentDialog
                templateCode={templateCode}
                templateName={templateName}
                users={users}
                triggerClassName="h-12 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
                triggerLabel="Создать документ"
                triggerIcon={<Plus className="size-4" />}
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

        <div className="space-y-4">
          {normalizedDocuments.length === 0 && (
            <EmptyDocumentsState />
          )}

          {normalizedDocuments.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-1 gap-4 rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[minmax(0,1.8fr)_280px_280px_56px] sm:items-center sm:gap-0 sm:px-7"
            >
              <Link href={`/journals/${templateCode}/documents/${document.id}`} className="min-w-0">
                <div className="text-[17px] font-semibold tracking-[-0.02em] text-black">{document.listTitle}</div>
              </Link>
              <Link
                href={`/journals/${templateCode}/documents/${document.id}`}
                className="min-w-0 border-t border-[#eceef5] pt-4 sm:border-l sm:border-t-0 sm:px-10 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">Комментарий</div>
                <div className="mt-1 truncate text-[15px] leading-none text-black">
                  {document.config.comment || "—"}
                </div>
              </Link>
              <Link
                href={`/journals/${templateCode}/documents/${document.id}`}
                className="border-t border-[#eceef5] pt-4 sm:border-l sm:border-t-0 sm:px-10 sm:pt-0"
              >
                <div className="text-[14px] text-[#84849a]">Дата документа</div>
                <div className="mt-2 text-[14px] font-semibold text-black">
                  {formatProductWriteoffDate(document.config.documentDate || document.dateFrom)}
                </div>
              </Link>
              <div className="flex justify-start sm:justify-end">
                <ProductWriteoffActionsMenu
                  isActive={document.status === "active"}
                  onEdit={() => setEditingDocument(document)}
                  onPrint={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                  onArchive={() => handleArchive(document.id)}
                  onDelete={() => handleDelete(document.id, document.listTitle)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!editingDocument} onOpenChange={(open) => !open && setEditingDocument(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[22px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          {settings && (
            <div className="space-y-5 px-8 py-6">
              <div className="space-y-2">
                <Label>Название документа</Label>
                <Input
                  value={settings.documentName}
                  onChange={(event) =>
                    setSettings((prev) => (prev ? { ...prev, documentName: event.target.value } : prev))
                  }
                  className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <Label>№ акта</Label>
                <Input
                  value={settings.actNumber}
                  onChange={(event) =>
                    setSettings((prev) => (prev ? { ...prev, actNumber: event.target.value } : prev))
                  }
                  className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Дата документа</Label>
                <Input
                  type="date"
                  value={settings.documentDate}
                  onChange={(event) =>
                    setSettings((prev) => (prev ? { ...prev, documentDate: event.target.value } : prev))
                  }
                  className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Комментарий</Label>
                <Textarea
                  value={settings.comment}
                  onChange={(event) =>
                    setSettings((prev) => (prev ? { ...prev, comment: event.target.value } : prev))
                  }
                  className="min-h-[160px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[18px]"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4c58ff]"
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
