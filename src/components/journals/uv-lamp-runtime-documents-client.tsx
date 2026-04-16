"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildUvRuntimeDocumentTitle,
  formatRuDateDash,
  getUvResponsibleTitleOptions,
  normalizeUvRuntimeDocumentConfig,
  type UvRuntimeDocumentConfig,
} from "@/lib/uv-lamp-runtime-document";

import { toast } from "sonner";
type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  responsibleTitle: string | null;
  responsibleUserId?: string | null;
  dateFrom: string;
  config?: Record<string, unknown> | null;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode?: string;
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: DocumentItem[];
};

type EditingState = {
  id: string;
  title: string;
  dateFrom: string;
  responsibleTitle: string;
  responsibleUserId: string;
  config: UvRuntimeDocumentConfig;
};

function UvRuntimeSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: { id: string; name: string; role: string }[];
  editing: EditingState | null;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [lampNumber, setLampNumber] = useState("1");
  const [areaName, setAreaName] = useState("Журнал учета работы");
  const [dateFrom, setDateFrom] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");

  const options = useMemo(() => getUvResponsibleTitleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.editing) return;
    setLampNumber(props.editing.config.lampNumber);
    setAreaName(props.editing.config.areaName);
    setDateFrom(props.editing.dateFrom);
    setResponsibleTitle(props.editing.responsibleTitle);
    setResponsibleUserId(props.editing.responsibleUserId);
  }, [props.editing]);

  async function handleSave() {
    if (!props.editing) return;
    setSubmitting(true);
    const nextConfig = {
      ...props.editing.config,
      lampNumber: lampNumber.trim() || "1",
      areaName: areaName.trim() || "Журнал учета работы",
    };

    try {
      const response = await fetch(`/api/journal-documents/${props.editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: buildUvRuntimeDocumentTitle(nextConfig),
          dateFrom,
          config: nextConfig,
          responsibleUserId: responsibleUserId || null,
          responsibleTitle: responsibleTitle || null,
        }),
      });

      if (!response.ok) {
        throw new Error("save_failed");
      }

      props.onOpenChange(false);
      props.onSaved();
    } catch {
      toast.error("Не удалось сохранить настройки документа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (open && props.editing) {
          setLampNumber(props.editing.config.lampNumber);
          setAreaName(props.editing.config.areaName);
          setDateFrom(props.editing.dateFrom);
          setResponsibleTitle(props.editing.responsibleTitle);
          setResponsibleUserId(props.editing.responsibleUserId);
        }
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Настройки документа
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-4 px-7 py-6">
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Бактерицидная установка №</Label>
            <Input
              value={lampNumber}
              onChange={(event) => setLampNumber(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[24px] leading-none"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Наименование цеха/участка применения</Label>
            <Input
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="- Выберите значение -">- Выберите значение -</SelectItem>
                {options.management.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Руководство</SelectLabel>
                    {options.management.map((title) => (
                      <SelectItem key={`mgmt:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {options.staff.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[14px] font-semibold italic text-black">Сотрудники</SelectLabel>
                    {options.staff.map((title) => (
                      <SelectItem key={`staff:${title}`} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UvLampRuntimeDocumentsClient(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const routeCode = props.routeCode || props.templateCode;

  async function handleDelete(documentId: string, title: string) {
    if (!window.confirm(`Удалить документ "${title}"?`)) return;

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }

    router.refresh();
  }

  async function handleReactivate(documentId: string, title: string) {
    if (!window.confirm(`Отправить документ "${title}" в активные?`)) return;

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });

    if (!response.ok) {
      toast.error("Не удалось вернуть документ в активные");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {props.activeTab === "closed"
            ? "Журнал учета работы УФ бактерицидной установки (Закрытые!!!)"
            : "Журнал учета работы УФ бактерицидной установки"}
        </h1>
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
          {props.activeTab === "active" && (
            <CreateDocumentDialog
              templateCode={props.templateCode}
              templateName={props.templateName}
              users={props.users}
              triggerClassName="h-12 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
              triggerLabel="Создать документ"
              triggerIcon={<Plus className="size-4" />}
            />
          )}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-9 text-[15px]">
          <Link
            href={`/journals/${routeCode}`}
            className={`relative pb-4 ${
              props.activeTab === "active"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7c7c93]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-4 ${
              props.activeTab === "closed"
                ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                : "text-[#7c7c93]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {props.documents.length === 0 && (
          <div className="rounded-[16px] border border-[#eceef5] bg-white px-6 py-8 text-center text-[16px] text-[#7d8196]">
            Документов пока нет
          </div>
        )}

        {props.documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;
          const config = normalizeUvRuntimeDocumentConfig(document.config);
          const resolvedTitle = document.title || buildUvRuntimeDocumentTitle(config);
          const responsibleName = document.responsibleUserId
            ? props.users.find((user) => user.id === document.responsibleUserId)?.name || ""
            : "";
          const responsibleLabel = document.responsibleTitle
            ? `${document.responsibleTitle}${responsibleName ? `: ${responsibleName}` : ""}`
            : ":";

          return (
            <div
              key={document.id}
              className="grid grid-cols-[minmax(0,1.9fr)_320px_220px_56px] items-stretch rounded-[18px] border border-[#e8ebf3] bg-white px-6 py-6 shadow-[0_2px_10px_rgba(46,55,89,0.04)]"
            >
              <Link href={href} className="flex items-center pr-6 text-[28px] font-semibold leading-[1.25] tracking-[-0.03em] text-black">
                {resolvedTitle}
              </Link>

              <Link href={href} className="flex flex-col justify-center border-l border-[#e7eaf2] px-8">
                <div className="text-[16px] text-[#8b8fa3]">Ответственный</div>
                <div className="mt-3 text-[18px] font-semibold leading-[1.3] text-black">
                  {responsibleLabel}
                </div>
              </Link>

              <Link href={href} className="flex flex-col justify-center border-l border-[#e7eaf2] px-8">
                <div className="text-[16px] text-[#8b8fa3]">Дата начала</div>
                <div className="mt-3 text-[18px] font-semibold text-black">
                  {formatRuDateDash(document.dateFrom)}
                </div>
              </Link>

              <div className="flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-11 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                    >
                      <Ellipsis className="size-6" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[260px] rounded-[20px] border border-[#eceef5] p-3 shadow-lg">
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[18px]"
                        onSelect={() =>
                          setEditing({
                            id: document.id,
                            title: resolvedTitle,
                            dateFrom: document.dateFrom,
                            responsibleTitle: document.responsibleTitle || "",
                            responsibleUserId: document.responsibleUserId || props.users[0]?.id || "",
                            config,
                          })
                        }
                      >
                        <Pencil className="mr-2 size-4 text-[#6f7282]" />
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="h-11 rounded-2xl px-4 text-[18px]"
                      onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}
                    >
                      <Printer className="mr-2 size-4 text-[#6f7282]" />
                      Печать
                    </DropdownMenuItem>
                    {document.status === "closed" && (
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[18px]"
                        onSelect={() => handleReactivate(document.id, resolvedTitle)}
                      >
                        <RotateCcw className="mr-2 size-4 text-[#6f7282]" />
                        Отправить в активные
                      </DropdownMenuItem>
                    )}
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => handleDelete(document.id, resolvedTitle)}
                      >
                        <Trash2 className="mr-2 size-4 text-[#ff3b30]" />
                        Удалить
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <UvRuntimeSettingsDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        editing={editing}
        users={props.users}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
