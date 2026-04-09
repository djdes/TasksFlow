"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  formatDateRu,
  formatTime,
  normalizeFryerOilEntryData,
  QUALITY_LABELS,
  QUALITY_ASSESSMENT_TABLE,
  type FryerOilDocumentConfig,
  type FryerOilEntryData,
  type FryerOilSelectLists,
} from "@/lib/fryer-oil-document";

/* ─── Local types ─── */

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type EntryItem = {
  id: string;
  date: string;
  data: FryerOilEntryData;
};

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

/* ─── Hours / Minutes arrays ─── */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const QUALITY_OPTIONS = [5, 4, 3, 2, 1] as const;

/* ─── EditListsDialog ─── */

function EditListsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: FryerOilSelectLists;
  onSave: (lists: FryerOilSelectLists) => Promise<void>;
}) {
  const [lists, setLists] = useState<FryerOilSelectLists>(props.lists);
  const [submitting, setSubmitting] = useState(false);

  // Inline edit state per tab: key = "fatTypes" | "equipmentTypes" | "productTypes"
  const [editIndex, setEditIndex] = useState<{ key: keyof FryerOilSelectLists; index: number } | null>(null);
  const [editValue, setEditValue] = useState("");

  // New item inputs per list
  const [newFat, setNewFat] = useState("");
  const [newEquipment, setNewEquipment] = useState("");
  const [newProduct, setNewProduct] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setLists(props.lists);
    setEditIndex(null);
    setEditValue("");
    setNewFat("");
    setNewEquipment("");
    setNewProduct("");
  }, [props.open, props.lists]);

  function startEdit(key: keyof FryerOilSelectLists, index: number) {
    setEditIndex({ key, index });
    setEditValue(lists[key][index]);
  }

  function confirmEdit() {
    if (!editIndex) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setLists((prev) => {
      const arr = [...prev[editIndex.key]];
      arr[editIndex.index] = trimmed;
      return { ...prev, [editIndex.key]: arr };
    });
    setEditIndex(null);
    setEditValue("");
  }

  function cancelEdit() {
    setEditIndex(null);
    setEditValue("");
  }

  function deleteItem(key: keyof FryerOilSelectLists, index: number) {
    setLists((prev) => {
      const arr = [...prev[key]];
      arr.splice(index, 1);
      return { ...prev, [key]: arr };
    });
    if (editIndex?.key === key && editIndex.index === index) {
      setEditIndex(null);
      setEditValue("");
    }
  }

  function addItem(key: keyof FryerOilSelectLists, value: string, clear: () => void) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLists((prev) => ({ ...prev, [key]: [...prev[key], trimmed] }));
    clear();
  }

  function renderList(key: keyof FryerOilSelectLists, newVal: string, setNew: (v: string) => void) {
    const items = lists[key];
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            {editIndex?.key === key && editIndex.index === index ? (
              <>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="h-10 flex-1 rounded-xl border-[#dfe1ec] px-3 text-[15px]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={confirmEdit}
                  className="rounded-lg p-1.5 text-[#5b66ff] hover:bg-[#eceef5]"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg p-1.5 text-[#6f7282] hover:bg-[#eceef5]"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 rounded-xl border border-[#eceef5] bg-[#f8f9fc] px-3 py-2 text-[15px]">
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(key, index)}
                  className="rounded-lg p-1.5 text-[#6f7282] hover:bg-[#eceef5] hover:text-[#5b66ff]"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(key, index)}
                  className="rounded-lg p-1.5 text-[#6f7282] hover:bg-[#fff2f1] hover:text-[#ff3b30]"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </div>
        ))}
        {/* Add new */}
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newVal}
            onChange={(e) => setNew(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addItem(key, newVal, () => setNew(""));
              }
            }}
            placeholder="Добавить новый..."
            className="h-10 flex-1 rounded-xl border-[#dfe1ec] px-3 text-[15px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addItem(key, newVal, () => setNew(""))}
            className="h-10 rounded-xl border-[#dfe1ec] px-3 text-[14px]"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Редактирование списков
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="px-7 py-6">
          <Tabs defaultValue="fatTypes">
            <TabsList className="mb-5 w-full">
              <TabsTrigger value="fatTypes" className="flex-1 text-[13px]">
                Вид жира
              </TabsTrigger>
              <TabsTrigger value="equipmentTypes" className="flex-1 text-[13px]">
                Оборудование
              </TabsTrigger>
              <TabsTrigger value="productTypes" className="flex-1 text-[13px]">
                Вид продукции
              </TabsTrigger>
            </TabsList>
            <TabsContent value="fatTypes">
              {renderList("fatTypes", newFat, setNewFat)}
            </TabsContent>
            <TabsContent value="equipmentTypes">
              {renderList("equipmentTypes", newEquipment, setNewEquipment)}
            </TabsContent>
            <TabsContent value="productTypes">
              {renderList("productTypes", newProduct, setNewProduct)}
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave(lists);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── AddEntryDialog ─── */

function AddEntryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: FryerOilSelectLists;
  users: UserItem[];
  onAdd: (data: FryerOilEntryData) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(today);
  const [startHour, setStartHour] = useState("08");
  const [startMinute, setStartMinute] = useState("00");
  const [fatType, setFatType] = useState(props.lists.fatTypes[0] ?? "");
  const [qualityStart, setQualityStart] = useState<number>(5);
  const [equipmentType, setEquipmentType] = useState(props.lists.equipmentTypes[0] ?? "");
  const [productType, setProductType] = useState(props.lists.productTypes[0] ?? "");
  const [endHour, setEndHour] = useState("17");
  const [endMinute, setEndMinute] = useState("00");
  const [qualityEnd, setQualityEnd] = useState<number>(5);
  const [carryoverKg, setCarryoverKg] = useState("0");
  const [disposedKg, setDisposedKg] = useState("0");
  const [controllerName, setControllerName] = useState(props.users[0]?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setStartDate(today);
    setStartHour("08");
    setStartMinute("00");
    setFatType(props.lists.fatTypes[0] ?? "");
    setQualityStart(5);
    setEquipmentType(props.lists.equipmentTypes[0] ?? "");
    setProductType(props.lists.productTypes[0] ?? "");
    setEndHour("17");
    setEndMinute("00");
    setQualityEnd(5);
    setCarryoverKg("0");
    setDisposedKg("0");
    setControllerName(props.users[0]?.name ?? "");
  }, [props.open, props.lists, props.users]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[560px] overflow-y-auto rounded-[24px] border-0 p-0">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Добавление новой строки
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>

        <div className="space-y-5 px-7 py-6">
          {/* Date + start time */}
          <div>
            <div className="mb-2 text-[16px] font-medium text-black">Дата и время начала использования</div>
            <div className="space-y-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
              />
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                  <Select value={startHour} onValueChange={setStartHour}>
                    <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                  <Select value={startMinute} onValueChange={setStartMinute}>
                    <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Fat type */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Вид фритюрного жира</Label>
            <Select value={fatType} onValueChange={setFatType}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="— Выберите —" />
              </SelectTrigger>
              <SelectContent>
                {props.lists.fatTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Quality start */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Органолептическая оценка на начало жарки</Label>
            <Select value={String(qualityStart)} onValueChange={(v) => setQualityStart(Number(v))}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((score) => (
                  <SelectItem key={score} value={String(score)}>
                    {score} — {QUALITY_LABELS[score]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Equipment type */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Тип жарочного оборудования</Label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="— Выберите —" />
              </SelectTrigger>
              <SelectContent>
                {props.lists.equipmentTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Product type */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Вид продукции</Label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue placeholder="— Выберите —" />
              </SelectTrigger>
              <SelectContent>
                {props.lists.productTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* End time */}
          <div>
            <div className="mb-2 text-[16px] font-medium text-black">Время окончания фритюрной жарки</div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Часы</Label>
                <Select value={endHour} onValueChange={setEndHour}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[14px] text-[#6f7282]">Минуты</Label>
                <Select value={endMinute} onValueChange={setEndMinute}>
                  <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Quality end */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Органолептическая оценка по окончании жарки</Label>
            <Select value={String(qualityEnd)} onValueChange={(v) => setQualityEnd(Number(v))}>
              <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_OPTIONS.map((score) => (
                  <SelectItem key={score} value={String(score)}>
                    {score} — {QUALITY_LABELS[score]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Carryover kg */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Переходящий остаток, кг</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={carryoverKg}
              onChange={(e) => setCarryoverKg(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          {/* Disposed kg */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Утилизировано, кг</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={disposedKg}
              onChange={(e) => setDisposedKg(e.target.value)}
              className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
            />
          </div>

          {/* Controller */}
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Должность, ФИО контролера</Label>
            {props.users.length > 0 ? (
              <Select value={controllerName} onValueChange={setControllerName}>
                <SelectTrigger className="h-14 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[18px]">
                  <SelectValue placeholder="— Выберите —" />
                </SelectTrigger>
                <SelectContent>
                  {props.users.map((u) => (
                    <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={controllerName}
                onChange={(e) => setControllerName(e.target.value)}
                className="h-14 rounded-2xl border-[#dfe1ec] px-4 text-[18px]"
              />
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onAdd({
                    startDate,
                    startHour: parseInt(startHour, 10),
                    startMinute: parseInt(startMinute, 10),
                    fatType,
                    qualityStart,
                    equipmentType,
                    productType,
                    endHour: parseInt(endHour, 10),
                    endMinute: parseInt(endMinute, 10),
                    qualityEnd,
                    carryoverKg: parseFloat(carryoverKg) || 0,
                    disposedKg: parseFloat(disposedKg) || 0,
                    controllerName,
                  });
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-14 rounded-xl bg-[#5863f8] px-7 text-[20px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Quality Assessment Appendix ─── */

function QualityAssessmentAppendix() {
  const { indicators, gradingTable, formulaExample } = QUALITY_ASSESSMENT_TABLE;

  return (
    <div className="fryer-appendix mt-8 space-y-6 rounded-2xl border border-[#eceef5] bg-white p-6">
      <div className="text-center text-[15px] font-bold uppercase tracking-wide text-black">
        Приложение. Органолептическая оценка качества жира
      </div>

      {/* Indicators table */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-[#6f7282]">
          Показатели качества и соответствующие баллы
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#f0f0f0]">
                <th className="border border-[#ccc] px-3 py-2 text-left font-semibold">Показатель</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">Коэфф.</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">5 — Отличное</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">4 — Хорошее</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">3 — Удовл.</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">2 — Неудовл.</th>
                <th className="border border-[#ccc] px-3 py-2 text-center font-semibold">1 — Неудовл.</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((ind) => (
                <tr key={ind.name}>
                  <td className="border border-[#ccc] bg-[#f9f9f9] px-3 py-2 font-medium">{ind.name}</td>
                  <td className="border border-[#ccc] px-3 py-2 text-center">{ind.coefficient}</td>
                  {[5, 4, 3, 2, 1].map((score) => (
                    <td key={score} className="border border-[#ccc] px-3 py-2">
                      {ind.scores[score as keyof typeof ind.scores]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grading table */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-[#6f7282]">
          Шкала оценки качества
        </div>
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#f0f0f0]">
              <th className="border border-[#ccc] px-4 py-2 text-left font-semibold">Оценка качества</th>
              <th className="border border-[#ccc] px-4 py-2 text-center font-semibold">Балл</th>
            </tr>
          </thead>
          <tbody>
            {gradingTable.map((row, i) => (
              <tr key={i}>
                <td className="border border-[#ccc] px-4 py-1.5">{row.label}</td>
                <td className="border border-[#ccc] px-4 py-1.5 text-center">{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formula */}
      <div className="rounded-xl bg-[#f8f9fc] px-5 py-4 text-[13px] text-[#6f7282]">
        <span className="font-semibold text-black">Формула расчёта:</span>{" "}
        (Σ балл × коэффициент) / Σ коэффициентов
        <br />
        <span className="font-semibold text-black">Пример:</span>{" "}
        {formulaExample}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export function FryerOilDocumentClient(props: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryItem[]>(() =>
    props.initialEntries.map((e) => ({
      ...e,
      data: normalizeFryerOilEntryData(e.data),
    }))
  );
  const [config, setConfig] = useState<FryerOilDocumentConfig>(props.config);
  const [addOpen, setAddOpen] = useState(false);
  const [editListsOpen, setEditListsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const isActive = props.status === "active";

  /* ── Toggle row selection ── */
  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  /* ── Add entry ── */
  const handleAddEntry = useCallback(
    async (data: FryerOilEntryData) => {
      const firstUserId = props.users[0]?.id ?? "";
      const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: firstUserId,
          date: data.startDate,
          data,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.entry) {
        window.alert("Не удалось сохранить запись");
        throw new Error("save_entry_failed");
      }

      const saved: EntryItem = {
        id: result.entry.id,
        date: data.startDate,
        data: normalizeFryerOilEntryData(result.entry.data ?? data),
      };

      setEntries((prev) => {
        const updated = [...prev.filter((e) => e.id !== saved.id), saved];
        updated.sort((a, b) => {
          const dateCmp = a.data.startDate.localeCompare(b.data.startDate);
          if (dateCmp !== 0) return dateCmp;
          return a.data.startHour !== b.data.startHour
            ? a.data.startHour - b.data.startHour
            : a.data.startMinute - b.data.startMinute;
        });
        return updated;
      });
    },
    [props.documentId, props.users]
  );

  /* ── Delete selected ── */
  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Удалить выбранные строки (${selectedIds.length})?`)) return;

    const response = await fetch(`/api/journal-documents/${props.documentId}/entries`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });

    if (!response.ok) {
      window.alert("Не удалось удалить выбранные строки");
      return;
    }

    setEntries((prev) => prev.filter((e) => !selectedIds.includes(e.id)));
    setSelectedIds([]);
  }

  /* ── Save lists ── */
  async function handleSaveLists(lists: FryerOilSelectLists) {
    const nextConfig: FryerOilDocumentConfig = { ...config, lists };
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: nextConfig }),
    });

    if (!response.ok) {
      window.alert("Не удалось сохранить списки");
      throw new Error("save_lists_failed");
    }

    setConfig(nextConfig);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="text-[13px] text-[#7c7c93] print:hidden">
        <Link href={`/journals/${props.routeCode}`} className="hover:underline">
          {props.title}
        </Link>
        {" › "}
        <span>{props.organizationName}</span>
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-black">
          {props.title}
        </h1>
      </div>

      {/* Action row */}
      {isActive && (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Button
            type="button"
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-xl bg-[#5b66ff] px-5 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
          >
            <Plus className="mr-1 size-4" />
            Добавить
          </Button>

          <button
            type="button"
            onClick={() => setEditListsOpen(true)}
            className="text-[14px] text-[#5b66ff] hover:underline"
          >
            Редактировать списки
          </button>

          {selectedIds.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-[14px]">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[#7c7c93] hover:text-black"
                >
                  <X className="size-4" />
                </button>
                <span>Выбрано: {selectedIds.length}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#ff3b30] px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]"
                onClick={() => {
                  handleDeleteSelected().catch(() => window.alert("Ошибка удаления"));
                }}
              >
                <Trash2 className="mr-1 size-4" />
                Удалить выбранные
              </Button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#eceef5] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eceef5] bg-[#f8f9fc]">
              {isActive && (
                <th className="w-10 px-3 py-3 text-center">
                  <span className="sr-only">Выбрать</span>
                </th>
              )}
              <th className="px-3 py-3 text-left font-semibold text-[#6f7282]">Дата, время начала</th>
              <th className="px-3 py-3 text-left font-semibold text-[#6f7282]">Вид фритюрного жира</th>
              <th className="px-3 py-3 text-center font-semibold text-[#6f7282]">Оценка на начало</th>
              <th className="px-3 py-3 text-left font-semibold text-[#6f7282]">Тип оборудования</th>
              <th className="px-3 py-3 text-left font-semibold text-[#6f7282]">Вид продукции</th>
              <th className="px-3 py-3 text-center font-semibold text-[#6f7282]">Время окончания</th>
              <th className="px-3 py-3 text-center font-semibold text-[#6f7282]">Оценка по окончании</th>
              <th className="px-3 py-3 text-center font-semibold text-[#6f7282]">Остаток, кг</th>
              <th className="px-3 py-3 text-center font-semibold text-[#6f7282]">Утилиз., кг</th>
              <th className="px-3 py-3 text-left font-semibold text-[#6f7282]">Контролер</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={isActive ? 11 : 10}
                  className="px-6 py-10 text-center text-[14px] text-[#6f7282]"
                >
                  Нет записей. Нажмите «Добавить», чтобы создать первую запись.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const d = entry.data;
                const isSelected = selectedIds.includes(entry.id);
                return (
                  <tr
                    key={entry.id}
                    className={`border-b border-[#eceef5] transition-colors last:border-0 ${
                      isSelected ? "bg-[#f0f2ff]" : "hover:bg-[#fafbff]"
                    }`}
                  >
                    {isActive && (
                      <td className="px-3 py-2 text-center">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(entry.id)}
                          className="size-4"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDateRu(d.startDate)}{" "}
                      <span className="text-[#6f7282]">{formatTime(d.startHour, d.startMinute)}</span>
                    </td>
                    <td className="px-3 py-2">{d.fatType || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-medium ${
                          d.qualityStart >= 4
                            ? "bg-[#e8f5e9] text-[#2e7d32]"
                            : d.qualityStart === 3
                            ? "bg-[#fff8e1] text-[#f57f17]"
                            : "bg-[#ffebee] text-[#c62828]"
                        }`}
                      >
                        {d.qualityStart} — {QUALITY_LABELS[d.qualityStart]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{d.equipmentType || "—"}</td>
                    <td className="px-3 py-2">{d.productType || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">
                      {formatTime(d.endHour, d.endMinute)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-medium ${
                          d.qualityEnd >= 4
                            ? "bg-[#e8f5e9] text-[#2e7d32]"
                            : d.qualityEnd === 3
                            ? "bg-[#fff8e1] text-[#f57f17]"
                            : "bg-[#ffebee] text-[#c62828]"
                        }`}
                      >
                        {d.qualityEnd} — {QUALITY_LABELS[d.qualityEnd]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{d.carryoverKg}</td>
                    <td className="px-3 py-2 text-center">{d.disposedKg}</td>
                    <td className="px-3 py-2 text-[#6f7282]">{d.controllerName || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Quality assessment appendix */}
      <QualityAssessmentAppendix />

      {/* Dialogs */}
      <AddEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        lists={config.lists}
        users={props.users}
        onAdd={handleAddEntry}
      />

      <EditListsDialog
        open={editListsOpen}
        onOpenChange={setEditListsOpen}
        lists={config.lists}
        onSave={handleSaveLists}
      />
    </div>
  );
}
