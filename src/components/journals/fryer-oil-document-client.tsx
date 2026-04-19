"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Printer, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { openDocumentPdf } from "@/lib/open-document-pdf";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { DocumentCloseButton } from "@/components/journals/document-close-button";
import {
  formatDateRu,
  formatTime,
  normalizeFryerOilEntryData,
  QUALITY_ASSESSMENT_TABLE,
  QUALITY_LABELS,
  type FryerOilDocumentConfig,
  type FryerOilEntryData,
  type FryerOilSelectLists,
} from "@/lib/fryer-oil-document";

import { toast } from "sonner";
type UserItem = { id: string; name: string; role: string };
type EntryItem = { id: string; date: string; data: FryerOilEntryData };
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  config: FryerOilDocumentConfig;
  users: UserItem[];
  initialEntries: EntryItem[];
  routeCode: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const QUALITY_OPTIONS = [5, 4, 3, 2, 1] as const;

function sortEntries(items: EntryItem[]) {
  return [...items]
    .map((item) => ({ ...item, data: normalizeFryerOilEntryData(item.data) }))
    .sort((a, b) =>
      `${a.data.startDate}-${a.data.startHour}-${a.data.startMinute}`.localeCompare(
        `${b.data.startDate}-${b.data.startHour}-${b.data.startMinute}`
      )
    );
}

function EntryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: FryerOilSelectLists;
  users: UserItem[];
  initialEntry: EntryItem | null;
  onSubmit: (payload: { id?: string; data: FryerOilEntryData }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const initial = props.initialEntry?.data
    ? normalizeFryerOilEntryData(props.initialEntry.data)
    : {
        ...normalizeFryerOilEntryData({}),
        startDate: new Date().toISOString().slice(0, 10),
        fatType: props.lists.fatTypes[0] ?? "",
        equipmentType: props.lists.equipmentTypes[0] ?? "",
        productType: props.lists.productTypes[0] ?? "",
        controllerName: props.users[0]?.name ?? "",
      };
  const [data, setData] = useState<FryerOilEntryData>(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await props.onSubmit({ id: props.initialEntry?.id, data });
      props.onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[24px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[22px] font-semibold">
            {props.initialEntry ? "Редактирование записи" : "Добавление новой строки"}
          </DialogTitle>
          <button type="button" className="rounded-md p-1 hover:bg-black/5" onClick={() => props.onOpenChange(false)}>
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="space-y-4 px-7 py-6">
          <Input type="date" value={data.startDate} onChange={(e) => setData((v) => ({ ...v, startDate: e.target.value }))} className="h-11 rounded-2xl" />
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={String(data.startHour).padStart(2, "0")} onValueChange={(v) => setData((d) => ({ ...d, startHour: Number(v) }))}>
              <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Часы" /></SelectTrigger>
              <SelectContent>{HOURS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(data.startMinute).padStart(2, "0")} onValueChange={(v) => setData((d) => ({ ...d, startMinute: Number(v) }))}>
              <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Минуты" /></SelectTrigger>
              <SelectContent>{MINUTES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={data.fatType} onValueChange={(v) => setData((d) => ({ ...d, fatType: v }))}>
            <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Вид фритюрного жира" /></SelectTrigger>
            <SelectContent>{props.lists.fatTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(data.qualityStart)} onValueChange={(v) => setData((d) => ({ ...d, qualityStart: Number(v) }))}>
            <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>{QUALITY_OPTIONS.map((v) => <SelectItem key={v} value={String(v)}>{v} - {QUALITY_LABELS[v]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={data.equipmentType} onValueChange={(v) => setData((d) => ({ ...d, equipmentType: v }))}>
            <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Тип жарочного оборудования" /></SelectTrigger>
            <SelectContent>{props.lists.equipmentTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={data.productType} onValueChange={(v) => setData((d) => ({ ...d, productType: v }))}>
            <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Вид продукции" /></SelectTrigger>
            <SelectContent>{props.lists.productTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={String(data.endHour).padStart(2, "0")} onValueChange={(v) => setData((d) => ({ ...d, endHour: Number(v) }))}>
              <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Часы окончания" /></SelectTrigger>
              <SelectContent>{HOURS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(data.endMinute).padStart(2, "0")} onValueChange={(v) => setData((d) => ({ ...d, endMinute: Number(v) }))}>
              <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Минуты окончания" /></SelectTrigger>
              <SelectContent>{MINUTES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={String(data.qualityEnd)} onValueChange={(v) => setData((d) => ({ ...d, qualityEnd: Number(v) }))}>
            <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>{QUALITY_OPTIONS.map((v) => <SelectItem key={v} value={String(v)}>{v} - {QUALITY_LABELS[v]}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid gap-3 md:grid-cols-2">
            <Input type="number" min="0" step="0.01" value={String(data.carryoverKg)} onChange={(e) => setData((d) => ({ ...d, carryoverKg: Number(e.target.value) || 0 }))} className="h-11 rounded-2xl" placeholder="Переходящий остаток, кг" />
            <Input type="number" min="0" step="0.01" value={String(data.disposedKg)} onChange={(e) => setData((d) => ({ ...d, disposedKg: Number(e.target.value) || 0 }))} className="h-11 rounded-2xl" placeholder="Утилизированный, кг" />
          </div>
          <Input value={data.controllerName} onChange={(e) => setData((d) => ({ ...d, controllerName: e.target.value }))} className="h-11 rounded-2xl" placeholder="Должность, ФИО контролера" />
          <div className={`flex ${props.initialEntry && props.onDelete ? "justify-between" : "justify-end"} gap-3 pt-2`}>
            {props.initialEntry && props.onDelete ? (
              <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#ffd7d3] text-[#ff3b30]" onClick={() => { void props.onDelete?.(props.initialEntry!.id); props.onOpenChange(false); }}>
                Удалить
              </Button>
            ) : null}
            <Button type="button" disabled={busy} className="h-11 rounded-2xl bg-[#5863f8] px-7 text-white" onClick={() => { void save(); }}>
              {busy ? "Сохранение..." : props.initialEntry ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; lists: FryerOilSelectLists; onSave: (lists: FryerOilSelectLists) => Promise<void> }) {
  const [lists, setLists] = useState(props.lists);
  const tabs: Array<[keyof FryerOilSelectLists, string]> = [["fatTypes", "Вид жира"], ["equipmentTypes", "Оборудование"], ["productTypes", "Вид продукции"]];
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[22px] font-semibold">Редактировать списки</DialogTitle>
          <button type="button" className="rounded-md p-1 hover:bg-black/5" onClick={() => props.onOpenChange(false)}><X className="size-6" /></button>
        </DialogHeader>
        <div className="px-7 py-6">
          <Tabs defaultValue="fatTypes">
            <TabsList className="mb-5 w-full">{tabs.map(([key, label]) => <TabsTrigger key={key} value={key} className="flex-1">{label}</TabsTrigger>)}</TabsList>
            {tabs.map(([key]) => (
              <TabsContent key={key} value={key} className="space-y-2">
                {lists[key].map((item, index) => (
                  <div key={`${key}:${index}`} className="flex items-center gap-2">
                    <Input value={item} onChange={(e) => setLists((v) => ({ ...v, [key]: v[key].map((x, i) => i === index ? e.target.value : x) }))} className="h-10 rounded-xl" />
                    <Button type="button" variant="outline" className="h-10 rounded-xl border-[#ffd7d3] text-[#ff3b30]" onClick={() => setLists((v) => ({ ...v, [key]: v[key].filter((_, i) => i !== index) }))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => setLists((v) => ({ ...v, [key]: [...v[key], ""] }))}><Plus className="size-4" />Добавить</Button>
              </TabsContent>
            ))}
          </Tabs>
          <div className="mt-6 flex justify-end"><Button type="button" className="h-11 rounded-2xl bg-[#5863f8] px-7 text-white" onClick={() => { void props.onSave(lists); props.onOpenChange(false); }}>Сохранить</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string; dateFrom: string; status: "active" | "closed"; onSave: (v: { title: string; dateFrom: string; status: "active" | "closed" }) => Promise<void> }) {
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [status, setStatus] = useState<"active" | "closed">(props.status);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[22px] font-semibold">Настройки журнала</DialogTitle>
          <button type="button" className="rounded-md p-1 hover:bg-black/5" onClick={() => props.onOpenChange(false)}><X className="size-6" /></button>
        </DialogHeader>
        <div className="space-y-4 px-7 py-6">
          <div className="space-y-1"><Label>Название документа</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-2xl" /></div>
          <div className="space-y-1"><Label>Дата начала</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-2xl" /></div>
          <div className="space-y-1"><Label>Статус документа</Label><Select value={status} onValueChange={(v: "active" | "closed") => setStatus(v)}><SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Активный</SelectItem><SelectItem value="closed">Закрытый</SelectItem></SelectContent></Select></div>
          <div className="flex justify-end"><Button type="button" className="h-11 rounded-2xl bg-[#5863f8] px-7 text-white" onClick={() => { void props.onSave({ title, dateFrom, status }); props.onOpenChange(false); }}>Сохранить</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Appendix() {
  return (
    <div className="space-y-5 pt-8">
      <div className="text-[18px]">Приложение. Методика определения качества фритюрного жира.</div>
      <table className="w-full border-collapse text-[14px]"><thead><tr className="bg-[#f2f2f2]"><th className="border border-black px-3 py-2">Показатели качества</th><th className="border border-black px-3 py-2">Отлично</th><th className="border border-black px-3 py-2">Хорошо</th><th className="border border-black px-3 py-2">Удовлетворительно</th><th className="border border-black px-3 py-2">Неудовлетворительно</th></tr></thead><tbody>{QUALITY_ASSESSMENT_TABLE.indicators.map((x) => <tr key={x.name}><td className="border border-black px-3 py-2">{x.name}</td><td className="border border-black px-3 py-2">{x.scores[5]}</td><td className="border border-black px-3 py-2">{x.scores[4]}</td><td className="border border-black px-3 py-2">{x.scores[3]}</td><td className="border border-black px-3 py-2">{x.scores[2]}</td></tr>)}</tbody></table>
      <table className="w-full border-collapse text-[14px]"><thead><tr className="bg-[#f2f2f2]"><th className="border border-black px-3 py-2">Качество фритюра</th><th className="border border-black px-3 py-2">Бальная оценка</th></tr></thead><tbody>{QUALITY_ASSESSMENT_TABLE.gradingTable.map((x) => <tr key={`${x.label}-${x.score}`}><td className="border border-black px-3 py-2 text-center">{x.label}</td><td className="border border-black px-3 py-2 text-center">{x.score}</td></tr>)}</tbody></table>
      <div className="text-[15px] leading-7">Пример расчета среднего балла: {QUALITY_ASSESSMENT_TABLE.formulaExample}</div>
    </div>
  );
}

export function FryerOilDocumentClient(props: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryItem[]>(() => sortEntries(props.initialEntries));
  const [config, setConfig] = useState(props.config);
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [status, setStatus] = useState<"active" | "closed">(props.status === "closed" ? "closed" : "active");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryItem, setEntryItem] = useState<EntryItem | null>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isActive = status === "active";

  async function saveEntry(payload: { id?: string; data: FryerOilEntryData }) {
    const response = await fetch(`/api/journal-documents/${props.documentId}/fryer-oil`, { method: payload.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.entry) throw new Error(result?.error || "Не удалось сохранить запись");
    const next = { id: result.entry.id, date: result.entry.date, data: normalizeFryerOilEntryData(result.entry.data) };
    setEntries((v) => sortEntries([...v.filter((x) => x.id !== next.id), next]));
  }

  async function deleteEntries(ids: string[]) {
    if (ids.length === 0) return;
    const response = await fetch(`/api/journal-documents/${props.documentId}/fryer-oil`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Не удалось удалить записи");
    setEntries((v) => v.filter((x) => !ids.includes(x.id)));
    setSelectedIds((v) => v.filter((x) => !ids.includes(x)));
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1880px] space-y-8 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6 print:hidden">
          <div className="space-y-3">
            <DocumentBackLink href={`/journals/${props.routeCode}`} documentId={props.documentId} />
            <h1 className="text-[32px] font-semibold tracking-[-0.02em]">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#dcdfed] px-6 text-[#3848c7]" onClick={() => setSettingsOpen(true)}><Settings2 className="size-5" />Настройки журнала</Button>
          </div>
        </div>

        {isActive ? (
          <div className="flex justify-end print:hidden">
            <DocumentCloseButton
              documentId={props.documentId}
              title={title}
              variant="outline"
              className="h-11 rounded-2xl border-[#dcdfed] px-6 text-[#3848c7]"
            >
              Закончить журнал
            </DocumentCloseButton>
          </div>
        ) : null}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[1400px]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[240px_1fr_280px] border border-black">
              <div className="flex min-h-[110px] items-center justify-center border-r border-black px-6 text-center text-[15px]">{props.organizationName}</div>
              <div className="grid grid-rows-[55px_55px]"><div className="flex items-center justify-center border-b border-black text-[20px] uppercase">Система ХАССП</div><div className="flex items-center justify-center text-[18px] italic uppercase">Журнал учета использования фритюрных жиров</div></div>
              <div className="grid grid-rows-[55px_55px] border-l border-black"><div className="space-y-1 border-b border-black px-6 py-3 text-[18px]"><div className="flex items-center justify-between"><span>Начат</span><span>{formatDateRu(dateFrom)}</span></div><div className="flex items-center justify-between"><span>Окончен</span><span>__________</span></div></div><div className="flex items-center justify-center text-[18px] uppercase">Стр. 1 из 1</div></div>
            </div>
            <div className="py-10 text-center text-[26px] font-semibold uppercase">Журнал учета использования фритюрных жиров</div>
            {isActive ? <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden"><Button type="button" className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white" onClick={() => { setEntryItem(null); setEntryOpen(true); }} disabled={props.users.length === 0}><Plus className="size-5" />Добавить</Button><Button type="button" variant="outline" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]" onClick={() => setListsOpen(true)}>Редактировать списки</Button>{selectedIds.length > 0 ? <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#ffd7d3] px-4 text-[#ff3b30]" onClick={() => { if (window.confirm(`Удалить выбранные строки (${selectedIds.length})?`)) { void deleteEntries(selectedIds).catch((e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить записи")); } }}><Trash2 className="size-5" />Удалить</Button> : null}</div> : null}
            <table className="w-full border-collapse text-[14px]">
              <thead><tr className="bg-[#f2f2f2]">{isActive ? <th rowSpan={2} className="w-[52px] border border-black px-2 py-3 print:hidden"><Checkbox checked={entries.length > 0 && selectedIds.length === entries.length} onCheckedChange={(checked) => setSelectedIds(checked === true ? entries.map((x) => x.id) : [])} disabled={entries.length === 0} /></th> : null}<th rowSpan={2} className="border border-black px-3 py-3">Дата, время начала использования фритюрного жира</th><th rowSpan={2} className="border border-black px-3 py-3">Вид фритюрного жира</th><th rowSpan={2} className="border border-black px-3 py-3">Органолептическая оценка качества жира на начало жарки</th><th rowSpan={2} className="border border-black px-3 py-3">Тип жарочного оборудования</th><th rowSpan={2} className="border border-black px-3 py-3">Вид продукции</th><th rowSpan={2} className="border border-black px-3 py-3">Время окончания фритюрной жарки</th><th rowSpan={2} className="border border-black px-3 py-3">Органолептическая оценка качества жира по окончании жарки</th><th colSpan={2} className="border border-black px-3 py-3">Использование оставшегося жира</th><th rowSpan={2} className="border border-black px-3 py-3">Должность, ФИО контролера</th></tr><tr className="bg-[#f2f2f2]"><th className="border border-black px-3 py-3">Переходящий остаток, кг</th><th className="border border-black px-3 py-3">Утилизированный, кг</th></tr></thead>
              <tbody>{entries.length === 0 ? <tr><td colSpan={isActive ? 11 : 10} className="border border-black px-6 py-10 text-center text-[#6f7282]">Нет записей. Нажмите «Добавить», чтобы создать первую запись.</td></tr> : entries.map((entry) => <tr key={entry.id} className={selectedIds.includes(entry.id) ? "bg-[#f3f5ff]" : ""}>{isActive ? <td className="border border-black px-2 py-3 text-center print:hidden"><Checkbox checked={selectedIds.includes(entry.id)} onCheckedChange={() => setSelectedIds((v) => v.includes(entry.id) ? v.filter((x) => x !== entry.id) : [...v, entry.id])} /></td> : null}<td className="border border-black px-3 py-3"><button type="button" className={`flex w-full items-start justify-between gap-3 text-left ${isActive ? "hover:text-[#3848c7]" : ""}`} onClick={() => { if (isActive) { setEntryItem(entry); setEntryOpen(true); } }} disabled={!isActive}>{formatDateRu(entry.data.startDate)} {formatTime(entry.data.startHour, entry.data.startMinute)}{isActive ? <Pencil className="mt-0.5 size-4 shrink-0 print:hidden" /> : null}</button></td><td className="border border-black px-3 py-3">{entry.data.fatType || "-"}</td><td className="border border-black px-3 py-3 text-center">{QUALITY_LABELS[entry.data.qualityStart] || entry.data.qualityStart}</td><td className="border border-black px-3 py-3">{entry.data.equipmentType || "-"}</td><td className="border border-black px-3 py-3">{entry.data.productType || "-"}</td><td className="border border-black px-3 py-3 text-center">{formatTime(entry.data.endHour, entry.data.endMinute)}</td><td className="border border-black px-3 py-3 text-center">{QUALITY_LABELS[entry.data.qualityEnd] || entry.data.qualityEnd}</td><td className="border border-black px-3 py-3 text-center">{entry.data.carryoverKg > 0 ? entry.data.carryoverKg : ""}</td><td className="border border-black px-3 py-3 text-center">{entry.data.disposedKg > 0 ? entry.data.disposedKg : ""}</td><td className="border border-black px-3 py-3">{entry.data.controllerName || "-"}</td></tr>)}</tbody>
            </table>
            <Appendix />
          </div>
        </div>
      </div>

      <EntryDialog key={entryItem?.id ?? "new"} open={entryOpen} onOpenChange={(open) => { setEntryOpen(open); if (!open) setEntryItem(null); }} lists={config.lists} users={props.users} initialEntry={entryItem} onSubmit={async (payload) => { await saveEntry(payload); }} onDelete={isActive ? async (id) => { await deleteEntries([id]); } : undefined} />
      <ListsDialog key={JSON.stringify(config.lists)} open={listsOpen} onOpenChange={setListsOpen} lists={config.lists} onSave={async (lists) => { const nextConfig = { ...config, lists }; const response = await fetch(`/api/journal-documents/${props.documentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: nextConfig }) }); const result = await response.json().catch(() => null); if (!response.ok) throw new Error(result?.error || "Не удалось сохранить списки"); setConfig(nextConfig); router.refresh(); }} />
      <SettingsDialog key={`${title}-${dateFrom}-${status}`} open={settingsOpen} onOpenChange={setSettingsOpen} title={title} dateFrom={dateFrom} status={status} onSave={async (v) => { const response = await fetch(`/api/journal-documents/${props.documentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: v.title, dateFrom: v.dateFrom, status: v.status }) }); const result = await response.json().catch(() => null); if (!response.ok) throw new Error(result?.error || "Не удалось сохранить настройки"); setTitle(v.title); setDateFrom(v.dateFrom); setStatus(v.status); router.refresh(); }} />
    </div>
  );
}
