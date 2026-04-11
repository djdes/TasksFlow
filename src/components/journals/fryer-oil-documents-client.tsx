"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
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
import { FRYER_OIL_PAGE_TITLE } from "@/lib/fryer-oil-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  dateFrom: string;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode?: string;
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: DocumentItem[];
};

type EditingState = {
  id: string;
  title: string;
  dateFrom: string;
};

function formatDateDash(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU").replaceAll(".", "-");
}

function FryerOilSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EditingState | null;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  useEffect(() => {
    if (!props.editing) return;
    setTitle(props.editing.title);
    setDateFrom(props.editing.dateFrom);
  }, [props.editing]);

  async function handleSave() {
    if (!props.editing) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/journal-documents/${props.editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || props.editing.title,
          dateFrom,
        }),
      });

      if (!response.ok) {
        throw new Error("save_failed");
      }

      props.onOpenChange(false);
      props.onSaved();
    } catch {
      window.alert("Не удалось сохранить настройки документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open && props.editing) {
          setTitle(props.editing.title);
          setDateFrom(props.editing.dateFrom);
        }
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[40px] font-semibold tracking-[-0.03em] text-black">
            Настройки документа
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-4 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Название документа</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[24px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[24px]"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FryerOilDocumentsClient(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const routeCode = props.routeCode || props.templateCode;
  const pageTitle =
    props.activeTab === "closed"
      ? `${FRYER_OIL_PAGE_TITLE} (Закрытые!!!)`
      : FRYER_OIL_PAGE_TITLE;

  async function handleDelete(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      window.alert("Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[54px] font-semibold tracking-[-0.04em] text-black">
          {pageTitle}
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
          {props.activeTab === "active" && (
            <CreateDocumentDialog
              templateCode={props.templateCode}
              templateName={props.templateName}
              users={props.users}
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
            href={`/journals/${routeCode}`}
            className={`relative pb-4 ${
              props.activeTab === "active"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7c7c93]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-4 ${
              props.activeTab === "closed"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7c7c93]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {props.documents.length === 0 && (
          <div className="rounded-[16px] border border-[#eceef5] bg-white px-6 py-8 text-center text-[16px] text-[#7d8196]">
            Документов пока нет
          </div>
        )}

        {props.documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;

          return (
            <div
              key={document.id}
              className="grid grid-cols-[minmax(0,1fr)_180px_40px] items-start gap-0 rounded-[16px] border border-[#eef0f6] bg-white px-3 py-4"
            >
              <Link href={href} className="px-2 text-[14px] font-semibold leading-5 text-black">
                {document.title}
              </Link>

              <Link href={href} className="border-l border-[#edf0f7] px-6">
                <div className="text-[11px] text-[#979aab]">Дата начала</div>
                <div className="mt-1 text-[12px] font-semibold text-black">
                  {formatDateDash(document.dateFrom)}
                </div>
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
                  <DropdownMenuContent align="end" className="w-[206px] rounded-[14px] border border-[#eceef5] p-2 shadow-lg">
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-lg px-3 text-[14px]"
                        onSelect={() =>
                          setEditing({
                            id: document.id,
                            title: document.title,
                            dateFrom: document.dateFrom,
                          })
                        }
                      >
                        <Pencil className="mr-2 size-4 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="h-11 rounded-lg px-3 text-[14px]"
                      onSelect={() => {
                        void openDocumentPdf(document.id).catch((error) =>
                          window.alert(
                            error instanceof Error ? error.message : "Не удалось открыть PDF"
                          )
                        );
                      }}
                    >
                      <Printer className="mr-2 size-4 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-lg px-3 text-[14px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => handleDelete(document.id, document.title)}
                      >
                        <Trash2 className="mr-2 size-4 text-[#ff3b30]" />
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

      <FryerOilSettingsDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
