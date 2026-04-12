"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel } from "@/lib/user-roles";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  TRACEABILITY_DOCUMENT_TITLE,
  TRACEABILITY_IMPORT_COLUMNS,
  createTraceabilityRow,
  formatTraceabilityQuantity,
  normalizeTraceabilityDocumentConfig,
  normalizeTraceabilityRow,
  validateTraceabilityRow,
  type TraceabilityDocumentConfig,
  type TraceabilityRow,
} from "@/lib/traceability-document";

import { toast } from "sonner";
type PersonItem = { id: string; name: string; role?: string | null };
type TraceabilitySettingsDraft = { title: string; dateFrom: string; showShockTempField: boolean; showShipmentBlock: boolean };
type TraceabilityRowDraft = {
  id: string;
  date: string;
  incomingRawMaterialName: string;
  incomingBatchNumber: string;
  incomingPackagingDate: string;
  incomingQuantityPieces: string;
  incomingQuantityKg: string;
  outgoingProductName: string;
  outgoingQuantityPieces: string;
  outgoingQuantityKg: string;
  outgoingShockTemp: string;
  responsibleRole: string;
  responsibleEmployeeId: string;
  responsibleEmployee: string;
};
type TraceabilityImportError = { rowNumber: number; errors: string[] };

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig?: unknown;
  config?: unknown;
  routeCode?: string;
  users?: PersonItem[];
  employees?: PersonItem[];
};

const DEFAULT_TITLE = TRACEABILITY_DOCUMENT_TITLE;
const ROLE_OPTIONS = USER_ROLE_LABEL_VALUES;

