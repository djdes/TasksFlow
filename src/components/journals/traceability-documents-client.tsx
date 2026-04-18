"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Ellipsis,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
type TraceabilityDocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config?: Record<string, unknown> | null;
};

type TraceabilityFormState = {
  title: string;
  dateFrom: string;
  showShockTempField: boolean;
  showShipmentBlock: boolean;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  templateName: string;
  documents: TraceabilityDocumentItem[];
};

const DEFAULT_TITLE = "Журнал прослеживаемости продукции";

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${toIsoDate(value)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readFormState(document?: TraceabilityDocumentItem | null): TraceabilityFormState {
  const config = document?.config && typeof document.config === "object" ? document.config : {};
  return {
    title: document?.title || DEFAULT_TITLE,
    dateFrom: document?.dateFrom ? toIsoDate(document.dateFrom) : new Date().toISOString().slice(0, 10),
    showShockTempField: toBoolean(config.showShockTempField, false),
    showShipmentBlock: toBoolean(config.showShipmentBlock, false),
  };
}

function buildConfig(state: TraceabilityFormState, baseConfig?: Record<string, unknown> | null) {
  return {
    ...(baseConfig && typeof baseConfig === "object" ? baseConfig : {}),
    showShockTempField: state.showShockTempField,
    showShipmentBlock: state.showShipmentBlock,
  };
}

function TraceabilitySettingsDialog(props: {
  open: boolean;
  title: string;
  initial: TraceabilityFormState | null;
  submitLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (state: TraceabilityFormState) => Promise<void>;
}) {
  const [state, setState] = useState<TraceabilityFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeState = state || props.initial;

  useEffect(() => {
    if (props.open) setState(props.initial);
  }, [props.initial, props.open]);

  async function handleSubmit() {
    if (!activeState) return;
    setSubmitting(true);
    try {
      await props.onSubmit(activeState);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.title}
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2 text-[#0b1024]"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>
        {activeState && (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Название документа</Label>
              <Input
                value={activeState.title}
                onChange={(e) => setState({ ...activeState, title: e.target.value })}
                placeholder="Введите название документа"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px] tracking-[-0.02em]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Дата начала</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.dateFrom}
                  onChange={(e) => setState({ ...activeState, dateFrom: toIsoDate(e.target.value) })}
                  className="h-11 rounded-2xl border-[#d8dae6] px-7 pr-14 text-[15px] tracking-[-0.02em]"
                />
                <CalendarDays className="pointer-events-none absolute right-6 top-1/2 size-7 -translate-y-1/2 text-[#6e7080]" />
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] border border-[#e3e5f0] px-5 py-5">
              <div className="text-[20px] font-medium tracking-[-0.02em] text-black">Добавить поле</div>
              <div className="flex items-center justify-between gap-4 rounded-[24px] bg-[#f7f8fd] px-5 py-4">
                <Label className="text-[18px] leading-tight text-black">
                  T °C продукта после шоковой заморозки
                </Label>
                <Switch
                  checked={activeState.showShockTempField}
                  onCheckedChange={(checked) =>
                    setState({ ...activeState, showShockTempField: checked })
                  }
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] border border-[#e3e5f0] px-5 py-5">
              <div className="text-[20px] font-medium tracking-[-0.02em] text-black">Добавить блок</div>
              <div className="flex items-center justify-between gap-4 rounded-[24px] bg-[#f7f8fd] px-5 py-4">
                <Label className="text-[18px] leading-tight text-black">Отгружено</Label>
                <Switch
                  checked={activeState.showShipmentBlock}
                  onCheckedChange={(checked) =>
                    setState({ ...activeState, showShipmentBlock: checked })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : props.submitLabel}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TraceabilityActionsMenu(props: {
  document: TraceabilityDocumentItem;
  onSettings: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onArchiveToggle: () => void;
}) {
  const isActive = props.document.status === "active";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full hover:bg-[#f5f6ff]"
        >
          <Ellipsis className="size-8 text-[#5566f6]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-4 shadow-xl">
        <DropdownMenuItem
          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
          onSelect={props.onSettings}
        >
          <Pencil className="mr-3 size-5 text-[#6f7282]" />
          Настройки
        </DropdownMenuItem>
        <DropdownMenuItem className="mb-2 h-11 rounded-2xl px-4 text-[15px]" onSelect={props.onPrint}>
          <Printer className="mr-3 size-5 text-[#6f7282]" />
          Печать
        </DropdownMenuItem>
        <DropdownMenuItem className="mb-2 h-11 rounded-2xl px-4 text-[15px]" onSelect={props.onArchiveToggle}>
          {isActive ? (
            <>
              <Archive className="mr-3 size-5 text-[#6f7282]" />
              Закрыть
            </>
          ) : (
            <>
              <ArchiveRestore className="mr-3 size-5 text-[#6f7282]" />
              В активные
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
          onSelect={props.onDelete}
        >
          <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TraceabilityDocumentsClient({
  activeTab,
  routeCode,
  templateCode,
  documents,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<TraceabilityDocumentItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TraceabilityDocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TraceabilityDocumentItem | null>(null);

  const heading = useMemo(
    () =>
      DEFAULT_TITLE,
    [activeTab]
  );

  async function persistDocument(
    payload: TraceabilityFormState,
    documentId?: string,
    baseConfig?: Record<string, unknown> | null
  ) {
    const response = await fetch(
      documentId ? `/api/journal-documents/${documentId}` : "/api/journal-documents",
      {
      method: documentId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || DEFAULT_TITLE,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
        config: buildConfig(payload, baseConfig),
      }),
      }
    );

    if (!response.ok) {
      throw new Error("request failed");
    }

    return response.json() as Promise<{ document: { id: string } }>;
  }

  async function handleCreate(payload: TraceabilityFormState) {
    try {
      const data = await persistDocument(payload);
      setCreateOpen(false);
      router.push(`/journals/${routeCode}/documents/${data.document.id}`);
      router.refresh();
    } catch {
      toast.error("Не удалось создать документ");
    }
  }

  async function handleSaveSettings(payload: TraceabilityFormState) {
    if (!editingDocument) return;
    try {
      await persistDocument(payload, editingDocument.id, editingDocument.config);
      setEditingDocument(null);
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить настройки");
    }
  }

  async function handleDelete(doc: TraceabilityDocumentItem) {
    if (!window.confirm(`Удалить документ "${doc.title || DEFAULT_TITLE}"?`)) return;
    const response = await fetch(`/api/journal-documents/${doc.id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  async function handleStatusChange(doc: TraceabilityDocumentItem, nextStatus: "active" | "closed") {
    const response = await fetch(`/api/journal-documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      toast.error(nextStatus === "closed" ? "Не удалось закрыть документ" : "Не удалось восстановить документ");
      return;
    }
    setArchiveTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
            {heading}
          </h1>
          <div className="mt-5 flex items-center gap-10 border-b border-[#d8dbe6] text-[18px]">
            <Link
              href={`/journals/${routeCode}`}
              className={cn(
                "relative pb-4 text-[#6f7282]",
                activeTab === "active" &&
                  "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
              )}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={cn(
                "relative pb-4 text-[#6f7282]",
                activeTab === "closed" &&
                  "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
              )}
            >
              Закрытые
            </Link>
          </div>
        </div>
        {activeTab === "active" && (
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] font-medium text-white shadow-md shadow-[#5563ff]/20 hover:bg-[#4957fb]"
          >
            <Plus className="size-6" />
            Создать документ
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {documents.length === 0 ? (
          <EmptyDocumentsState />
        ) : (
          documents.map((document) => (
            <div
              key={document.id}
              className="grid grid-cols-[minmax(0,1fr)_220px_48px] items-center rounded-[18px] border border-[#eceef5] bg-white px-5 py-4 shadow-[0_1px_0_rgba(17,24,39,0.02)]"
            >
              <Link href={`/journals/${routeCode}/documents/${document.id}`} className="min-w-0">
                <div className="truncate text-[17px] font-semibold tracking-[-0.03em] text-black">
                  {document.title || DEFAULT_TITLE}
                </div>
              </Link>
              <Link href={`/journals/${routeCode}/documents/${document.id}`} className="justify-self-end pr-2">
                <div className="text-[14px] text-[#84849a]">Дата начала</div>
                <div className="text-[15px] font-medium leading-none tracking-[-0.03em] text-black">
                  {formatDateLabel(document.dateFrom)}
                </div>
              </Link>
              <TraceabilityActionsMenu
                document={document}
                onSettings={() => setEditingDocument(document)}
                onPrint={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                onDelete={() => setDeleteTarget(document)}
                onArchiveToggle={() => setArchiveTarget(document)}
              />
            </div>
          ))
        )}
      </div>

      <TraceabilitySettingsDialog
        open={createOpen}
        title="Создание документа"
        initial={readFormState()}
        submitLabel="Создать"
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />

      <TraceabilitySettingsDialog
        open={!!editingDocument}
        title="Настройки документа"
        initial={editingDocument ? readFormState(editingDocument) : null}
        submitLabel="Сохранить"
        onOpenChange={(open) => !open && setEditingDocument(null)}
        onSubmit={handleSaveSettings}
      />

      <Dialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[620px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-10 py-8">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
                {archiveTarget?.status === "active"
                  ? `Закрыть документ "${archiveTarget?.title || DEFAULT_TITLE}"`
                  : `Восстановить документ "${archiveTarget?.title || DEFAULT_TITLE}"`}
              </DialogTitle>
              <button
                type="button"
                className="rounded-xl p-2 text-[#0b1024]"
                onClick={() => setArchiveTarget(null)}
              >
                <X className="size-8" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex justify-end px-10 py-10">
            <Button
              type="button"
              onClick={() =>
                archiveTarget &&
                handleStatusChange(
                  archiveTarget,
                  archiveTarget.status === "active" ? "closed" : "active"
                )
              }
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            >
              {archiveTarget?.status === "active" ? "Закрыть" : "Восстановить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[620px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-10 py-8">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
                Удаление документа &quot;{deleteTarget?.title || DEFAULT_TITLE}&quot;
              </DialogTitle>
              <button
                type="button"
                className="rounded-xl p-2 text-[#0b1024]"
                onClick={() => setDeleteTarget(null)}
              >
                <X className="size-8" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex justify-end px-10 py-10">
            <Button
              type="button"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            >
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
