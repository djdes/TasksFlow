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
  metaLabel: string;
  metaValue: string;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  heading: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

export function TrackedDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  heading,
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
        heading={heading}
        activeTab={activeTab}
        templateCode={templateCode}
        templateName={templateName}
        users={users}
      />

      <JournalTabs activeTab={activeTab} templateCode={templateCode} />

      <div className="space-y-4">
        {documents.length === 0 && <EmptyDocumentsState />}

        {documents.map((document) => {
          const href = `/journals/${templateCode}/documents/${document.id}`;

          return (
            <div
              key={document.id}
              className="grid grid-cols-[1.8fr_300px_240px_48px] items-center rounded-[26px] border border-[#eceef5] bg-white px-6 py-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
            >
              <Link href={href} className="text-[20px] font-semibold tracking-[-0.02em] text-black">
                {document.title}
              </Link>
              <Link href={href} className="border-l border-[#e6e6f0] px-10">
                <div className="text-[14px] text-[#84849a]">Ответственный</div>
                <div className="mt-2 text-[18px] font-semibold text-black">{document.responsibleTitle || ""}</div>
              </Link>
              <Link href={href} className="border-l border-[#e6e6f0] px-10">
                <div className="text-[14px] text-[#84849a]">{document.metaLabel}</div>
                <div className="mt-2 text-[18px] font-semibold text-black">{document.metaValue}</div>
              </Link>
              <div className="flex items-center justify-center text-[#5b66ff]">
                <DocumentActionsMenu
                  onEdit={() => router.push(href)}
                  onPrint={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                  onDelete={() => handleDelete(document.id, document.title)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
