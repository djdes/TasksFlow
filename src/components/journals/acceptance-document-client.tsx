"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarDays,
  ChevronDown,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import { Textarea } from "@/components/ui/textarea";
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
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  createAcceptanceRow,
  normalizeAcceptanceDocumentConfig,
  formatAcceptanceDateDash,
  getAcceptanceDocumentTitle,
  getAcceptancePageTitle,
  getExpiryFieldDisplayLabel,
  TRANSPORT_LABELS,
  COMPLIANCE_LABELS,
  ORGANOLEPTIC_LABELS,
  type AcceptanceDocumentConfig,
  type AcceptanceRow,
} from "@/lib/acceptance-document";
import { PositionSelectItems } from "@/components/shared/position-select";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";
import {
  RecordCardsView,
  type RecordCardItem,
} from "@/components/journals/record-cards-view";

type User = { id: string; name: string; role: string };

type Props = {
  documentId: string;
  routeCode: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  config: unknown;
  users: User[];
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const POSITION_OPTIONS = USER_ROLE_LABEL_VALUES;
function getResponsibleLabel(row: AcceptanceRow, users: User[]) {
  const user = users.find((u) => u.id === row.responsibleUserId);
  return user?.name || "";
}

function getErrorMessage(error: unknown, fallback = "Ошибка") {
  return error instanceof Error ? error.message : fallback;
}

function normalizeImportText(value: unknown) {
  return String(value ?? "").trim();
}

function parseImportDate(value: string) {
  const normalized = normalizeImportText(value);
  if (!normalized) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split(".");
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function parseImportTime(value: string) {
  const normalized = normalizeImportText(value);
  if (!normalized) return { hour: "", minute: "" };
  const parts = normalized.split(":");
  return {
    hour: parts[0]?.padStart(2, "0") || "",
    minute: parts[1]?.padStart(2, "0") || "",
  };
}

function parseImportBoolean(value: string) {
  const normalized = normalizeImportText(value).toLowerCase();
  if (!normalized) return true;
  return ["1", "да", "yes", "ok", "удовл.", "удовл", "соотв.", "соотв", "соответствует"].includes(normalized);
}

function parseListImportItems(rows: unknown[][]) {
  return rows
    .map((row) => normalizeImportText(Array.isArray(row) ? row[0] : ""))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function downloadAcceptanceImportTemplate() {
  const header =
    "Дата поступления;Время поступления;Наименование;Производитель;Поставщик;Условия транспортировки;Соответствие упаковки;Результаты орг. оценки;Предельный срок реализации, дата;Предельный срок реализации, время;Примечания";
  const sample =
    "11.04.2026;11:00;Гастрономия;ООО \"Агро-Юг\";ООО \"Метро\";1;1;1;11.04.2026;18:00;";
  const blob = new Blob([[header, sample].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "incoming-control-import-example.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/* ─── Row Dialog ─── */

function RowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
  config: AcceptanceDocumentConfig;
  initialRow: AcceptanceRow | null;
  onSave: (row: AcceptanceRow, addToLists: { products: string[]; manufacturers: string[]; suppliers: string[] }) => Promise<void>;
}) {
  const [row, setRow] = useState<AcceptanceRow>(() => createAcceptanceRow());
  const [newProduct, setNewProduct] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [manufacturerOptions, setManufacturerOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [addedProducts, setAddedProducts] = useState<string[]>([]);
  const [addedManufacturers, setAddedManufacturers] = useState<string[]>([]);
  const [addedSuppliers, setAddedSuppliers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setRow(
      props.initialRow ||
        createAcceptanceRow({
          responsibleUserId: props.config.defaultResponsibleUserId || "",
          responsibleTitle: props.config.defaultResponsibleTitle || "",
          deliveryDate: new Date().toISOString().slice(0, 10),
        })
    );
    setNewProduct("");
    setNewManufacturer("");
    setNewSupplier("");
    setProductOptions(props.config.products);
    setManufacturerOptions(props.config.manufacturers);
    setSupplierOptions(props.config.suppliers);
    setAddedProducts([]);
    setAddedManufacturers([]);
    setAddedSuppliers([]);
  }, [
    props.config.defaultResponsibleUserId,
    props.config.defaultResponsibleTitle,
    props.config.manufacturers,
    props.config.products,
    props.config.suppliers,
    props.initialRow,
    props.open,
  ]);

  function setValue<K extends keyof AcceptanceRow>(key: K, value: AcceptanceRow[K]) {
    setRow((current) => ({ ...current, [key]: value }));
  }

  function appendUnique(list: string[], value: string) {
    const normalized = value.trim();
    if (!normalized) return list;
    if (list.some((item) => item.toLowerCase() === normalized.toLowerCase())) return list;
    return [...list, normalized];
  }

  function addInlineOption(kind: "product" | "manufacturer" | "supplier") {
    if (kind === "product") {
      const value = newProduct.trim();
      if (!value) return;
      setProductOptions((current) => appendUnique(current, value));
      setAddedProducts((current) => appendUnique(current, value));
      setValue("productName", value);
      setNewProduct("");
      return;
    }

    if (kind === "manufacturer") {
      const value = newManufacturer.trim();
      if (!value) return;
      setManufacturerOptions((current) => appendUnique(current, value));
      setAddedManufacturers((current) => appendUnique(current, value));
      setValue("manufacturer", value);
      setNewManufacturer("");
      return;
    }

    const value = newSupplier.trim();
    if (!value) return;
    setSupplierOptions((current) => appendUnique(current, value));
    setAddedSuppliers((current) => appendUnique(current, value));
    setValue("supplier", value);
    setNewSupplier("");
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      const newProducts = appendUnique(addedProducts, newProduct.trim());
      const newManufacturers = appendUnique(addedManufacturers, newManufacturer.trim());
      const newSuppliers = appendUnique(addedSuppliers, newSupplier.trim());
      // If user typed new product but didn't select, use it
      const finalRow = { ...row };
      if (newProduct.trim() && !finalRow.productName) finalRow.productName = newProduct.trim();
      if (newManufacturer.trim() && !finalRow.manufacturer) finalRow.manufacturer = newManufacturer.trim();
      if (newSupplier.trim() && !finalRow.supplier) finalRow.supplier = newSupplier.trim();
      await props.onSave(finalRow, { products: newProducts, manufacturers: newManufacturers, suppliers: newSuppliers });
      props.onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEdit = !!props.initialRow;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-semibold text-black">
            {isEdit ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
          <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => props.onOpenChange(false)}>
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          {/* Дата и время поставки */}
          <fieldset className="space-y-3 rounded-2xl border border-[#dfe1ec] p-4">
            <legend className="px-2 text-[14px] text-[#6f7282]">Дата и время поставки</legend>
            <div className="space-y-1">
              <Label className="text-[14px] text-[#6f7282]">Дата поставки</Label>
              <Input type="date" value={row.deliveryDate} onChange={(e) => setValue("deliveryDate", e.target.value)} className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                <Select value={row.deliveryHour || "--"} onValueChange={(v) => setValue("deliveryHour", v === "--" ? "" : v)}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="--">--</SelectItem>
                    {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                <Select value={row.deliveryMinute || "--"} onValueChange={(v) => setValue("deliveryMinute", v === "--" ? "" : v)}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="--">--</SelectItem>
                    {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          <>
              {/* Наименование продукции */}
              <div className="space-y-2">
                <Label className="font-semibold">Наименование продукции</Label>
                {productOptions.map((item) => (
                  <label key={item} className="flex items-center gap-3 text-[15px]">
                    <input type="radio" name="product" checked={row.productName === item} onChange={() => setValue("productName", item)} className="size-4 accent-[#5863f8]" />
                    {item}
                  </label>
                ))}
                <div className="flex gap-2">
                  <Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Добавить название новой продукции" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
                  <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addInlineOption("product")}>
                    <Plus className="size-5" />
                  </Button>
                </div>
              </div>

              {/* Производитель */}
              <div className="space-y-2">
                <Label className="font-semibold">Производитель</Label>
                <Select value={row.manufacturer} onValueChange={(v) => setValue("manufacturer", v)}>
                  <SelectTrigger className="h-12 rounded-xl border-[#dfe1ec] text-[15px]"><SelectValue placeholder="Выберите из списка или добавьте нового" /></SelectTrigger>
                  <SelectContent>
                    {manufacturerOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input value={newManufacturer} onChange={(e) => setNewManufacturer(e.target.value)} placeholder="Добавить название нового производителя" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
                  <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addInlineOption("manufacturer")}>
                    <Plus className="size-5" />
                  </Button>
                </div>
              </div>

              {/* Поставщик */}
              <div className="space-y-2">
                <Label className="font-semibold">Поставщик</Label>
                <Select value={row.supplier} onValueChange={(v) => setValue("supplier", v)}>
                  <SelectTrigger className="h-12 rounded-xl border-[#dfe1ec] text-[15px]"><SelectValue placeholder="Выберите из списка или добавьте нового" /></SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Добавить название нового поставщика" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
                  <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addInlineOption("supplier")}>
                    <Plus className="size-5" />
                  </Button>
                </div>
              </div>

              {/* Условия транспортировки */}
              <div className="space-y-2">
                <Label className="font-semibold">Условия транспортировки</Label>
                <div className="flex gap-6 text-[15px]">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="transport" checked={row.transportCondition === "satisfactory"} onChange={() => setValue("transportCondition", "satisfactory")} className="size-4 accent-[#5863f8]" />
                    Удовл.
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="transport" checked={row.transportCondition === "unsatisfactory"} onChange={() => setValue("transportCondition", "unsatisfactory")} className="size-4 accent-[#5863f8]" />
                    Не удовл.
                  </label>
                </div>
              </div>

              {/* Соответствие упаковки */}
              <div className="space-y-2">
                <Label className="font-semibold">Соответствие упаковки</Label>
                <div className="flex gap-6 text-[15px]">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="packaging" checked={row.packagingCompliance === "compliant"} onChange={() => setValue("packagingCompliance", "compliant")} className="size-4 accent-[#5863f8]" />
                    Соотв.
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="packaging" checked={row.packagingCompliance === "non_compliant"} onChange={() => setValue("packagingCompliance", "non_compliant")} className="size-4 accent-[#5863f8]" />
                    Не соотв.
                  </label>
                </div>
              </div>

              {/* Результаты орг. оценки */}
              <div className="space-y-2">
                <Label className="font-semibold">Результаты орг. оценки</Label>
                <div className="flex gap-6 text-[15px]">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="organoleptic" checked={row.organolepticResult === "satisfactory"} onChange={() => setValue("organolepticResult", "satisfactory")} className="size-4 accent-[#5863f8]" />
                    Удовл.
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="organoleptic" checked={row.organolepticResult === "unsatisfactory"} onChange={() => setValue("organolepticResult", "unsatisfactory")} className="size-4 accent-[#5863f8]" />
                    Не удовл.
                  </label>
                </div>
              </div>

              {/* Предельный срок реализации */}
              <fieldset className="space-y-3 rounded-2xl border border-[#dfe1ec] p-4">
                <legend className="px-2 text-[14px] font-semibold">{getExpiryFieldDisplayLabel(props.config.expiryFieldLabel)}</legend>
                <div className="space-y-1">
                  <Label className="text-[14px] text-[#6f7282]">Годен до</Label>
                  <Input type="date" value={row.expiryDate} onChange={(e) => setValue("expiryDate", e.target.value)} className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                    <Select value={row.expiryHour || "--"} onValueChange={(v) => setValue("expiryHour", v === "--" ? "" : v)}>
                      <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="--">--</SelectItem>
                        {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                    <Select value={row.expiryMinute || "--"} onValueChange={(v) => setValue("expiryMinute", v === "--" ? "" : v)}>
                      <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        <SelectItem value="--">--</SelectItem>
                        {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* Примечание */}
              <Textarea value={row.note} onChange={(e) => setValue("note", e.target.value)} placeholder="Примечание" rows={3} className="rounded-2xl border-[#dfe1ec] px-5 py-4 text-[15px]" />

              {/* Должность ответственного */}
              <div className="space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Должность ответственного</Label>
                <Select value={row.responsibleTitle} onValueChange={(v) => {
                  const candidates = getUsersForRoleLabel(props.users, v);
                  const stillValid = candidates.some((u) => u.id === row.responsibleUserId);
                  setValue("responsibleTitle", v);
                  if (!stillValid) setValue("responsibleUserId", "");
                }}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                  <SelectContent>
                    <PositionSelectItems users={props.users} />
                  </SelectContent>
                </Select>
              </div>

              {/* Сотрудник */}
              <div className="space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Сотрудник</Label>
                <Select value={row.responsibleUserId} onValueChange={(v) => {
                  setValue("responsibleUserId", v);
                  if (!row.responsibleTitle) {
                    const user = props.users.find((u) => u.id === v);
                    if (user) setValue("responsibleTitle", getUserRoleLabel(user.role));
                  }
                }}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                  <SelectContent>
                    {(row.responsibleTitle ? getUsersForRoleLabel(props.users, row.responsibleTitle) : props.users).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
          </>

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleSave} disabled={isSubmitting} className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]">
              {isSubmitting ? "Сохранение..." : isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Lists Dialog ─── */

function EditListsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AcceptanceDocumentConfig;
  setConfig: (config: AcceptanceDocumentConfig) => void;
}) {
  const [products, setProducts] = useState<string[]>([...props.config.products]);
  const [manufacturers, setManufacturers] = useState<string[]>([
    ...props.config.manufacturers,
  ]);
  const [suppliers, setSuppliers] = useState<string[]>([...props.config.suppliers]);
  const [newProduct, setNewProduct] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newSupplier, setNewSupplier] = useState("");

  function addItem(list: string[], setList: (l: string[]) => void, value: string, setInput: (v: string) => void) {
    const v = value.trim();
    if (!v || list.includes(v)) return;
    setList([...list, v]);
    setInput("");
  }

  function removeItem(list: string[], setList: (l: string[]) => void, value: string) {
    setList(list.filter((item) => item !== value));
  }

  function handleClose() {
    props.setConfig({ ...props.config, products, manufacturers, suppliers });
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) handleClose(); else props.onOpenChange(true); }}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-semibold text-black">Редактировать список</DialogTitle>
          <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={handleClose}><X className="size-6" /></button>
        </DialogHeader>
        <div className="space-y-6 px-8 py-6">
          {/* Продукция */}
          <div className="space-y-2">
            <div className="text-[16px] font-semibold">Продукция</div>
            {products.map((item) => (
              <div key={item} className="flex items-center justify-between rounded-xl bg-[#f9f9fc] px-4 py-2">
                <span className="text-[15px]">{item}</span>
                <button type="button" onClick={() => removeItem(products, setProducts, item)} className="text-[#999] hover:text-red-500"><Pencil className="size-4" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Введите название нового изделия" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
              <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addItem(products, setProducts, newProduct, setNewProduct)}><Plus className="size-5" /></Button>
            </div>
          </div>

          {/* Производители */}
          <div className="space-y-2">
            <div className="text-[16px] font-semibold">Производители</div>
            {manufacturers.map((item) => (
              <div key={item} className="flex items-center justify-between rounded-xl bg-[#f9f9fc] px-4 py-2">
                <span className="text-[15px]">{item}</span>
                <button type="button" onClick={() => removeItem(manufacturers, setManufacturers, item)} className="text-[#999] hover:text-red-500"><Pencil className="size-4" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newManufacturer} onChange={(e) => setNewManufacturer(e.target.value)} placeholder="Введите название нового производителя" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
              <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addItem(manufacturers, setManufacturers, newManufacturer, setNewManufacturer)}><Plus className="size-5" /></Button>
            </div>
          </div>

          {/* Поставщики */}
          <div className="space-y-2">
            <div className="text-[16px] font-semibold">Поставщики</div>
            {suppliers.map((item) => (
              <div key={item} className="flex items-center justify-between rounded-xl bg-[#f9f9fc] px-4 py-2">
                <span className="text-[15px]">{item}</span>
                <button type="button" onClick={() => removeItem(suppliers, setSuppliers, item)} className="text-[#999] hover:text-red-500"><Pencil className="size-4" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Введите название нового поставщика" className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]" />
              <Button type="button" className="h-12 rounded-xl bg-[#5863f8] px-4" onClick={() => addItem(suppliers, setSuppliers, newSupplier, setNewSupplier)}><Plus className="size-5" /></Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleClose} className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]">Закрыть</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Settings Dialog ─── */

function EditableListSection(props: {
  title: string;
  items: string[];
  placeholder: string;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function upsertValue(nextValue: string) {
    const trimmed = nextValue.trim();
    if (!trimmed) return;
    const withoutEdited = editingValue
      ? props.items.filter((item) => item !== editingValue)
      : props.items;
    if (withoutEdited.includes(trimmed)) {
      setDraft("");
      setEditingValue(null);
      return;
    }
    props.onChange([...withoutEdited, trimmed]);
    setDraft("");
    setEditingValue(null);
  }

  async function handleImport(file: File) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Файл не содержит листов");
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const importedItems = parseListImportItems(rawRows);
    if (importedItems.length === 0) {
      throw new Error("Не удалось найти значения в первом столбце первого листа");
    }
    props.onChange(
      [...props.items, ...importedItems].filter(
        (value, index, list) => list.indexOf(value) === index
      )
    );
    setImportOpen(false);
    setImportError(null);
  }

  return (
    <div className="space-y-3">
      <div className="text-[16px] font-semibold">{props.title}</div>
      {props.items.map((item) => (
        <div
          key={item}
          className="flex items-center justify-between rounded-xl bg-[#f9f9fc] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Checkbox checked={false} className="pointer-events-none size-5 rounded-md" />
            <span className="text-[15px]">{item}</span>
          </div>
          <button
            type="button"
            className="text-[#5566f6] hover:text-[#4b57f3]"
            onClick={() => {
              setDraft(item);
              setEditingValue(item);
            }}
          >
            <Pencil className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={props.placeholder}
          className="h-12 rounded-xl border-[#dfe1ec] px-4 text-[15px]"
        />
        <Button
          type="button"
          className="h-12 rounded-xl bg-[#5863f8] px-4"
          onClick={() => upsertValue(draft)}
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <button
        type="button"
        className="text-left text-[15px] text-[#5863f8] underline underline-offset-4"
        onClick={() => {
          setImportOpen((current) => !current);
          setImportError(null);
        }}
      >
        Добавить из файла
      </button>
      {importOpen && (
        <div className="space-y-3 rounded-2xl border border-[#e3e5ef] bg-white p-4">
          <div className="text-[14px] leading-6 text-[#3d4152]">
            Список должен быть в файле Excel, на первом листе в первом столбце и
            начинаться с первой строки.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file).catch((error) =>
                setImportError(getErrorMessage(error, "Ошибка импорта"))
              );
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void handleImport(file).catch((error) =>
                  setImportError(getErrorMessage(error, "Ошибка импорта"))
                );
              }
            }}
            className={`flex min-h-[148px] w-full flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed px-6 py-8 text-center ${
              dragActive ? "border-[#5863f8] bg-[#f6f7ff]" : "border-[#d7d9e5] bg-white"
            }`}
          >
            <Paperclip className="size-8 text-[#6f7282]" />
            <span className="text-[18px] text-[#5863f8]">Выберите файл</span>
            <span className="text-[16px] text-[#3d4152]">или перетащите его сюда</span>
          </button>
          {importError ? (
            <div className="rounded-xl bg-[#fff2f1] px-4 py-3 text-[14px] text-[#d43a2f]">
              {importError}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IncomingControlEditListsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AcceptanceDocumentConfig;
  setConfig: (config: AcceptanceDocumentConfig) => void;
}) {
  const [products, setProducts] = useState<string[]>(() => [...props.config.products]);
  const [manufacturers, setManufacturers] = useState<string[]>(() => [...props.config.manufacturers]);
  const [suppliers, setSuppliers] = useState<string[]>(() => [...props.config.suppliers]);

  function handleClose() {
    props.setConfig({ ...props.config, products, manufacturers, suppliers });
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) handleClose(); else props.onOpenChange(true); }}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[900px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-semibold text-black">Редактировать список изделий</DialogTitle>
          <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={handleClose}><X className="size-6" /></button>
        </DialogHeader>
        <div className="space-y-6 px-8 py-6">
          <EditableListSection
            title="Продукция"
            items={products}
            placeholder="Введите название новой продукции"
            onChange={setProducts}
          />
          <EditableListSection
            title="Производители"
            items={manufacturers}
            placeholder="Введите название нового производителя"
            onChange={setManufacturers}
          />
          <EditableListSection
            title="Поставщики"
            items={suppliers}
            placeholder="Введите название нового поставщика"
            onChange={setSuppliers}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose} className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]">
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dateFrom: string;
  users: User[];
  config: AcceptanceDocumentConfig;
  onSave: (params: { title: string; dateFrom: string; config: AcceptanceDocumentConfig }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [expiryLabel, setExpiryLabel] = useState(props.config.expiryFieldLabel);
  const [responsibleTitle, setResponsibleTitle] = useState(props.config.defaultResponsibleTitle || "");
  const [responsibleUserId, setResponsibleUserId] = useState(props.config.defaultResponsibleUserId || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.title);
    setDateFrom(props.dateFrom);
    setExpiryLabel(props.config.expiryFieldLabel);
    setResponsibleTitle(props.config.defaultResponsibleTitle || "");
    setResponsibleUserId(props.config.defaultResponsibleUserId || "");
  }, [props.open, props.title, props.dateFrom, props.config]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await props.onSave({
        title: title.trim(),
        dateFrom,
        config: {
          ...props.config,
          expiryFieldLabel: expiryLabel,
          defaultResponsibleTitle: responsibleTitle || null,
          defaultResponsibleUserId: responsibleUserId || null,
        },
      });
      props.onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-semibold text-black">Настройки документа</DialogTitle>
          <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => props.onOpenChange(false)}><X className="size-6" /></button>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-1">
            <Label className="text-[14px] text-[#6f7282]">Название документа</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[14px] text-[#6f7282]">Дата начала</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]" />
          </div>
          <div className="space-y-2">
            <div className="text-[14px] font-semibold">Название поля</div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="radio" name="expiryLabel" checked={expiryLabel === "expiry_deadline"} onChange={() => setExpiryLabel("expiry_deadline")} className="size-4 accent-[#5863f8]" />
              &quot;Предельный срок реализации&quot;
            </label>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="radio" name="expiryLabel" checked={expiryLabel === "shelf_life"} onChange={() => setExpiryLabel("shelf_life")} className="size-4 accent-[#5863f8]" />
              &quot;Срок годности&quot;
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-[14px] text-[#6f7282]">Должность ответственного</Label>
            <Select value={responsibleTitle} onValueChange={(v) => {
              const candidates = getUsersForRoleLabel(props.users, v);
              const stillValid = candidates.some((u) => u.id === responsibleUserId);
              setResponsibleTitle(v);
              if (!stillValid) setResponsibleUserId("");
            }}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={props.users} />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[14px] text-[#6f7282]">Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={(v) => {
              setResponsibleUserId(v);
              if (!responsibleTitle) {
                const user = props.users.find((u) => u.id === v);
                if (user) setResponsibleTitle(getUserRoleLabel(user.role));
              }
            }}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[16px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
              <SelectContent>
                {(responsibleTitle ? getUsersForRoleLabel(props.users, responsibleTitle) : props.users).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleSave} disabled={isSubmitting} className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]">
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  actionLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) setSubmitting(false);
  }, [props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[640px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="pr-10 text-[24px] font-semibold text-black">
            {props.title}
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="flex justify-end px-8 py-6">
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await props.onConfirm();
                props.onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
          >
            {submitting ? "Сохранение..." : props.actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportRowsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsibleTitle: string;
  responsibleUserId: string;
  users: User[];
  onFileSelect: (file: File) => Promise<void>;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setDragActive(false);
    setSubmitting(false);
    setErrorMessage(null);
  }, [props.open]);

  async function handleFile(file: File) {
    setSubmitting(true);
    try {
      setErrorMessage(null);
      await props.onFileSelect(file);
      props.onOpenChange(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Ошибка импорта"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="pr-10 text-[24px] font-semibold text-black">
            Добавление списка изделий из файла в формате Excel
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6 text-[16px] text-black">
          <div className="space-y-3 leading-7 text-[#333]">
            <p>Список должен быть в файле Excel, на первом листе и начинаться с первой строки.</p>
            <p>Столбцы должны быть в следующем формате:</p>
            <div className="space-y-1">
              <div>1-й столбец - дата поступления (не может быть пустым или строкой)</div>
              <div>2-й столбец - время поступления</div>
              <div>3-й столбец - наименование (не может быть пустым)</div>
              <div>4-й столбец - производитель</div>
              <div>5-й столбец - поставщик (не может быть пустым)</div>
              <div>6-й столбец - условия транспортировки (0 - Не удовл., 1 - Удовл.)</div>
              <div>7-й столбец - соответствие упаковки (0 - Не соотв., 1 - Соотв.)</div>
              <div>8-й столбец - результаты орг. оценки (0 - Не удовл., 1 - Удовл.)</div>
              <div>9-й столбец - предельный срок реализации, дата</div>
              <div>10-й столбец - предельный срок реализации, время</div>
              <div>11-й столбец - примечания</div>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadAcceptanceImportTemplate}
            className="text-[16px] text-[#5863f8] underline underline-offset-4"
          >
            Скачать пример файла
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={`flex min-h-[200px] w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed px-6 py-8 text-center ${
              dragActive ? "border-[#5863f8] bg-[#f6f7ff]" : "border-[#d7d9e5] bg-white"
            }`}
          >
            <Paperclip className="size-10 text-[#6f7282]" />
            <span className="text-[15px] text-[#5863f8]">Выберите файл</span>
            <span className="text-[18px] text-[#3d4152]">или перетащите его сюда</span>
          </button>
          {errorMessage ? (
            <div className="whitespace-pre-line rounded-xl bg-[#fff2f1] px-4 py-3 text-[14px] text-[#d43a2f]">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-3">
            <Label className="text-[14px] text-[#6f7282]">Должность ответственного</Label>
            <div className="flex h-14 items-center rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
              {props.responsibleTitle || "—"}
            </div>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#6f7282]">Сотрудник</Label>
            <div className="flex h-14 items-center rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
              {props.users.find((user) => user.id === props.responsibleUserId)?.name || "—"}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={() => inputRef.current?.click()}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Добавление..." : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── iiko Dialog ─── */

function AddMultipleRowsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (count: number) => Promise<void>;
}) {
  const [count, setCount] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setCount("5");
    setSubmitting(false);
    setErrorMessage(null);
  }, [props.open]);

  async function handleSubmit() {
    const parsed = Number(count);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
      setErrorMessage("Укажите количество строк от 1 до 100.");
      return;
    }

    setSubmitting(true);
    try {
      await props.onSubmit(parsed);
      props.onOpenChange(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Ошибка добавления строк"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="pr-10 text-[24px] font-semibold text-black">
            Добавить несколько строк
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[14px] text-[#6f7282]">Количество строк</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>
          {errorMessage ? (
            <div className="rounded-xl bg-[#fff2f1] px-4 py-3 text-[14px] text-[#d43a2f]">
              {errorMessage}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Добавление..." : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IikoDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-6">
          <DialogTitle className="text-[20px] font-semibold text-black">Добавление списка из Iiko (Приходные накладные)</DialogTitle>
          <button type="button" className="rounded-md p-1 text-black/80 hover:bg-black/5" onClick={() => props.onOpenChange(false)}><X className="size-6" /></button>
        </DialogHeader>
        <div className="px-8 py-6 text-[15px] text-[#555]">
          Для настройки синхронизации с Iiko обратитесь к разработчикам сервиса Haccp-Online.
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Component ─── */

export function AcceptanceDocumentClient(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState(() => normalizeAcceptanceDocumentConfig(props.config, props.users));
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [sortByExpiry, setSortByExpiry] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editListsOpen, setEditListsOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AcceptanceRow | null>(null);
  const [iikoOpen, setIikoOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [rowsImportOpen, setRowsImportOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => { setConfig(normalizeAcceptanceDocumentConfig(props.config, props.users)); }, [props.config, props.users]);
  useEffect(() => { setTitle(props.title); setDateFrom(props.dateFrom); }, [props.dateFrom, props.title]);

  const rows = config.rows;
  const routeCode = props.routeCode;
  const isProductAcceptance = routeCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE;
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;
  const isClosed = props.status === "closed";
  const responsibleTitle = config.defaultResponsibleTitle || "";
  const responsibleUserId = config.defaultResponsibleUserId || "";
  const displayedRows = useMemo(() => {
    if (!sortByExpiry) return rows;
    return [...rows].sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || ""));
  }, [rows, sortByExpiry]);
  const { mobileView, switchMobileView } = useMobileView(routeCode);

  const cardItems: RecordCardItem[] = displayedRows.map((row, index) => ({
    id: row.id,
    title: `№${index + 1} · ${row.productName || "—"}`,
    subtitle:
      [
        formatAcceptanceDateDash(row.deliveryDate),
        row.deliveryHour ? `${row.deliveryHour}:${row.deliveryMinute || "00"}` : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    leading: !isClosed ? (
      <Checkbox
        checked={selectedRowIds.includes(row.id)}
        onCheckedChange={(c) =>
          setSelectedRowIds((cur) =>
            c === true
              ? [...new Set([...cur, row.id])]
              : cur.filter((id) => id !== row.id)
          )
        }
        className="size-5"
      />
    ) : null,
    fields: [
      { label: "Производитель", value: row.manufacturer, hideIfEmpty: true },
      { label: "Поставщик", value: row.supplier, hideIfEmpty: true },
      {
        label: "Транспортировка",
        value: TRANSPORT_LABELS[row.transportCondition],
        hideIfEmpty: true,
      },
      {
        label: "Упаковка/маркировка",
        value: COMPLIANCE_LABELS[row.packagingCompliance],
        hideIfEmpty: true,
      },
      {
        label: "Органолептика",
        value: ORGANOLEPTIC_LABELS[row.organolepticResult],
        hideIfEmpty: true,
      },
      {
        label: getExpiryFieldDisplayLabel(config.expiryFieldLabel),
        value: `${formatAcceptanceDateDash(row.expiryDate)}${row.expiryHour ? ` ${row.expiryHour}:${row.expiryMinute || "00"}` : ""}`,
        hideIfEmpty: true,
      },
      { label: "Примечания", value: row.note, hideIfEmpty: true },
      {
        label: "Ответственный",
        value: getResponsibleLabel(row, props.users),
        hideIfEmpty: true,
      },
    ],
    onClick: !isClosed
      ? () => {
          setEditingRow(row);
          setRowDialogOpen(true);
        }
      : undefined,
  }));

  async function persist(nextTitle: string, nextDateFrom: string, nextConfig: AcceptanceDocumentConfig) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle, dateFrom: nextDateFrom, config: nextConfig }),
    });
    if (!response.ok) throw new Error("Не удалось сохранить документ");
    setErrorMessage(null);
    setTitle(nextTitle);
    setDateFrom(nextDateFrom);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: AcceptanceRow, addToLists: { products: string[]; manufacturers: string[]; suppliers: string[] }) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];
    const nextProducts = [...new Set([...config.products, ...addToLists.products])];
    const nextManufacturers = [...new Set([...config.manufacturers, ...addToLists.manufacturers])];
    const nextSuppliers = [...new Set([...config.suppliers, ...addToLists.suppliers])];
    await persist(title, dateFrom, { ...config, rows: nextRows, products: nextProducts, manufacturers: nextManufacturers, suppliers: nextSuppliers });
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    await persist(title, dateFrom, { ...config, rows: config.rows.filter((r) => !selectedRowIds.includes(r.id)) });
    setSelectedRowIds([]);
    setDeleteSelectedOpen(false);
  }

  async function handleCloseJournal() {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!response.ok) throw new Error("Не удалось закончить журнал");
    setErrorMessage(null);
    setFinishOpen(false);
    startTransition(() => router.refresh());
  }

  async function addMultipleRows(count: number) {
    const nextRows = [...config.rows];
    for (let i = 0; i < Math.min(count, 100); i++) {
      nextRows.push(createAcceptanceRow({ responsibleUserId, responsibleTitle }));
    }
    await persist(title, dateFrom, { ...config, rows: nextRows });
    setBulkAddOpen(false);
  }

  async function handleImportFile(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return;
    const normalizedRows = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false })
      .filter((row) => Array.isArray(row))
      .map((row) => row.map((cell) => normalizeImportText(cell)));
    if (normalizedRows.length === 0) return;

    const hasHeader = (normalizedRows[0] ?? []).some((cell) => {
      const value = cell.toLowerCase();
      return value.includes("дата") || value.includes("наименование") || value.includes("поставщик");
    });
    const dataRows = (hasHeader ? normalizedRows.slice(1) : normalizedRows).filter((row) =>
      row.some((cell) => normalizeImportText(cell))
    );
    if (dataRows.length === 0) return;

    const errors: string[] = [];
    const productsToAdd: string[] = [];
    const manufacturersToAdd: string[] = [];
    const suppliersToAdd: string[] = [];
    const imported = dataRows.flatMap((cols, index) => {
      const rowNumber = index + (hasHeader ? 2 : 1);
      const deliveryDate = parseImportDate(cols[0] || "");
      const deliveryTime = parseImportTime(cols[1] || "");
      const productName = normalizeImportText(cols[2]);
      const manufacturer = normalizeImportText(cols[3]);
      const supplier = normalizeImportText(cols[4]);
      const expiryDateRaw = normalizeImportText(cols[8]);
      const expiryDate = parseImportDate(expiryDateRaw);
      const expiryTime = parseImportTime(cols[9] || "");

      if (!deliveryDate) errors.push(`Строка ${rowNumber}: заполните корректную дату поступления`);
      if (!productName) errors.push(`Строка ${rowNumber}: заполните наименование продукции`);
      if (!supplier) errors.push(`Строка ${rowNumber}: заполните поставщика`);
      if (expiryDateRaw && !expiryDate) errors.push(`Строка ${rowNumber}: заполните корректную дату срока реализации`);
      if (!deliveryDate || !productName || !supplier || (expiryDateRaw && !expiryDate)) return [];

      if (productName) productsToAdd.push(productName);
      if (manufacturer) manufacturersToAdd.push(manufacturer);
      if (supplier) suppliersToAdd.push(supplier);

      return [
        createAcceptanceRow({
          deliveryDate,
          deliveryHour: deliveryTime.hour,
          deliveryMinute: deliveryTime.minute,
          productName,
          manufacturer,
          supplier,
          transportCondition: parseImportBoolean(cols[5] || "") ? "satisfactory" : "unsatisfactory",
          packagingCompliance: parseImportBoolean(cols[6] || "") ? "compliant" : "non_compliant",
          organolepticResult: parseImportBoolean(cols[7] || "") ? "satisfactory" : "unsatisfactory",
          expiryDate,
          expiryHour: expiryTime.hour,
          expiryMinute: expiryTime.minute,
          note: normalizeImportText(cols[10]),
          responsibleTitle,
          responsibleUserId,
        }),
      ];
    });
    if (errors.length > 0) throw new Error(errors.slice(0, 8).join("\n"));
    if (imported.length === 0) return;
    await persist(title, dateFrom, {
      ...config,
      rows: [...config.rows, ...imported],
      products: [...new Set([...config.products, ...productsToAdd])],
      manufacturers: [...new Set([...config.manufacturers, ...manufacturersToAdd])],
      suppliers: [...new Set([...config.suppliers, ...suppliersToAdd])],
    });
    setRowsImportOpen(false);
  }

  const organizationLabel = props.organizationName || 'ООО "Тест"';
  const pageTitle = getAcceptancePageTitle(routeCode);
  const documentTitle = title || getAcceptanceDocumentTitle(routeCode);
  const journalHeaderTitle = isProductAcceptance
    ? "ЖУРНАЛ ПРИЕМКИ И ВХОДНОГО КОНТРОЛЯ ПРОДУКЦИИ"
    : "ЖУРНАЛ ВХОДНОГО КОНТРОЛЯ СЫРЬЯ, ИНГРЕДИЕНТОВ, УПАКОВОЧНЫХ МАТЕРИАЛОВ";

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1860px] space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        {/* Selection bar */}
        {selectedRowIds.length > 0 && !isClosed && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedRowIds([])} className="text-[#6f7282] hover:text-black"><X className="size-4" /></button>
            <span className="text-[14px]">Выбрано: {selectedRowIds.length}</span>
            <Button type="button" variant="ghost" className="h-9 px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]" onClick={() => setDeleteSelectedOpen(true)}>
              <span className="mr-1">🗑</span> Удалить
            </Button>
          </div>
        )}

        {errorMessage ? (
          <div className="whitespace-pre-line rounded-2xl bg-[#fff2f1] px-5 py-4 text-[14px] text-[#d43a2f]">
            {errorMessage}
          </div>
        ) : null}

        <DocumentBackLink href={`/journals/${routeCode}`} documentId={props.documentId} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-5">
            <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em]">{documentTitle}</h1>
            <label className="flex items-center gap-4 rounded-[18px] bg-[#f3f4fe] px-5 py-4 text-[16px]">
              <Checkbox checked={sortByExpiry} onCheckedChange={(checked) => setSortByExpiry(checked === true)} />
              <span>Сортировать по сроку годности</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            >
              Настройки журнала
            </Button>
          </div>
        </div>

        {/* HACCP header */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <table className="w-full min-w-[640px] border-collapse text-[15px] sm:min-w-0">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[220px] border border-black px-4 py-3 text-center font-semibold"
              >
                {organizationLabel}
              </td>
              <td className="border border-black px-4 py-2 text-center">
                СИСТЕМА ХАССП
              </td>
              <td rowSpan={2} className="w-[200px] border border-black px-3 py-2">
                <div className="text-sm font-semibold">
                  Начат {formatAcceptanceDateDash(dateFrom)}
                </div>
                <div className="mt-1 text-sm">Окончен ________</div>
              </td>
            </tr>
            <tr>
              <td className="border border-black px-4 py-2 text-center italic">
                {journalHeaderTitle}
              </td>
            </tr>
          </tbody>
        </table>
        </div>

        <div className="text-center text-[16px] font-semibold leading-tight sm:text-[20px]">{journalHeaderTitle}</div>

        {/* Toolbar */}
        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" className="h-11 rounded-2xl bg-[#5566f6] px-6 text-[16px]">
                  <Plus className="size-5" /> Добавить <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[300px] rounded-2xl border-0 p-2 shadow-xl">
                <DropdownMenuItem className="h-11 rounded-xl px-3 text-[15px] text-[#5566f6]" onSelect={() => { setEditingRow(null); setRowDialogOpen(true); }}>
                  <Plus className="mr-2 size-4" /> Добавить
                </DropdownMenuItem>
                <DropdownMenuItem className="h-11 rounded-xl px-3 text-[15px] text-[#5566f6]" onSelect={() => setBulkAddOpen(true)}>
                  <Plus className="mr-2 size-4" /> Добавить несколько строк
                </DropdownMenuItem>
                <DropdownMenuItem className="h-11 rounded-xl px-3 text-[15px] text-[#5566f6]" onSelect={() => setRowsImportOpen(true)}>
                  <Upload className="mr-2 size-4" /> Добавить из файла
                </DropdownMenuItem>
                <DropdownMenuItem className="h-11 rounded-xl px-3 text-[15px] text-[#5566f6]" onSelect={() => setIikoOpen(true)}>
                  <span className="mr-2">📋</span> Добавить из Айко
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]" onClick={() => setEditListsOpen(true)}>
              Редактировать списки
            </Button>

            <div className="flex-1" />

            <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]" onClick={() => setFinishOpen(true)}>
              Закончить журнал
            </Button>
          </div>
        )}

        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView items={cardItems} emptyLabel="Поставок пока не зарегистрировано." />
        ) : null}

        {/* Data table */}
        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[960px] w-full border-collapse text-[13px] sm:min-w-[1400px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2">
                  <Checkbox checked={allSelected} onCheckedChange={(c) => setSelectedRowIds(c === true ? displayedRows.map((r) => r.id) : [])} disabled={displayedRows.length === 0 || isClosed} />
                </th>
                <th className="border border-black p-2 text-center">
                  {isProductAcceptance
                    ? "Дата, время поступления продукции, товара"
                    : "Дата, время поступления"}
                </th>
                <th className="border border-black p-2 text-center">
                  {isProductAcceptance ? "Наименование продукции" : "Наименование"}
                </th>
                <th className="border border-black p-2 text-center">Производитель</th>
                <th className="border border-black p-2 text-center">Поставщик</th>
                <th className="border border-black p-2 text-center">Условия транспортировки</th>
                <th className="border border-black p-2 text-center">
                  {isProductAcceptance
                    ? "Соответствие упаковки, маркировки, гигиенические требования, наличие и правильность оформления товаросопроводительной документации"
                    : "Соответствие упаковки, маркировки и товаросопроводительной документации"}
                </th>
                <th className="border border-black p-2 text-center">Результаты органолептической оценки доброкачественности</th>
                <th className="border border-black p-2 text-center">{getExpiryFieldDisplayLabel(config.expiryFieldLabel)}</th>
                <th className="border border-black p-2 text-center">Примечания</th>
                <th className="border border-black p-2 text-center">Ответственный</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-black p-2 text-center">
                    <Checkbox checked={selectedRowIds.includes(row.id)} onCheckedChange={(c) => setSelectedRowIds((cur) => c === true ? [...new Set([...cur, row.id])] : cur.filter((id) => id !== row.id))} disabled={isClosed} />
                  </td>
                  <td className="border border-black p-2 text-center whitespace-pre-line">
                    {formatAcceptanceDateDash(row.deliveryDate)}
                    {row.deliveryHour ? `\n${row.deliveryHour}:${row.deliveryMinute || "00"}` : ""}
                  </td>
                  <td className="border border-black p-2">
                    <button type="button" className="text-left hover:text-[#5566f6]" onClick={() => { if (isClosed) return; setEditingRow(row); setRowDialogOpen(true); }}>
                      {row.productName || "—"}
                    </button>
                  </td>
                  <td className="border border-black p-2 text-center">{row.manufacturer || "—"}</td>
                  <td className="border border-black p-2 text-center">{row.supplier || "—"}</td>
                  <td className="border border-black p-2 text-center">{TRANSPORT_LABELS[row.transportCondition]}</td>
                  <td className="border border-black p-2 text-center">{COMPLIANCE_LABELS[row.packagingCompliance]}</td>
                  <td className="border border-black p-2 text-center">{ORGANOLEPTIC_LABELS[row.organolepticResult]}</td>
                  <td className="border border-black p-2 text-center whitespace-pre-line">
                    {formatAcceptanceDateDash(row.expiryDate)}
                    {row.expiryHour ? `\n${row.expiryHour}:${row.expiryMinute || "00"}` : ""}
                  </td>
                  <td className="border border-black p-2">{row.note || ""}</td>
                  <td className="border border-black p-2">{getResponsibleLabel(row, props.users)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="border border-black p-8 text-center text-[#80849a]">Строк пока нет</td></tr>
              )}
              {/* Empty row at bottom */}
              <tr><td className="border border-black p-2 text-center"><Checkbox disabled /></td><td colSpan={10} className="border border-black p-2" /></tr>
            </tbody>
          </table>
        </MobileViewTableWrapper>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} title={title} dateFrom={dateFrom} users={props.users} config={config} onSave={async (params) => { await persist(params.title, params.dateFrom, params.config); }} />
      {editListsOpen && (
        <IncomingControlEditListsDialog
          key={`${config.products.join("|")}::${config.manufacturers.join("|")}::${config.suppliers.join("|")}`}
          open={editListsOpen}
          onOpenChange={setEditListsOpen}
          config={config}
          setConfig={(nextConfig) => {
            void persist(title, dateFrom, nextConfig).catch((error) =>
              setErrorMessage(getErrorMessage(error, "Ошибка сохранения списков"))
            );
          }}
        />
      )}
      <RowDialog open={rowDialogOpen} onOpenChange={(open) => { setRowDialogOpen(open); if (!open) setEditingRow(null); }} users={props.users} config={config} initialRow={editingRow} onSave={handleSaveRow} />
      <ConfirmDialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen} title={`Удаление строк (${selectedRowIds.length})`} actionLabel="Удалить" onConfirm={handleDeleteSelected} />
      <ConfirmDialog open={finishOpen} onOpenChange={setFinishOpen} title={`Закончить журнал "${title}"`} actionLabel="Закончить" onConfirm={handleCloseJournal} />
      <ImportRowsDialog open={rowsImportOpen} onOpenChange={setRowsImportOpen} users={props.users} responsibleTitle={responsibleTitle} responsibleUserId={responsibleUserId} onFileSelect={handleImportFile} />
      <AddMultipleRowsDialog open={bulkAddOpen} onOpenChange={setBulkAddOpen} onSubmit={addMultipleRows} />
      <IikoDialog open={iikoOpen} onOpenChange={setIikoOpen} />
    </div>
  );
}