function todayIso() { return new Date().toISOString().slice(0, 10); }
function normalizeIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayIso() : date.toISOString().slice(0, 10);
}
function formatDashDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${normalizeIsoDate(value)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${date.getUTCFullYear()}`;
}
function parseLooseNumber(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
function mergeUnique(base: string[], extra: string[]) { return uniqueStrings([...base, ...extra]); }

function defaultSettings(config: TraceabilityDocumentConfig, title: string, dateFrom: string): TraceabilitySettingsDraft {
  return {
    title: title || config.documentTitle || DEFAULT_TITLE,
    dateFrom: normalizeIsoDate(dateFrom || config.dateFrom || todayIso()),
    showShockTempField: config.showShockTempField,
    showShipmentBlock: config.showShipmentBlock,
  };
}
function defaultRow(config: TraceabilityDocumentConfig, dateFrom: string): TraceabilityRow {
  return createTraceabilityRow({
    date: dateFrom,
    incoming: { rawMaterialName: config.rawMaterialList[0] || "", batchNumber: "", packagingDate: dateFrom, quantityPieces: null, quantityKg: null },
    outgoing: { productName: config.productList[0] || "", quantityPacksPieces: null, quantityPacksKg: null, shockTemp: null },
    responsibleRole: config.defaultResponsibleRole || "",
    responsibleEmployeeId: config.defaultResponsibleEmployeeId || "",
    responsibleEmployee: config.defaultResponsibleEmployee || "",
  });
}
function rowToDraft(row: TraceabilityRow, config: TraceabilityDocumentConfig): TraceabilityRowDraft {
  return {
    id: row.id,
    date: normalizeIsoDate(row.date || config.dateFrom || todayIso()),
    incomingRawMaterialName: row.incoming.rawMaterialName || config.rawMaterialList[0] || "",
    incomingBatchNumber: row.incoming.batchNumber || "",
    incomingPackagingDate: normalizeIsoDate(row.incoming.packagingDate || config.dateFrom || todayIso()),
    incomingQuantityPieces: row.incoming.quantityPieces != null ? String(row.incoming.quantityPieces) : "",
    incomingQuantityKg: row.incoming.quantityKg != null ? String(row.incoming.quantityKg) : "",
    outgoingProductName: row.outgoing.productName || config.productList[0] || "",
    outgoingQuantityPieces: row.outgoing.quantityPacksPieces != null ? String(row.outgoing.quantityPacksPieces) : "",
    outgoingQuantityKg: row.outgoing.quantityPacksKg != null ? String(row.outgoing.quantityPacksKg) : "",
    outgoingShockTemp: row.outgoing.shockTemp != null ? String(row.outgoing.shockTemp) : "",
    responsibleRole: row.responsibleRole || config.defaultResponsibleRole || "",
    responsibleEmployeeId: row.responsibleEmployeeId || config.defaultResponsibleEmployeeId || "",
    responsibleEmployee: row.responsibleEmployee || config.defaultResponsibleEmployee || "",
  };
}
function draftToRow(draft: TraceabilityRowDraft) {
  return normalizeTraceabilityRow({
    id: draft.id,
    date: normalizeIsoDate(draft.date),
    incoming: {
      rawMaterialName: draft.incomingRawMaterialName,
      batchNumber: draft.incomingBatchNumber,
      packagingDate: normalizeIsoDate(draft.incomingPackagingDate),
      quantityPieces: parseLooseNumber(draft.incomingQuantityPieces),
      quantityKg: parseLooseNumber(draft.incomingQuantityKg),
    },
    outgoing: {
      productName: draft.outgoingProductName,
      quantityPacksPieces: parseLooseNumber(draft.outgoingQuantityPieces),
      quantityPacksKg: parseLooseNumber(draft.outgoingQuantityKg),
      shockTemp: parseLooseNumber(draft.outgoingShockTemp),
    },
    responsibleRole: draft.responsibleRole,
    responsibleEmployeeId: draft.responsibleEmployeeId,
    responsibleEmployee: draft.responsibleEmployee,
  });
}
function formatImportErrors(errors: TraceabilityImportError[]) {
  return errors.slice(0, 8).map((item) => `Строка ${item.rowNumber}: ${item.errors.join("; ")}`).join("\n");
}

function SettingsDialog(props: {
  open: boolean;
  title: string;
  initial: TraceabilitySettingsDraft | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: TraceabilitySettingsDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TraceabilitySettingsDraft | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (props.open) setDraft(props.initial); }, [props.initial, props.open]);
  async function save() {
    if (!draft) return;
    setLoading(true);
    try { await props.onSave(draft); props.onOpenChange(false); } finally { setLoading(false); }
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[700px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">{props.title}</DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button>
          </div>
        </DialogHeader>
        {draft && (
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2"><Label className="text-[18px] text-[#7a7c8e]">Название документа</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-16 rounded-3xl border-[#d8dae6] px-6 text-[20px]" /></div>
            <div className="space-y-2"><Label className="text-[18px] text-[#7a7c8e]">Дата начала</Label><div className="relative"><Input type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: normalizeIsoDate(e.target.value) })} className="h-16 rounded-3xl border-[#d8dae6] px-6 pr-14 text-[20px]" /><CalendarDays className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" /></div></div>
            <div className="space-y-4 rounded-[28px] border border-[#e3e5f0] px-5 py-5"><div className="text-[20px] font-medium tracking-[-0.02em] text-black">Добавить поле</div><div className="flex items-center justify-between gap-4 rounded-[24px] bg-[#f7f8fd] px-5 py-4"><Label className="text-[18px] leading-tight text-black">T °C продукта после шоковой заморозки</Label><Switch checked={draft.showShockTempField} onCheckedChange={(checked) => setDraft({ ...draft, showShockTempField: checked })} /></div></div>
            <div className="space-y-4 rounded-[28px] border border-[#e3e5f0] px-5 py-5"><div className="text-[20px] font-medium tracking-[-0.02em] text-black">Добавить блок</div><div className="flex items-center justify-between gap-4 rounded-[24px] bg-[#f7f8fd] px-5 py-4"><Label className="text-[18px] leading-tight text-black">Отгружено</Label><Switch checked={draft.showShipmentBlock} onCheckedChange={(checked) => setDraft({ ...draft, showShipmentBlock: checked })} /></div></div>
            <div className="flex justify-end pt-2"><Button type="button" onClick={save} disabled={loading} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4654ff]">{loading ? "Сохранение..." : "Сохранить"}</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function ListsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TraceabilityDocumentConfig;
  onSave: (nextConfig: TraceabilityDocumentConfig) => Promise<void>;
}) {
  const [rawMaterials, setRawMaterials] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [newRaw, setNewRaw] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setRawMaterials(props.config.rawMaterialList);
    setProducts(props.config.productList);
    setNewRaw("");
    setNewProduct("");
  }, [props.config.productList, props.config.rawMaterialList, props.open]);

  function update(list: "raw" | "product", index: number, value: string) {
    if (list === "raw") setRawMaterials((current) => current.map((item, i) => (i === index ? value : item)));
    else setProducts((current) => current.map((item, i) => (i === index ? value : item)));
  }

  function remove(list: "raw" | "product", index: number) {
    if (list === "raw") setRawMaterials((current) => current.filter((_, i) => i !== index));
    else setProducts((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setLoading(true);
    try {
      await props.onSave({ ...props.config, rawMaterialList: uniqueStrings(rawMaterials), productList: uniqueStrings(products) });
      props.onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[920px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">Редактировать списки</DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button>
          </div>
        </DialogHeader>

        <div className="grid gap-5 px-8 py-6 md:grid-cols-2">
          <section className="space-y-4 rounded-[24px] border border-[#e6e9f5] p-5">
            <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">Сырье</div>
            <div className="space-y-2">
              {rawMaterials.map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-2">
                  <Input value={item} onChange={(e) => update("raw", index, e.target.value)} className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]" />
                  <button type="button" className="rounded-xl p-2 text-[#6f7282] hover:bg-[#fff2f1] hover:text-[#ff3b30]" onClick={() => remove("raw", index)}><Trash2 className="size-5" /></button>
                </div>
              ))}
              {rawMaterials.length === 0 && <div className="rounded-2xl border border-dashed border-[#dfe1ec] px-4 py-4 text-[15px] text-[#7c7c93]">Список пуст</div>}
            </div>
            <div className="flex items-center gap-2"><Input value={newRaw} onChange={(e) => setNewRaw(e.target.value)} placeholder="Добавить новое сырье" className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]" /><Button type="button" onClick={() => { const v = newRaw.trim(); if (!v) return; setRawMaterials((current) => [...current, v]); setNewRaw(""); }} className="h-12 rounded-2xl bg-[#5563ff] px-4 text-white hover:bg-[#4654ff]"><Plus className="size-5" /></Button></div>
          </section>
          <section className="space-y-4 rounded-[24px] border border-[#e6e9f5] p-5">
            <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">Продукция</div>
            <div className="space-y-2">
              {products.map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-2">
                  <Input value={item} onChange={(e) => update("product", index, e.target.value)} className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]" />
                  <button type="button" className="rounded-xl p-2 text-[#6f7282] hover:bg-[#fff2f1] hover:text-[#ff3b30]" onClick={() => remove("product", index)}><Trash2 className="size-5" /></button>
                </div>
              ))}
              {products.length === 0 && <div className="rounded-2xl border border-dashed border-[#dfe1ec] px-4 py-4 text-[15px] text-[#7c7c93]">Список пуст</div>}
            </div>
            <div className="flex items-center gap-2"><Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Добавить новую продукцию" className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]" /><Button type="button" onClick={() => { const v = newProduct.trim(); if (!v) return; setProducts((current) => [...current, v]); setNewProduct(""); }} className="h-12 rounded-2xl bg-[#5563ff] px-4 text-white hover:bg-[#4654ff]"><Plus className="size-5" /></Button></div>
          </section>
        </div>

        <div className="flex justify-end px-8 pb-6"><Button type="button" onClick={save} disabled={loading} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4654ff]">{loading ? "Сохранение..." : "Сохранить"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TraceabilityDocumentConfig;
  employees: PersonItem[];
  initialRow: TraceabilityRow | null;
  dateFrom: string;
  onSave: (row: TraceabilityRow, additions: { rawMaterials: string[]; products: string[] }) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TraceabilityRowDraft | null>(null);
  const [rawOptions, setRawOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [newRaw, setNewRaw] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [createdRaw, setCreatedRaw] = useState<string[]>([]);
  const [createdProducts, setCreatedProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open) return;
    const base = props.initialRow ?? defaultRow(props.config, props.dateFrom);
    setDraft(rowToDraft(base, props.config));
    setRawOptions(props.config.rawMaterialList);
    setProductOptions(props.config.productList);
    setNewRaw("");
    setNewProduct("");
    setCreatedRaw([]);
    setCreatedProducts([]);
    setError("");
  }, [props.config, props.dateFrom, props.initialRow, props.open]);

  function setField<K extends keyof TraceabilityRowDraft>(key: K, value: TraceabilityRowDraft[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
  }

  function addCustom(list: "raw" | "product") {
    if (!draft) return;
    if (list === "raw") {
      const v = newRaw.trim();
      if (!v) return;
      setRawOptions((current) => mergeUnique(current, [v]));
      setCreatedRaw((current) => mergeUnique(current, [v]));
      setField("incomingRawMaterialName", v);
      setNewRaw("");
    } else {
      const v = newProduct.trim();
      if (!v) return;
      setProductOptions((current) => mergeUnique(current, [v]));
      setCreatedProducts((current) => mergeUnique(current, [v]));
      setField("outgoingProductName", v);
      setNewProduct("");
    }
  }

  async function save() {
    if (!draft) return;
    const row = draftToRow(draft);
    const issues = validateTraceabilityRow(row);
    if (issues.length > 0) {
      setError(issues.map((item) => item.message).join(" "));
      return;
    }
    setLoading(true);
    try {
      await props.onSave(row, { rawMaterials: createdRaw, products: createdProducts });
      props.onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  const employees = props.employees;
  const roleOptions = useMemo(() => (draft ? uniqueStrings([draft.responsibleRole, ...ROLE_OPTIONS]) : ROLE_OPTIONS), [draft]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[760px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">{props.initialRow ? "Редактирование строки" : "Добавление новой строки"}</DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button>
          </div>
        </DialogHeader>

        {draft && (
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2"><Label className="text-[16px] text-[#7a7c8e]">Дата</Label><div className="relative"><Input type="date" value={draft.date} onChange={(e) => setField("date", normalizeIsoDate(e.target.value))} className="h-14 rounded-2xl border-[#d8dae6] px-5 pr-14 text-[18px]" /><CalendarDays className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" /></div></div>

            <div className="space-y-3 rounded-[28px] border border-[#e3e5f0] px-4 py-4">
              <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">Поступило</div>
              <div className="space-y-2">
                <Label className="text-[15px] text-[#7a7c8e]">Наименование сырья</Label>
                <Select value={draft.incomingRawMaterialName || "__empty__"} onValueChange={(value) => setField("incomingRawMaterialName", value === "__empty__" ? "" : value)}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-white px-4 text-[18px]"><SelectValue placeholder="Выберите из списка или добавьте новое" /></SelectTrigger>
                  <SelectContent><SelectItem value="__empty__">- Выберите значение -</SelectItem>{rawOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2"><Input value={newRaw} onChange={(e) => setNewRaw(e.target.value)} placeholder="Добавить название нового сырья" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[16px]" /><Button type="button" onClick={() => addCustom("raw")} className="h-14 rounded-2xl bg-[#5563ff] px-4 text-white hover:bg-[#4654ff]"><Plus className="size-5" /></Button></div>
              </div>
              <div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Номер партии ПФ</Label><Input value={draft.incomingBatchNumber} onChange={(e) => setField("incomingBatchNumber", e.target.value)} placeholder="Введите номер партии ПФ" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div>
              <div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Дата фасовки</Label><div className="relative"><Input type="date" value={draft.incomingPackagingDate} onChange={(e) => setField("incomingPackagingDate", normalizeIsoDate(e.target.value))} className="h-14 rounded-2xl border-[#d8dae6] px-4 pr-14 text-[18px]" /><CalendarDays className="pointer-events-none absolute right-5 top-1/2 size-6 -translate-y-1/2 text-[#6e7080]" /></div></div>
              <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Кол-во, шт.</Label><Input value={draft.incomingQuantityPieces} onChange={(e) => setField("incomingQuantityPieces", e.target.value)} inputMode="decimal" placeholder="0" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div><div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Кол-во, кг.</Label><Input value={draft.incomingQuantityKg} onChange={(e) => setField("incomingQuantityKg", e.target.value)} inputMode="decimal" placeholder="0" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div></div>
            </div>

            <div className="space-y-3 rounded-[28px] border border-[#e3e5f0] px-4 py-4">
              <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">Выпущено</div>
              <div className="space-y-2">
                <Label className="text-[15px] text-[#7a7c8e]">Наименование ПФ</Label>
                <Select value={draft.outgoingProductName || "__empty__"} onValueChange={(value) => setField("outgoingProductName", value === "__empty__" ? "" : value)}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-white px-4 text-[18px]"><SelectValue placeholder="Выберите из списка или добавьте новое" /></SelectTrigger>
                  <SelectContent><SelectItem value="__empty__">- Выберите значение -</SelectItem>{productOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2"><Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Добавить название нового ПФ" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[16px]" /><Button type="button" onClick={() => addCustom("product")} className="h-14 rounded-2xl bg-[#5563ff] px-4 text-white hover:bg-[#4654ff]"><Plus className="size-5" /></Button></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Кол-во фасовок, шт.</Label><Input value={draft.outgoingQuantityPieces} onChange={(e) => setField("outgoingQuantityPieces", e.target.value)} inputMode="decimal" placeholder="0" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div><div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Кол-во фасовок, кг.</Label><Input value={draft.outgoingQuantityKg} onChange={(e) => setField("outgoingQuantityKg", e.target.value)} inputMode="decimal" placeholder="0" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div></div>
              {props.config.showShockTempField && <div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">T °C продукта после шоковой заморозки</Label><Input value={draft.outgoingShockTemp} onChange={(e) => setField("outgoingShockTemp", e.target.value)} inputMode="decimal" placeholder="0" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" /></div>}
            </div>

            <div className="space-y-2 rounded-[28px] border border-[#e3e5f0] px-4 py-4">
              <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">Ответственный</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Должность ответственного</Label><Select value={draft.responsibleRole || "__empty__"} onValueChange={(value) => setField("responsibleRole", value === "__empty__" ? "" : value)} disabled={employees.length > 0}><SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f3f4fb] px-4 text-[18px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger><SelectContent><SelectItem value="__empty__">- Выберите значение -</SelectItem>{roleOptions.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-[15px] text-[#7a7c8e]">Сотрудник</Label>{employees.length > 0 ? <Select value={draft.responsibleEmployeeId || "__empty__"} onValueChange={(value) => {
                  if (value === "__empty__") {
                    setField("responsibleEmployeeId", "");
                    setField("responsibleEmployee", "");
                    setField("responsibleRole", "");
                    return;
                  }
                  const employee = employees.find((item) => item.id === value);
                  setField("responsibleEmployeeId", value);
                  setField("responsibleEmployee", employee?.name || "");
                  setField("responsibleRole", employee ? getUserRoleLabel(employee.role) : draft.responsibleRole);
                }}><SelectTrigger className="h-14 rounded-2xl border-[#d8dae6] bg-[#f3f4fb] px-4 text-[18px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger><SelectContent><SelectItem value="__empty__">- Выберите значение -</SelectItem>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{buildStaffOptionLabel(employee)}</SelectItem>)}</SelectContent></Select> : <Input value={draft.responsibleEmployee} onChange={(e) => setField("responsibleEmployee", e.target.value)} placeholder="ФИО ответственного" className="h-14 rounded-2xl border-[#d8dae6] px-4 text-[18px]" />}</div>
              </div>
            </div>

            {error && <div className="rounded-[20px] border border-[#ffd7d3] bg-[#fff4f2] px-4 py-3 text-[15px] text-[#d2453d]">{error}</div>}
            <div className="flex justify-end pt-1"><Button type="button" onClick={save} disabled={loading} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4654ff]">{loading ? "Сохранение..." : "Сохранить"}</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function ImportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => Promise<{ importedCount: number; errors: TraceabilityImportError[] }>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (props.open) setFile(null); }, [props.open]);

  async function save() {
    if (!file) return;
    setLoading(true);
    try { await props.onImport(file); props.onOpenChange(false); } finally { setLoading(false); }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[760px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6"><div className="flex items-center justify-between gap-4"><DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">Добавление из Excel</DialogTitle><button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button></div></DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <div className="rounded-[24px] border border-[#e6e9f5] bg-[#fbfbff] px-5 py-4 text-[15px] leading-7 text-[#505469]"><p>Список должен быть в Excel-файле на первом листе и начинаться с первой строки.</p><p className="mt-3">Столбцы должны быть в фиксированном порядке:</p><ol className="mt-2 space-y-1 pl-5">{TRACEABILITY_IMPORT_COLUMNS.map((column, index) => <li key={column}>{index + 1}-й столбец - {column}</li>)}</ol></div>
          <div className="space-y-2"><Button type="button" variant="outline" className="h-12 rounded-2xl border-[#dfe1ec] px-4 text-[16px]" onClick={() => fileInputRef.current?.click()}><Upload className="size-4" />Выберите файл</Button><div className="text-[15px] text-[#7c7c93]">{file ? file.name : "Файл не выбран"}</div><input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} /></div>
          <div className="flex justify-end pt-2"><Button type="button" onClick={save} disabled={!file || loading} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4654ff]">{loading ? "Импорт..." : "Добавить"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; title: string; onFinish: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  async function finish() { setLoading(true); try { await props.onFinish(); props.onOpenChange(false); } finally { setLoading(false); } }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[640px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6"><div className="flex items-center justify-between gap-4"><DialogTitle className="text-[28px] font-semibold tracking-[-0.03em] text-black">Закончить журнал &quot;{props.title}&quot;</DialogTitle><button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button></div></DialogHeader>
        <div className="space-y-4 px-8 py-8"><div className="text-[17px] leading-7 text-[#505469]">Документ станет доступен только для чтения.</div><div className="flex justify-end"><Button type="button" onClick={finish} disabled={loading} className="h-14 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4654ff]">{loading ? "Сохранение..." : "Закончить"}</Button></div></div>
      </DialogContent>
    </Dialog>
  );
}

export function TraceabilityDocumentClient(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<TraceabilityDocumentConfig>(() =>
    normalizeTraceabilityDocumentConfig(props.initialConfig ?? props.config)
  );
  const [title, setTitle] = useState(props.title || DEFAULT_TITLE);
  const [dateFrom, setDateFrom] = useState(normalizeIsoDate(props.dateFrom || todayIso()));
  const [status, setStatus] = useState(props.status || "active");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TraceabilityRow | null>(null);
  const [saving, setSaving] = useState(false);

  const isClosed = status === "closed";
  const employees = props.employees ?? props.users ?? [];
  const organizationName = props.organizationName || 'ООО "Тест"';
  const allSelected = config.rows.length > 0 && selectedRowIds.length === config.rows.length;
  const headerSettings = useMemo(() => defaultSettings(config, title, dateFrom), [config, dateFrom, title]);
  const rowById = useMemo(() => new Map(config.rows.map((row) => [row.id, row])), [config.rows]);

  useEffect(() => {
    setConfig(normalizeTraceabilityDocumentConfig(props.initialConfig ?? props.config));
  }, [props.config, props.initialConfig]);
  useEffect(() => { setTitle(props.title || DEFAULT_TITLE); setDateFrom(normalizeIsoDate(props.dateFrom || todayIso())); }, [props.dateFrom, props.title]);
  useEffect(() => { setStatus(props.status || "active"); }, [props.status]);
  useEffect(() => { setSelectedRowIds((current) => current.filter((id) => config.rows.some((row) => row.id === id))); }, [config.rows]);

  async function patchDocument(payload: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || "Не удалось сохранить документ");
    return result;
  }

  async function persistConfig(nextConfig: TraceabilityDocumentConfig) {
    setSaving(true);
    try {
      await patchDocument({ title, dateFrom, config: nextConfig });
      setConfig(nextConfig);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(draft: TraceabilitySettingsDraft) {
    const nextTitle = draft.title.trim() || DEFAULT_TITLE;
    const nextDateFrom = normalizeIsoDate(draft.dateFrom);
    const nextConfig: TraceabilityDocumentConfig = { ...config, documentTitle: nextTitle, dateFrom: nextDateFrom, showShockTempField: draft.showShockTempField, showShipmentBlock: draft.showShipmentBlock };
    setSaving(true);
    try {
      await patchDocument({ title: nextTitle, dateFrom: nextDateFrom, config: nextConfig });
      setTitle(nextTitle);
      setDateFrom(nextDateFrom);
      setConfig(nextConfig);
      startTransition(() => router.refresh());
    } finally { setSaving(false); }
  }

  async function saveLists(nextConfig: TraceabilityDocumentConfig) {
    await persistConfig({ ...config, rawMaterialList: uniqueStrings(nextConfig.rawMaterialList), productList: uniqueStrings(nextConfig.productList) });
  }

  async function saveRow(row: TraceabilityRow, additions: { rawMaterials: string[]; products: string[] }) {
    const nextRows = rowById.has(row.id) ? config.rows.map((item) => (item.id === row.id ? row : item)) : [...config.rows, row];
    await persistConfig({ ...config, rows: nextRows, rawMaterialList: mergeUnique(config.rawMaterialList, additions.rawMaterials), productList: mergeUnique(config.productList, additions.products) });
    setEditingRow(null);
  }

  async function deleteSelected() {
    if (selectedRowIds.length === 0) return;
    if (!window.confirm(`Удалить выбранные строки (${selectedRowIds.length})?`)) return;
    setSelectedRowIds([]);
    await persistConfig({ ...config, rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)) });
  }

  async function finishJournal() {
    setSaving(true);
    try { await patchDocument({ status: "closed" }); setStatus("closed"); startTransition(() => router.refresh()); } finally { setSaving(false); }
  }

  async function importFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/journal-documents/${props.documentId}/traceability/import`, { method: "POST", body: formData });
    const result = (await response.json().catch(() => null)) as { rows?: unknown[]; errors?: TraceabilityImportError[]; error?: string } | null;
    if (!response.ok && !result?.error) throw new Error("Не удалось импортировать файл");
    const rows = Array.isArray(result?.rows) ? result.rows.map((item) => normalizeTraceabilityRow(item)) : [];
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    if (rows.length === 0 && errors.length > 0) throw new Error(formatImportErrors(errors) || "Импорт не выполнен");
    if (rows.length > 0) {
      await persistConfig({ ...config, rows: [...config.rows, ...rows], rawMaterialList: mergeUnique(config.rawMaterialList, rows.map((row) => row.incoming.rawMaterialName).filter(Boolean)), productList: mergeUnique(config.productList, rows.map((row) => row.outgoing.productName).filter(Boolean)) });
    }
    if (errors.length > 0) toast.error(`Импорт выполнен частично.\n\n${formatImportErrors(errors)}`);
    else toast.error(`Импортировано строк: ${rows.length}`);
    return { importedCount: rows.length, errors };
  }

  return (
    <div className="space-y-8 pb-8 text-black">
      {props.routeCode ? <div className="text-[13px] text-[#7c7c93] print:hidden"><Link href={`/journals/${props.routeCode}`} className="hover:underline">{organizationName}</Link>{" > "}<span>{DEFAULT_TITLE}</span>{" > "}<span>{title || DEFAULT_TITLE}</span></div> : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[44px] font-semibold tracking-[-0.04em] text-black lg:text-[62px]">{title || DEFAULT_TITLE}</h1>
          <div className="mt-3 flex items-center gap-3"><span className={cn("inline-flex rounded-full px-3 py-1 text-[13px] font-medium", isClosed ? "bg-[#fff2f1] text-[#d2453d]" : "bg-[#eef1ff] text-[#5563ff]")}>{isClosed ? "Закрыт" : "Активен"}</span><span className="text-[15px] text-[#7c7c93]">Начат {formatDashDate(dateFrom)}</span></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-black bg-white">
        <table className="w-full border-collapse text-[15px]"><tbody><tr><td rowSpan={2} className="w-[220px] border border-black px-4 py-4 text-center font-semibold">{organizationName}</td><td className="border border-black px-4 py-4 text-center text-[18px]">СИСТЕМА ХАССП</td><td rowSpan={2} className="w-[220px] border border-black px-4 py-3 align-top"><div className="space-y-2 text-[17px] font-semibold"><div>Начат {formatDashDate(dateFrom)}</div><div>Окончен ________</div></div><div className="mt-4 text-center text-[16px]">СТР. 1 ИЗ 1</div></td></tr><tr><td className="border border-black px-4 py-4 text-center italic">ЖУРНАЛ ПРОСЛЕЖИВАЕМОСТИ ПРОДУКЦИИ</td></tr></tbody></table>
      </div>

      <div className="space-y-4">
        <div className="text-center text-[22px] font-semibold tracking-[-0.03em]">ЖУРНАЛ ПРОСЛЕЖИВАЕМОСТИ ПРОДУКЦИИ</div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {!isClosed && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" disabled={saving || isPending} className="h-14 rounded-2xl bg-[#5563ff] px-6 text-[18px] font-medium text-white shadow-md shadow-[#5563ff]/20 hover:bg-[#4957fb]"><Plus className="size-6" />Добавить<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[280px] rounded-[22px] border-0 p-2 shadow-xl"><DropdownMenuItem className="h-12 rounded-2xl px-3 text-[16px] text-[#5563ff]" onSelect={(event) => { event.preventDefault(); setEditingRow(null); setRowOpen(true); }}><Plus className="mr-2 size-4" />Добавить</DropdownMenuItem><DropdownMenuItem className="h-12 rounded-2xl px-3 text-[16px] text-[#5563ff]" onSelect={(event) => { event.preventDefault(); setImportOpen(true); }}><Upload className="mr-2 size-4" />Добавить из файла</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          {!isClosed && <button type="button" onClick={() => setListsOpen(true)} className="rounded-2xl bg-[#f7f8fd] px-5 py-4 text-[18px] font-medium text-[#5563ff]">Редактировать списки</button>}
          <div className="flex-1" />
          {!isClosed && <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-2xl bg-[#f7f8fd] px-5 py-4 text-[18px] font-medium text-[#5563ff]">Настройки документа</button>}
          {!isClosed && <button type="button" onClick={() => setFinishOpen(true)} className="rounded-2xl bg-[#f7f8fd] px-5 py-4 text-[18px] font-medium text-[#5563ff]">Закончить журнал</button>}
        </div>

        {selectedRowIds.length > 0 && !isClosed && <div className="flex items-center gap-3 rounded-[18px] border border-[#e6e9f5] bg-[#fbfbff] px-4 py-3 print:hidden"><button type="button" className="text-[#7c7c93] hover:text-black" onClick={() => setSelectedRowIds([])}><X className="size-5" /></button><span className="text-[15px]">Выбрано: {selectedRowIds.length}</span><Button type="button" variant="outline" className="h-10 rounded-2xl border-[#ffd7d3] px-4 text-[15px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]" onClick={() => { deleteSelected().catch((error) => toast.error(error instanceof Error ? error.message : "Не удалось удалить строки")); }}><Trash2 className="size-4" />Удалить</Button></div>}

        <div className="max-w-full overflow-x-auto rounded-[18px] border border-[#1f1f1f] bg-white">
          <table className="min-w-[980px] w-full border-collapse text-[14px] sm:min-w-[1480px]">
            <thead>
              <tr className="bg-[#efefef]">
                {!isClosed && <th rowSpan={2} className="w-[44px] border border-black px-2 py-3 text-center"><Checkbox checked={allSelected} disabled={config.rows.length === 0} onCheckedChange={(checked) => setSelectedRowIds(checked === true ? config.rows.map((row) => row.id) : [])} /></th>}
                <th rowSpan={2} className="w-[140px] border border-black px-3 py-3 text-center font-semibold">Дата</th>
                <th colSpan={3} className="border border-black px-3 py-3 text-center font-semibold">Поступило в цех сырья</th>
                <th colSpan={config.showShockTempField ? 3 : 2} className="border border-black px-3 py-3 text-center font-semibold">Выпущено цехом</th>
                <th rowSpan={2} className="w-[210px] border border-black px-3 py-3 text-center font-semibold">ФИО ответственного</th>
              </tr>
              <tr className="bg-[#efefef]">
                <th className="border border-black px-3 py-3 text-center font-medium">Наименование сырья</th>
                <th className="border border-black px-3 py-3 text-center font-medium">Номер партии ПФ<br />Дата фасовки</th>
                <th className="w-[120px] border border-black px-3 py-3 text-center font-medium">Кол-во<br />шт./кг.</th>
                <th className="border border-black px-3 py-3 text-center font-medium">Наименование ПФ</th>
                <th className="w-[120px] border border-black px-3 py-3 text-center font-medium">Кол-во фасовок<br />шт./кг.</th>
                {config.showShockTempField && <th className="w-[140px] border border-black px-3 py-3 text-center font-medium">T °C<br />продукта после<br />шоковой<br />заморозки</th>}
              </tr>
            </thead>
            <tbody>
              {config.rows.length > 0 ? config.rows.map((row) => {
                const incomingQty = row.incoming.quantityKg ?? row.incoming.quantityPieces;
                const outgoingQty = row.outgoing.quantityPacksKg ?? row.outgoing.quantityPacksPieces;
                const selected = selectedRowIds.includes(row.id);
                return (
                  <tr key={row.id} className={cn("transition-colors", !isClosed && "cursor-pointer hover:bg-[#fafbff]", selected && "bg-[#eef1ff]")} onClick={() => { if (!isClosed) setEditingRow(row); if (!isClosed) setRowOpen(true); }}>
                    {!isClosed && <td className="border border-black px-2 py-3 text-center" onClick={(event) => event.stopPropagation()}><Checkbox checked={selected} onCheckedChange={(checked) => setSelectedRowIds((current) => checked === true ? uniqueStrings([...current, row.id]) : current.filter((id) => id !== row.id))} /></td>}
                    <td className="border border-black px-3 py-3 text-center">{formatDashDate(row.date)}</td>
                    <td className="border border-black px-3 py-3 text-center">{row.incoming.rawMaterialName || "—"}</td>
                    <td className="border border-black px-3 py-3 text-center whitespace-pre-line">{[row.incoming.batchNumber, formatDashDate(row.incoming.packagingDate)].filter(Boolean).join("\n") || "—"}</td>
                    <td className="border border-black px-3 py-3 text-center">{incomingQty != null ? formatTraceabilityQuantity(incomingQty) : "—"}</td>
                    <td className="border border-black px-3 py-3 text-center">{row.outgoing.productName || "—"}</td>
                    <td className="border border-black px-3 py-3 text-center">{outgoingQty != null ? formatTraceabilityQuantity(outgoingQty) : "—"}</td>
                    {config.showShockTempField && <td className="border border-black px-3 py-3 text-center">{row.outgoing.shockTemp != null ? formatTraceabilityQuantity(row.outgoing.shockTemp) : "—"}</td>}
                    <td className="border border-black px-3 py-3 text-center">{row.responsibleEmployee || "—"}</td>
                  </tr>
                );
              }) : <tr><td colSpan={isClosed ? 8 : config.showShockTempField ? 9 : 8} className="border border-black px-4 py-10 text-center text-[15px] text-[#7c7c93]">Строк пока нет</td></tr>}
            </tbody>
          </table>
        </div>

        {isClosed && <div className="rounded-[18px] border border-[#e6e9f5] bg-[#fbfbff] px-4 py-3 text-[15px] text-[#7c7c93] print:hidden">Журнал закрыт и доступен только для чтения.</div>}
      </div>

      <SettingsDialog open={settingsOpen} title="Настройки документа" initial={headerSettings} onOpenChange={setSettingsOpen} onSave={saveSettings} />
      <ListsDialog open={listsOpen} onOpenChange={setListsOpen} config={config} onSave={saveLists} />
      <RowDialog open={rowOpen} onOpenChange={(open) => { setRowOpen(open); if (!open) setEditingRow(null); }} config={config} employees={employees} initialRow={editingRow} dateFrom={dateFrom} onSave={saveRow} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={importFile} />
      <FinishDialog open={finishOpen} onOpenChange={setFinishOpen} title={title || DEFAULT_TITLE} onFinish={finishJournal} />
    </div>
  );
}

