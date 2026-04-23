"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  getSanitaryDayChecklistTitle,
  normalizeSdcConfig,
  normalizeSdcEntryData,
  getItemNumber,
  type SdcConfig,
  type SdcEntryData,
  type SdcZone,
  type SdcItem,
} from "@/lib/sanitary-day-checklist-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";

import { toast } from "sonner";
/* ─── Types ─── */

type UserItem = { id: string; name: string; role: string };

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  users: UserItem[];
  config: SdcConfig;
  initialEntries: { id: string; date: string; data: SdcEntryData }[];
  routeCode: string;
};

/* ─── Helpers ─── */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

function createId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatRuDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parseTime(t: string): { h: string; m: string } {
  const parts = t.split(":");
  return { h: parts[0] || "12", m: parts[1] || "00" };
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (result && typeof result.error === "string" && result.error) ||
        "Операция не выполнена"
    );
  }
  return result;
}

/* ─── Settings Dialog ─── */

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  title: string;
  dateFrom: string;
  onSaved: () => void;
}) {
  const [docTitle, setDocTitle] = useState(props.title);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setDocTitle(props.title);
    setDateFrom(props.dateFrom);
  }, [props.open, props.title, props.dateFrom]);

  async function handleSave() {
    setSubmitting(true);
    try {
      await requestJson(`/api/journal-documents/${props.documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle.trim() || props.title,
          dateFrom,
        }),
      });
      props.onOpenChange(false);
      props.onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Ошибка сохранения"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Настройки документа
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
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">
              Название документа
            </Label>
            <Input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Дата</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={submitting}
              onClick={handleSave}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add Item Dialog ─── */

function AddItemDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: SdcZone[];
  onAdd: (zoneId: string, text: string) => void;
}) {
  const [zoneId, setZoneId] = useState(props.zones[0]?.id || "");
  const [text, setText] = useState("");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[24px] border-0 p-0 sm:max-w-[560px]">
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
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Зона</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите зону -" />
              </SelectTrigger>
              <SelectContent>
                {props.zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Описание</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="rounded-2xl border-[#dfe1ec] px-4 py-3 text-[18px]"
              placeholder="Введите описание действия..."
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={!zoneId || !text.trim()}
              onClick={() => {
                props.onAdd(zoneId, text.trim());
                props.onOpenChange(false);
              }}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Item Dialog ─── */

function EditItemDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: SdcZone[];
  item: SdcItem | null;
  onSave: (itemId: string, zoneId: string, text: string) => void;
}) {
  const [zoneId, setZoneId] = useState(props.item?.zoneId || "");
  const [text, setText] = useState(props.item?.text || "");

  if (!props.item) return null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Редактирование строки
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
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Зона</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите зону -" />
              </SelectTrigger>
              <SelectContent>
                {props.zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[16px] text-[#6f7282]">Описание</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="rounded-2xl border-[#dfe1ec] px-4 py-3 text-[18px]"
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={!zoneId || !text.trim()}
              onClick={() => {
                props.onSave(props.item!.id, zoneId, text.trim());
                props.onOpenChange(false);
              }}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Zones Dialog ─── */

function EditZonesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: SdcZone[];
  onSave: (zones: SdcZone[]) => void;
}) {
  const [zones, setZones] = useState<SdcZone[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddZone() {
    if (!newName.trim()) return;
    const zone: SdcZone = { id: createId(), name: newName.trim() };
    setZones((prev) => [...prev, zone]);
    setNewName("");
  }

  function handleDeleteSelected() {
    setZones((prev) => prev.filter((z) => !selected.has(z.id)));
    setSelected(new Set());
  }

  function handleDeleteAll() {
    setZones([]);
    setSelected(new Set());
  }

  function startEdit(zone: SdcZone) {
    setEditingId(zone.id);
    setEditingName(zone.name);
  }

  function confirmEdit() {
    if (!editingId || !editingName.trim()) return;
    setZones((prev) =>
      prev.map((z) =>
        z.id === editingId ? { ...z, name: editingName.trim() } : z
      )
    );
    setEditingId(null);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-semibold tracking-[-0.03em] text-black">
            Редактировать список
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="space-y-4 px-7 py-6">
          {/* Zone list */}
          <div className="space-y-2">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center gap-3 rounded-xl border border-[#dfe1ec] px-4 py-3"
              >
                <Checkbox
                  checked={selected.has(zone.id)}
                  onCheckedChange={() => toggleSelect(zone.id)}
                  className="size-5 rounded border-[#dfe1ec] data-[state=checked]:border-[#5566f6] data-[state=checked]:bg-[#5566f6]"
                />
                {editingId === zone.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-10 flex-1 rounded-xl border-[#dfe1ec] px-3 text-[16px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit();
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-md p-1 text-[#5566f6] hover:bg-[#f3f4fb]"
                      onClick={confirmEdit}
                    >
                      <Check className="size-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-[16px] text-black">
                      {zone.name}
                    </span>
                    <button
                      type="button"
                      className="rounded-md p-1 text-[#6f7282] hover:bg-[#f3f4fb]"
                      onClick={() => startEdit(zone)}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Selection actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-4 rounded-xl bg-[#f3f4fb] px-4 py-3">
              <span className="text-[14px] text-[#6f7282]">
                Выбрано: {selected.size}
              </span>
              <button
                type="button"
                className="text-[14px] font-medium text-[#ff3b30] hover:underline"
                onClick={handleDeleteSelected}
              >
                Удалить
              </button>
              <button
                type="button"
                className="text-[14px] font-medium text-[#ff3b30] hover:underline"
                onClick={handleDeleteAll}
              >
                Удалить все
              </button>
            </div>
          )}

          {/* Add new zone */}
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Новая зона..."
              className="h-12 flex-1 rounded-xl border-[#dfe1ec] px-4 text-[16px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddZone();
              }}
            />
            <Button
              type="button"
              size="icon"
              onClick={handleAddZone}
              disabled={!newName.trim()}
              className="size-12 rounded-xl bg-[#5566f6] text-white hover:bg-[#4b57ff]"
            >
              <Plus className="size-5" />
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => {
                props.onSave(zones);
                props.onOpenChange(false);
              }}
              className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] font-medium text-white hover:bg-[#4b57f3]"
            >
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Time Input Cell ─── */

function TimeCell({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { h, m } = value ? parseTime(value) : { h: "", m: "" };

  if (disabled) {
    return (
      <span className="text-[14px] text-[#6f7282]">{value || ""}</span>
    );
  }

  if (!editing && !value) {
    return (
      <button
        type="button"
        className="w-full text-center text-[14px] text-[#b0b3c4] hover:text-[#5566f6]"
        onClick={() => setEditing(true)}
      >
        —
      </button>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-center text-[14px] text-black hover:text-[#5566f6]"
        onClick={() => setEditing(true)}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <select
        value={h || "12"}
        onChange={(e) => {
          const newVal = `${e.target.value}:${m || "00"}`;
          onChange(newVal);
        }}
        className="h-8 w-12 rounded border border-[#dfe1ec] text-center text-[13px]"
      >
        {HOURS.map((hh) => (
          <option key={hh} value={hh}>
            {hh}
          </option>
        ))}
      </select>
      <span className="text-[13px]">:</span>
      <select
        value={m || "00"}
        onChange={(e) => {
          const newVal = `${h || "12"}:${e.target.value}`;
          onChange(newVal);
          setEditing(false);
        }}
        className="h-8 w-12 rounded border border-[#dfe1ec] text-center text-[13px]"
      >
        {MINUTES.map((mm) => (
          <option key={mm} value={mm}>
            {mm}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─── Print Header ─── */

function PrintHeader({
  organizationLabel,
  pageLabel,
}: {
  organizationLabel: string;
  pageLabel: string;
}) {
  return (
    <table className="sdc-header w-full border-collapse">
      <tbody>
        <tr>
          <td
            rowSpan={2}
            className="w-[270px] border border-black px-8 py-8 text-center text-[22px] font-semibold"
          >
            {organizationLabel}
          </td>
          <td className="border border-black px-8 py-4 text-center text-[18px] uppercase">
            СИСТЕМА ХАССП
          </td>
          <td
            rowSpan={2}
            className="w-[170px] border border-black px-8 py-8 text-center text-[18px] uppercase"
          >
            {pageLabel}
          </td>
        </tr>
        <tr>
          <td className="border border-black px-8 py-4 text-center text-[17px] italic uppercase">
            ЧЕК-ЛИСТ (ПАМЯТКА) ПРОВЕДЕНИЯ САНИТАРНОГО ДНЯ
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ─── Main Component ─── */

export function SanitaryDayChecklistDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  dateFrom,
  users,
  config: initialConfig,
  initialEntries,
  routeCode,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<SdcConfig>(() =>
    normalizeSdcConfig(initialConfig)
  );
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const entry = initialEntries[0];
    return entry ? normalizeSdcEntryData(entry.data).marks : {};
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editZonesOpen, setEditZonesOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SdcItem | null>(null);
  const [saving, setSaving] = useState(false);

  const isActive = status === "active";
  const { mobileView, switchMobileView } = useMobileView("sanitary_day_control");
  const organizationLabel = organizationName || 'ООО "Тест"';
  const documentTitle = title || getSanitaryDayChecklistTitle(routeCode);
  const entryDate = dateFrom;

  // Group items by zone
  const zoneGroups = useMemo(() => {
    return config.zones.map((zone, zoneIndex) => ({
      zone,
      zoneIndex,
      items: config.items.filter((item) => item.zoneId === zone.id),
    }));
  }, [config.zones, config.items]);

  // Save config to server
  const saveConfig = useCallback(
    async (newConfig: SdcConfig) => {
      setSaving(true);
      try {
        await requestJson(`/api/journal-documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: newConfig }),
        });
        setConfig(newConfig);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка сохранения"
        );
      } finally {
        setSaving(false);
      }
    },
    [documentId]
  );

  // Save marks to server
  const saveMarks = useCallback(
    async (newMarks: Record<string, string>) => {
      try {
        await requestJson(`/api/journal-documents/${documentId}/entries`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: "system",
            date: entryDate,
            data: { marks: newMarks },
          }),
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Ошибка сохранения"
        );
      }
    },
    [documentId, entryDate]
  );

  // Handlers
  function handleToggleCheck(itemId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleTimeChange(itemId: string, time: string) {
    const newMarks = { ...marks, [itemId]: time };
    setMarks(newMarks);
    saveMarks(newMarks);
  }

  function handleAddItem(zoneId: string, text: string) {
    const newItem: SdcItem = { id: createId(), zoneId, text };
    const newConfig = {
      ...config,
      items: [...config.items, newItem],
    };
    saveConfig(newConfig);
  }

  function handleEditItem(itemId: string, zoneId: string, text: string) {
    const newConfig = {
      ...config,
      items: config.items.map((item) =>
        item.id === itemId ? { ...item, zoneId, text } : item
      ),
    };
    saveConfig(newConfig);
  }

  function handleDeleteItem(itemId: string) {
    const newConfig = {
      ...config,
      items: config.items.filter((item) => item.id !== itemId),
    };
    saveConfig(newConfig);
  }

  function handleSaveZones(zones: SdcZone[]) {
    const zoneIds = new Set(zones.map((z) => z.id));
    const newConfig = {
      ...config,
      zones,
      items: config.items.filter((item) => zoneIds.has(item.zoneId)),
    };
    saveConfig(newConfig);
  }

  function openEditItem(item: SdcItem) {
    setEditingItem(item);
    setEditItemOpen(true);
  }

  return (
    <div className="bg-white text-black">
      <DocumentBackLink href={`/journals/${routeCode}`} documentId={documentId} />
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body {
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .screen-only {
            display: none !important;
          }

          .sdc-sheet {
            width: 100%;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .sdc-header td {
            font-size: 11px !important;
            line-height: 1.15 !important;
            padding: 8px 10px !important;
          }

          .sdc-table th,
          .sdc-table td {
            font-size: 10px !important;
            line-height: 1.2 !important;
            padding: 4px 3px !important;
          }
        }
      `}</style>

      <div className="sdc-sheet mx-auto max-w-[960px] px-4 py-4 sm:px-8 sm:py-6">
        {/* ─── Toolbar (screen only) ─── */}
        <div className="screen-only mb-6 space-y-4 sm:mb-10 sm:space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              {title || getSanitaryDayChecklistTitle(routeCode)}
            </h1>
            {isActive && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-11 shrink-0 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff] self-start sm:self-auto"
              >
                Настройки журнала
              </Button>
            )}
          </div>

          {isActive && (
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <Button
                type="button"
                onClick={() => setAddItemOpen(true)}
                className="h-[58px] rounded-2xl bg-[#5566f6] px-6 text-[16px] text-white hover:bg-[#4b57ff] sm:px-8 sm:text-[18px]"
              >
                <Plus className="mr-2 size-5" />
                Добавить
              </Button>
              <button
                type="button"
                className="text-[16px] font-medium text-[#3848c7] hover:underline sm:text-[18px]"
                onClick={() => setEditZonesOpen(true)}
              >
                Редактировать списки
              </button>
            </div>
          )}
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 lg:overflow-visible sm:px-0 print:mx-0 print:overflow-visible print:px-0">
        <div className="min-w-[1100px] sm:min-w-0">

        {/* ─── Print Header ─── */}
        <div className="mb-8">
          <PrintHeader
            organizationLabel={organizationLabel}
            pageLabel="СТР. 1 ИЗ 1"
          />
        </div>

        {/* ─── Date Row ─── */}
        <div className="mb-6 flex items-center gap-3 text-[18px]">
          <span className="font-semibold uppercase">Дата проведения</span>
          <span>{formatRuDate(entryDate)}</span>
        </div>

        <div className="sm:hidden print:hidden mb-6">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <div className="space-y-4 sm:hidden print:hidden">
            {zoneGroups.map(({ zone, items }, zoneIndex) => (
              <div
                key={zone.id}
                className="overflow-hidden rounded-2xl border border-[#ececf4] bg-white"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[#ececf4] bg-[#fafbff] px-4 py-3">
                  <span className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#0b1024]">
                    {zoneIndex + 1}. {zone.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#6f7282]">
                    {items.filter((it) => checked.has(it.id)).length}/{items.length}
                  </span>
                </div>
                <ul className="divide-y divide-[#ececf4]">
                  {items.map((item) => {
                    const isChecked = checked.has(item.id);
                    const time = marks[item.id];
                    return (
                      <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <button
                          type="button"
                          disabled={!isActive}
                          onClick={() => handleToggleCheck(item.id)}
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-60 ${
                            isChecked
                              ? "border-[#5566f6] bg-[#5566f6] text-white"
                              : "border-[#dcdfed] bg-white"
                          }`}
                          aria-label={isChecked ? "Снять отметку" : "Отметить выполненным"}
                        >
                          {isChecked ? "✓" : ""}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            disabled={!isActive}
                            onClick={() => openEditItem(item)}
                            className="text-left text-[14px] text-[#0b1024] hover:text-[#5566f6] disabled:cursor-default disabled:text-[#0b1024]"
                          >
                            {item.text}
                          </button>
                          {time ? (
                            <div className="mt-1 text-[12px] text-[#6f7282]">
                              Отмечено: {time}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                  {items.length === 0 ? (
                    <li className="px-4 py-4 text-center text-[13px] text-[#9b9fb3]">
                      В зоне пока нет пунктов.
                    </li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <MobileViewTableWrapper mobileView={mobileView}>
        {/* ─── Checklist Table ─── */}
        <table className="sdc-table w-full border-collapse text-[15px]">
          <thead>
            <tr className="bg-[#f2f2f2]">
              <th className="w-[48px] border border-black p-2 text-center font-semibold">
                <span className="screen-only">✓</span>
              </th>
              <th className="w-[72px] border border-black p-2 text-center font-semibold">
                № п/п
              </th>
              <th className="border border-black p-2 text-center font-semibold">
                Действия
              </th>
              <th className="w-[130px] border border-black p-2 text-center font-semibold">
                Отметка времени
              </th>
            </tr>
          </thead>
          <tbody>
            {zoneGroups.map(({ zone, zoneIndex, items }) => (
              <ZoneBlock
                key={zone.id}
                zone={zone}
                zoneIndex={zoneIndex}
                items={items}
                config={config}
                marks={marks}
                checked={checked}
                showPrinciples={zoneIndex === 0}
                generalPrinciples={config.generalPrinciples}
                isActive={isActive}
                onToggleCheck={handleToggleCheck}
                onTimeChange={handleTimeChange}
                onEditItem={openEditItem}
                onDeleteItem={handleDeleteItem}
              />
            ))}

            {/* Empty row for visual spacing */}
            <tr>
              <td className="border border-black p-2" />
              <td className="border border-black p-2" />
              <td className="border border-black p-2" />
              <td className="border border-black p-2" />
            </tr>
          </tbody>
        </table>
        </MobileViewTableWrapper>

        {/* ─── Signatures ─── */}
        <div className="mt-10 space-y-6 text-[16px]">
          <div className="flex items-end justify-between">
            <span className="font-semibold uppercase">Выполнил:</span>
            <span className="min-w-[200px] border-b border-black text-right">
              {config.responsibleName}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <span className="font-semibold uppercase">Проверил:</span>
            <span className="min-w-[200px] border-b border-black text-right">
              {config.checkerName}
            </span>
          </div>
        </div>

        </div>
        </div>
      </div>

      {/* ─── Dialogs ─── */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        documentId={documentId}
        title={documentTitle}
        dateFrom={entryDate}
        onSaved={() => router.refresh()}
      />
      {addItemOpen && (
        <AddItemDialog
          key={`add-item-${config.zones[0]?.id || "empty"}`}
          open={addItemOpen}
          onOpenChange={setAddItemOpen}
          zones={config.zones}
          onAdd={handleAddItem}
        />
      )}
      {editItemOpen && (
        <EditItemDialog
          key={`edit-item-${editingItem?.id || "empty"}`}
          open={editItemOpen}
          onOpenChange={setEditItemOpen}
          zones={config.zones}
          item={editingItem}
          onSave={handleEditItem}
        />
      )}
      {editZonesOpen && (
        <EditZonesDialog
          key={`edit-zones-${config.zones.map((zone) => zone.id).join("-")}`}
          open={editZonesOpen}
          onOpenChange={setEditZonesOpen}
          zones={config.zones}
          onSave={handleSaveZones}
        />
      )}
    </div>
  );
}

/* ─── Zone Block ─── */

function ZoneBlock({
  zone,
  zoneIndex,
  items,
  config,
  marks,
  checked,
  showPrinciples,
  generalPrinciples,
  isActive,
  onToggleCheck,
  onTimeChange,
  onEditItem,
  onDeleteItem,
}: {
  zone: SdcZone;
  zoneIndex: number;
  items: SdcItem[];
  config: SdcConfig;
  marks: Record<string, string>;
  checked: Set<string>;
  showPrinciples: boolean;
  generalPrinciples: string[];
  isActive: boolean;
  onToggleCheck: (id: string) => void;
  onTimeChange: (id: string, time: string) => void;
  onEditItem: (item: SdcItem) => void;
  onDeleteItem: (id: string) => void;
}) {
  return (
    <>
      {/* Zone header */}
      <tr className="bg-[#e8e8e8]">
        <td colSpan={4} className="border border-black p-3 text-center">
          <span className="text-[16px] font-bold uppercase">
            {zoneIndex + 1} {zone.name.toUpperCase()}
          </span>
        </td>
      </tr>

      {/* General principles (only after first zone header) */}
      {showPrinciples && generalPrinciples.length > 0 && (
        <tr>
          <td colSpan={4} className="border border-black px-4 py-3">
            <div className="text-[14px] font-semibold uppercase">
              Общие принципы
            </div>
            <ul className="mt-1 list-disc pl-5 text-[14px] leading-relaxed text-[#333]">
              {generalPrinciples.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}

      {/* Items */}
      {items.map((item) => {
        const itemNumber = getItemNumber(config, item);
        const isChecked = checked.has(item.id);
        const timeValue = marks[item.id] || "";

        return (
          <tr
            key={item.id}
            className={isChecked ? "bg-[#f0fff0]" : "hover:bg-[#fafbff]"}
          >
            {/* Checkbox */}
            <td className="border border-black p-2 text-center">
              {isActive && (
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggleCheck(item.id)}
                  className="size-5 rounded border-[#dfe1ec] data-[state=checked]:border-[#5566f6] data-[state=checked]:bg-[#5566f6]"
                />
              )}
            </td>

            {/* Number */}
            <td className="border border-black p-2 text-center text-[14px]">
              {itemNumber}
            </td>

            {/* Description */}
            <td
              className={`border border-black px-3 py-2 ${isActive ? "cursor-pointer hover:bg-[#f5f6ff]" : ""}`}
              onClick={() => isActive && onEditItem(item)}
            >
              <div className="group flex items-start gap-2">
                <div className="flex-1 whitespace-pre-line text-[14px] leading-relaxed">
                  {item.text}
                </div>
                {isActive && (
                  <div
                    className="screen-only flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="rounded p-1 text-[#6f7282] hover:bg-[#f3f4fb] hover:text-[#5566f6]"
                      onClick={() => onEditItem(item)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-[#6f7282] hover:bg-[#fff0f0] hover:text-[#ff3b30]"
                      onClick={() => onDeleteItem(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </td>

            {/* Time */}
            <td className="border border-black p-2 text-center">
              <TimeCell
                value={timeValue}
                onChange={(v) => onTimeChange(item.id, v)}
                disabled={!isActive}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
