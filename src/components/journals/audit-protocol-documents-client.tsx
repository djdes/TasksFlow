"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Copy, Ellipsis, Plus, Printer, Settings2, Trash2 } from "lucide-react";
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
  AUDIT_PROTOCOL_DOCUMENT_TITLE,
  AUDIT_PROTOCOL_TEMPLATE_CODE,
  getDefaultAuditProtocolConfig,
  normalizeAuditProtocolConfig,
} from "@/lib/audit-protocol-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  documents: DocumentItem[];
};

type SettingsState = {
  title: string;
  documentDate: string;
  basisTitle: string;
  auditedObject: string;
};

function DocumentDialog({
  open,
  onOpenChange,
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: SettingsState;
  submitLabel: string;
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState(initial);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setState(initial);
      setSubmitting(false);
    }
  }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[32px] font-medium text-black">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-12 py-10">
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(event) => setState({ ...state, title: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Дата документа</Label>
            <Input
              type="date"
              value={state.documentDate}
              onChange={(event) => setState({ ...state, documentDate: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Основание проверки</Label>
            <Input
              value={state.basisTitle}
              onChange={(event) => setState({ ...state, basisTitle: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Проверяемый объект</Label>
            <Input
              value={state.auditedObject}
              onChange={(event) => setState({ ...state, auditedObject: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit(state);
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditProtocolDocumentsClient({
  activeTab,
  routeCode,
  documents,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<DocumentItem | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<DocumentItem | null>(null);

  const createState = useMemo<SettingsState>(() => {
    const config = getDefaultAuditProtocolConfig();
    return {
      title: AUDIT_PROTOCOL_DOCUMENT_TITLE,
      documentDate: config.documentDate,
      basisTitle: config.basisTitle,
      auditedObject: config.auditedObject,
    };
  }, []);

  async function createDocument(payload: SettingsState) {
    const config = {
      ...getDefaultAuditProtocolConfig(),
      documentDate: payload.documentDate,
      basisTitle: payload.basisTitle,
      auditedObject: payload.auditedObject,
    };

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: AUDIT_PROTOCOL_TEMPLATE_CODE,
        title: payload.title.trim() || AUDIT_PROTOCOL_DOCUMENT_TITLE,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        config,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось создать документ");
    }
    router.push(`/journals/${routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function saveDocument(document: DocumentItem, payload: SettingsState) {
    const current = normalizeAuditProtocolConfig(document.config);
    const response = await fetch(`/api/journal-documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || AUDIT_PROTOCOL_DOCUMENT_TITLE,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        config: {
          ...current,
          documentDate: payload.documentDate,
          basisTitle: payload.basisTitle,
          auditedObject: payload.auditedObject,
        },
      }),
    });
    if (!response.ok) throw new Error("Не удалось сохранить документ");
    router.refresh();
  }

  async function copyDocument(document: DocumentItem) {
    const current = normalizeAuditProtocolConfig(document.config);
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: AUDIT_PROTOCOL_TEMPLATE_CODE,
        title: document.title || AUDIT_PROTOCOL_DOCUMENT_TITLE,
        dateFrom: current.documentDate,
        dateTo: current.documentDate,
        config: current,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось сделать копию");
    }
    router.push(`/journals/${routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function deleteById(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Не удалось удалить документ");
    router.refresh();
  }

  return (
    <>
      <div className="space-y-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {activeTab === "closed"
              ? `${AUDIT_PROTOCOL_DOCUMENT_TITLE} (закрытые)`
              : AUDIT_PROTOCOL_DOCUMENT_TITLE}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-[#eef0fb] px-4 text-[14px] text-[#5464ff] shadow-none"
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
            <Link href={`/journals/${routeCode}`} className={`relative pb-4 ${activeTab === "active" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]" : "text-[#7c7c93]"}`}>Активные</Link>
            <Link href={`/journals/${routeCode}?tab=closed`} className={`relative pb-4 ${activeTab === "closed" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]" : "text-[#7c7c93]"}`}>Закрытые</Link>
          </div>
        </div>

        <div className="space-y-3">
          {documents.length === 0 && (
            <div className="rounded-[16px] border border-[#eef0f6] bg-white px-8 py-10 text-[18px] text-[#7c7c93]">
              Документов пока нет
            </div>
          )}

          {documents.map((document) => {
            const config = normalizeAuditProtocolConfig(document.config);
            return (
              <div key={document.id} className="grid grid-cols-1 gap-4 rounded-[16px] border border-[#eef0f6] bg-white px-5 py-5 sm:grid-cols-[minmax(0,1fr)_280px_170px_56px] sm:items-center sm:gap-0 sm:px-7">
                <Link href={`/journals/${routeCode}/documents/${document.id}`} className="text-[16px] font-semibold text-black">
                  {document.title || AUDIT_PROTOCOL_DOCUMENT_TITLE}
                </Link>
                <Link href={`/journals/${routeCode}/documents/${document.id}`} className="border-t border-[#eef0f6] pt-4 sm:border-l sm:border-t-0 sm:px-6 sm:pt-0">
                  <div className="text-[11px] text-[#979aab]">Основание проверки</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">{config.basisTitle}</div>
                </Link>
                <Link href={`/journals/${routeCode}/documents/${document.id}`} className="border-t border-[#eef0f6] pt-4 text-left sm:border-l sm:border-t-0 sm:px-6 sm:pt-0 sm:text-right">
                  <div className="text-[11px] text-[#979aab]">Дата документа</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">{config.documentDate}</div>
                </Link>
                <div className="justify-self-start sm:justify-self-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="flex size-9 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]">
                        <Ellipsis className="size-6" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[290px] rounded-[24px] border-0 p-4 shadow-xl">
                      {document.status === "active" && (
                        <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => setSettingsDocument(document)}>
                          <Settings2 className="mr-3 size-5 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                      )}
                      {document.status === "active" && (
                        <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => copyDocument(document)}>
                          <Copy className="mr-3 size-5 text-[#6f7282]" />
                          Сделать копию
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => void openDocumentPdf(document.id).catch((error) => window.alert(error instanceof Error ? error.message : "Не удалось открыть PDF"))}>
                        <Printer className="mr-3 size-5 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" && (
                        <DropdownMenuItem className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]" onSelect={() => setDeleteDocument(document)}>
                          <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
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
      </div>

      <DocumentDialog open={createOpen} onOpenChange={setCreateOpen} title="Создание документа" initial={createState} submitLabel="Создать" onSubmit={createDocument} />

      <DocumentDialog
        open={!!settingsDocument}
        onOpenChange={(open) => {
          if (!open) setSettingsDocument(null);
        }}
        title="Настройки документа"
        initial={
          settingsDocument
            ? {
                title: settingsDocument.title,
                ...(() => {
                  const config = normalizeAuditProtocolConfig(settingsDocument.config);
                  return {
                    documentDate: config.documentDate,
                    basisTitle: config.basisTitle,
                    auditedObject: config.auditedObject,
                  };
                })(),
              }
            : createState
        }
        submitLabel="Сохранить"
        onSubmit={async (value) => {
          if (!settingsDocument) return;
          await saveDocument(settingsDocument, value);
        }}
      />

      <Dialog open={!!deleteDocument} onOpenChange={(open) => !open && setDeleteDocument(null)}>
        <DialogContent className="max-w-[680px] rounded-[32px] border-0 p-0">
          <DialogHeader className="border-b px-12 py-10">
            <DialogTitle className="pr-10 text-[32px] font-medium text-black">
              {`Удалить документ "${deleteDocument?.title || AUDIT_PROTOCOL_DOCUMENT_TITLE}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end px-12 py-10">
            <Button
              type="button"
              onClick={async () => {
                if (!deleteDocument) return;
                await deleteById(deleteDocument.id);
                setDeleteDocument(null);
              }}
              className="h-16 rounded-[18px] bg-[#ff5e57] px-10 text-[18px] text-white hover:bg-[#ef4b44]"
            >
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
