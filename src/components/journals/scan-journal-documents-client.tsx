"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
import {
  JOURNAL_CARD_LABEL_CLASS,
  JOURNAL_CARD_TITLE_CLASS,
  JOURNAL_CARD_VALUE_CLASS,
} from "@/components/journals/journal-responsive";
type JournalDocumentRow = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateLabel: string;
  dateValue: string;
  responsibleLabel?: string | null;
  responsibleValue?: string | null;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  documents: JournalDocumentRow[];
  defaultResponsibleTitle?: string | null;
  defaultResponsibleUserId?: string | null;
};

export function ScanJournalDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  documents,
  defaultResponsibleTitle,
  defaultResponsibleUserId,
}: Props) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const response = await fetch("/api/journal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode,
          title: templateName,
          dateFrom: date,
          dateTo: date,
          responsibleUserId: defaultResponsibleUserId || null,
          responsibleTitle: defaultResponsibleTitle || "Ответственный",
          config: {},
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось создать документ");
      }

      const data = await response.json();
      router.push(`/journals/${templateCode}/documents/${data.document.id}`);
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(document: JournalDocumentRow) {
    if (!window.confirm(`Удалить документ "${document.title}"?`)) return;

    const response = await fetch(`/api/journal-documents/${document.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">{templateName}</h1>
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
          {activeTab === "active" && (
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="h-12 rounded-xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0]"
            >
              <Plus className="size-4" />
              {isCreating ? "Создание..." : "Создать документ"}
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-9 text-[15px]">
          <Link
            href={`/journals/${templateCode}`}
            className={`relative pb-4 ${activeTab === "active" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]" : "text-[#6f7282]"}`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${templateCode}?tab=closed`}
            className={`relative pb-4 ${activeTab === "closed" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5566f6]" : "text-[#6f7282]"}`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {documents.length === 0 ? (
          <EmptyDocumentsState />
        ) : (
          documents.map((document) => {
            const href = `/journals/${templateCode}/documents/${document.id}`;
            return (
              <div
                key={document.id}
                className="grid gap-3 rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] md:grid-cols-[1.8fr_320px_290px_48px] md:items-center md:gap-0"
              >
                <Link href={href} className={JOURNAL_CARD_TITLE_CLASS}>
                  {document.title}
                </Link>
                {document.responsibleValue ? (
                  <Link href={href} className="md:border-l md:border-[#e6e6f0] md:px-10">
                    <div className={JOURNAL_CARD_LABEL_CLASS}>
                      {document.responsibleLabel || "Ответственный"}
                    </div>
                    <div className={JOURNAL_CARD_VALUE_CLASS}>
                      {document.responsibleValue}
                    </div>
                  </Link>
                ) : (
                  <div className="hidden md:block md:border-l md:border-[#e6e6f0]" />
                )}
                <Link href={href} className="md:border-l md:border-[#e6e6f0] md:px-10">
                  <div className={JOURNAL_CARD_LABEL_CLASS}>{document.dateLabel}</div>
                  <div className={JOURNAL_CARD_VALUE_CLASS}>{document.dateValue}</div>
                </Link>
                <div className="flex justify-center">
                  {document.status === "active" && (
                    <button
                      type="button"
                      onClick={() => handleDelete(document)}
                      className="flex size-8 items-center justify-center rounded-full text-[#ff3b30] hover:bg-[#fff0ef]"
                    >
                      <Trash2 className="size-6" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
