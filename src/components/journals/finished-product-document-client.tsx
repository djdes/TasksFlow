"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Printer,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DocumentPageHeader } from "@/components/journals/document-page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  createFinishedProductRow,
  normalizeFinishedProductDocumentConfig,
  type FinishedProductDocumentConfig,
  type FinishedProductDocumentRow,
} from "@/lib/finished-product-document";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

import { toast } from "sonner";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  initialConfig: FinishedProductDocumentConfig;
  users: { id: string; name: string; role: string }[];
};

const QUALITY_GUIDELINES = [
  "Контроль за доброкачественностью пищи проводится органолептическим методом.",
  "Осмотр лучше проводить при дневном свете, запах и вкус оценивать при характерной температуре блюда.",
  "Для измерения температуры используйте только исправные термометры-зонды.",
];

const TEMPERATURE_GUIDELINES = [
  ["A", "Натуральные рубленые изделия из мяса", "+85"],
  ["B", "Изделия из фарша: котлеты, биточки, тефтели, зразы", "+90"],
  ["C", "Мясо, рыба, ракообразные", "+68"],
  ["D", "Домашняя птица, яйца, рыба, мясо измельченное", "+74"],
  ["E", "Цельная говядина, баранина, рыба для холодного употребления", "+65"],
  ["G", "Холодные блюда: салаты, десерты", "+2..+5"],
  ["H", "Горячие блюда: супы, соусы", ">+75"],
] as const;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const dt = new Date();
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function parseDateTime(value: string) {
  const [date = nowDate(), time = nowTime()] = value.split(" ");
  return { date, time };
}

function mergeDateTime(date: string, time: string) {
  return `${date} ${time}`;
}

function createDraft(users: Props["users"], productName = ""): FinishedProductDocumentRow {
  return createFinishedProductRow({
    productName,
    productionDateTime: mergeDateTime(nowDate(), nowTime()),
    rejectionTime: mergeDateTime(nowDate(), nowTime()),
    releasePermissionTime: mergeDateTime(nowDate(), nowTime()),
    courierTransferTime: mergeDateTime(nowDate(), nowTime()),
    responsiblePerson: users[0]?.name || "",
    inspectorName: users[1]?.name || users[0]?.name || "",
    releaseAllowed: "yes",
  });
}

