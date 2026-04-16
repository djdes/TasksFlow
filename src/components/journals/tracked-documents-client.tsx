"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HYGIENE_PERIODICITY_TEXT, getStaffJournalResponsibleTitleOptions } from "@/lib/hygiene-document";
import {
  getTrackedDocumentCreateMode,
  isSourceStyleTrackedTemplate,
} from "@/lib/tracked-document";
import { PestControlDocumentsClient } from "@/components/journals/pest-control-documents-client";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  normalizeAcceptanceDocumentConfig,
} from "@/lib/acceptance-document";

import { toast } from "sonner";
type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  responsibleUserName?: string | null;
  periodLabel: string;
  metaLabel: string;
  metaValue: string;
  dateFrom: string;
  dateTo: string;
  config?: Record<string, unknown> | null;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  heading: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

function EditTrackedDocumentDialog({
  open,
  onOpenChange,
  document,
  templateCode,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: JournalListDocument | null;
  templateCode: string;
  users: { id: string; name: string; role: string }[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [areaName, setAreaName] = useState("");
  const [showPackagingField, setShowPackagingField] = useState(false);
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const responsibleOptions = useMemo(
    () => getStaffJournalResponsibleTitleOptions(users),
    [users]
  );

  const createMode = getTrackedDocumentCreateMode(templateCode);
  const isSourceStyle = isSourceStyleTrackedTemplate(templateCode);
  const isAcceptance = templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE;

  useEffect(() => {
    if (!open || !document) return;
    setTitle(document.title);
    setResponsibleTitle(document.responsibleTitle || responsibleOptions[0] || "");
    setDateFrom(document.dateFrom);
    setDateTo(document.dateTo);
    setAreaName(
      document.config &&
        typeof document.config === "object" &&
        typeof document.config.areaName === "string"
        ? document.config.areaName
        : ""
    );
    const acceptanceConfig = normalizeAcceptanceDocumentConfig(document.config, users);
    setShowPackagingField(acceptanceConfig.showPackagingComplianceField);
    setResponsibleUserId(acceptanceConfig.defaultResponsibleUserId || "");
  }, [document, open, responsibleOptions, users]);

  async function handleSave() {
    if (!document) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          responsibleTitle: responsibleTitle || null,
          dateFrom,
          dateTo,
          config: areaName.trim() ? { ...(document.config || {}), areaName: areaName.trim() } : document.config,
          ...(isAcceptance
            ? {
                config: {
                  ...normalizeAcceptanceDocumentConfig(document.config, users),
                  showPackagingComplianceField: showPackagingField,
                  defaultResponsibleUserId: responsibleUserId || null,
                  defaultResponsibleTitle: responsibleTitle || null,
                },
              }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Не удалось сохранить настройки документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[24px] font-medium text-black">Настройки документа</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-3">
            <Label htmlFor="tracked-edit-title" className="sr-only">
              Название документа
            </Label>
            <Input
              id="tracked-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите название документа"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>

          {createMode === "uv" && (
            <div className="space-y-3">
              <Label htmlFor="tracked-edit-area" className="sr-only">
                Наименование цеха
              </Label>
              <Input
                id="tracked-edit-area"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Введите наименование цеха/участка применения"
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
          )}

          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
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

          {createMode === "staff" ? (
            <div className="space-y-2 rounded-2xl border border-[#dfe1ec] px-5 py-4">
              <div className="text-[18px] text-[#73738a]">Периодичность контроля</div>
              <div className="text-[22px] leading-[1.35] text-black">{HYGIENE_PERIODICITY_TEXT}</div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="tracked-edit-date-from" className="text-[14px] text-[#73738a]">
                {createMode === "uv" || isAcceptance ? "Дата начала" : "Дата документа"}
              </Label>
              <Input
                id="tracked-edit-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
          )}

          {isAcceptance && (
            <>
              <div className="space-y-3">
                <Label className="text-[14px] text-[#73738a]">Добавить поля</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={showPackagingField} onCheckedChange={setShowPackagingField} />
                  <span className="text-[14px]">
                    Соответствие внешнего вида упаковки, маркировки требованиям НД
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
                <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                    <SelectValue placeholder="- Выберите значение -" />
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
            </>
          )}

          {isSourceStyle && createMode === "staff" && (
            <div className="hidden">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
          )}

          <div className="hidden">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5b66ff] px-6 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrackedDocumentsClientImpl({
  activeTab,
  templateCode,
  templateName,
  heading,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<JournalListDocument | null>(null);

  function getResponsibleCardValue(document: JournalListDocument) {
    if (document.responsibleTitle && document.responsibleUserName) {
      return `${document.responsibleTitle}: ${document.responsibleUserName}`;
    }

    return document.responsibleTitle || document.responsibleUserName || "—";
  }

  async function handleDelete(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;

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
    <>
      <div className="space-y-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">{heading}</h1>
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

        <div className="border-b border-[#d9dce8]">
          <div className="flex gap-9 text-[15px]">
            <Link
              href={`/journals/${templateCode}`}
              className={`relative pb-4 ${
                activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${templateCode}?tab=closed`}
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
          {documents.length === 0 && (
            <div className="rounded-[16px] border border-[#eceef5] bg-white px-6 py-8 text-center text-[16px] text-[#7d8196]">
              Документов пока нет
            </div>
          )}

          {documents.map((document) => {
            const href = `/journals/${templateCode}/documents/${document.id}`;

            return (
              <div
                key={document.id}
                className="grid grid-cols-[minmax(0,1.6fr)_220px_180px_40px] items-start gap-0 rounded-[16px] border border-[#eef0f6] bg-white px-3 py-4"
              >
                <Link href={href} className="px-2 text-[14px] font-semibold leading-5 text-black">
                  {document.title}
                </Link>

                <Link href={href} className="border-l border-[#edf0f7] px-6">
                  <div className="text-[11px] text-[#979aab]">Ответственный</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">
                    {getResponsibleCardValue(document)}
                  </div>
                </Link>

                <Link href={href} className="border-l border-[#edf0f7] px-6">
                  <div className="text-[11px] text-[#979aab]">{document.metaLabel}</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">{document.metaValue}</div>
                </Link>

                <div className="flex justify-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                      >
                        <Ellipsis className="size-6" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[280px] rounded-[24px] border-0 p-4 shadow-xl">
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                          onSelect={() => setEditingDocument(document)}
                        >
                          <Pencil className="mr-3 size-5 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                        onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                      >
                        <Printer className="mr-3 size-5 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => handleDelete(document.id, document.title)}
                        >
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

      <EditTrackedDocumentDialog
        open={!!editingDocument}
        onOpenChange={(open) => {
          if (!open) setEditingDocument(null);
        }}
        document={editingDocument}
        templateCode={templateCode}
        users={users}
  onSaved={() => router.refresh()}
      />
    </>
  );
}

export function TrackedDocumentsClient(props: Props) {
  if (props.templateCode === "pest_control") {
    return (
      <PestControlDocumentsClient
        routeCode={props.templateCode}
        activeTab={props.activeTab}
        templateCode={props.templateCode}
        users={props.users}
        documents={props.documents.map((document) => ({
          id: document.id,
          title: document.title,
          status: document.status,
          dateFrom: document.dateFrom,
        }))}
      />
    );
  }

  return <TrackedDocumentsClientImpl {...props} />;
}
