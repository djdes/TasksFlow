"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  periodLabel: string;
  startedAtLabel: string;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

export function FinishedProductDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();

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
      <div className="rounded-[28px] bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-black">
              Журнал бракеража готовой пищевой продукции
            </h1>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="h-12 rounded-2xl border-[#e6e9f5] px-5 text-[16px] text-black shadow-none"
                asChild
              >
                <Link href="/sanpin">
                  <BookOpenText className="size-5" />
                  Инструкция
                </Link>
              </Button>

              {activeTab === "active" && (
                <CreateDocumentDialog
                  templateCode={templateCode}
                  templateName={templateName}
                  users={users}
                  triggerClassName="h-12 rounded-2xl bg-[#5b66ff] px-5 text-[16px] text-white hover:bg-[#4d58f5]"
                  triggerLabel="Создать документ"
                  triggerIcon={<Plus className="size-5" />}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-10 text-[18px]">
          <Link
            href={`/journals/${templateCode}`}
            className={`relative pb-4 ${
              activeTab === "active"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7d8196]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${templateCode}?tab=closed`}
            className={`relative pb-4 ${
              activeTab === "closed"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7d8196]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 && (
          <div className="rounded-[26px] border border-[#eceef5] bg-white px-6 py-8 text-center text-[17px] text-[#7d8196]">
            Документов пока нет
          </div>
        )}

        {documents.map((document) => (
          <div
            key={document.id}
            className="rounded-[26px] border border-[#eceef5] bg-white px-6 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-start justify-between gap-4">
              <Link href={`/journals/${templateCode}/documents/${document.id}`} className="min-w-0 flex-1">
                <div className="text-[24px] font-semibold tracking-[-0.02em] text-black">
                  {document.title}
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f4f6ff]"
                  >
                    <Ellipsis className="size-8" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[280px] rounded-[24px] border-0 p-4 shadow-xl">
                  <DropdownMenuItem
                    className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                    onSelect={() => router.push(`/journals/${templateCode}/documents/${document.id}`)}
                  >
                    <Pencil className="mr-3 size-5 text-[#6f7282]" />
                    Настройки
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                    onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                  >
                    <Printer className="mr-3 size-5 text-[#6f7282]" />
                    Печать
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                    onSelect={() => handleDelete(document.id, document.title)}
                  >
                    <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Link
              href={`/journals/${templateCode}/documents/${document.id}`}
              className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[#fbfbfe] px-5 py-4"
            >
              <div>
                <div className="text-[14px] text-[#85889b]">Дата начала</div>
                <div className="mt-1 text-[18px] font-medium text-black">{document.startedAtLabel}</div>
              </div>
              <div className="text-[14px] text-[#5b66ff]">Открыть</div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
