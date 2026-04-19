"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmptyDocumentsState,
  JournalTabs,
  JournalTopBar,
} from "@/components/journals/document-list-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel } from "@/lib/user-roles";
import { openDocumentPdf } from "@/lib/open-document-pdf";
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
import { Ellipsis, Pencil, Copy, Printer, Archive, Trash2, ArchiveRestore } from "lucide-react";
import {
  normalizeEquipmentMaintenanceConfig,
  formatMaintenanceDate,
} from "@/lib/equipment-maintenance-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";

import { toast } from "sonner";
import {
  JOURNAL_CARD_LABEL_CLASS,
  JOURNAL_CARD_SECTION_CLASS,
  JOURNAL_CARD_TITLE_CLASS,
  JOURNAL_CARD_VALUE_CLASS,
} from "@/components/journals/journal-responsive";
import { PositionSelectItems } from "@/components/shared/position-select";
const POSITION_OPTIONS = USER_ROLE_LABEL_VALUES;

type JournalListDocument = {
  id: string;
  title: string;
  status: "active" | "closed";
  dateFrom: string;
  config?: unknown;
};

type Props = {
  activeTab: "active" | "closed";
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  documents: JournalListDocument[];
};

export function EquipmentMaintenanceDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDoc, setEditingDoc] = useState<JournalListDocument | null>(null);
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [approveRole, setApproveRole] = useState("");
  const [approveEmployeeId, setApproveEmployeeId] = useState("");
  const [approveEmployee, setApproveEmployee] = useState("");
  const [responsibleRole, setResponsibleRole] = useState("");
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState("");
  const [responsibleEmployee, setResponsibleEmployee] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editingDoc) return;
    const cfg = normalizeEquipmentMaintenanceConfig(editingDoc.config);
    setTitle(editingDoc.title);
    setDocDate(cfg.documentDate);
    setYear(String(cfg.year));
    setApproveRole(cfg.approveRole);
    setApproveEmployeeId(cfg.approveEmployeeId || "");
    setApproveEmployee(cfg.approveEmployee);
    setResponsibleRole(cfg.responsibleRole);
    setResponsibleEmployeeId(cfg.responsibleEmployeeId || "");
    setResponsibleEmployee(cfg.responsibleEmployee);
  }, [editingDoc]);

  async function handleDelete(docId: string, docTitle: string) {
    if (!window.confirm(`Удалить документ "${docTitle}"?`)) return;
    const response = await fetch(`/api/journal-documents/${docId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Не удалось удалить документ");
    router.refresh();
  }

  async function handleStatusChange(docId: string, newStatus: "active" | "closed", docTitle: string) {
    const label = newStatus === "closed" ? "Отправить в закрытые" : "Отправить в активные";
    if (!window.confirm(`${label} документ "${docTitle}"?`)) return;
    const response = await fetch(`/api/journal-documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error("Не удалось изменить статус документа");
    router.refresh();
  }

  async function handleCopy(doc: JournalListDocument) {
    const cfg = normalizeEquipmentMaintenanceConfig(doc.config);
    const newYear = cfg.year + 1;
    const response = await fetch("/api/journal-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateCode,
        title: doc.title,
        dateFrom: `${newYear}-01-01`,
        dateTo: `${newYear}-12-31`,
        config: { ...cfg, year: newYear, documentDate: `${newYear}-01-01` },
      }),
    });
    if (!response.ok) throw new Error("Не удалось скопировать документ");
    router.refresh();
  }

  async function saveSettings() {
    if (!editingDoc) return;
    setIsSaving(true);
    try {
      const prevConfig = normalizeEquipmentMaintenanceConfig(editingDoc.config);
      const response = await fetch(`/api/journal-documents/${editingDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dateFrom: docDate,
          config: {
            ...prevConfig,
            year: Number(year),
            documentDate: docDate,
            approveRole,
            approveEmployeeId: approveEmployeeId || null,
            approveEmployee,
            responsibleRole,
            responsibleEmployeeId: responsibleEmployeeId || null,
            responsibleEmployee,
          },
        }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить");
      setEditingDoc(null);
      router.refresh();
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <JournalTopBar
        heading="График профилактического обслуживания оборудования"
        activeTab={activeTab}
        templateCode={templateCode}
        templateName={templateName}
        users={users}
      />
      <JournalTabs activeTab={activeTab} templateCode={templateCode} />
      <div className="space-y-4">
        {documents.length === 0 && <EmptyDocumentsState />}
        {documents.map((doc) => {
          const cfg = normalizeEquipmentMaintenanceConfig(doc.config);
          return (
            <div
              key={doc.id}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:grid-cols-[minmax(0,1.8fr)_80px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_48px] sm:items-center sm:gap-0 sm:px-6 sm:py-5"
            >
              <Link href={`/journals/${templateCode}/documents/${doc.id}`} className="min-w-0">
                <div className={JOURNAL_CARD_TITLE_CLASS}>{doc.title}</div>
              </Link>
              <div className={JOURNAL_CARD_SECTION_CLASS}>
                <div className={JOURNAL_CARD_LABEL_CLASS}>Год</div>
                <div className={JOURNAL_CARD_VALUE_CLASS}>{cfg.year}</div>
              </div>
              <div className={JOURNAL_CARD_SECTION_CLASS}>
                <div className={JOURNAL_CARD_LABEL_CLASS}>Должность &quot;Утверждаю&quot;</div>
                <div className={JOURNAL_CARD_VALUE_CLASS}>{cfg.approveRole}: {cfg.approveEmployee}</div>
              </div>
              <div className={JOURNAL_CARD_SECTION_CLASS}>
                <div className={JOURNAL_CARD_LABEL_CLASS}>Ответственный</div>
                <div className={JOURNAL_CARD_VALUE_CLASS}>{cfg.responsibleRole}: {cfg.responsibleEmployee}</div>
              </div>
              <div className={JOURNAL_CARD_SECTION_CLASS}>
                <div className={JOURNAL_CARD_LABEL_CLASS}>Дата документа</div>
                <div className={JOURNAL_CARD_VALUE_CLASS}>{formatMaintenanceDate(cfg.documentDate)}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex size-10 items-center justify-center rounded-full hover:bg-gray-100">
                    <Ellipsis className="size-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[280px] rounded-2xl border-0 p-3 shadow-xl">
                  {doc.status === "active" && (
                    <>
                      <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => setEditingDoc(doc)}>
                        <Pencil className="mr-3 size-5 text-[#6f7282]" /> Настройки
                      </DropdownMenuItem>
                      <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => handleCopy(doc)}>
                        <Copy className="mr-3 size-5 text-[#6f7282]" /> Сделать копию
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => openDocumentPdf(doc.id)}>
                    <Printer className="mr-3 size-5 text-[#6f7282]" /> Печать
                  </DropdownMenuItem>
                  {doc.status === "active" ? (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => handleStatusChange(doc.id, "closed", doc.title)}>
                      <Archive className="mr-3 size-5 text-[#6f7282]" /> Отправить в закрытые
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => handleStatusChange(doc.id, "active", doc.title)}>
                      <ArchiveRestore className="mr-3 size-5 text-[#6f7282]" /> Отправить в активные
                    </DropdownMenuItem>
                  )}
                  {doc.status === "active" && (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px] text-[#ff3b30] focus:text-[#ff3b30]" onSelect={() => handleDelete(doc.id, doc.title)}>
                      <Trash2 className="mr-3 size-5 text-[#ff3b30]" /> Удалить
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[560px]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[22px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label>Название документа</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Дата документа</Label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Год</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Должность &quot;Утверждаю&quot;</Label>
              <Select value={approveRole} onValueChange={(value) => {
                const user = users.find((item) => getUserRoleLabel(item.role) === value);
                setApproveRole(value);
                setApproveEmployeeId(user?.id || "");
                setApproveEmployee(user?.name || approveEmployee);
              }}>
                <SelectTrigger><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  <PositionSelectItems users={users} />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сотрудник</Label>
              <Select value={approveEmployeeId} onValueChange={(value) => {
                const user = users.find((item) => item.id === value);
                setApproveEmployeeId(value);
                setApproveEmployee(user?.name || approveEmployee);
                if (user) setApproveRole(getUserRoleLabel(user.role));
              }}>
                <SelectTrigger><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{buildStaffOptionLabel(u)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Должность ответственного</Label>
              <Select value={responsibleRole} onValueChange={(value) => {
                const user = users.find((item) => getUserRoleLabel(item.role) === value);
                setResponsibleRole(value);
                setResponsibleEmployeeId(user?.id || "");
                setResponsibleEmployee(user?.name || responsibleEmployee);
              }}>
                <SelectTrigger><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  <PositionSelectItems users={users} />
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сотрудник</Label>
              <Select value={responsibleEmployeeId} onValueChange={(value) => {
                const user = users.find((item) => item.id === value);
                setResponsibleEmployeeId(value);
                setResponsibleEmployee(user?.name || responsibleEmployee);
                if (user) setResponsibleRole(getUserRoleLabel(user.role));
              }}>
                <SelectTrigger><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{buildStaffOptionLabel(u)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={isSaving}>
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


