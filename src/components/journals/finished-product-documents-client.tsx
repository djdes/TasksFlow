"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DocumentActionsMenu,
  EmptyDocumentsState,
  JournalTabs,
  JournalTopBar,
} from "@/components/journals/document-list-ui";

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
      <JournalTopBar
        heading="Журнал бракеража готовой пищевой продукции"
        activeTab={activeTab}
        templateCode={templateCode}
        templateName={templateName}
        users={users}
      />

      <JournalTabs activeTab={activeTab} templateCode={templateCode} />

      <div className="space-y-4">
        {documents.length === 0 && <EmptyDocumentsState />}

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

              <DocumentActionsMenu
                size="sm"
                onEdit={() => router.push(`/journals/${templateCode}/documents/${document.id}`)}
                onPrint={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                onDelete={() => handleDelete(document.id, document.title)}
              />
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
