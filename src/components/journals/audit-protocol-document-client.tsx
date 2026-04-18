"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIT_PROTOCOL_DOCUMENT_TITLE,
  createAuditProtocolRow,
  createAuditProtocolSection,
  createAuditProtocolSignature,
  normalizeAuditProtocolConfig,
  type AuditProtocolConfig,
  type AuditProtocolRow,
  type AuditProtocolSection,
  type AuditProtocolSignature,
} from "@/lib/audit-protocol-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  config: unknown;
};

function SectionDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[22px] font-semibold text-black">Добавить новый раздел</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]" />
          <div className="flex justify-end">
            <Button type="button" onClick={async () => { if (!value.trim()) return; await onCreate(value.trim()); onOpenChange(false); setValue(""); }} className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]">
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowDialog({
  open,
  onOpenChange,
  sections,
  row,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: AuditProtocolSection[];
  row: AuditProtocolRow | null;
  onSave: (row: AuditProtocolRow) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AuditProtocolRow>(
    row ||
      createAuditProtocolRow({
        sectionId: sections[0]?.id || "",
      })
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[700px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[22px] font-semibold text-black">
            {row ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Раздел</Label>
            <Select value={draft.sectionId} onValueChange={(value) => setDraft({ ...draft, sectionId: value })}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="Выберите раздел" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>{section.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Требование</Label>
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} className="min-h-[160px] rounded-2xl border-[#d8dae6] px-4 py-3 text-[18px]" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={async () => { await onSave(draft); onOpenChange(false); }} className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]">
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditProtocolDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  config: initialConfig,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [documentTitle, setDocumentTitle] = useState(title || AUDIT_PROTOCOL_DOCUMENT_TITLE);
  const [config, setConfig] = useState(() => normalizeAuditProtocolConfig(initialConfig));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AuditProtocolRow | null>(null);

  useEffect(() => {
    setConfig(normalizeAuditProtocolConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    setDocumentTitle(title || AUDIT_PROTOCOL_DOCUMENT_TITLE);
  }, [title]);

  async function persist(nextTitle: string, nextConfig: AuditProtocolConfig, patch?: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextConfig.documentDate,
        dateTo: nextConfig.documentDate,
        config: nextConfig,
        ...patch,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Не удалось сохранить документ");
    setDocumentTitle(nextTitle);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function saveRow(row: AuditProtocolRow) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];
    await persist(documentTitle, { ...config, rows: nextRows });
    setEditingRow(null);
  }

  async function deleteSelected() {
    if (selectedRowIds.length === 0) return;
    await persist(documentTitle, {
      ...config,
      rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
    });
    setSelectedRowIds([]);
  }

  async function addSection(title: string) {
    await persist(documentTitle, {
      ...config,
      sections: [...config.sections, createAuditProtocolSection(title)],
    });
  }

  async function saveSettings(nextTitle: string, nextConfig: AuditProtocolConfig) {
    await persist(nextTitle, nextConfig);
  }

  async function saveSignature(index: number, next: AuditProtocolSignature) {
    const signatures = [...config.signatures];
    signatures[index] = next;
    await persist(documentTitle, { ...config, signatures });
  }

  const rowsBySection = useMemo(
    () =>
      config.sections.map((section) => ({
        section,
        rows: config.rows.filter((row) => row.sectionId === section.id),
      })),
    [config.rows, config.sections]
  );

  const allSelected = config.rows.length > 0 && selectedRowIds.length === config.rows.length;

  return (
    <>
      <div className="space-y-8">
        {selectedRowIds.length > 0 && status === "active" && (
          <div className="flex items-center gap-4 rounded-2xl bg-[#f3f4fe] px-6 py-3 print:hidden">
            <button type="button" className="flex items-center gap-1 text-[16px] text-[#5566f6]" onClick={() => setSelectedRowIds([])}>
              <X className="size-4" /> Выбрано: {selectedRowIds.length}
            </button>
            <button type="button" className="flex items-center gap-1 text-[16px] text-[#ff3b30]" onClick={() => deleteSelected().catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка удаления"))}>
              <Trash2 className="size-4" /> Удалить
            </button>
          </div>
        )}

        <DocumentBackLink href="/journals/audit_protocol" documentId={documentId} />
        <div className="flex items-center justify-between print:hidden">
          <div />
          {status === "active" && (
            <>
            <Button variant="outline" className="h-12 rounded-xl border-[#e8ebf7] px-5 text-[14px] text-[#5566f6]" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" />
              Настройки журнала
            </Button>
            <DocumentCloseButton
              documentId={documentId}
              title={documentTitle}
              variant="outline"
              className="h-12 rounded-xl border-[#e8ebf7] px-5 text-[14px] text-[#5566f6]"
            >
              Закончить журнал
            </DocumentCloseButton>
            </>
          )}
        </div>

        <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024] print:hidden">{documentTitle}</h1>

        <section className="space-y-4 rounded-[18px] border border-[#dadde9] bg-white p-8 print:border-0 print:p-0">
          <div className="grid grid-cols-[220px_1fr_120px] border border-black/70">
            <div className="flex items-center justify-center border-r border-black/70 py-10 text-[16px] font-semibold">{organizationName}</div>
            <div className="grid grid-rows-2">
              <div className="flex items-center justify-center border-b border-black/70 py-4 text-[14px]">СИСТЕМА ХАССП</div>
              <div className="flex items-center justify-center py-4 text-[14px] italic">ПРОТОКОЛ ВНУТРЕННЕГО АУДИТА</div>
            </div>
            <div className="flex items-center justify-center border-l border-black/70 text-[14px]">СТР. 1 ИЗ 1</div>
          </div>

          <div className="grid gap-2 text-[18px]">
            <div><span className="font-semibold">Дата:</span> {config.documentDate}</div>
            <div><span className="font-semibold">Основание проверки:</span> {config.basisTitle}</div>
            <div><span className="font-semibold">Проверяемый объект:</span> {config.auditedObject}</div>
          </div>

          {status === "active" && (
            <div className="flex gap-3 print:hidden">
              <Button className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={() => { setEditingRow(null); setRowOpen(true); }}>
                <Plus className="size-5" /> Добавить строку
              </Button>
              <Button className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={() => setSectionOpen(true)}>
                <Plus className="size-5" /> Добавить новый раздел
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-black/70 bg-white text-[14px]">
              <thead>
                <tr>
                  <th className="w-14 border border-black/70 px-2 py-2 print:hidden">
                    <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedRowIds(checked === true ? config.rows.map((row) => row.id) : [])} disabled={status !== "active"} />
                  </th>
                  <th className="w-[60px] border border-black/70 px-2 py-2">№ п/п</th>
                  <th className="min-w-[520px] border border-black/70 px-3 py-2">Требования</th>
                  <th className="w-[110px] border border-black/70 px-3 py-2">Да (+)</th>
                  <th className="w-[110px] border border-black/70 px-3 py-2">Нет (-)</th>
                  <th className="min-w-[260px] border border-black/70 px-3 py-2">Примечания</th>
                </tr>
              </thead>
              <tbody>
                {rowsBySection.map(({ section, rows }) => (
                  <Fragment key={section.id}>
                    <tr>
                      <td colSpan={6} className="border border-black/70 px-3 py-2 text-center font-semibold">{section.title}</td>
                    </tr>
                    {rows.map((row) => {
                      const rowNumber = config.rows.findIndex((item) => item.id === row.id) + 1;
                      return (
                        <tr key={row.id}>
                          <td className="border border-black/70 px-2 py-2 text-center print:hidden">
                            <Checkbox
                              checked={selectedRowIds.includes(row.id)}
                              onCheckedChange={(checked) =>
                                setSelectedRowIds((current) =>
                                  checked === true
                                    ? [...new Set([...current, row.id])]
                                    : current.filter((id) => id !== row.id)
                                )
                              }
                              disabled={status !== "active"}
                            />
                          </td>
                          <td className="border border-black/70 px-2 py-2 text-center">{rowNumber}</td>
                          <td className="border border-black/70 px-3 py-2">
                            <button type="button" disabled={status !== "active"} className="w-full text-left disabled:cursor-default" onClick={() => { if (status !== "active") return; setEditingRow(row); setRowOpen(true); }}>
                              {row.text}
                            </button>
                          </td>
                          <td className="border border-black/70 px-2 py-2 text-center">
                            <Checkbox checked={row.result === "yes"} disabled={status !== "active"} onCheckedChange={() => persist(documentTitle, { ...config, rows: config.rows.map((item) => item.id === row.id ? { ...item, result: item.result === "yes" ? "" : "yes" } : item) }).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} />
                          </td>
                          <td className="border border-black/70 px-2 py-2 text-center">
                            <Checkbox checked={row.result === "no"} disabled={status !== "active"} onCheckedChange={() => persist(documentTitle, { ...config, rows: config.rows.map((item) => item.id === row.id ? { ...item, result: item.result === "no" ? "" : "no" } : item) }).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} />
                          </td>
                          <td className="border border-black/70 px-2 py-2">
                            {status === "active" ? (
                              <Textarea value={row.note} onChange={(event) => setConfig((current) => ({ ...current, rows: current.rows.map((item) => item.id === row.id ? { ...item, note: event.target.value } : item) }))} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="min-h-[70px] border-0 px-0 py-0 text-[14px] shadow-none focus-visible:ring-0" />
                            ) : (
                              row.note
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 pt-6">
            <div className="text-[20px] font-semibold">Подписи</div>
            {config.signatures.map((signature, index) => (
              <div key={signature.id} className="grid grid-cols-[220px_1fr_240px] gap-3">
                <Input value={signature.role} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, role: e.target.value } : item) }))} onBlur={() => saveSignature(index, config.signatures[index]).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
                <Input value={signature.name} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, name: e.target.value } : item) }))} onBlur={() => saveSignature(index, config.signatures[index]).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
                <Input type="date" value={signature.signedAt} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, signedAt: e.target.value } : item) }))} onBlur={() => saveSignature(index, config.signatures[index]).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
              </div>
            ))}
            {status === "active" && (
              <Button type="button" variant="outline" onClick={() => persist(documentTitle, { ...config, signatures: [...config.signatures, createAuditProtocolSignature()] }).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))}>
                Добавить подпись
              </Button>
            )}
          </div>
        </section>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[760px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[22px] font-semibold text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-8 py-6">
            <div className="space-y-2">
              <Label className="text-[14px] text-[#73738a]">Название документа</Label>
              <Input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#73738a]">Дата документа</Label>
              <Input type="date" value={config.documentDate} onChange={(e) => setConfig({ ...config, documentDate: e.target.value })} className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#73738a]">Основание проверки</Label>
              <Input value={config.basisTitle} onChange={(e) => setConfig({ ...config, basisTitle: e.target.value })} className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[14px] text-[#73738a]">Проверяемый объект</Label>
              <Input value={config.auditedObject} onChange={(e) => setConfig({ ...config, auditedObject: e.target.value })} className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]" />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={async () => { await saveSettings(documentTitle.trim() || AUDIT_PROTOCOL_DOCUMENT_TITLE, config); setSettingsOpen(false); }} className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]">
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SectionDialog open={sectionOpen} onOpenChange={setSectionOpen} onCreate={addSection} />
      {rowOpen && (
        <RowDialog
          key={editingRow?.id || `new-${config.sections[0]?.id || "empty"}`}
          open={rowOpen}
          onOpenChange={(open) => {
            setRowOpen(open);
            if (!open) setEditingRow(null);
          }}
          sections={config.sections}
          row={editingRow}
          onSave={saveRow}
        />
      )}
    </>
  );
}
