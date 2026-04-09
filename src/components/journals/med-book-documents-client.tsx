"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenText, Ellipsis, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MedBookListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: MedBookListDocument[];
};

function SettingsDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: MedBookListDocument | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  function handleOpen(isOpen: boolean) {
    if (isOpen && document) setTitle(document.title);
    onOpenChange(isOpen);
  }

  async function handleSave() {
    if (!document) return;
    setSaving(true);
    try {
      await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-[20px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="settings-title">Название документа</Label>
            <Input
              id="settings-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 rounded-xl border-[#dfe1ec] px-4"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="h-10 rounded-xl bg-[#5b66ff] px-5 text-white hover:bg-[#4b57ff]"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MedBookDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [settingsDoc, setSettingsDoc] = useState<MedBookListDocument | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">Медицинские книжки</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="gap-2 text-[#5b66ff]"
            onClick={() => {
              const el = document.getElementById("med-book-reference");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <BookOpenText className="size-4" />
            Инструкция
          </Button>
          <CreateDocumentDialog
            templateCode={templateCode}
            templateName={templateName}
            users={users}
            triggerLabel="Создать документ"
            triggerIcon={<Plus className="size-4" />}
            triggerClassName="bg-[#5b66ff] text-white hover:bg-[#4b57ff]"
          />
        </div>
      </div>

      <div className="flex gap-6 border-b">
        <button
          className={`pb-3 text-sm font-medium ${activeTab === "active" ? "border-b-2 border-[#5b66ff] text-[#5b66ff]" : "text-muted-foreground"}`}
          onClick={() => router.push(`/journals/${templateCode}`)}
        >
          Активные
        </button>
        <button
          className={`pb-3 text-sm font-medium ${activeTab === "closed" ? "border-b-2 border-[#5b66ff] text-[#5b66ff]" : "text-muted-foreground"}`}
          onClick={() => router.push(`/journals/${templateCode}?tab=closed`)}
        >
          Закрытые
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-muted-foreground">
          Документов пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-lg border bg-card px-5 py-4"
            >
              <Link
                href={`/journals/${templateCode}/documents/${doc.id}`}
                className="flex-1 text-[16px] font-medium hover:underline"
              >
                {doc.title}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <Ellipsis className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSettingsDoc(doc)}>
                    Настройки
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <SettingsDialog
        open={!!settingsDoc}
        onOpenChange={(v) => { if (!v) setSettingsDoc(null); }}
        document={settingsDoc}
      />
    </div>
  );
}
