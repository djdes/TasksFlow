"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Ellipsis,
  Printer,
  Settings2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  METAL_IMPURITY_DOCUMENT_TITLE,
  METAL_IMPURITY_PAGE_TITLE,
  METAL_IMPURITY_RESPONSIBLE_POSITIONS,
  METAL_IMPURITY_TEMPLATE_CODE,
  type MetalImpurityUser,
  getDefaultMetalImpurityConfig,
  normalizeMetalImpurityConfig,
} from "@/lib/metal-impurity-document";
import { getUsersForRoleLabel, pickPrimaryManager } from "@/lib/user-roles";

type DocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  routeCode: string;
  documents: DocumentItem[];
  users: MetalImpurityUser[];
  availableMaterials: string[];
  availableSuppliers: string[];
};

type SettingsState = {
  title: string;
  startDate: string;
  responsiblePosition: string;
  responsibleEmployee: string;
};

function formatRuDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU").replace(/\./g, "-");
}

function collectEmployeeOptions(
  users: MetalImpurityUser[],
  documents: DocumentItem[],
  roleLabel: string,
  fallbackEmployee: string,
  currentEmployee?: string
) {
  const values = new Set<string>([fallbackEmployee]);
  if (currentEmployee) values.add(currentEmployee);
  for (const user of getUsersForRoleLabel(users, roleLabel)) {
    values.add(user.name);
  }

  for (const document of documents) {
    const config = normalizeMetalImpurityConfig(document.config);
    if (config.responsiblePosition === roleLabel && config.responsibleEmployee) {
      values.add(config.responsibleEmployee);
    }
  }

  return Array.from(values).filter(Boolean);
}

function getDefaultState(
  users: MetalImpurityUser[],
  availableMaterials: string[],
  availableSuppliers: string[]
): SettingsState {
  const config = getDefaultMetalImpurityConfig({
    users,
    materials: availableMaterials,
    suppliers: availableSuppliers,
  });
  return {
    title: METAL_IMPURITY_DOCUMENT_TITLE,
    startDate: config.startDate,
    responsiblePosition: config.responsiblePosition,
    responsibleEmployee: config.responsibleEmployee,
  };
}

