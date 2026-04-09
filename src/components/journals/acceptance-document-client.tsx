"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Pencil, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  createAcceptanceRow,
  normalizeAcceptanceDocumentConfig,
  type AcceptanceDocumentConfig,
  type AcceptanceDecision,
  type AcceptanceRow,
} from "@/lib/acceptance-document";

type User = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  config: unknown;
  users: User[];
};

function formatDateLabel(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}-${month}-${year}`;
}

function getRowResponsibleLabel(row: AcceptanceRow, users: User[]) {
  const user = users.find((item) => item.id === row.responsibleUserId);
  return user?.name || "—";
}

function sortRows(rows: AcceptanceRow[], sortByExpiry: boolean) {
  if (!sortByExpiry) return rows;
  return [...rows].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: User[];
  config: AcceptanceDocumentConfig;
  initialRow: AcceptanceRow | null;
  onSave: (row: AcceptanceRow) => Promise<void>;
}) {
  const [row, setRow] = useState<AcceptanceRow>(() => createAcceptanceRow());
  const [newProduct, setNewProduct] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setRow(
      props.initialRow ||
        createAcceptanceRow({
          responsibleUserId: props.config.defaultResponsibleUserId || "",
          dateSupply: new Date().toISOString().slice(0, 10),
        })
    );
    setNewProduct("");
    setNewManufacturer("");
    setNewSupplier("");
  }, [props.config.defaultResponsibleUserId, props.initialRow, props.open]);

  function setValue<K extends keyof AcceptanceRow>(key: K, value: AcceptanceRow[K]) {
    setRow((current) => ({ ...current, [key]: value }));
  }

  function pushToCatalog(type: "products" | "manufacturers" | "suppliers", value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    if (type === "products") {
      setValue("productName", normalized);
      setNewProduct("");
    }
    if (type === "manufacturers") {
      setValue("manufacturer", normalized);
      setNewManufacturer("");
    }
    if (type === "suppliers") {
      setValue("supplier", normalized);
      setNewSupplier("");
    }
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await props.onSave(row);
      props.onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[30px] font-medium text-black">
            {props.initialRow ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label>Дата поставки</Label>
            <Input
              type="date"
              value={row.dateSupply}
              onChange={(event) => setValue("dateSupply", event.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <Label>Наименование продукции</Label>
            <Select value={row.productName} onValueChange={(value) => setValue("productName", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите из списка" />
              </SelectTrigger>
              <SelectContent>
                {props.config.products.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newProduct}
                onChange={(event) => setNewProduct(event.target.value)}
                placeholder="Добавить новое изделие"
              />
              <Button type="button" onClick={() => pushToCatalog("products", newProduct)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Годен до</Label>
            <Input
              type="date"
              value={row.expiryDate}
              onChange={(event) => setValue("expiryDate", event.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <Label>Производитель</Label>
            <Select value={row.manufacturer} onValueChange={(value) => setValue("manufacturer", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите из списка" />
              </SelectTrigger>
              <SelectContent>
                {props.config.manufacturers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newManufacturer}
                onChange={(event) => setNewManufacturer(event.target.value)}
                placeholder="Добавить нового производителя"
              />
              <Button type="button" onClick={() => pushToCatalog("manufacturers", newManufacturer)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <Label>Поставщик</Label>
            <Select value={row.supplier} onValueChange={(value) => setValue("supplier", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите из списка" />
              </SelectTrigger>
              <SelectContent>
                {props.config.suppliers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newSupplier}
                onChange={(event) => setNewSupplier(event.target.value)}
                placeholder="Добавить нового поставщика"
              />
              <Button type="button" onClick={() => pushToCatalog("suppliers", newSupplier)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>ТТН, документы соответствия</Label>
            <Input value={row.ttnDocs} onChange={(event) => setValue("ttnDocs", event.target.value)} />
          </div>
          <div className="space-y-2 rounded-xl border border-[#e5e8f2] p-3">
            <Label>Партия</Label>
            <Input
              value={row.batchVolume}
              onChange={(event) => setValue("batchVolume", event.target.value)}
              placeholder="Объем партии"
            />
            <Input
              value={row.batchNumber}
              onChange={(event) => setValue("batchNumber", event.target.value)}
              placeholder="Номер партии"
            />
            <Input
              type="date"
              value={row.productionDate}
              onChange={(event) => setValue("productionDate", event.target.value)}
              placeholder="Дата производства"
            />
          </div>
          <div className="space-y-2">
            <Label>Внутренняя температура продукта, °C</Label>
            <Input
              value={row.innerTemperature}
              onChange={(event) => setValue("innerTemperature", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Соответствие товаросопроводительной документации</Label>
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="docsCompliance"
                  checked={row.docsCompliance === "yes"}
                  onChange={() => setValue("docsCompliance", "yes")}
                />
                Да
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="docsCompliance"
                  checked={row.docsCompliance === "no"}
                  onChange={() => setValue("docsCompliance", "no")}
                />
                Нет
              </label>
            </div>
          </div>
          {props.config.showPackagingComplianceField && (
            <div className="space-y-2">
              <Label>Соответствие внешнего вида упаковки, маркировки требованиям НД</Label>
              <div className="flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="packagingCompliance"
                    checked={row.packagingCompliance === "yes"}
                    onChange={() => setValue("packagingCompliance", "yes")}
                  />
                  Да
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="packagingCompliance"
                    checked={row.packagingCompliance === "no"}
                    onChange={() => setValue("packagingCompliance", "no")}
                  />
                  Нет
                </label>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Принять/Отклонить</Label>
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decision"
                  checked={row.decision === "accept"}
                  onChange={() => setValue("decision", "accept" as AcceptanceDecision)}
                />
                Принять
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="decision"
                  checked={row.decision === "reject"}
                  onChange={() => setValue("decision", "reject" as AcceptanceDecision)}
                />
                Отклонить
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Корректирующие действия</Label>
            <Input
              value={row.correctiveAction}
              onChange={(event) => setValue("correctiveAction", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Сотрудник</Label>
            <Select
              value={row.responsibleUserId}
              onValueChange={(value) => setValue("responsibleUserId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "Сохранение..." : props.initialRow ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditListsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AcceptanceDocumentConfig;
  setConfig: (config: AcceptanceDocumentConfig) => void;
}) {
  const [newProduct, setNewProduct] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newSupplier, setNewSupplier] = useState("");

  function addToList(type: "products" | "manufacturers" | "suppliers", value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    const current = props.config[type];
    if (current.includes(normalized)) return;
    props.setConfig({ ...props.config, [type]: [...current, normalized] });
  }

  function renameInList(type: "products" | "manufacturers" | "suppliers", value: string) {
    const next = window.prompt("Новое значение", value)?.trim();
    if (!next) return;
    props.setConfig({
      ...props.config,
      [type]: props.config[type].map((item) => (item === value ? next : item)),
    });
  }

  function removeFromList(type: "products" | "manufacturers" | "suppliers", value: string) {
    props.setConfig({
      ...props.config,
      [type]: props.config[type].filter((item) => item !== value),
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[30px] font-medium text-black">
            Редактировать списки изделий
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-8 py-6">
          {([
            ["products", "Продукция", newProduct, setNewProduct],
            ["manufacturers", "Производители", newManufacturer, setNewManufacturer],
            ["suppliers", "Поставщики", newSupplier, setNewSupplier],
          ] as const).map(([key, label, value, setValue]) => (
            <div key={key} className="space-y-2 rounded-xl bg-[#f6f7fc] p-3">
              <Label>{label}</Label>
              <div className="space-y-2">
                {props.config[key].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                    <span className="text-sm">{item}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => renameInList(key, item)}>
                        <Pencil className="size-4 text-[#5b66ff]" />
                      </button>
                      <button type="button" onClick={() => removeFromList(key, item)}>
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Добавить значение"
                />
                <Button type="button" onClick={() => addToList(key, value)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" onClick={() => props.onOpenChange(false)}>
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
  onSave: (params: {
    title: string;
    dateFrom: string;
    config: AcceptanceDocumentConfig;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [showPackaging, setShowPackaging] = useState(
    props.config.showPackagingComplianceField
  );
  const [responsibleTitle, setResponsibleTitle] = useState(
    props.config.defaultResponsibleTitle || ""
  );
  const [responsibleUserId, setResponsibleUserId] = useState(
    props.config.defaultResponsibleUserId || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.title);
    setDateFrom(props.dateFrom);
    setShowPackaging(props.config.showPackagingComplianceField);
    setResponsibleTitle(props.config.defaultResponsibleTitle || "");
    setResponsibleUserId(props.config.defaultResponsibleUserId || "");
  }, [props.config, props.dateFrom, props.open, props.title]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await props.onSave({
        title: title.trim(),
        dateFrom,
        config: {
          ...props.config,
          showPackagingComplianceField: showPackaging,
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
      <DialogContent className="max-w-[560px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[30px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label>Название документа</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Добавить поля</Label>
            <div className="flex items-center gap-3">
              <Switch checked={showPackaging} onCheckedChange={setShowPackaging} />
              <span className="text-sm">
                Соответствие внешнего вида упаковки, маркировки требованиям НД
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Должность ответственного</Label>
            <Input
              value={responsibleTitle}
              onChange={(event) => setResponsibleTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Сотрудник</Label>
            <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AcceptanceDocumentClient(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState(() =>
    normalizeAcceptanceDocumentConfig(props.config, props.users)
  );
  const [title, setTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editListsOpen, setEditListsOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AcceptanceRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfig(normalizeAcceptanceDocumentConfig(props.config, props.users));
  }, [props.config, props.users]);

  useEffect(() => {
    setTitle(props.title);
    setDateFrom(props.dateFrom);
  }, [props.dateFrom, props.title]);

  const rows = useMemo(
    () => sortRows(config.rows, config.sortByExpiry),
    [config.rows, config.sortByExpiry]
  );
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  async function persist(nextTitle: string, nextDateFrom: string, nextConfig: AcceptanceDocumentConfig) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextDateFrom,
        config: nextConfig,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить документ");
    }
    setTitle(nextTitle);
    setDateFrom(nextDateFrom);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: AcceptanceRow) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];
    await persist(title, dateFrom, { ...config, rows: nextRows });
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    if (!window.confirm("Удалить выбранные строки?")) return;
    const nextConfig = {
      ...config,
      rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
    };
    await persist(title, dateFrom, nextConfig);
    setSelectedRowIds([]);
  }

  async function handleSaveSettings(params: {
    title: string;
    dateFrom: string;
    config: AcceptanceDocumentConfig;
  }) {
    await persist(params.title, params.dateFrom, params.config);
  }

  async function handleToggleSort(value: boolean) {
    await persist(title, dateFrom, { ...config, sortByExpiry: value });
  }

  async function addMultipleRows(count: number) {
    const safeCount = Math.max(1, Math.min(100, count));
    const nextRows = [...config.rows];
    for (let index = 0; index < safeCount; index += 1) {
      nextRows.push(
        createAcceptanceRow({
          responsibleUserId: config.defaultResponsibleUserId || "",
        })
      );
    }
    await persist(title, dateFrom, { ...config, rows: nextRows });
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (lines.length <= 1) return;

    const rowsFromFile = lines.slice(1).map((line) => {
      const columns = line.split(";").map((item) => item.trim());
      return createAcceptanceRow({
        dateSupply: columns[0] || new Date().toISOString().slice(0, 10),
        productName: columns[1] || "",
        expiryDate: columns[2] || "",
        manufacturer: columns[3] || "",
        supplier: columns[4] || "",
        ttnDocs: columns[5] || "",
        batchVolume: columns[6] || "",
        batchNumber: columns[7] || "",
        productionDate: columns[8] || "",
        innerTemperature: columns[9] || "",
        docsCompliance: columns[10] === "0" ? "no" : "yes",
        packagingCompliance: columns[11] === "0" ? "no" : "yes",
        decision: columns[12] === "reject" ? "reject" : "accept",
        correctiveAction: columns[13] || "",
        responsibleUserId: config.defaultResponsibleUserId || "",
      });
    });

    await persist(title, dateFrom, { ...config, rows: [...config.rows, ...rowsFromFile] });
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1860px] space-y-6 px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[54px] font-semibold tracking-[-0.04em]">{title || "Журнал приемки"}</h1>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            Настройки журнала
          </Button>
        </div>

        <div className="rounded-2xl bg-[#f3f4fe] px-4 py-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={config.sortByExpiry}
              onCheckedChange={(checked) => {
                handleToggleSort(checked).catch((error) =>
                  window.alert(error instanceof Error ? error.message : "Ошибка сохранения")
                );
              }}
              disabled={isPending}
            />
            <span className="text-[18px]">Сортировать по сроку годности</span>
          </div>
        </div>

        <table className="w-full border-collapse text-[15px]">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-[220px] border border-black px-4 py-3 text-center font-semibold">
                {props.organizationName || 'ООО "Тест"'}
              </td>
              <td className="border border-black px-4 py-2 text-center">СИСТЕМА ХАССП</td>
              <td rowSpan={2} className="w-[200px] border border-black px-3 py-2">
                <div className="text-sm font-semibold">Начат {formatDateLabel(dateFrom)}</div>
                <div className="mt-1 text-sm">Окончен ____</div>
                <div className="mt-2 text-right text-sm">СТР. 1 ИЗ 1</div>
              </td>
            </tr>
            <tr>
              <td className="border border-black px-4 py-2 text-center italic">
                ЖУРНАЛ ПРИЕМКИ И ВХОДНОГО КОНТРОЛЯ ПРОДУКЦИИ
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-center text-[34px] font-semibold">ЖУРНАЛ ПРИЕМКИ</div>

        {props.status === "active" && (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" className="h-14 rounded-2xl bg-[#5b66ff] px-6 text-[18px]">
                  <Plus className="size-5" />
                  Добавить
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px] rounded-2xl border-0 p-2 shadow-xl">
                <DropdownMenuItem onSelect={() => { setEditingRow(null); setRowDialogOpen(true); }}>
                  Добавить
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const raw = window.prompt("Сколько строк добавить?", "5");
                    const count = Number(raw || "0");
                    if (!Number.isFinite(count) || count <= 0) return;
                    addMultipleRows(count).catch((error) =>
                      window.alert(error instanceof Error ? error.message : "Ошибка добавления")
                    );
                  }}
                >
                  Добавить несколько строк
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 size-4" />
                  Добавить из файла
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.alert("Интеграция с Айко пока недоступна")}>
                  Добавить из Айко
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              className="h-14 rounded-2xl bg-[#5b66ff] px-6 text-[18px]"
              onClick={() => {
                setEditingRow(null);
                setRowDialogOpen(true);
              }}
            >
              <Plus className="size-5" />
              Добавить
            </Button>

            <button
              type="button"
              className="ml-2 text-[24px] text-[#5b66ff]"
              onClick={() => setEditListsOpen(true)}
            >
              Редактировать списки
            </button>

            {selectedRowIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="ml-3 border-[#ffd7d3] text-[#ff3b30]"
                onClick={() => {
                  handleDeleteSelected().catch((error) =>
                    window.alert(error instanceof Error ? error.message : "Ошибка удаления")
                  );
                }}
              >
                Удалить выбранные
              </Button>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            handleImportFile(file).catch((error) =>
              window.alert(error instanceof Error ? error.message : "Ошибка импорта")
            );
            event.currentTarget.value = "";
          }}
        />

        <div className="overflow-x-auto">
          <table className="min-w-[1700px] w-full border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? rows.map((row) => row.id) : [])
                    }
                    disabled={rows.length === 0 || props.status !== "active"}
                  />
                </th>
                <th className="border border-black p-2">Дата поставки</th>
                <th className="border border-black p-2">Наименование продукции</th>
                <th className="border border-black p-2">Годен до</th>
                <th className="border border-black p-2">Производитель / поставщик</th>
                <th className="border border-black p-2">ТТН, документы соответствия</th>
                <th className="border border-black p-2">Объем, номер партии, дата пр-ва</th>
                <th className="border border-black p-2">Внутр-я темп-ра продукта</th>
                <th className="border border-black p-2">Соответствие товаросопроводительной документации</th>
                {config.showPackagingComplianceField && (
                  <th className="border border-black p-2">
                    Соответствие внешнего вида упаковки, маркировки требованиям НД
                  </th>
                )}
                <th className="border border-black p-2">Принять/Отклонить</th>
                <th className="border border-black p-2">Корректирующие действия</th>
                <th className="border border-black p-2">Ответственный</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-black p-2 text-center">
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds((current) =>
                          checked === true
                            ? [...new Set([...current, row.id])]
                            : current.filter((item) => item !== row.id)
                        )
                      }
                      disabled={props.status !== "active"}
                    />
                  </td>
                  <td className="border border-black p-2">{formatDateLabel(row.dateSupply)}</td>
                  <td className="border border-black p-2">
                    <button
                      type="button"
                      className="text-left hover:text-[#5b66ff]"
                      onClick={() => {
                        if (props.status !== "active") return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                    >
                      {row.productName || "—"}
                    </button>
                  </td>
                  <td className="border border-black p-2">{formatDateLabel(row.expiryDate)}</td>
                  <td className="border border-black p-2">
                    <div>{row.manufacturer || "—"}</div>
                    <div>{row.supplier || "—"}</div>
                  </td>
                  <td className="border border-black p-2">{row.ttnDocs || "—"}</td>
                  <td className="border border-black p-2">
                    <div>{row.batchVolume || "—"}</div>
                    <div>{row.batchNumber || "—"}</div>
                    <div>{formatDateLabel(row.productionDate) || "—"}</div>
                  </td>
                  <td className="border border-black p-2">{row.innerTemperature || "—"}</td>
                  <td className="border border-black p-2">{row.docsCompliance === "yes" ? "Да" : "Нет"}</td>
                  {config.showPackagingComplianceField && (
                    <td className="border border-black p-2">
                      {row.packagingCompliance === "yes" ? "Да" : "Нет"}
                    </td>
                  )}
                  <td className="border border-black p-2">{row.decision === "accept" ? "Принят" : "Отклонен"}</td>
                  <td className="border border-black p-2">{row.correctiveAction || "—"}</td>
                  <td className="border border-black p-2">{getRowResponsibleLabel(row, props.users)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={config.showPackagingComplianceField ? 13 : 12}
                    className="border border-black p-8 text-center text-[#80849a]"
                  >
                    Строк пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={title}
        dateFrom={dateFrom}
        users={props.users}
        config={config}
        onSave={handleSaveSettings}
      />

      <EditListsDialog
        open={editListsOpen}
        onOpenChange={setEditListsOpen}
        config={config}
        setConfig={(nextConfig) => {
          persist(title, dateFrom, nextConfig).catch((error) =>
            window.alert(error instanceof Error ? error.message : "Ошибка сохранения")
          );
        }}
      />

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(open) => {
          setRowDialogOpen(open);
          if (!open) setEditingRow(null);
        }}
        users={props.users}
        config={config}
        initialRow={editingRow}
        onSave={handleSaveRow}
      />
    </div>
  );
}
