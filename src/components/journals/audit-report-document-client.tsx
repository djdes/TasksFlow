"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  AUDIT_REPORT_DOCUMENT_TITLE,
  createAuditReportFinding,
  createAuditReportSignature,
  normalizeAuditReportConfig,
  type AuditReportConfig,
  type AuditReportFinding,
} from "@/lib/audit-report-document";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  config: unknown;
};

function FindingDialog({
  open,
  onOpenChange,
  finding,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: AuditReportFinding | null;
  onSave: (finding: AuditReportFinding) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AuditReportFinding>(
    finding || createAuditReportFinding()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[920px] overflow-y-auto rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[32px] font-medium text-black">
            {finding ? "Редактирование несоответствия" : "Добавить несоответствие"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-12 py-10">
          <Textarea value={draft.nonConformity} onChange={(e) => setDraft({ ...draft, nonConformity: e.target.value })} placeholder="Описание несоответствия" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" />
          <Textarea value={draft.correctionActions} onChange={(e) => setDraft({ ...draft, correctionActions: e.target.value })} placeholder="Коррекция, описание действий" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" />
          <Textarea value={draft.correctiveActions} onChange={(e) => setDraft({ ...draft, correctiveActions: e.target.value })} placeholder="Корректирующие действия" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" />
          <div className="grid grid-cols-2 gap-5">
            <Input value={draft.responsibleName} onChange={(e) => setDraft({ ...draft, responsibleName: e.target.value })} placeholder="ФИО ответственного" className="h-16 rounded-[18px] border-[#dfe1ec] px-5 text-[18px]" />
            <Input value={draft.responsiblePosition} onChange={(e) => setDraft({ ...draft, responsiblePosition: e.target.value })} placeholder="Должность ответственного" className="h-16 rounded-[18px] border-[#dfe1ec] px-5 text-[18px]" />
            <Input type="date" value={draft.dueDatePlan} onChange={(e) => setDraft({ ...draft, dueDatePlan: e.target.value })} className="h-16 rounded-[18px] border-[#dfe1ec] px-5 text-[18px]" />
            <Input type="date" value={draft.dueDateFact} onChange={(e) => setDraft({ ...draft, dueDateFact: e.target.value })} className="h-16 rounded-[18px] border-[#dfe1ec] px-5 text-[18px]" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={async () => { await onSave(draft); onOpenChange(false); }} className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]">
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditReportDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  config: initialConfig,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documentTitle, setDocumentTitle] = useState(title || AUDIT_REPORT_DOCUMENT_TITLE);
  const [config, setConfig] = useState(() => normalizeAuditReportConfig(initialConfig));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findingOpen, setFindingOpen] = useState(false);
  const [editingFinding, setEditingFinding] = useState<AuditReportFinding | null>(null);

  useEffect(() => {
    setConfig(normalizeAuditReportConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    setDocumentTitle(title || AUDIT_REPORT_DOCUMENT_TITLE);
  }, [title]);

  async function persist(nextTitle: string, nextConfig: AuditReportConfig, patch?: Record<string, unknown>) {
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

  async function saveFinding(finding: AuditReportFinding) {
    const findings = editingFinding
      ? config.findings.map((item) => (item.id === editingFinding.id ? finding : item))
      : [...config.findings, finding];
    await persist(documentTitle, { ...config, findings });
    setEditingFinding(null);
  }

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between print:hidden">
          <div className="text-[16px] text-[#6f7282]">
            {organizationName} <span className="mx-2">›</span> {documentTitle}
          </div>
          {status === "active" && (
            <Button variant="outline" className="h-12 rounded-xl border-[#e8ebf7] px-5 text-[14px] text-[#5b66ff]" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-4" />
              Настройки журнала
            </Button>
          )}
        </div>

        <h1 className="text-[56px] font-semibold tracking-[-0.04em] text-black print:hidden">{documentTitle}</h1>

        <section className="space-y-6 rounded-[18px] border border-[#dadde9] bg-white p-8 print:border-0 print:p-0">
          <div className="grid grid-cols-[220px_1fr_120px] border border-black/70">
            <div className="flex items-center justify-center border-r border-black/70 py-10 text-[16px] font-semibold">{organizationName}</div>
            <div className="grid grid-rows-2">
              <div className="flex items-center justify-center border-b border-black/70 py-4 text-[14px]">СИСТЕМА ХАССП</div>
              <div className="flex items-center justify-center py-4 text-[14px] italic">ОТЧЕТ О ВНУТРЕННЕМ АУДИТЕ</div>
            </div>
            <div className="flex items-center justify-center border-l border-black/70 text-[14px]">СТР. 1 ИЗ 1</div>
          </div>

          <div className="grid gap-3 text-[18px]">
            <div><span className="font-semibold">Дата аудита:</span> {config.documentDate}</div>
            <div><span className="font-semibold">Основание:</span> {config.basisTitle}</div>
            <div><span className="font-semibold">Объект аудита:</span> {config.auditedObject}</div>
            <div><span className="font-semibold">Тип проверки:</span> {config.auditType === "planned" ? "Плановая" : "Внеплановая"}</div>
            <div><span className="font-semibold">Аудиторы:</span> {config.auditors.join(", ")}</div>
          </div>

          <div className="space-y-2">
            <div className="text-[24px] font-semibold">Результаты аудита</div>
            {status === "active" ? (
              <Textarea value={config.summary} onChange={(e) => setConfig({ ...config, summary: e.target.value })} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="min-h-[140px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" />
            ) : (
              <div className="whitespace-pre-wrap text-[18px]">{config.summary}</div>
            )}
          </div>

          {status === "active" && (
            <div className="print:hidden">
              <Button type="button" onClick={() => { setEditingFinding(null); setFindingOpen(true); }} className="h-14 rounded-[14px] bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4b57ff]">
                <Plus className="size-5" />
                Добавить несоответствие
              </Button>
            </div>
          )}

          <div className="space-y-5">
            {config.findings.map((finding, index) => (
              <div key={finding.id} className="rounded-[18px] border border-black/70">
                <div className="border-b border-black/70 px-5 py-4 text-[20px] font-semibold">
                  Несоответствие #{index + 1}
                </div>
                <div className="grid gap-0 text-[16px]">
                  {[
                    ["Описание несоответствия", finding.nonConformity],
                    ["Коррекция, описание действий", finding.correctionActions],
                    ["Корректирующие действия", finding.correctiveActions],
                    ["Ответственный", `${finding.responsibleName}${finding.responsiblePosition ? `, ${finding.responsiblePosition}` : ""}`],
                    ["Дата завершения КД: план / факт", `${finding.dueDatePlan || "—"} / ${finding.dueDateFact || "—"}`],
                  ].map(([label, value], rowIndex) => (
                    <div key={`${finding.id}-${rowIndex}`} className="grid grid-cols-[280px_1fr] border-t border-black/70 first:border-t-0">
                      <div className="border-r border-black/70 px-5 py-4 font-medium">{label}</div>
                      <button
                        type="button"
                        disabled={status !== "active"}
                        onClick={() => {
                          if (status !== "active") return;
                          setEditingFinding(finding);
                          setFindingOpen(true);
                        }}
                        className="px-5 py-4 text-left whitespace-pre-wrap disabled:cursor-default"
                      >
                        {value || "—"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-[24px] font-semibold">Рекомендации и наблюдения</div>
            {status === "active" ? (
              <Textarea value={config.recommendations} onChange={(e) => setConfig({ ...config, recommendations: e.target.value })} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="min-h-[140px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" />
            ) : (
              <div className="whitespace-pre-wrap text-[18px]">{config.recommendations}</div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-[24px] font-semibold">Подписи</div>
            {config.signatures.map((signature, index) => (
              <div key={signature.id} className="grid grid-cols-[180px_1fr_220px_180px] gap-3">
                <Input value={signature.role} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, role: e.target.value } : item) }))} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
                <Input value={signature.name} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, name: e.target.value } : item) }))} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
                <Input value={signature.position} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, position: e.target.value } : item) }))} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
                <Input type="date" value={signature.signedAt} disabled={status !== "active"} onChange={(e) => setConfig((current) => ({ ...current, signatures: current.signatures.map((item, idx) => idx === index ? { ...item, signedAt: e.target.value } : item) }))} onBlur={() => persist(documentTitle, config).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))} className="h-12 rounded-xl border-[#d8dae6] px-4 text-[16px]" />
              </div>
            ))}
            {status === "active" && (
              <Button type="button" variant="outline" disabled={isPending} onClick={() => persist(documentTitle, { ...config, signatures: [...config.signatures, createAuditReportSignature()] }).catch((error) => toast.error(error instanceof Error ? error.message : "Ошибка сохранения"))}>
                Добавить подпись
              </Button>
            )}
          </div>
        </section>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
          <DialogHeader className="border-b px-12 py-10">
            <DialogTitle className="text-[32px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-12 py-10">
            <div className="space-y-3">
              <Label className="text-[18px] text-[#73738a]">Название документа</Label>
              <Input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]" />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <Input type="date" value={config.documentDate} onChange={(e) => setConfig({ ...config, documentDate: e.target.value })} className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]" />
              <Select value={config.auditType} onValueChange={(value: "planned" | "unplanned") => setConfig({ ...config, auditType: value })}>
                <SelectTrigger className="h-16 rounded-[18px] border-[#dfe1ec] bg-[#f5f6fb] px-6 text-[18px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Плановая</SelectItem>
                  <SelectItem value="unplanned">Внеплановая</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input value={config.basisTitle} onChange={(e) => setConfig({ ...config, basisTitle: e.target.value })} placeholder="Основание проверки" className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]" />
            <Input value={config.auditedObject} onChange={(e) => setConfig({ ...config, auditedObject: e.target.value })} placeholder="Объект аудита" className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]" />
            <Input value={config.auditors.join(", ")} onChange={(e) => setConfig({ ...config, auditors: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Аудиторы через запятую" className="h-16 rounded-[18px] border-[#dfe1ec] px-6 text-[18px]" />
            <div className="flex justify-end">
              <Button type="button" onClick={async () => { await persist(documentTitle.trim() || AUDIT_REPORT_DOCUMENT_TITLE, config); setSettingsOpen(false); }} className="h-16 rounded-[18px] bg-[#5b66ff] px-10 text-[18px] text-white hover:bg-[#4b57ff]">
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {findingOpen && (
        <FindingDialog
          key={editingFinding?.id || "new-finding"}
          open={findingOpen}
          onOpenChange={(open) => {
            setFindingOpen(open);
            if (!open) setEditingFinding(null);
          }}
          finding={editingFinding}
          onSave={saveFinding}
        />
      )}
    </>
  );
}
