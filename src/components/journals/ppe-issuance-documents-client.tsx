"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  Ellipsis,
  Pencil,
  Plus,
  Printer,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PPE_ISSUANCE_DOCUMENT_TITLE,
  getPpeIssuanceDefaultConfig,
  normalizePpeIssuanceConfig,
  type PpeIssuanceConfig,
} from "@/lib/ppe-issuance-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";

import { toast } from "sonner";
import { EmptyDocumentsState } from "@/components/journals/document-list-ui";
type UserItem = { id: string; name: string; role: string };

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: unknown;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  users: UserItem[];
  documents: DocumentItem[];
};

type SettingsState = {
  title: string;
  dateFrom: string;
  showGloves: boolean;
  showShoes: boolean;
  showClothing: boolean;
  showCaps: boolean;
  defaultIssuerUserId: string;
  defaultIssuerTitle: string;
};

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function roleOptions(users: UserItem[]) {
  return [...new Set(users.map((user) => getHygienePositionLabel(user.role)))];
}

function toSettingsState(document: DocumentItem, users: UserItem[]): SettingsState {
  const config = normalizePpeIssuanceConfig(document.config, users);
  return {
    title: document.title || PPE_ISSUANCE_DOCUMENT_TITLE,
    dateFrom: document.dateFrom,
    showGloves: config.showGloves,
    showShoes: config.showShoes,
    showClothing: config.showClothing,
    showCaps: config.showCaps,
    defaultIssuerUserId: config.defaultIssuerUserId || "",
    defaultIssuerTitle: config.defaultIssuerTitle || "",
  };
}

function defaultCreateState(users: UserItem[]): SettingsState {
  const config = getPpeIssuanceDefaultConfig(users);
  return {
    title: "",
    dateFrom: new Date().toISOString().slice(0, 10),
    showGloves: false,
    showShoes: false,
    showClothing: false,
    showCaps: false,
    defaultIssuerUserId: config.defaultIssuerUserId || "",
    defaultIssuerTitle: config.defaultIssuerTitle || "",
  };
}

function FieldToggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className="flex items-center gap-4 text-left"
    >
      <span
        className={`relative h-8 w-16 rounded-full transition-colors ${
          checked ? "bg-[#5863f8]" : "bg-[#d6d6db]"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
            checked ? "left-9" : "left-1"
          }`}
        />
      </span>
      <span className="text-[18px] text-black">{label}</span>
    </button>
  );
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  submitText: string;
  users: UserItem[];
  initial: SettingsState | null;
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titles = useMemo(() => roleOptions(props.users), [props.users]);
  const active = state || props.initial;

  async function handleSubmit() {
    if (!active) return;
    setSubmitting(true);
    try {
      await props.onSubmit(active);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(value) => {
        if (value) setState(props.initial);
        props.onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
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
        {active && (
          <div className="space-y-6 px-5 py-6 sm:px-10 sm:py-8">
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Название документа</Label>
              <Input
                value={active.title}
                placeholder="Введите название документа"
                onChange={(e) => setState({ ...active, title: e.target.value })}
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Дата начала</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={active.dateFrom}
                  onChange={(e) => setState({ ...active, dateFrom: e.target.value })}
                  className="h-11 rounded-2xl border-[#d8dae6] px-7 pr-14 text-[15px]"
                />
                <CalendarDays className="pointer-events-none absolute right-6 top-1/2 size-7 -translate-y-1/2 text-[#6e7080]" />
              </div>
            </div>
            <fieldset className="space-y-4 rounded-[28px] border border-[#d8dae6] px-6 py-5">
              <legend className="px-2 text-[20px] font-semibold text-black">Добавить поля</legend>
              <FieldToggle checked={active.showGloves} onCheckedChange={(checked) => setState({ ...active, showGloves: checked })} label="Выдача перчаток" />
              <FieldToggle checked={active.showShoes} onCheckedChange={(checked) => setState({ ...active, showShoes: checked })} label="Выдача обуви" />
              <FieldToggle checked={active.showClothing} onCheckedChange={(checked) => setState({ ...active, showClothing: checked })} label="Выдача спец. одежды" />
              <FieldToggle checked={active.showCaps} onCheckedChange={(checked) => setState({ ...active, showCaps: checked })} label="Выдача шапочек" />
            </fieldset>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Сотрудник по умолчанию, выдавший СИЗ</Label>
              <Select
                value={active.defaultIssuerUserId}
                onValueChange={(value) => {
                  const user = props.users.find((item) => item.id === value);
                  setState({
                    ...active,
                    defaultIssuerUserId: value,
                    defaultIssuerTitle:
                      active.defaultIssuerTitle ||
                      (user ? getHygienePositionLabel(user.role) : ""),
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
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
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Должность лица, выдавшего СИЗ</Label>
              <Select
                value={active.defaultIssuerTitle}
                onValueChange={(value) => setState({ ...active, defaultIssuerTitle: value })}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {titles.map((title) => (
                    <SelectItem key={title} value={title}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              >
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  onDelete: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      await props.onDelete();
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[660px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold text-black">
              Удаление документа &quot;{props.title}&quot;
            </DialogTitle>
            <button
              type="button"
              className="rounded-xl p-2"
              onClick={() => props.onOpenChange(false)}
            >
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="flex justify-end px-8 py-6">
          <Button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PpeIssuanceDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  async function createDocument(value: SettingsState) {
    const config: PpeIssuanceConfig = {
      rows: [],
      showGloves: value.showGloves,
      showShoes: value.showShoes,
      showClothing: value.showClothing,
      showCaps: value.showCaps,
      defaultIssuerUserId: value.defaultIssuerUserId || null,
      defaultIssuerTitle: value.defaultIssuerTitle || null,
    };

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: value.title.trim() || PPE_ISSUANCE_DOCUMENT_TITLE,
        dateFrom: value.dateFrom,
        dateTo: value.dateFrom,
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

  async function saveSettings(documentId: string, value: SettingsState) {
    const current = documents.find((item) => item.id === documentId);
    if (!current) return;
    const currentConfig = normalizePpeIssuanceConfig(current.config, users);

    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: value.title.trim() || PPE_ISSUANCE_DOCUMENT_TITLE,
        dateFrom: value.dateFrom,
        dateTo: value.dateFrom,
        config: {
          ...currentConfig,
          showGloves: value.showGloves,
          showShoes: value.showShoes,
          showClothing: value.showClothing,
          showCaps: value.showCaps,
          defaultIssuerUserId: value.defaultIssuerUserId || null,
          defaultIssuerTitle: value.defaultIssuerTitle || null,
        },
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки");
      return;
    }

    router.refresh();
  }

  async function handleDelete(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("Не удалось удалить документ");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
          {PPE_ISSUANCE_DOCUMENT_TITLE}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl border-[#e8ebf7] px-6 text-[16px] text-[#5566f6] shadow-none"
            asChild
          >
            <Link href="/sanpin">
              <BookOpenText className="size-5" /> Инструкция
            </Link>
          </Button>
          {activeTab === "active" && (
            <Button
              className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-5" /> Создать документ
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-6 text-[15px] sm:gap-12 sm:text-[16px]">
          <Link
            href={`/journals/${routeCode}`}
            className={`relative pb-6 ${
              activeTab === "active"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
                : "text-[#8a8ea4]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-6 ${
              activeTab === "closed"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5566f6]"
                : "text-[#8a8ea4]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 && (
          <EmptyDocumentsState />
        )}
        {documents.map((document) => {
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[1fr_230px_64px] sm:items-center sm:gap-0 sm:px-6 sm:py-5"
            >
              <Link
                href={href}
                className="text-[17px] font-semibold tracking-[-0.02em] text-black"
              >
                {document.title || PPE_ISSUANCE_DOCUMENT_TITLE}
              </Link>
              <Link href={href} className="sm:border-l sm:border-[#e6e6f0] sm:px-8">
                <div className="text-[14px] text-[#84849a]">Дата начала</div>
                <div className="mt-2 text-[14px] font-semibold text-black">
                  {formatDateLabel(document.dateFrom)}
                </div>
              </Link>
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center rounded-full text-[#5566f6] hover:bg-[#f5f6ff]"
                    >
                      <Ellipsis className="size-8" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl"
                  >
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() => setSettingsTarget(document)}
                      >
                        <Pencil className="mr-3 size-6 text-[#6f7282]" /> Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className={`h-11 rounded-2xl px-4 text-[15px] ${
                        document.status === "active" ? "mb-2" : ""
                      }`}
                      onSelect={() =>
                        window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")
                      }
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" /> Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <DropdownMenuItem
                        className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                        onSelect={() => setDeleteTarget(document)}
                      >
                        <Trash2 className="mr-3 size-6 text-[#ff3b30]" /> Удалить
                      </DropdownMenuItem>
                    )}
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
        title="Создание документа"
        submitText="Создать"
        users={users}
        initial={defaultCreateState(users)}
        onSubmit={createDocument}
      />

      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(value) => {
          if (!value) setSettingsTarget(null);
        }}
        title="Настройки документа"
        submitText="Сохранить"
        users={users}
        initial={settingsTarget ? toSettingsState(settingsTarget, users) : null}
        onSubmit={async (value) => {
          if (settingsTarget) await saveSettings(settingsTarget.id, value);
        }}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(value) => {
          if (!value) setDeleteTarget(null);
        }}
        title={deleteTarget?.title || PPE_ISSUANCE_DOCUMENT_TITLE}
        onDelete={async () => {
          if (deleteTarget) {
            await handleDelete(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
