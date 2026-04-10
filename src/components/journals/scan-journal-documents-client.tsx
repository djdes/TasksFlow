"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type JournalDocumentRow = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFromLabel: string;
  dateToLabel: string;
  pageCount: number;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  documents: JournalDocumentRow[];
  pageCount: number;
};

export function ScanJournalDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  documents,
  pageCount,
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
          responsibleTitle: "Ответственный",
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
      window.alert("Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">{templateName}</h1>
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
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="h-12 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
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
            className={`relative pb-4 ${activeTab === "active" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]" : "text-[#7c7c93]"}`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${templateCode}?tab=closed`}
            className={`relative pb-4 ${activeTab === "closed" ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]" : "text-[#7c7c93]"}`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {documents.length === 0 ? (
          <div className="rounded-[16px] border border-[#eceef5] bg-white px-6 py-8 text-center text-[16px] text-[#7d8196]">
            Документов пока нет
          </div>
        ) : (
          documents.map((document) => {
            const href = `/journals/${templateCode}/documents/${document.id}`;
            return (
              <div
                key={document.id}
                className="grid grid-cols-[1.6fr_190px_190px_140px_40px] items-start gap-0 rounded-[16px] border border-[#eef0f6] bg-white px-3 py-4"
              >
                <Link href={href} className="px-2 text-[14px] font-semibold leading-5 text-black">
                  {document.title}
                </Link>
                <Link href={href} className="border-l border-[#edf0f7] px-6">
                  <div className="text-[11px] text-[#979aab]">Период</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">
                    {document.dateFromLabel}
                    {document.dateFromLabel !== document.dateToLabel ? ` — ${document.dateToLabel}` : ""}
                  </div>
                </Link>
                <Link href={href} className="border-l border-[#edf0f7] px-6">
                  <div className="text-[11px] text-[#979aab]">Страниц</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">
                    {pageCount || document.pageCount}
                  </div>
                </Link>
                <div className="border-l border-[#edf0f7] px-6 text-[12px] text-[#979aab]">
                  Статус: {document.status}
                </div>
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
