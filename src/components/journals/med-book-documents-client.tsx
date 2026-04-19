"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Archive,
  BookOpenText,
  Ellipsis,
  ExternalLink,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
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

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
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
  onOpenChange: (value: boolean) => void;
  document: MedBookListDocument | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  function handleOpen(nextOpen: boolean) {
    if (nextOpen && document) setTitle(document.title);
    onOpenChange(nextOpen);
  }

  async function handleSave() {
    if (!document || !title.trim()) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Не удалось сохранить название документа");
      }

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить название документа");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-[#e5e7f0] px-8 py-6">
          <DialogTitle className="text-[20px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <div className="space-y-3">
            <Label htmlFor="settings-title" className="text-[15px] text-[#666b80]">
              Название документа
            </Label>
            <Input
              id="settings-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="h-12 rounded-2xl bg-[#5863f8] px-6 text-[16px] text-white hover:bg-[#4b57f3]"
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
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);

  const firstDocumentLink = useMemo(() => {
    if (documents.length === 0) return `/journals/${templateCode}`;
    return `/journals/${templateCode}/documents/${documents[0].id}#med-book-reference`;
  }, [documents, templateCode]);

  async function patchDocument(documentId: string, payload: Record<string, unknown>) {
    setBusyDocumentId(documentId);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Не удалось обновить документ");
      }

      router.refresh();
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function deleteDocument(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;

    setBusyDocumentId(documentId);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Не удалось удалить документ");
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить документ");
    } finally {
      setBusyDocumentId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
            Медицинские книжки
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            asChild
            type="button"
            variant="ghost"
            className="h-11 rounded-2xl border border-[#edf0ff] bg-[#fafbff] px-7 text-[18px] font-medium text-[#5863f8] hover:bg-[#f3f5ff] hover:text-[#5863f8]"
          >
            <Link href={firstDocumentLink}>
              <BookOpenText className="size-5" />
              Инструкция
            </Link>
          </Button>
          <CreateDocumentDialog
            templateCode={templateCode}
            templateName={templateName}
            users={users}
            triggerLabel="Создать документ"
            triggerIcon={<Plus className="size-5" />}
            triggerClassName="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
          />
        </div>
      </div>

      <div className="flex gap-5 border-b border-[#d8dbea] sm:gap-8">
        <button
          type="button"
          className={`relative pb-4 text-[18px] ${
            activeTab === "active"
              ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5863f8]"
              : "text-[#6f7282]"
          }`}
          onClick={() => router.push(`/journals/${templateCode}`)}
        >
          Активные
        </button>
        <button
          type="button"
          className={`relative pb-4 text-[18px] ${
            activeTab === "closed"
              ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5863f8]"
              : "text-[#6f7282]"
          }`}
          onClick={() => router.push(`/journals/${templateCode}?tab=closed`)}
        >
          Закрытые
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyDocumentsState />
      ) : (
        <div className="space-y-3">
          {documents.map((document) => {
            const isBusy = busyDocumentId === document.id;

            return (
              <div
                key={document.id}
                className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e6e9f5] bg-white px-7 py-6"
              >
                <Link
                  href={`/journals/${templateCode}/documents/${document.id}`}
                  className="min-w-0 flex-1 truncate text-[22px] font-medium text-black transition hover:text-[#5863f8]"
                >
                  {document.title}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isBusy}
                      className="size-11 rounded-xl text-[#5863f8] hover:bg-[#f3f5ff] hover:text-[#5863f8]"
                    >
                      <Ellipsis className="size-6" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[240px] rounded-2xl p-2">
                    <DropdownMenuItem
                      className="mb-1 h-12 rounded-xl px-3 text-[16px]"
                      onSelect={() => router.push(`/journals/${templateCode}/documents/${document.id}`)}
                    >
                      <ExternalLink className="mr-3 size-5 text-[#6f7282]" />
                      Открыть
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="mb-1 h-12 rounded-xl px-3 text-[16px]"
                      onSelect={() => setSettingsDoc(document)}
                    >
                      <Settings2 className="mr-3 size-5 text-[#6f7282]" />
                      Настройки
                    </DropdownMenuItem>
                    {document.status === "active" ? (
                      <DropdownMenuItem
                        className="mb-1 h-12 rounded-xl px-3 text-[16px]"
                        onSelect={() => {
                          patchDocument(document.id, { status: "closed" }).catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Не удалось закрыть документ");
                          });
                        }}
                      >
                        <Archive className="mr-3 size-5 text-[#6f7282]" />
                        Закрыть
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="mb-1 h-12 rounded-xl px-3 text-[16px]"
                        onSelect={() => {
                          patchDocument(document.id, { status: "active" }).catch((error) => {
                            toast.error(error instanceof Error ? error.message : "Не удалось восстановить документ");
                          });
                        }}
                      >
                        <RotateCcw className="mr-3 size-5 text-[#6f7282]" />
                        Вернуть в активные
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="h-12 rounded-xl px-3 text-[16px] text-[#ff4d4f] focus:text-[#ff4d4f]"
                      onSelect={() => {
                        deleteDocument(document.id, document.title).catch(() => undefined);
                      }}
                    >
                      <Trash2 className="mr-3 size-5 text-[#ff4d4f]" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <SettingsDialog
        open={Boolean(settingsDoc)}
        onOpenChange={(value) => {
          if (!value) setSettingsDoc(null);
        }}
        document={settingsDoc}
      />
    </div>
  );
}