function DocumentDialog({
  open,
  onOpenChange,
  initial,
  submitLabel,
  title,
  users,
  documents,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SettingsState;
  submitLabel: string;
  title: string;
  users: MetalImpurityUser[];
  documents: DocumentItem[];
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const defaultEmployee = pickPrimaryManager(users)?.name || getDefaultMetalImpurityConfig().responsibleEmployee;
  const employeeOptions = useMemo(
    () =>
      collectEmployeeOptions(
        users,
        documents,
        state.responsiblePosition,
        defaultEmployee,
        state.responsibleEmployee
      ),
    [defaultEmployee, documents, state.responsibleEmployee, state.responsiblePosition, users]
  );

  useEffect(() => {
    if (open) {
      setState(initial);
      setSubmitting(false);
    }
  }, [initial, open]);

  useEffect(() => {
    if (!open || employeeOptions.length === 0) return;
    if (!employeeOptions.includes(state.responsibleEmployee)) {
      setState((current) => ({ ...current, responsibleEmployee: employeeOptions[0] }));
    }
  }, [employeeOptions, open, state.responsibleEmployee]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[32px] font-medium text-black">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-12 py-10">
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              placeholder="Введите название документа"
              onChange={(event) => setState({ ...state, title: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Дата начала</Label>
            <Input
              type="date"
              value={state.startDate}
              onChange={(event) => setState({ ...state, startDate: event.target.value })}
              className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Должность ответственного</Label>
            <Select
              value={state.responsiblePosition}
              onValueChange={(value) =>
                setState({
                  ...state,
                  responsiblePosition: value,
                  responsibleEmployee:
                    getUsersForRoleLabel(users, value)[0]?.name ||
                    state.responsibleEmployee,
                })
              }
            >
              <SelectTrigger className="h-16 rounded-[18px] border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {METAL_IMPURITY_RESPONSIBLE_POSITIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label className="text-[18px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={state.responsibleEmployee}
              onValueChange={(value) => setState({ ...state, responsibleEmployee: value })}
            >
              <SelectTrigger className="h-16 rounded-[18px] border-[#dfe1ec] bg-[#f3f4fb] px-6 text-[18px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee} value={employee}>
                    {employee}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit(state);
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  title,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onDelete: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="pr-10 text-[32px] font-medium text-black">
            {`Удаление документа "${title}"`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end px-12 py-10">
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onDelete();
                onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-16 rounded-[18px] bg-[#ff5e57] px-10 text-[18px] text-white hover:bg-[#ef4b44]"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MetalImpurityDocumentsClient({
  activeTab,
  routeCode,
  documents,
  users,
  availableMaterials,
  availableSuppliers,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDocument, setSettingsDocument] = useState<DocumentItem | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<DocumentItem | null>(null);

  const createState = useMemo<SettingsState>(
    () => getDefaultState(users, availableMaterials, availableSuppliers),
    [availableMaterials, availableSuppliers, users]
  );

  async function createDocument(payload: SettingsState) {
    const config = getDefaultMetalImpurityConfig({
      users,
      materials: availableMaterials,
      suppliers: availableSuppliers,
      date: payload.startDate,
      responsibleName: payload.responsibleEmployee,
      responsiblePosition: payload.responsiblePosition,
    });

    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode: METAL_IMPURITY_TEMPLATE_CODE,
        title: payload.title.trim() || METAL_IMPURITY_DOCUMENT_TITLE,
        dateFrom: payload.startDate,
        dateTo: payload.startDate,
        config,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.document?.id) {
      throw new Error(result?.error || "Не удалось создать документ");
    }

    router.push(`/journals/${routeCode}/documents/${result.document.id}`);
    router.refresh();
  }

  async function saveSettings(document: DocumentItem, payload: SettingsState) {
    const current = normalizeMetalImpurityConfig(document.config, {
      users,
      materials: availableMaterials,
      suppliers: availableSuppliers,
      date: payload.startDate,
      responsibleName: payload.responsibleEmployee,
      responsiblePosition: payload.responsiblePosition,
    });

    const response = await fetch(`/api/journal-documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title.trim() || METAL_IMPURITY_DOCUMENT_TITLE,
        dateFrom: payload.startDate,
        dateTo: current.endDate || payload.startDate,
        config: {
          ...current,
          startDate: payload.startDate,
          responsiblePosition: payload.responsiblePosition,
          responsibleEmployee: payload.responsibleEmployee,
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Не удалось сохранить документ");
    }
    router.refresh();
  }

  async function deleteById(documentId: string) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Не удалось удалить документ");
    }
    router.refresh();
  }

  return (
    <>
      <div className="space-y-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {activeTab === "closed"
              ? `${METAL_IMPURITY_PAGE_TITLE} (Закрытые!!!)`
              : METAL_IMPURITY_PAGE_TITLE}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-[#eef0fb] px-4 text-[14px] text-[#5464ff] shadow-none"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-4" />
                Инструкция
              </Link>
            </Button>
            {activeTab === "active" && (
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-12 rounded-xl bg-[#5b66ff] px-5 text-[14px] font-medium text-white hover:bg-[#4c58ff]"
              >
                <Plus className="size-4" />
                Создать документ
              </Button>
            )}
          </div>
        </div>

        <div className="border-b border-[#d9dce8]">
          <div className="flex gap-9 text-[15px]">
            <Link
              href={`/journals/${routeCode}`}
              className={`relative pb-4 ${
                activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${routeCode}?tab=closed`}
              className={`relative pb-4 ${
                activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[2px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {documents.length === 0 && (
            <div className="rounded-[16px] border border-[#eef0f6] bg-white px-8 py-10 text-[18px] text-[#7c7c93]">
              Документов пока нет
            </div>
          )}

          {documents.map((document) => {
            const config = normalizeMetalImpurityConfig(document.config);
            return (
              <div
                key={document.id}
                className="grid grid-cols-[minmax(0,1fr)_260px_190px_56px] items-center rounded-[16px] border border-[#eef0f6] bg-white px-7 py-5"
              >
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className="text-[16px] font-semibold text-black"
                >
                  {document.title || METAL_IMPURITY_DOCUMENT_TITLE}
                </Link>
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className="border-l border-[#eef0f6] px-6"
                >
                  <div className="text-[11px] text-[#979aab]">Ответственный</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">
                    {`${config.responsiblePosition}: ${config.responsibleEmployee}`}
                  </div>
                </Link>
                <Link
                  href={`/journals/${routeCode}/documents/${document.id}`}
                  className="border-l border-[#eef0f6] px-6 text-right"
                >
                  <div className="text-[11px] text-[#979aab]">Дата начала</div>
                  <div className="mt-1 text-[12px] font-semibold text-black">
                    {formatRuDate(config.startDate)}
                  </div>
                </Link>
                <div className="justify-self-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"
                      >
                        <Ellipsis className="size-6" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[280px] rounded-[24px] border-0 p-4 shadow-xl"
                    >
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                          onSelect={() => setSettingsDocument(document)}
                        >
                          <Settings2 className="mr-3 size-5 text-[#6f7282]" />
                          Настройки
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="mb-2 h-14 rounded-2xl px-4 text-[18px]"
                        onSelect={() =>
                          window.open(
                            `/journals/${routeCode}/documents/${document.id}?print=1`,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        <Printer className="mr-3 size-5 text-[#6f7282]" />
                        Печать
                      </DropdownMenuItem>
                      {document.status === "active" && (
                        <DropdownMenuItem
                          className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]"
                          onSelect={() => setDeleteDocument(document)}
                        >
                          <Trash2 className="mr-3 size-5 text-[#ff3b30]" />
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
      </div>

      <DocumentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={createState}
        submitLabel="Создать"
        title="Создание документа"
        users={users}
        documents={documents}
        onSubmit={createDocument}
      />

      <DocumentDialog
        open={!!settingsDocument}
        onOpenChange={(open) => {
          if (!open) setSettingsDocument(null);
        }}
        initial={
          settingsDocument
            ? {
                title: settingsDocument.title,
                ...(() => {
                  const config = normalizeMetalImpurityConfig(settingsDocument.config);
                  return {
                    startDate: config.startDate,
                    responsiblePosition: config.responsiblePosition,
                    responsibleEmployee: config.responsibleEmployee,
                  };
                })(),
              }
            : createState
        }
        submitLabel="Сохранить"
        title="Настройки документа"
        users={users}
        documents={documents}
        onSubmit={async (value) => {
          if (!settingsDocument) return;
          await saveSettings(settingsDocument, value);
        }}
      />

      <DeleteDialog
        open={!!deleteDocument}
        onOpenChange={(open) => {
          if (!open) setDeleteDocument(null);
        }}
        title={deleteDocument?.title || METAL_IMPURITY_DOCUMENT_TITLE}
        onDelete={async () => {
          if (!deleteDocument) return;
          await deleteById(deleteDocument.id);
        }}
      />
    </>
  );
}
