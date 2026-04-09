"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  Copy,
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
  TRAINING_PLAN_HEADING,
  TRAINING_PLAN_DOCUMENT_TITLE,
  getTrainingPlanApproveLabel,
  getTrainingPlanDefaultConfig,
  getTrainingPlanDocumentDateLabel,
  getTrainingPlanYearLabel,
  normalizeTrainingPlanConfig,
  type TrainingPlanConfig,
} from "@/lib/training-plan-document";

type UserItem = { id: string; name: string; role: string };

type TrainingPlanDocumentItem = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  dateTo: string;
  config: unknown;
};

type Props = {
  routeCode: string;
  templateCode: string;
  activeTab: "active" | "closed";
  users: UserItem[];
  documents: TrainingPlanDocumentItem[];
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Управляющий",
  technologist: "Технолог",
  operator: "Сотрудник",
};

type SettingsState = {
  title: string;
  documentDate: string;
  year: string;
  approveRole: string;
  approveEmployee: string;
};

function roleOptionsFromUsers(users: UserItem[]) {
  const labels = users.map((u) => ROLE_LABELS[u.role] || u.role);
  return [...new Set(labels)];
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return users.filter((u) => (ROLE_LABELS[u.role] || u.role) === roleLabel);
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toUiState(document: TrainingPlanDocumentItem): SettingsState {
  const cfg = normalizeTrainingPlanConfig(document.config);
  return {
    title: document.title || TRAINING_PLAN_DOCUMENT_TITLE,
    documentDate: cfg.documentDate,
    year: String(cfg.year),
    approveRole: cfg.approveRole,
    approveEmployee: cfg.approveEmployee,
  };
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  initial: SettingsState | null;
  onSubmit: (value: SettingsState) => Promise<void>;
  submitText: string;
  title: string;
}) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);
  const activeState = state || props.initial;

  async function handleSubmit() {
    if (!activeState) return;
    setSubmitting(true);
    try { await props.onSubmit(activeState); props.onOpenChange(false); } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => { if (v) setState(props.initial); props.onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">{props.title}</DialogTitle>
            <button type="button" className="rounded-xl p-2 text-[#0b1024]" onClick={() => props.onOpenChange(false)}><X className="size-8" /></button>
          </div>
        </DialogHeader>
        {activeState && (
          <div className="space-y-5 px-10 py-8">
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Название документа</Label>
              <Input value={activeState.title} onChange={(e) => setState({ ...activeState, title: e.target.value })} className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Дата документа</Label>
              <div className="relative">
                <Input type="date" value={activeState.documentDate} onChange={(e) => setState({ ...activeState, documentDate: toIsoDate(e.target.value) })} className="h-16 rounded-3xl border-[#d8dae6] px-7 pr-14 text-[22px]" />
                <CalendarDays className="pointer-events-none absolute right-6 top-1/2 size-7 -translate-y-1/2 text-[#6e7080]" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Год</Label>
              <Select value={activeState.year} onValueChange={(v) => setState({ ...activeState, year: v })}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 8 }).map((_, idx) => {
                    const year = String(new Date().getFullYear() - 2 + idx);
                    return <SelectItem key={year} value={year}>{year}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Должность &quot;Утверждаю&quot;</Label>
              <Select value={activeState.approveRole} onValueChange={(v) => {
                const user = usersForRole(props.users, v)[0];
                setState({ ...activeState, approveRole: v, approveEmployee: user?.name || activeState.approveEmployee });
              }}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Сотрудник</Label>
              <Select value={activeState.approveEmployee} onValueChange={(v) => setState({ ...activeState, approveEmployee: v })}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>{usersForRole(props.users, activeState.approveRole).map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-3">
              <Button type="button" onClick={handleSubmit} disabled={submitting} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4554ff]">
                {submitting ? "Сохранение..." : props.submitText}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TrainingPlanDocumentsClient({ routeCode, templateCode, activeTab, users, documents }: Props) {
  const router = useRouter();
  const [settingsTarget, setSettingsTarget] = useState<TrainingPlanDocumentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TrainingPlanDocumentItem | null>(null);

  const defaultConfig = getTrainingPlanDefaultConfig();

  async function createDocument(payload: SettingsState) {
    const config: TrainingPlanConfig = {
      ...defaultConfig,
      year: Number(payload.year),
      documentDate: payload.documentDate,
      approveRole: payload.approveRole,
      approveEmployee: payload.approveEmployee,
      rows: [],
    };
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: payload.title.trim() || `${TRAINING_PLAN_DOCUMENT_TITLE} ${payload.year}`,
        dateFrom: payload.documentDate,
        dateTo: payload.documentDate,
        config,
      }),
    });
    if (!response.ok) { window.alert("Не удалось создать документ"); return; }
    const data = (await response.json()) as { document: { id: string } };
    router.push(`/journals/${routeCode}/documents/${data.document.id}`);
    router.refresh();
  }

  async function saveSettings(documentId: string, payload: SettingsState) {
    const current = documents.find((d) => d.id === documentId);
    if (!current) return;
    const currentConfig = normalizeTrainingPlanConfig(current.config);
    const config: TrainingPlanConfig = {
      ...currentConfig,
      year: Number(payload.year),
      documentDate: payload.documentDate,
      approveRole: payload.approveRole,
      approveEmployee: payload.approveEmployee,
    };
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: payload.title.trim() || TRAINING_PLAN_DOCUMENT_TITLE, dateFrom: payload.documentDate, dateTo: payload.documentDate, config }),
    });
    if (!response.ok) { window.alert("Не удалось сохранить"); return; }
    router.refresh();
  }

  async function handleDelete(documentId: string, docTitle: string) {
    if (!window.confirm(`Удалить документ "${docTitle}"?`)) return;
    const response = await fetch(`/api/journal-documents/${documentId}`, { method: "DELETE" });
    if (!response.ok) { window.alert("Не удалось удалить"); return; }
    router.refresh();
  }

  async function moveToStatus(documentId: string, newStatus: "active" | "closed") {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) { window.alert("Ошибка"); return; }
    router.refresh();
  }

  const defaultCreateState = useMemo<SettingsState>(() => ({
    title: "",
    documentDate: defaultConfig.documentDate,
    year: String(defaultConfig.year),
    approveRole: defaultConfig.approveRole,
    approveEmployee: defaultConfig.approveEmployee,
  }), []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
          {TRAINING_PLAN_HEADING}
          {activeTab === "closed" && " (Закрытые)"}
        </h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-12 rounded-2xl border-[#e8ebf7] px-6 text-[16px] text-[#5b66ff] shadow-none" asChild>
            <Link href="/sanpin"><BookOpenText className="size-5" /> Инструкция</Link>
          </Button>
          {activeTab === "active" && (
            <Button className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[16px] text-white hover:bg-[#4554ff]" onClick={() => setCreateOpen(true)}>
              <Plus className="size-5" /> Создать документ
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-[#d9dce8]">
        <div className="flex gap-12 text-[18px]">
          <Link href={`/journals/${routeCode}`} className={`relative pb-6 ${activeTab === "active" ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]" : "text-[#8a8ea4]"}`}>Активные</Link>
          <Link href={`/journals/${routeCode}?tab=closed`} className={`relative pb-6 ${activeTab === "closed" ? "font-semibold text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]" : "text-[#8a8ea4]"}`}>Закрытые</Link>
        </div>
      </div>

      <div className="space-y-4">
        {documents.length === 0 && (
          <div className="rounded-[18px] border border-[#e9ecf7] bg-white px-8 py-8 text-[28px] text-[#8a8ea4]">Документов пока нет</div>
        )}
        {documents.map((document) => {
          const cfg = normalizeTrainingPlanConfig(document.config);
          const href = `/journals/${routeCode}/documents/${document.id}`;
          return (
            <div key={document.id} className="grid grid-cols-[1.7fr_200px_430px_270px_64px] items-center rounded-[18px] border border-[#eaedf7] bg-white px-8 py-5">
              <Link href={href} className="text-[18px] font-semibold tracking-[-0.02em] text-black">{document.title || TRAINING_PLAN_DOCUMENT_TITLE}</Link>
              <Link href={href} className="border-l border-[#e8ebf5] px-8">
                <div className="text-[14px] text-[#7c8094]">Год</div>
                <div className="mt-2 text-[18px] font-semibold text-black">{getTrainingPlanYearLabel(cfg.year)}</div>
              </Link>
              <Link href={href} className="border-l border-[#e8ebf5] px-8">
                <div className="text-[14px] text-[#7c8094]">Должность &quot;Утверждаю&quot;</div>
                <div className="mt-2 text-[18px] font-semibold text-black">{getTrainingPlanApproveLabel(cfg.approveRole, cfg.approveEmployee)}</div>
              </Link>
              <Link href={href} className="border-l border-[#e8ebf5] px-8">
                <div className="text-[14px] text-[#7c8094]">Дата документа</div>
                <div className="mt-2 text-[18px] font-semibold text-black">{getTrainingPlanDocumentDateLabel(cfg.documentDate)}</div>
              </Link>
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex size-10 items-center justify-center rounded-full text-[#5b66ff] hover:bg-[#f5f6ff]"><Ellipsis className="size-8" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[320px] rounded-[28px] border-0 p-5 shadow-xl">
                    {document.status === "active" && (
                      <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => setSettingsTarget(document)}>
                        <Pencil className="mr-3 size-6 text-[#6f7282]" /> Настройки
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => window.open(`/api/journal-documents/${document.id}/pdf`, "_blank")}>
                      <Printer className="mr-3 size-6 text-[#6f7282]" /> Печать
                    </DropdownMenuItem>
                    {document.status === "active" && (
                      <>
                        <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => setArchiveTarget(document)}>
                          <BookOpenText className="mr-3 size-6 text-[#6f7282]" /> Отправить в закрытые
                        </DropdownMenuItem>
                        <DropdownMenuItem className="h-14 rounded-2xl px-4 text-[18px] text-[#ff3b30] focus:text-[#ff3b30]" onSelect={() => handleDelete(document.id, document.title)}>
                          <Trash2 className="mr-3 size-6 text-[#ff3b30]" /> Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                    {document.status === "closed" && (
                      <DropdownMenuItem className="mb-2 h-14 rounded-2xl px-4 text-[18px]" onSelect={() => moveToStatus(document.id, "active")}>
                        <BookOpenText className="mr-3 size-6 text-[#6f7282]" /> Отправить в активные
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <SettingsDialog open={createOpen} onOpenChange={setCreateOpen} users={users} initial={defaultCreateState} onSubmit={createDocument} submitText="Создать" title="Создание документа" />
      <SettingsDialog
        open={!!settingsTarget}
        onOpenChange={(v) => { if (!v) setSettingsTarget(null); }}
        users={users}
        initial={settingsTarget ? toUiState(settingsTarget) : null}
        onSubmit={async (v) => { if (settingsTarget) await saveSettings(settingsTarget.id, v); }}
        submitText="Сохранить"
        title="Настройки документа"
      />

      <Dialog open={!!archiveTarget} onOpenChange={(v) => { if (!v) setArchiveTarget(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[660px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-[24px] font-semibold text-black">
                Перенести в архив документ &quot;{archiveTarget?.title}&quot;
              </DialogTitle>
              <button type="button" className="rounded-xl p-2" onClick={() => setArchiveTarget(null)}><X className="size-7" /></button>
            </div>
          </DialogHeader>
          <div className="flex justify-end px-8 py-6">
            <Button className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[18px] text-white hover:bg-[#4554ff]" onClick={async () => {
              if (!archiveTarget) return;
              await moveToStatus(archiveTarget.id, "closed");
              setArchiveTarget(null);
            }}>В архив</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