export function FinishedProductDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState(() => normalizeFinishedProductDocumentConfig(initialConfig));
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [draftRow, setDraftRow] = useState<FinishedProductDocumentRow>(() => createDraft(users));
  const readOnly = status === "closed";

  const productOptions = useMemo(() => Array.from(new Set(config.itemsCatalog)).filter(Boolean), [config.itemsCatalog]);
  const personOptions = useMemo(() => users.map((item) => item.name), [users]);

  async function saveConfig(nextConfig = config) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      if (!response.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      toast.error("Не удалось сохранить журнал");
    } finally {
      setIsSaving(false);
    }
  }

  function updateRow(id: string, patch: Partial<FinishedProductDocumentRow>) {
    setConfig((prev) => ({ ...prev, rows: prev.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) }));
  }

  function removeSelectedRows() {
    if (readOnly || selectedRows.length === 0) return;
    setConfig((prev) => ({ ...prev, rows: prev.rows.filter((row) => !selectedRows.includes(row.id)) }));
    setSelectedRows([]);
  }

  function saveDraftRow() {
    setConfig((prev) => ({ ...prev, rows: [...prev.rows, draftRow] }));
    setDraftRow(createDraft(users));
    setAddModalOpen(false);
  }

  return (
    <div className="space-y-6 text-black">
      <div className="rounded-[28px] bg-white px-8 py-7 shadow-sm">
        <DocumentPageHeader
          backHref="/journals/finished_product"
          documentId={documentId}
          rightActions={
            !readOnly ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="size-4" />Настройки журнала
              </Button>
            ) : null
          }
        />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">{title}</h1>
        </div>
      </div>

      {!readOnly ? (
        <div className="flex justify-end">
          <DocumentCloseButton
            documentId={documentId}
            title={title}
            variant="outline"
            className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
          >
            Закончить журнал
          </DocumentCloseButton>
        </div>
      ) : null}

      <div className="space-y-5 rounded-[20px] border bg-white p-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-[18%] border border-black p-3 text-center font-semibold">{organizationName}</td>
              <td className="border border-black p-2 text-center">СИСТЕМА ХАССП</td>
              <td className="w-[20%] border border-black p-2">Начат &nbsp; {new Date(dateFrom).toLocaleDateString("ru-RU")}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-sm uppercase italic">ЖУРНАЛ БРАКЕРАЖА ГОТОВОЙ ПИЩЕВОЙ ПРОДУКЦИИ</td>
              <td className="border border-black p-2">Окончен &nbsp; {readOnly ? new Date(dateTo).toLocaleDateString("ru-RU") : "__________"}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-center text-[30px] font-semibold uppercase">Журнал бракеража готовой пищевой продукции</h2>

        {!readOnly && <div className="flex flex-wrap gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] hover:bg-[#4d58f5]"><Plus className="size-5" />Добавить<ChevronDown className="ml-1 size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[300px] rounded-[24px] border-0 p-3 shadow-xl">
              <DropdownMenuItem className="h-14 rounded-2xl px-4 text-[18px]" onSelect={() => setAddModalOpen(true)}>Добавить изделие</DropdownMenuItem>
              <DropdownMenuItem className="h-14 rounded-2xl px-4 text-[18px]" onSelect={() => { const count = Number(window.prompt("Сколько изделий добавить?", "3") || "0"); if (count > 0) { for (let i = 0; i < count; i += 1) setConfig((prev) => ({ ...prev, rows: [...prev.rows, createDraft(users)] })); } }}>Добавить несколько изделий</DropdownMenuItem>
              <DropdownMenuItem className="h-14 rounded-2xl px-4 text-[18px]" onSelect={() => { const text = window.prompt("Вставьте названия изделий, каждое с новой строки:"); if (!text) return; const items = text.split("\n").map((item) => item.trim()).filter(Boolean); setConfig((prev) => ({ ...prev, rows: [...prev.rows, ...items.map((item) => createDraft(users, item))] })); }}>Добавить из файла</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" className="h-11 rounded-2xl border-0 bg-[#f5f6ff] px-4 text-[15px] text-[#5464ff] hover:bg-[#eceeff]" onClick={() => setCatalogOpen(true)}>Редактировать список изделий</Button>
          <Button type="button" variant="outline" onClick={removeSelectedRows} disabled={selectedRows.length === 0}><Trash2 className="size-4" />Удалить выбранные</Button>
          <Button type="button" onClick={() => saveConfig()} disabled={isSaving || isPending}><Save className="size-4" />{isSaving ? "Сохранение..." : "Сохранить"}</Button>
        </div>}

        <div className="overflow-x-auto">
          <table className="min-w-[1650px] w-full border-collapse text-sm">
            <thead><tr>
              <th className="w-10 border p-2" /><th className="border p-2">Дата, время изготовления</th><th className="border p-2">Время снятия бракеража</th><th className="border p-2">{config.fieldNameMode === "semi" ? "Наименование полуфабриката" : "Наименование блюд (изделий)"}</th><th className="border p-2">Органолептическая оценка</th>
              {config.showProductTemp && <th className="border p-2">T°C внутри продукта</th>}
              {config.showCorrectiveAction && <th className="border p-2">Корректирующие действия</th>}
              <th className="border p-2">Разрешение к реализации (время)</th>
              {config.showCourierTime && <th className="border p-2">Время передачи блюд курьеру</th>}
              <th className="border p-2">Ответственный исполнитель</th><th className="border p-2">{config.inspectorMode === "commission_signatures" ? "Подписи членов комиссии" : "ФИО лица, проводившего бракераж"}</th>
            </tr></thead>
            <tbody>{config.rows.map((row) => <tr key={row.id}>
              <td className="border p-2 align-top"><Checkbox checked={selectedRows.includes(row.id)} onCheckedChange={(value) => !readOnly && setSelectedRows((prev) => value === true ? [...new Set([...prev, row.id])] : prev.filter((item) => item !== row.id))} disabled={readOnly} /></td>
              <td className="border p-1 align-top"><Input value={row.productionDateTime} onChange={(e) => updateRow(row.id, { productionDateTime: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>
              <td className="border p-1 align-top"><Input value={row.rejectionTime} onChange={(e) => updateRow(row.id, { rejectionTime: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>
              <td className="border p-1 align-top"><Input value={row.productName} onChange={(e) => updateRow(row.id, { productName: e.target.value })} className="border-0 shadow-none" disabled={readOnly} list="finished-product-items" /></td>
              <td className="border p-1 align-top"><Input value={row.organoleptic} onChange={(e) => updateRow(row.id, { organoleptic: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>
              {config.showProductTemp && <td className="border p-1 align-top"><Input value={row.productTemp} onChange={(e) => updateRow(row.id, { productTemp: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>}
              {config.showCorrectiveAction && <td className="border p-1 align-top"><Input value={row.correctiveAction} onChange={(e) => updateRow(row.id, { correctiveAction: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>}
              <td className="border p-1 align-top"><Input value={row.releasePermissionTime} onChange={(e) => updateRow(row.id, { releasePermissionTime: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>
              {config.showCourierTime && <td className="border p-1 align-top"><Input value={row.courierTransferTime} onChange={(e) => updateRow(row.id, { courierTransferTime: e.target.value })} className="border-0 shadow-none" disabled={readOnly} /></td>}
              <td className="border p-1 align-top"><Input value={row.responsiblePerson} onChange={(e) => updateRow(row.id, { responsiblePerson: e.target.value })} className="border-0 shadow-none" disabled={readOnly} list="finished-product-users" /></td>
              <td className="border p-1 align-top"><Input value={row.inspectorName} onChange={(e) => updateRow(row.id, { inspectorName: e.target.value })} className="border-0 shadow-none" disabled={readOnly} list="finished-product-users" /></td>
            </tr>)}</tbody>
          </table>
          <datalist id="finished-product-items">{productOptions.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id="finished-product-users">{personOptions.map((item) => <option key={item} value={item} />)}</datalist>
        </div>
        <div className="text-[18px] underline">{config.footerNote}</div>
      </div>

      <section className="space-y-4 rounded-[20px] border bg-white p-6">
        <h3 className="text-[24px] font-semibold">Рекомендации по организации контроля за доброкачественностью готовой пищи</h3>
        {QUALITY_GUIDELINES.map((item) => <p key={item} className="text-[18px] leading-8">{item}</p>)}
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse text-[18px]"><thead><tr><th className="border border-black p-3">Группа</th><th className="border border-black p-3">Наименование продукта</th><th className="border border-black p-3">°C</th></tr></thead><tbody>{TEMPERATURE_GUIDELINES.map(([group, name, temperature]) => <tr key={group}><td className="border border-black p-3 text-center font-semibold">{group}</td><td className="border border-black p-3">{name}</td><td className="border border-black p-3 text-center font-semibold">{temperature}</td></tr>)}</tbody></table>
        </div>
      </section>

      <Dialog open={readOnly ? false : addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader><DialogTitle>Добавление новой строки</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <Label>Дата и время изготовления</Label>
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={parseDateTime(draftRow.productionDateTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, productionDateTime: mergeDateTime(e.target.value, parseDateTime(prev.productionDateTime).time) }))} /><Input type="time" value={parseDateTime(draftRow.productionDateTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, productionDateTime: mergeDateTime(parseDateTime(prev.productionDateTime).date, e.target.value) }))} /></div>
            <Label>Время снятия бракеража</Label>
            <div className="grid grid-cols-2 gap-2"><Input type="date" value={parseDateTime(draftRow.rejectionTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, rejectionTime: mergeDateTime(e.target.value, parseDateTime(prev.rejectionTime).time) }))} /><Input type="time" value={parseDateTime(draftRow.rejectionTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, rejectionTime: mergeDateTime(parseDateTime(prev.rejectionTime).date, e.target.value) }))} /></div>
            <Label>Наименование изделия</Label><Input value={draftRow.productName} onChange={(e) => setDraftRow((prev) => ({ ...prev, productName: e.target.value }))} list="finished-product-items" />
            <Label>Органолептическая оценка</Label><Input value={draftRow.organoleptic} onChange={(e) => setDraftRow((prev) => ({ ...prev, organoleptic: e.target.value }))} />
            {config.showProductTemp && <><Label>Введите T°C внутри продукта</Label><Input value={draftRow.productTemp} onChange={(e) => setDraftRow((prev) => ({ ...prev, productTemp: e.target.value }))} /></>}
            {config.showCorrectiveAction && <><Label>Корректирующие действия</Label><Textarea value={draftRow.correctiveAction} onChange={(e) => setDraftRow((prev) => ({ ...prev, correctiveAction: e.target.value }))} /></>}
            <Label>Разрешение к реализации</Label>
            <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={draftRow.releaseAllowed === "yes"} onChange={() => setDraftRow((prev) => ({ ...prev, releaseAllowed: "yes" }))} />Да</label><label className="flex items-center gap-2"><input type="radio" checked={draftRow.releaseAllowed === "no"} onChange={() => setDraftRow((prev) => ({ ...prev, releaseAllowed: "no" }))} />Нет</label></div>
            <Label>Дата и время разрешения</Label><div className="grid grid-cols-2 gap-2"><Input type="date" value={parseDateTime(draftRow.releasePermissionTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, releasePermissionTime: mergeDateTime(e.target.value, parseDateTime(prev.releasePermissionTime).time) }))} /><Input type="time" value={parseDateTime(draftRow.releasePermissionTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, releasePermissionTime: mergeDateTime(parseDateTime(prev.releasePermissionTime).date, e.target.value) }))} /></div>
            {config.showCourierTime && <><Label>Дата и время передачи блюд курьеру</Label><div className="grid grid-cols-2 gap-2"><Input type="date" value={parseDateTime(draftRow.courierTransferTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, courierTransferTime: mergeDateTime(e.target.value, parseDateTime(prev.courierTransferTime).time) }))} /><Input type="time" value={parseDateTime(draftRow.courierTransferTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, courierTransferTime: mergeDateTime(parseDateTime(prev.courierTransferTime).date, e.target.value) }))} /></div></>}
            <Label>Ответственный исполнитель</Label><Input value={draftRow.responsiblePerson} onChange={(e) => setDraftRow((prev) => ({ ...prev, responsiblePerson: e.target.value }))} list="finished-product-users" />
            <Label>{config.inspectorMode === "commission_signatures" ? "Подписи членов комиссии" : "Лицо, проводившее бракераж"}</Label><Input value={draftRow.inspectorName} onChange={(e) => setDraftRow((prev) => ({ ...prev, inspectorName: e.target.value }))} list="finished-product-users" />
            <div className="flex justify-end"><Button onClick={saveDraftRow}>Добавить</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={readOnly ? false : settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[640px]"><DialogHeader><DialogTitle>Настройки журнала</DialogTitle></DialogHeader><div className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={config.showProductTemp} onCheckedChange={(value) => setConfig((prev) => ({ ...prev, showProductTemp: value === true }))} />T°C внутри продукта</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={config.showCorrectiveAction} onCheckedChange={(value) => setConfig((prev) => ({ ...prev, showCorrectiveAction: value === true }))} />Корректирующие действия</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={config.showCourierTime} onCheckedChange={(value) => setConfig((prev) => ({ ...prev, showCourierTime: value === true }))} />Время передачи блюд курьеру</label>
          <Textarea value={config.footerNote} onChange={(e) => setConfig((prev) => ({ ...prev, footerNote: e.target.value }))} />
          <div className="flex justify-end"><Button onClick={() => saveConfig()} disabled={isSaving}>{isSaving ? "Сохранение..." : "Сохранить"}</Button></div>
        </div></DialogContent>
      </Dialog>

      <Dialog open={readOnly ? false : catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="sm:max-w-[640px]"><DialogHeader><DialogTitle>Список изделий</DialogTitle></DialogHeader><div className="space-y-4">
          {config.itemsCatalog.map((item) => <div key={item} className="flex items-center gap-2 rounded-lg border p-2"><div className="flex-1">{item}</div><Button type="button" variant="ghost" onClick={() => setConfig((prev) => ({ ...prev, itemsCatalog: prev.itemsCatalog.filter((catalogItem) => catalogItem !== item) }))}><Trash2 className="size-4" /></Button></div>)}
          <div className="flex gap-2"><Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Введите название нового изделия" /><Button onClick={() => { if (!newItemName.trim()) return; setConfig((prev) => ({ ...prev, itemsCatalog: Array.from(new Set([...prev.itemsCatalog, newItemName.trim()])) })); setNewItemName(""); }}><Plus className="size-4" /></Button></div>
        </div></DialogContent>
      </Dialog>
    </div>
  );
}
