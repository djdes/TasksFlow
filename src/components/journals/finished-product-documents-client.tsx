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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeFinishedProductDocumentConfig } from "@/lib/finished-product-document";

import { toast } from "sonner";
type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  periodLabel: string;
  startedAtLabel: string;
  dateFrom: string;
  dateTo: string;
  config?: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

function endOfMonth(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);
  if (!year || !month) return dateValue;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function FinishedProductDocumentsClient({
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
  const [fieldNameMode, setFieldNameMode] = useState<"dish" | "semi">("dish");
  const [inspectorMode, setInspectorMode] = useState<"inspector_name" | "commission_signatures">(
    "inspector_name"
  );
  const [showProductTemp, setShowProductTemp] = useState(false);
  const [showCorrectiveAction, setShowCorrectiveAction] = useState(false);
  const [showOxygenLevel, setShowOxygenLevel] = useState(false);
  const [showCourierTime, setShowCourierTime] = useState(false);
  const [footerNote, setFooterNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editingDocument) return;
    const cfg = normalizeFinishedProductDocumentConfig(editingDocument.config);
    setTitle(editingDocument.title);
    setDateFrom(editingDocument.dateFrom);
    setFieldNameMode(cfg.fieldNameMode);
    setInspectorMode(cfg.inspectorMode);
    setShowProductTemp(cfg.showProductTemp);
    setShowCorrectiveAction(cfg.showCorrectiveAction);
    setShowOxygenLevel(cfg.showOxygenLevel);
    setShowCourierTime(cfg.showCourierTime);
    setFooterNote(cfg.footerNote);
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
      const response = await fetch(`/api/journal-documents/${editingDocument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dateFrom,
          dateTo: endOfMonth(dateFrom),
          config: {
            ...(normalizeFinishedProductDocumentConfig(editingDocument.config) || {}),
            fieldNameMode,
            inspectorMode,
            showProductTemp,
            showCorrectiveAction,
            showOxygenLevel,
            showCourierTime,
            footerNote,
          },
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
        heading={
          activeTab === "closed"
            ? "Журнал бракеража готовой пищевой продукции (Закрытые!!!)"
            : "Журнал бракеража готовой пищевой продукции"
        }
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
            className="grid grid-cols-1 gap-3 rounded-[16px] border border-[#e7eaf3] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(33,43,54,0.04)] sm:grid-cols-[minmax(0,1fr)_180px_48px] sm:items-center sm:gap-0 sm:px-5"
          >
            <Link href={`/journals/${templateCode}/documents/${document.id}`} className="min-w-0">
              <div className="truncate text-[22px] font-medium tracking-[-0.02em] text-black">
                {document.title}
              </div>
            </Link>
            <Link
              href={`/journals/${templateCode}/documents/${document.id}`}
              className="justify-self-end pr-2 text-right"
            >
              <div className="text-[14px] text-[#84849a]">Дата начала</div>
              <div className="text-[16px] font-semibold text-black">{document.startedAtLabel}</div>
            </Link>
            <DocumentActionsMenu
              size="sm"
              onEdit={activeTab === "active" ? () => setEditingDocument(document) : undefined}
              onPrint={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
              onDelete={
                activeTab === "active"
                  ? () => handleDelete(document.id, document.title)
                  : undefined
              }
            />
          </div>
        ))}
      </div>

      <Dialog open={!!editingDocument} onOpenChange={(open) => !open && setEditingDocument(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[22px] font-medium text-black">
              Настройки документа
            </DialogTitle>
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
            <div className="space-y-2 rounded-xl border p-3">
              <Label>Название поля</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={fieldNameMode === "dish"}
                  onChange={() => setFieldNameMode("dish")}
                />
                Наименование блюд (изделий)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={fieldNameMode === "semi"}
                  onChange={() => setFieldNameMode("semi")}
                />
                Наименование полуфабриката
              </label>
            </div>
            <div className="space-y-2 rounded-xl border p-3">
              <Label>Добавить поля</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showProductTemp} onCheckedChange={(v) => setShowProductTemp(v === true)} />
                T°C внутри продукта
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showCorrectiveAction}
                  onCheckedChange={(v) => setShowCorrectiveAction(v === true)}
                />
                Корректирующие действия
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showOxygenLevel} onCheckedChange={(v) => setShowOxygenLevel(v === true)} />
                Остаточный уровень кислорода, % об.
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showCourierTime} onCheckedChange={(v) => setShowCourierTime(v === true)} />
                Время передачи блюд курьеру
              </label>
            </div>
            <div className="space-y-2 rounded-xl border p-3">
              <Label>Название поля</Label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={inspectorMode === "inspector_name"}
                  onChange={() => setInspectorMode("inspector_name")}
                />
                ФИО лица, проводившего бракераж
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={inspectorMode === "commission_signatures"}
                  onChange={() => setInspectorMode("commission_signatures")}
                />
                Подписи членов бракеражной комиссии
              </label>
            </div>
            <Input
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="Примечание после таблицы"
            />
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
