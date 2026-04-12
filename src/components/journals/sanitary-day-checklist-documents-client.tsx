"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  Copy,
  Ellipsis,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";
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
import { getSanitaryDayChecklistTitle } from "@/lib/sanitary-day-checklist-document";

import { toast } from "sonner";
type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config?: Record<string, unknown> | null;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  users: { id: string; name: string; role: string }[];
  documents: DocumentItem[];
};

type SettingsState = {
  title: string;
  documentDate: string;
};

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getDefaultDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUiState(document: DocumentItem, fallbackTitle: string): SettingsState {
  const cfg = document.config ?? {};
  const documentDate =
    typeof cfg.documentDate === "string" && cfg.documentDate
      ? cfg.documentDate
      : document.dateFrom
        ? toIsoDate(document.dateFrom)
        : getDefaultDate();
  return {
    title: document.title || fallbackTitle,
    documentDate,
  };
}

function formatDateLabel(isoDate: string): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initial: SettingsState | null;
  onSubmit: (value: SettingsState) => Promise<void>;
  submitText: string;
  title: string;
}) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeState = state || props.initial;

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
    <Dialog
      open={props.open}
      onOpenChange={(value) => {
        if (value) {
          setState(props.initial);
        }
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-3xl font-semibold tracking-[-0.03em] text-black sm:text-[42px]">
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
              <Label className="text-[22px] text-[#7a7c8e]">Название документа</Label>
              <Input
                value={activeState.title}
                onChange={(e) => setState({ ...activeState, title: e.target.value })}
                className="h-14 rounded-3xl border-[#d8dae6] px-5 text-[16px] tracking-[-0.02em] sm:h-20 sm:px-7 sm:text-[28px]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[22px] text-[#7a7c8e]">Дата проведения</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.documentDate}
                  onChange={(e) =>
                    setState({ ...activeState, documentDate: toIsoDate(e.target.value) })
                  }
                  className="h-14 rounded-3xl border-[#d8dae6] px-5 pr-12 text-[16px] tracking-[-0.02em] sm:h-20 sm:px-7 sm:pr-14 sm:text-[28px]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080] sm:right-6 sm:size-8" />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-12 rounded-3xl bg-[#5563ff] px-8 text-[18px] text-white hover:bg-[#4554ff] sm:h-14 sm:px-10 sm:text-[24px]"
              >
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SanitaryDayChecklistDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  documents,
}: Props) {
  const router = useRouter();
  const [settingsTarget, setSettingsTarget] = useState<DocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<DocumentItem | null>(null);
  const checklistTitle = getSanitaryDayChecklistTitle(templateCode);

  async function createDocument(payload: SettingsState) {
    const config = {
      documentDate: payload.documentDate,
    };

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || checklistTitle,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        config,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось создать документ");
      return;
    }

    const data = (await response.json()) as { document: { id: string } };
    router.push(`/journals/${routeCode}/documents/${data.document.id}`);
    router.refresh();
  }

  async function saveSettings(documentId: string, payload: SettingsState) {
    const current = documents.find((item) => item.id === documentId);
    if (!current) return;
    const config = {
      ...(current.config ?? {}),
      documentDate: payload.documentDate,
    };

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || checklistTitle,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        config,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
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

  async function moveToClosed(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!response.ok) {
      toast.error("Не удалось закрыть документ");
      return;
    }
    setArchiveTarget(null);
    router.refresh();
  }

  async function moveToActive(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (!response.ok) {
      toast.error("Не удалось отправить в активные");
      return;
    }
    router.refresh();
  }

  async function cloneDocument(documentId: string) {
    const current = documents.find((item) => item.id === documentId);
    if (!current) return;
    const cfg = current.config ?? {};
    const documentDate =
      typeof cfg.documentDate === "string" && cfg.documentDate
        ? cfg.documentDate
        : toIsoDate(current.dateFrom);

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: current.title,
        dateFrom: documentDate,
        dateTo: documentDate,
        config: { ...cfg, documentDate },
      }),
    });
    if (!response.ok) {
      toast.error("Не удалось сделать копию");
      return;
    }
    router.refresh();
  }

  const defaultCreateState = useMemo<SettingsState>(
    () => ({
      title: checklistTitle,
      documentDate: getDefaultDate(),
    }),
    [checklistTitle],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {checklistTitle}
          {activeTab === "closed" && " (Закрытые)"}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl border-[#e8ebf7] px-6 text-[16px] text-[#5b66ff] shadow-none"
            asChild
          >
            <Link href="/sanpin">
              <BookOpenText className="size-5" />
              Инструкция
            </Link>
          </Button>
          {activeTab === "active" && (
            <Button
              className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-5" />
              Создать документ
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-12 text-[18px]">
          <Link
            href={`/journals/${routeCode}`}
            className={`relative pb-6 ${
              activeTab === "active"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-6 ${
              activeTab === "closed"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 && (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-4 py-5 text-lg text-[#8a8ea4] sm:px-8 sm:py-8 sm:text-[28px]">
            Документов пока нет
          </div>
        )}

        {documents.map((document) => {
          const cfg = document.config ?? {};
          const documentDate =
            typeof cfg.documentDate === "string" && cfg.documentDate
              ? cfg.documentDate
              : toIsoDate(document.dateFrom);
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-[1fr_280px_64px] items-center rounded-[18px] border border-[#eaedf7] bg-white px-8 py-5"
            >
              <Link href={href} className="text-[18px] font-semibold tracking-[-0.02em] text-black">
                {document.title || checklistTitle}
              </Link>

              <Link href={href} className="border-l border-[#e8ebf5] px-8">
                <div className="text-[14px] text-[#7c8094]">Дата проведения</div>
                <div className="mt-2 text-[18px] font-semibold text-black">
                  {formatDateLabel(documentDate)}
                </div>
              </Link>

              <div className="flex justify-center">
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
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                        onSelect={() => setSettingsTarget(document)}
                      >
                        <Pencil className="mr-3 size-6 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                      onSelect={() => cloneDocument(document.id)}
                    >
                      <Copy className="mr-3 size-6 text-[#6f7282]" />
                      Сделать копию
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                      onSelect={() =>
                        window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")
                      }
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "closed" && (
                      <DropdownMenuItem
                        className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                        onSelect={() => moveToActive(document.id)}
                      >
                        <BookOpenText className="mr-3 size-6 text-[#6f7282]" />
                        Отправить в активные
                      </DropdownMenuItem>
                    )}
                    {document.status === "active" && (
                      <>
                        <DropdownMenuItem
                          className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                          onSelect={() => setArchiveTarget(document)}
                        >
                          <BookOpenText className="mr-3 size-6 text-[#6f7282]" />
                          Отправить в закрытые
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => handleDelete(document.id, document.title)}
                        >
                          <Trash2 className="mr-3 size-6 text-[#ff3b30]" />
                          Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveTarget} onOpenChange={(v) => { if (!v) setArchiveTarget(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-10 py-8">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">
                Перенести в архив
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
          {archiveTarget && (
            <div className="px-10 py-8 space-y-6">
              <p className="text-lg text-[#3a3d52] sm:text-[22px]">
                Перенести в архив документ &quot;{archiveTarget.title || checklistTitle}&quot;?
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  className="h-14 rounded-3xl px-8 text-[20px]"
                  onClick={() => setArchiveTarget(null)}
                >
                  Отмена
                </Button>
                <Button
                  className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4554ff]"
                  onClick={() => moveToClosed(archiveTarget.id)}
                >
                  В архив
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SettingsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={defaultCreateState}
        onSubmit={createDocument}
        submitText="Создать"
        title="Создание документа"
      />

      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        initial={settingsTarget ? toUiState(settingsTarget, checklistTitle) : null}
        onSubmit={async (value) => {
          if (!settingsTarget) return;
          await saveSettings(settingsTarget.id, value);
        }}
        submitText="Сохранить"
        title="Настройки документа"
      />
    </div>
  );
}
