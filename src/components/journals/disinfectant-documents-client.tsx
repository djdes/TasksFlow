"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
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
import { getDistinctRoleLabels, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import {
  DISINFECTANT_HEADING,
  DISINFECTANT_DOCUMENT_TITLE,
  getDisinfectantDefaultConfig,
  normalizeDisinfectantConfig,
  type DisinfectantDocumentConfig,
} from "@/lib/disinfectant-document";

import { toast } from "sonner";
type UserItem = { id: string; name: string; role: string };

type DisinfectantDocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  config: unknown;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  users: UserItem[];
  documents: DisinfectantDocumentItem[];
};

type SettingsState = {
  title: string;
  responsibleRole: string;
  responsibleEmployeeId: string;
  responsibleEmployee: string;
};

function roleOptionsFromUsers(users: UserItem[]) {
  return getDistinctRoleLabels(users);
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return getUsersForRoleLabel(users, roleLabel);
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  initial: SettingsState | null;
  onSubmit: (value: SettingsState) => Promise<void>;
  submitText: string;
  dialogTitle: string;
}) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);
  const activeState = state || props.initial;

  async function handleSubmit() {
    if (!activeState) return;
    setSubmitting(true);
    try {
      await props.onSubmit(activeState);
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setState(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.dialogTitle}
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
        {activeState && (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">
                Название документа
              </Label>
              <Input
                value={activeState.title}
                onChange={(e) =>
                  setState({ ...activeState, title: e.target.value })
                }
                placeholder="Введите название документа"
                className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">
                Должность ответственного
              </Label>
              <Select
                value={activeState.responsibleRole}
                onValueChange={(v) => {
                  const user = usersForRole(props.users, v)[0];
                  setState({
                    ...activeState,
                    responsibleRole: v,
                    responsibleEmployeeId: user?.id || "",
                    responsibleEmployee:
                      user?.name || activeState.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#7a7c8e]">Сотрудник</Label>
              <Select
                value={activeState.responsibleEmployeeId}
                onValueChange={(v) => {
                  const user = props.users.find((item) => item.id === v);
                  setState({
                    ...activeState,
                    responsibleEmployeeId: v,
                    responsibleEmployee: user?.name || activeState.responsibleEmployee,
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                  <SelectValue placeholder="- Выберите значение -" />
                </SelectTrigger>
                <SelectContent>
                  {usersForRole(props.users, activeState.responsibleRole).map(
                    (u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {buildStaffOptionLabel(u)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-3">
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

export function DisinfectantDocumentsClient({
  routeCode,
  templateCode,
  activeTab,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [settingsTarget, setSettingsTarget] =
    useState<DisinfectantDocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] =
    useState<DisinfectantDocumentItem | null>(null);

  const defaultConfig = getDisinfectantDefaultConfig();

  async function createDocument(payload: SettingsState) {
    const config: DisinfectantDocumentConfig = {
      ...defaultConfig,
      responsibleRole: payload.responsibleRole,
      responsibleEmployeeId: payload.responsibleEmployeeId || null,
      responsibleEmployee: payload.responsibleEmployee,
      subdivisions: [],
      receipts: [],
      consumptions: [],
    };
    const now = new Date();
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || DISINFECTANT_DOCUMENT_TITLE,
        dateFrom: now.toISOString().slice(0, 10),
        dateTo: now.toISOString().slice(0, 10),
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

  async function saveSettings(documentId: string, payload: SettingsState) {
    const current = documents.find((d) => d.id === documentId);
    if (!current) return;
    const currentConfig = normalizeDisinfectantConfig(current.config);
    const config: DisinfectantDocumentConfig = {
      ...currentConfig,
      responsibleRole: payload.responsibleRole,
      responsibleEmployeeId: payload.responsibleEmployeeId || null,
      responsibleEmployee: payload.responsibleEmployee,
    };
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || DISINFECTANT_DOCUMENT_TITLE,
        config,
      }),
    });
    if (!response.ok) {
      toast.error("Не удалось сохранить");
      return;
    }
    router.refresh();
  }

  async function handleDelete(documentId: string, docTitle: string) {
    if (!window.confirm(`Удалить документ "${docTitle}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.error("Не удалось удалить");
      return;
    }
    router.refresh();
  }

  async function moveToStatus(
    documentId: string,
    newStatus: "active" | "closed"
  ) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) {
      toast.error("Ошибка");
      return;
    }
    router.refresh();
  }

  const defaultCreateState = useMemo<SettingsState>(
    () => ({
      title: "",
      responsibleRole: defaultConfig.responsibleRole,
      responsibleEmployeeId: defaultConfig.responsibleEmployeeId || "",
      responsibleEmployee: defaultConfig.responsibleEmployee,
    }),
    []
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {DISINFECTANT_HEADING}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-2xl border-[#e8ebf7] px-6 text-[16px] text-[#5b66ff] shadow-none"
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
        <div className="flex gap-12 text-[16px]">
          <Link
            href={`/journals/${routeCode}`}
            className={`relative pb-6 ${
              activeTab === "active"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Активные
          </Link>
          <Link
            href={`/journals/${routeCode}?tab=closed`}
            className={`relative pb-6 ${
              activeTab === "closed"
                ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                : "text-[#8a8ea4]"
            }`}
          >
            Закрытые
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 && (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-6 py-6 text-[15px] text-[#8a8ea4]">
            Документов пока нет
          </div>
        )}
        {documents.map((document) => {
          const cfg = normalizeDisinfectantConfig(document.config);
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div
              key={document.id}
              className="flex items-center justify-between rounded-[18px] border border-[#eaedf7] bg-white px-8 py-5"
            >
              <Link
                href={href}
                className="text-[17px] font-semibold tracking-[-0.02em] text-black"
              >
                {document.title || DISINFECTANT_DOCUMENT_TITLE}
              </Link>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-[14px] text-[#7c8094]">
                    Ответственный за получение
                  </div>
                  <div className="mt-1 text-[16px] font-semibold text-black">
                    {cfg.responsibleRole}
                    {cfg.responsibleEmployee
                      ? `: ${cfg.responsibleEmployee}`
                      : ""}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
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
                        <Pencil className="mr-3 size-6 text-[#6f7282]" />{" "}
                        Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                      onSelect={() =>
                        window.open(
                          `/api/journal-documents/${document.id}/pdf`,
                          "_blank"
                        )
                      }
                    >
                      <Printer className="mr-3 size-6 text-[#6f7282]" /> Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <>
                        <DropdownMenuItem
                          className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                          onSelect={() => setArchiveTarget(document)}
                        >
                          <BookOpenText className="mr-3 size-6 text-[#6f7282]" />{" "}
                          Отправить в закрытые
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="h-11 rounded-2xl px-4 text-[15px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() =>
                            handleDelete(document.id, document.title)
                          }
                        >
                          <Trash2 className="mr-3 size-6 text-[#ff3b30]" />{" "}
                          Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                    {document.status === "closed" && (
                      <DropdownMenuItem
                        className="mb-2 h-11 rounded-2xl px-4 text-[15px]"
                        onSelect={() => moveToStatus(document.id, "active")}
                      >
                        <BookOpenText className="mr-3 size-6 text-[#6f7282]" />{" "}
                        Отправить в активные
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
        users={users}
        initial={defaultCreateState}
        onSubmit={createDocument}
        submitText="Создать"
        dialogTitle="Создание документа"
      />
      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(v) => {
          if (!v) setSettingsTarget(null);
        }}
        users={users}
        initial={
          settingsTarget
            ? {
                title:
                  settingsTarget.title || DISINFECTANT_DOCUMENT_TITLE,
                responsibleRole: normalizeDisinfectantConfig(
                  settingsTarget.config
                ).responsibleRole,
                responsibleEmployeeId: normalizeDisinfectantConfig(
                  settingsTarget.config
                ).responsibleEmployeeId || "",
                responsibleEmployee: normalizeDisinfectantConfig(
                  settingsTarget.config
                ).responsibleEmployee,
              }
            : null
        }
        onSubmit={async (v) => {
          if (settingsTarget) await saveSettings(settingsTarget.id, v);
        }}
        submitText="Сохранить"
        dialogTitle="Настройки документа"
      />

      <Dialog
        open={!!archiveTarget}
        onOpenChange={(v) => {
          if (!v) setArchiveTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[660px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[22px] font-semibold text-black">
                Перенести в архив документ &quot;{archiveTarget?.title}&quot;
              </DialogTitle>
              <button
                type="button"
                className="rounded-xl p-2"
                onClick={() => setArchiveTarget(null)}
              >
                <X className="size-7" />
              </button>
            </div>
          </DialogHeader>
          <div className="flex justify-end px-8 py-6">
            <Button
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              onClick={async () => {
                if (!archiveTarget) return;
                await moveToStatus(archiveTarget.id, "closed");
                setArchiveTarget(null);
              }}
            >
              В архив
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
