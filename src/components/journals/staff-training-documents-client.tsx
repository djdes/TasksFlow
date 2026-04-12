"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DocumentActionsMenu,
  EmptyDocumentsState,
  JournalTabs,
  JournalTopBar,
} from "@/components/journals/document-list-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { openDocumentPdf } from "@/lib/open-document-pdf";

import { toast } from "sonner";
type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  startedAtLabel: string;
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

export function StaffTrainingDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<JournalListDocument | null>(null);
  const [title, setTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [showSignature, setShowSignature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editingDocument) return;
    setTitle(editingDocument.title);
    setDateFrom(editingDocument.dateFrom);
    const cfg = editingDocument.config as Record<string, unknown> | null;
    setShowSignature(cfg?.showSignatureField === true);
  }, [editingDocument]);

  async function handleDelete(documentId: string, titleValue: string) {
    if (!window.confirm(`Удалить документ "${titleValue}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  async function saveSettings() {
    if (!editingDocument) return;
    setIsSaving(true);
    try {
      const prevConfig = (editingDocument.config && typeof editingDocument.config === "object" && !Array.isArray(editingDocument.config))
        ? editingDocument.config as Record<string, unknown>
        : {};
      const response = await fetch(`/api/journal-documents/${editingDocument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dateFrom,
          config: { ...prevConfig, showSignatureField: showSignature },
        }),
      });
      if (!response.ok) throw new Error();
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
      <JournalTopBar
        heading="Журнал регистрации инструктажей (обучения) сотрудников"
        activeTab={activeTab}
        templateCode={templateCode}
        templateName={templateName}
        users={users}
      />
      <JournalTabs activeTab={activeTab} templateCode={templateCode} />
      <div className="space-y-4">
        {documents.length === 0 && <EmptyDocumentsState />}
        {documents.map((document) => (
          <div
            key={document.id}
            className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#eceef5] bg-white px-4 py-3 sm:grid-cols-[1.8fr_220px_48px] sm:items-center sm:gap-0"
          >
            <Link href={`/journals/${templateCode}/documents/${document.id}`} className="min-w-0">
              <div className="text-[24px] leading-none tracking-tight text-black sm:text-[36px]">{document.title}</div>
            </Link>
            <Link href={`/journals/${templateCode}/documents/${document.id}`} className="border-t border-[#eceef5] pt-3 sm:justify-self-end sm:border-t-0 sm:pr-2 sm:pt-0">
              <div className="text-[14px] text-[#85889b]">Дата начала</div>
              <div className="text-[20px] leading-none text-black sm:text-[30px]">{document.startedAtLabel}</div>
            </Link>
            <DocumentActionsMenu
              size="sm"
              onEdit={() => setEditingDocument(document)}
              onPrint={() => openDocumentPdf(document.id)}
              onDelete={() => handleDelete(document.id, document.title)}
            />
          </div>
        ))}
      </div>

      <Dialog open={!!editingDocument} onOpenChange={(open) => !open && setEditingDocument(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[24px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Название документа</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Дата начала</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <label className="flex items-center gap-3">
              <Switch checked={showSignature} onCheckedChange={setShowSignature} />
              <span className="text-sm">Добавить поле &quot;Подпись инструктируемого&quot;</span>
            </label>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={isSaving}>
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
