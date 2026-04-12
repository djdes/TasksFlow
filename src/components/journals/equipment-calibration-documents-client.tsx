"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  JournalTabs,
  JournalTopBar,
  EmptyDocumentsState,
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
import { Ellipsis, Pencil, Copy, Printer, Archive, Trash2, ArchiveRestore, X } from "lucide-react";
import {
  normalizeEquipmentCalibrationConfig,
  formatCalibrationDate,
} from "@/lib/equipment-calibration-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";

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

export function EquipmentCalibrationDocumentsClient({
  activeTab,
  templateCode,
  templateName,
  users,
  documents,
}: Props) {
  const router = useRouter();
  const [editingDoc, setEditingDoc] = useState<JournalListDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<JournalListDocument | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<JournalListDocument | null>(null);
  const [title, setTitle] = useState("");
  const [docDate, setDocDate] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [approveRole, setApproveRole] = useState("");
  const [approveEmployeeId, setApproveEmployeeId] = useState("");
  const [approveEmployee, setApproveEmployee] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!editingDoc) return;
    const cfg = normalizeEquipmentCalibrationConfig(editingDoc.config);
    setTitle(editingDoc.title);
    setDocDate(cfg.documentDate);
    setYear(String(cfg.year));
    setApproveRole(cfg.approveRole);
    setApproveEmployeeId(cfg.approveEmployeeId || "");
    setApproveEmployee(cfg.approveEmployee);
  }, [editingDoc]);

  async function handleDelete(docId: string) {
    const response = await fetch(`/api/journal-documents/${docId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РґРѕРєСѓРјРµРЅС‚");
    setDeleteDoc(null);
    router.refresh();
  }

  async function handleStatusChange(docId: string, newStatus: "active" | "closed") {
    const response = await fetch(`/api/journal-documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ РґРѕРєСѓРјРµРЅС‚Р°");
    setArchiveDoc(null);
    router.refresh();
  }

  async function handleCopy(doc: JournalListDocument) {
    const cfg = normalizeEquipmentCalibrationConfig(doc.config);
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
    if (!response.ok) throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ РґРѕРєСѓРјРµРЅС‚");
    router.refresh();
  }

  async function saveSettings() {
    if (!editingDoc) return;
    setIsSaving(true);
    try {
      const prevConfig = normalizeEquipmentCalibrationConfig(editingDoc.config);
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
          },
        }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить");
      setEditingDoc(null);
      router.refresh();
    } catch {
      window.alert("Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <JournalTopBar
        heading="Р“СЂР°С„РёРє РїРѕРІРµСЂРєРё СЃСЂРµРґСЃС‚РІ РёР·РјРµСЂРµРЅРёР№"
        activeTab={activeTab}
        templateCode={templateCode}
        templateName={templateName}
        users={users}
      />
      <JournalTabs activeTab={activeTab} templateCode={templateCode} />
      <div className="space-y-4">
        {documents.length === 0 && <EmptyDocumentsState />}
        {documents.map((doc) => {
          const cfg = normalizeEquipmentCalibrationConfig(doc.config);
          return (
            <div
              key={doc.id}
              className="grid grid-cols-[1fr_80px_240px_160px_48px] items-center rounded-[16px] border border-[#eceef5] bg-white px-4 py-3"
            >
              <Link href={`/journals/${templateCode}/documents/${doc.id}`} className="min-w-0">
                <div className="text-[24px] font-semibold text-black">{doc.title}</div>
              </Link>
              <div className="text-center">
                <div className="text-[12px] text-[#85889b]">Р“РѕРґ</div>
                <div className="text-[18px] font-semibold">{cfg.year}</div>
              </div>
              <div className="px-3">
                <div className="text-[12px] text-[#85889b]">Р”РѕР»Р¶РЅРѕСЃС‚СЊ &quot;РЈС‚РІРµСЂР¶РґР°СЋ&quot;</div>
                <div className="text-[14px] font-semibold">{cfg.approveRole}: {cfg.approveEmployee}</div>
              </div>
              <div className="px-3">
                <div className="text-[12px] text-[#85889b]">Р”Р°С‚Р° РґРѕРєСѓРјРµРЅС‚Р°</div>
                <div className="text-[18px] font-semibold">{formatCalibrationDate(cfg.documentDate)}</div>
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
                        <Pencil className="mr-3 size-5 text-[#6f7282]" /> РќР°СЃС‚СЂРѕР№РєРё
                      </DropdownMenuItem>
                      <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => handleCopy(doc)}>
                        <Copy className="mr-3 size-5 text-[#6f7282]" /> РЎРґРµР»Р°С‚СЊ РєРѕРїРёСЋ
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => openDocumentPdf(doc.id)}>
                    <Printer className="mr-3 size-5 text-[#6f7282]" /> РџРµС‡Р°С‚СЊ
                  </DropdownMenuItem>
                  {doc.status === "active" ? (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => setArchiveDoc(doc)}>
                      <Archive className="mr-3 size-5 text-[#6f7282]" /> РћС‚РїСЂР°РІРёС‚СЊ РІ Р·Р°РєСЂС‹С‚С‹Рµ
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px]" onSelect={() => handleStatusChange(doc.id, "active")}>
                      <ArchiveRestore className="mr-3 size-5 text-[#6f7282]" /> РћС‚РїСЂР°РІРёС‚СЊ РІ Р°РєС‚РёРІРЅС‹Рµ
                    </DropdownMenuItem>
                  )}
                  {doc.status === "active" && (
                    <DropdownMenuItem className="h-12 rounded-xl px-3 text-[16px] text-[#ff3b30] focus:text-[#ff3b30]" onSelect={() => setDeleteDoc(doc)}>
                      <Trash2 className="mr-3 size-5 text-[#ff3b30]" /> РЈРґР°Р»РёС‚СЊ
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      {/* Settings dialog */}
      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[24px] font-semibold text-black">РќР°СЃС‚СЂРѕР№РєРё РґРѕРєСѓРјРµРЅС‚Р°</DialogTitle>
            <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => setEditingDoc(null)}>
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="space-y-4 px-7 py-6">
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">РќР°Р·РІР°РЅРёРµ РґРѕРєСѓРјРµРЅС‚Р°</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Р”Р°С‚Р° РґРѕРєСѓРјРµРЅС‚Р°</Label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Р“РѕРґ</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Р”РѕР»Р¶РЅРѕСЃС‚СЊ &quot;РЈС‚РІРµСЂР¶РґР°СЋ&quot;</Label>
              <Select value={approveRole} onValueChange={(value) => {
                const user = users.find((item) => getUserRoleLabel(item.role) === value);
                setApproveRole(value);
                setApproveEmployeeId(user?.id || "");
                setApproveEmployee(user?.name || approveEmployee);
              }}>
                <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]"><SelectValue placeholder="- Р’С‹Р±РµСЂРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ -" /></SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">РЎРѕС‚СЂСѓРґРЅРёРє</Label>
              <Select value={approveEmployeeId} onValueChange={(value) => {
                const user = users.find((item) => item.id === value);
                setApproveEmployeeId(value);
                setApproveEmployee(user?.name || approveEmployee);
                if (user) setApproveRole(getUserRoleLabel(user.role));
              }}>
                <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]"><SelectValue placeholder="- Р’С‹Р±РµСЂРёС‚Рµ Р·РЅР°С‡РµРЅРёРµ -" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{buildStaffOptionLabel(u)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={saveSettings} disabled={isSaving} className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]">
                {isSaving ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[20px] font-semibold text-black">
              РЈРґР°Р»РµРЅРёРµ РґРѕРєСѓРјРµРЅС‚Р° &quot;{deleteDoc?.title}&quot;
            </DialogTitle>
            <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => setDeleteDoc(null)}>
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="flex justify-end px-7 py-6">
            <Button
              onClick={() => deleteDoc && handleDelete(deleteDoc.id)}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]"
            >
              РЈРґР°Р»РёС‚СЊ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveDoc} onOpenChange={(open) => !open && setArchiveDoc(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0">
          <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
            <DialogTitle className="text-[20px] font-semibold text-black">
              РџРµСЂРµРЅРµСЃС‚Рё РІ Р°СЂС…РёРІ РґРѕРєСѓРјРµРЅС‚ &quot;{archiveDoc?.title}&quot;
            </DialogTitle>
            <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => setArchiveDoc(null)}>
              <X className="size-6" />
            </button>
          </DialogHeader>
          <div className="flex justify-end px-7 py-6">
            <Button
              onClick={() => archiveDoc && handleStatusChange(archiveDoc.id, "closed")}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[18px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Р’ Р°СЂС…РёРІ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


