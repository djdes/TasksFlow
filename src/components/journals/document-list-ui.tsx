"use client";

import Link from "next/link";
import { BookOpenText, Ellipsis, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function JournalTopBar(props: {
  heading: string;
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  compact?: boolean;
}) {
  const compact = props.compact ?? true;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h1 className="max-w-[70%] text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">
        {props.heading}
      </h1>
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="outline"
          className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
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
            triggerClassName="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] font-medium text-white hover:bg-[#4a5bf0]"
            triggerLabel="Создать документ"
            triggerIcon={<Plus className="size-4" />}
          />
        )}
      </div>
    </div>
  );
}

export function JournalTabs(props: {
  activeTab: "active" | "closed";
  templateCode: string;
  compact?: boolean;
}) {
  const compact = props.compact ?? true;
  return (
    <div className={compact ? "border-b border-[#d9dce8]" : "border-b border-[#ececf4]"}>
      <div className="flex gap-12 text-[16px]">
        <Link
          href={`/journals/${props.templateCode}`}
          className={`relative pb-5 ${
            props.activeTab === "active"
              ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
              : "text-[#6f7282]"
          }`}
        >
          Активные
        </Link>
        <Link
          href={`/journals/${props.templateCode}?tab=closed`}
          className={`relative pb-5 ${
            props.activeTab === "closed"
              ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
              : "text-[#6f7282]"
          }`}
        >
          Закрытые
        </Link>
      </div>
    </div>
  );
}

export function EmptyDocumentsState({ label }: { label?: string } = {}) {
  return (
    <div className="rounded-2xl border border-[#ececf4] bg-white px-6 py-10 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
      <div className="text-[15px] font-medium text-[#6f7282]">
        {label ?? "Документов пока нет"}
      </div>
      <div className="mt-1 text-[13px] text-[#9b9fb3]">
        Создайте первый документ кнопкой выше.
      </div>
    </div>
  );
}

export function DocumentActionsMenu(props: {
  onEdit?: () => void;
  onPrint: () => void;
  onDelete?: () => void;
  size?: "sm" | "md";
}) {
  const md = (props.size ?? "md") === "md";
  const hasDelete = Boolean(props.onDelete);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full hover:bg-[#f5f6ff]"
        >
          <Ellipsis className="size-8 text-[#5566f6]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={
          md
            ? "w-[320px] rounded-[28px] border-0 p-6 shadow-xl"
            : "w-[280px] rounded-[24px] border-0 p-4 shadow-xl"
        }
      >
        {props.onEdit && (
          <DropdownMenuItem
            className={
              md
                ? "mb-3 h-11 rounded-2xl px-4 text-[15px]"
                : "mb-2 h-11 rounded-2xl px-4 text-[15px]"
            }
            onSelect={props.onEdit}
          >
            <Pencil className={md ? "mr-4 size-7 text-[#6f7282]" : "mr-3 size-5 text-[#6f7282]"} />
            Настройки
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={
            md
              ? `${hasDelete ? "mb-3 " : ""}h-11 rounded-2xl px-4 text-[15px]`
              : `${hasDelete ? "mb-2 " : ""}h-11 rounded-2xl px-4 text-[15px]`
          }
          onSelect={props.onPrint}
        >
          <Printer className={md ? "mr-4 size-7 text-[#6f7282]" : "mr-3 size-5 text-[#6f7282]"} />
          Печать
        </DropdownMenuItem>
        {props.onDelete && (
          <DropdownMenuItem
            className={
              md
                ? "h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                : "h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
            }
            onSelect={props.onDelete}
          >
            <Trash2 className={md ? "mr-4 size-7 text-[#ff3b30]" : "mr-3 size-5 text-[#ff3b30]"} />
            Удалить
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
