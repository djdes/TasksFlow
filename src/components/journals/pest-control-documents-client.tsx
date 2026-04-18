"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_PAGE_TITLE,
  formatPestControlDate,
} from "@/lib/pest-control-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import { openDocumentPdf } from "@/lib/open-document-pdf";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
type UserItem = { id: string; name: string; role: string };

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  users: UserItem[];
  documents: DocumentItem[];
};

type EditingState = {
  id: string;
  title: string;
  dateFrom: string;
};

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initial: EditingState | null;
  onSubmit: (payload: { title: string; dateFrom: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ title: "", dateFrom: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.initial) return;
    setForm({
      title: props.initial.title,
      dateFrom: props.initial.dateFrom,
    });
  }, [props.initial]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open && props.initial) {
          setForm({
            title: props.initial.title,
            dateFrom: props.initial.dateFrom,
          });
        }
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[22px] font-medium text-black">
            {props.title}
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          <Input
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Введите название документа"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Input
            type="date"
            value={form.dateFrom}
            onChange={(event) =>
              setForm((current) => ({ ...current, dateFrom: event.target.value }))
            }
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || !form.dateFrom}
              className="h-12 rounded-xl bg-[#5863f8] px-7 text-[18px] text-white hover:bg-[#4b57f3]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit({
                    title: form.title.trim() || PEST_CONTROL_DOCUMENT_TITLE,
                    dateFrom: form.dateFrom,
                  });
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Сохранение..." : props.submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[22px] font-medium text-black">
            {props.title}
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="flex justify-end px-7 py-6">
          <Button
            type="button"
            disabled={submitting}
            className="h-12 rounded-xl bg-[#5863f8] px-7 text-[18px] text-white hover:bg-[#4b57f3]"
            onClick={async () => {
              setSubmitting(true);
              try {
                await props.onSubmit();
                props.onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Подождите..." : props.submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PestControlDocumentsClient(props: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleting, setDeleting] = useState<DocumentItem | null>(null);
  const [seeding, setSeeding] = useState(false);

  const createState: EditingState = {
    id: "",
    title: PEST_CONTROL_DOCUMENT_TITLE,
    dateFrom: new Date().toISOString().slice(0, 10),
  };

  useEffect(() => {
    if (props.activeTab !== "active" || props.documents.length > 0 || seeding) {
      return;
    }

    let cancelled = false;

    async function ensureSampleDocuments() {
      setSeeding(true);

      try {
        const createResponse = await fetch("/api/journal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateCode: props.templateCode,
            title: PEST_CONTROL_DOCUMENT_TITLE,
            dateFrom: "2025-03-05",
            dateTo: "2025-03-05",
          }),
        });

        if (!createResponse.ok) return;

        const created = (await createResponse.json()) as { document: { id: string } };
        const acceptedUser = props.users[0];
        const acceptedRole = acceptedUser
          ? getHygienePositionLabel(acceptedUser.role)
          : "Управляющий";

        if (acceptedUser) {
          const firstEntryResponse = await fetch(`/api/journal-documents/${created.document.id}/pest-control-entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              performedDate: "2025-03-17",
              performedHour: "18",
              performedMinute: "00",
              timeSpecified: true,
              event: "Дезинсекция",
              areaOrVolume: "200",
              treatmentProduct: "Раствор",
              note: "Не мыть полы 24 -48 часов. Добавочно расставить ловушки.",
              performedBy: "ИП",
              acceptedRole,
              acceptedEmployeeId: acceptedUser.id,
            }),
          });
          if (!firstEntryResponse.ok) {
            throw new Error("Не удалось создать первую строку журнала");
          }

          const secondEntryResponse = await fetch(`/api/journal-documents/${created.document.id}/pest-control-entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              performedDate: "2025-03-25",
              performedHour: "11",
              performedMinute: "00",
              timeSpecified: true,
              event: "Дезинсекция",
              areaOrVolume: "84,9",
              treatmentProduct: "пропан",
              note: "",
              performedBy: "ИП Хижняк",
              acceptedRole,
              acceptedEmployeeId: acceptedUser.id,
            }),
          });
          if (!secondEntryResponse.ok) {
            throw new Error("Не удалось создать вторую строку журнала");
          }
        }

        const closedResponse = await fetch("/api/journal-documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateCode: props.templateCode,
            title: PEST_CONTROL_DOCUMENT_TITLE,
            dateFrom: "2025-02-05",
            dateTo: "2025-02-05",
          }),
        });

        if (closedResponse.ok) {
          const closed = (await closedResponse.json()) as { document: { id: string } };
          const patchResponse = await fetch(`/api/journal-documents/${closed.document.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "closed",
              dateTo: "2025-02-28",
            }),
          });
          if (!patchResponse.ok) {
            throw new Error("Не удалось подготовить закрытый документ журнала");
          }
        }

        if (!cancelled) {
          router.refresh();
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Не удалось подготовить тестовые документы");
        }
      } finally {
        if (!cancelled) {
          setSeeding(false);
        }
      }
    }

    void ensureSampleDocuments();

    return () => {
      cancelled = true;
    };
  }, [props.activeTab, props.documents.length, props.templateCode, props.users, router, seeding]);

  async function createDocument(payload: { title: string; dateFrom: string }) {
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: props.templateCode,
        title: payload.title,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось создать документ");
      return;
    }

    const result = (await response.json()) as { document: { id: string } };
    router.push(`/journals/${props.routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function saveDocumentSettings(
    documentId: string,
    payload: { title: string; dateFrom: string }
  ) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        dateFrom: payload.dateFrom,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки документа");
      return;
    }

    router.refresh();
  }

  async function deleteDocument(documentId: string) {
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
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
          {PEST_CONTROL_PAGE_TITLE}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-xl border-[#dcdfed] px-4 text-[14px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            asChild
          >
            <Link href="/sanpin">
              <BookOpenText className="size-4" />
              Инструкция
            </Link>
          </Button>
          {props.activeTab === "active" && (
            <Button
              className="h-12 rounded-xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0]"
              onClick={() => setCreating(true)}
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
            href={`/journals/${props.routeCode}`}
            className={`relative pb-4 ${
              props.activeTab === "active"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                : "text-[#6f7282]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${props.routeCode}?tab=closed`}
            className={`relative pb-4 ${
              props.activeTab === "closed"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]"
                : "text-[#6f7282]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {props.documents.length === 0 && (
          <EmptyDocumentsState />
        )}

        {props.documents.map((document) => {
          const href = `/journals/${props.routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[1.8fr_320px_48px] sm:items-center sm:gap-0 sm:px-6 sm:py-5"
            >
              <Link href={href} className="text-[17px] font-semibold tracking-[-0.02em] text-black">
                {document.title || PEST_CONTROL_DOCUMENT_TITLE}
              </Link>

              <Link href={href} className="border-l border-[#e6e6f0] px-10">
                <div className="text-[14px] text-[#84849a]">Дата начала</div>
                <div className="mt-2 text-[14px] font-semibold text-black">
                  {formatPestControlDate(document.dateFrom)}
                </div>
              </Link>

              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-full text-[#5566f6] hover:bg-[#f5f6ff]"
                    >
                      <Ellipsis className="size-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[220px] rounded-[14px] border border-[#eceef5] p-2 shadow-lg"
                  >
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-lg px-3 text-[14px]"
                        onSelect={() =>
                          setEditing({
                            id: document.id,
                            title: document.title || PEST_CONTROL_DOCUMENT_TITLE,
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
                      onSelect={() =>
                        openDocumentPdf(document.id)
                      }
                    >
                      <Printer className="mr-2 size-4 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-lg px-3 text-[14px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => setDeleting(document)}
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

      <SettingsDialog
        open={creating}
        onOpenChange={setCreating}
        title="Создание документа"
        submitLabel="Создать"
        initial={createState}
        onSubmit={createDocument}
      />

      <SettingsDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="Настройки документа"
        submitLabel="Сохранить"
        initial={editing}
        onSubmit={async (payload) => {
          if (!editing) return;
          await saveDocumentSettings(editing.id, payload);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Удаление документа "${deleting?.title || PEST_CONTROL_DOCUMENT_TITLE}"`}
        submitLabel="Удалить"
        onSubmit={async () => {
          if (!deleting) return;
          await deleteDocument(deleting.id);
        }}
      />
    </div>
  );
}
