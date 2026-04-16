"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Ellipsis,
  Plus,
  Printer,
  Settings2,
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
import {
  CLEANING_VENTILATION_CHECKLIST_TITLE,
  getDefaultCleaningVentilationConfig,
} from "@/lib/cleaning-ventilation-checklist-document";

import { toast } from "sonner";
type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config?: Record<string, unknown> | null;
};

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  templateCode: string;
  users: UserItem[];
  documents: DocumentItem[];
};

type SettingsState = {
  title: string;
  dateFrom: string;
};

function getDefaultDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(isoDate: string) {
  if (!isoDate) return "—";
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("ru-RU");
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

  return (
    <Dialog
      open={props.open}
      onOpenChange={(value) => {
        if (value) setState(props.initial);
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-3xl font-semibold tracking-[-0.03em] text-black sm:text-[40px]">
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
        {activeState ? (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[22px] text-[#7a7c8e]">Название документа</Label>
              <Input
                value={activeState.title}
                onChange={(event) => setState({ ...activeState, title: event.target.value })}
                className="h-11 rounded-2xl border-[#d8dae6] px-5 text-[16px] sm:h-20 sm:px-7 sm:text-[28px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[22px] text-[#7a7c8e]">Дата начала</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={activeState.dateFrom}
                  onChange={(event) => setState({ ...activeState, dateFrom: event.target.value })}
                  className="h-11 rounded-2xl border-[#d8dae6] px-5 pr-12 text-[16px] sm:h-20 sm:px-7 sm:pr-14 sm:text-[28px]"
                />
                <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-6 -translate-y-1/2 text-[#6e7080] sm:right-6 sm:size-8" />
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <Button
                type="button"
                onClick={async () => {
                  if (!activeState) return;
                  setSubmitting(true);
                  try {
                    await props.onSubmit(activeState);
                    props.onOpenChange(false);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="h-12 rounded-3xl bg-[#5563ff] px-8 text-[18px] text-white hover:bg-[#4554ff] sm:h-14 sm:px-10 sm:text-[24px]"
              >
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CleaningVentilationChecklistDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<DocumentItem | null>(null);

  const createInitial = useMemo<SettingsState>(
    () => ({
      title: CLEANING_VENTILATION_CHECKLIST_TITLE,
      dateFrom: getDefaultDate(),
    }),
    []
  );

  async function createDocument(payload: SettingsState) {
    const config = getDefaultCleaningVentilationConfig(users);
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || CLEANING_VENTILATION_CHECKLIST_TITLE,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
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

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || CLEANING_VENTILATION_CHECKLIST_TITLE,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateFrom,
        config: current.config ?? getDefaultCleaningVentilationConfig(users),
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
  }

  async function deleteDocument(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  async function moveDocument(documentId: string, status: "active" | "closed") {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      toast.error("Не удалось изменить статус документа");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {CLEANING_VENTILATION_CHECKLIST_TITLE}
          {activeTab === "closed" ? " (Закрытые)" : ""}
        </h1>
        {activeTab === "active" ? (
          <Button
            className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 size-5" />
            Создать документ
          </Button>
        ) : null}
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
        {documents.length === 0 ? (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-4 py-5 text-lg text-[#8a8ea4] sm:px-8 sm:py-8 sm:text-[28px]">
            Документов пока нет
          </div>
        ) : null}

        {documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-[1fr_240px_220px_72px] items-center rounded-[22px] border border-[#eaedf7] bg-white px-8 py-5"
            >
              <Link href={href} className="min-w-0 pr-6">
                <div className="truncate text-[22px] font-semibold tracking-[-0.02em] text-black">
                  {document.title || CLEANING_VENTILATION_CHECKLIST_TITLE}
                </div>
              </Link>

              <Link href={href} className="border-l border-[#e8ebf5] px-6">
                <div className="text-[14px] text-[#7c8094]">Дата начала</div>
                <div className="mt-2 text-[18px] font-semibold text-black">
                  {formatDateLabel(document.dateFrom)}
                </div>
              </Link>

              <Link href={href} className="border-l border-[#e8ebf5] px-6">
                <div className="text-[14px] text-[#7c8094]">Статус</div>
                <div className="mt-2 text-[18px] font-semibold text-black">
                  {document.status === "active" ? "Активный" : "Закрытый"}
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
                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                      onSelect={() => setSettingsTarget(document)}
                    >
                      <Settings2 className="mr-3 size-5 text-[#5b66ff]" />
                      Настройки
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                      onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                    >
                      <Printer className="mr-3 size-5 text-[#5b66ff]" />
                      Печать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[18px]"
                      onSelect={() =>
                        moveDocument(document.id, document.status === "active" ? "closed" : "active")
                      }
                    >
                      <CalendarDays className="mr-3 size-5 text-[#5b66ff]" />
                      {document.status === "active" ? "Закрыть" : "Вернуть в активные"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="h-11 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                      onSelect={() =>
                        deleteDocument(
                          document.id,
                          document.title || CLEANING_VENTILATION_CHECKLIST_TITLE
                        )
                      }
                    >
                      <Trash2 className="mr-3 size-5" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <SettingsDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={createInitial}
        onSubmit={createDocument}
        submitText="Создать"
        title="Создание документа"
      />

      <SettingsDialog
        open={Boolean(settingsTarget)}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        initial={
          settingsTarget
            ? {
                title: settingsTarget.title || CLEANING_VENTILATION_CHECKLIST_TITLE,
                dateFrom: settingsTarget.dateFrom || getDefaultDate(),
              }
            : null
        }
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
