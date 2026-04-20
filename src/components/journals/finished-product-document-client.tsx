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
import { FocusTodayScroller } from "@/components/journals/focus-today-scroller";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";
import {
  RecordCardsView,
  type RecordCardItem,
} from "@/components/journals/record-cards-view";

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
  const { mobileView, switchMobileView } = useMobileView("finished_product");

  const cardItems: RecordCardItem[] = config.rows.map((row, index) => ({
    id: row.id,
    title: `№${index + 1} · ${row.productName || "—"}`,
    subtitle: row.productionDateTime || undefined,
    leading: !readOnly ? (
      <Checkbox
        checked={selectedRows.includes(row.id)}
        onCheckedChange={(value) =>
          setSelectedRows((prev) =>
            value === true
              ? [...new Set([...prev, row.id])]
              : prev.filter((item) => item !== row.id)
          )
        }
        className="size-5"
      />
    ) : null,
    fields: [
      { label: "Время снятия бракеража", value: row.rejectionTime, hideIfEmpty: true },
      { label: "Органолептика", value: row.organoleptic, hideIfEmpty: true },
      config.showProductTemp
        ? { label: "T°C внутри продукта", value: row.productTemp, hideIfEmpty: true }
        : null,
      config.showCorrectiveAction
        ? { label: "Корректирующие действия", value: row.correctiveAction, hideIfEmpty: true }
        : null,
      { label: "Разрешение к реализации", value: row.releasePermissionTime, hideIfEmpty: true },
      config.showCourierTime
        ? { label: "Передача курьеру", value: row.courierTransferTime, hideIfEmpty: true }
        : null,
      { label: "Исполнитель", value: row.responsiblePerson, hideIfEmpty: true },
      { label: "Провёл бракераж", value: row.inspectorName, hideIfEmpty: true },
    ].filter((f): f is { label: string; value: string; hideIfEmpty: boolean } => f !== null),
  }));

  const productOptions = useMemo(() => Array.from(new Set(config.itemsCatalog)).filter(Boolean), [config.itemsCatalog]);
  // Dedupe by name — multiple staff records can carry identical full
  // names ("Титов Максим Андреевич"), and React would warn about
  // duplicate keys in the <datalist> below. The select still falls
  // back to a free-text input, so dropping ID-disambiguation here is
  // safe for the autosuggest UX.
  const personOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.name).filter(Boolean))),
    [users]
  );

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

  async function saveDraftRow() {
    const nextConfig = { ...config, rows: [...config.rows, draftRow] };
    setConfig(nextConfig);
    await saveConfig(nextConfig);
    setDraftRow(createDraft(users));
    setAddModalOpen(false);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayFocusRowId = config.rows.find((row) => row.productionDateTime.slice(0, 10) === todayKey)?.id;

  return (
    <div className="space-y-6 text-black">
      <FocusTodayScroller
        onCreate={!readOnly ? () => setAddModalOpen(true) : undefined}
      />
      <div className="rounded-[28px] bg-white px-4 py-5 shadow-sm sm:px-8 sm:py-7">
        <DocumentPageHeader
          backHref="/journals/finished_product"
          documentId={documentId}
          rightActions={
            !readOnly ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 className="size-4" />Настройки журнала
              </Button>
            ) : null
          }
        />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">{title}</h1>
        </div>
      </div>

      {!readOnly ? (
        <div className="flex justify-end">
          <DocumentCloseButton
            documentId={documentId}
            title={title}
            variant="outline"
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
          >
            Закончить журнал
          </DocumentCloseButton>
        </div>
      ) : null}

      <div className="space-y-5 overflow-hidden rounded-[20px] border bg-white p-4 sm:p-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <table className="w-full min-w-[640px] border-collapse sm:min-w-0">
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
        </div>

        <h2 className="text-center text-[20px] font-semibold uppercase leading-tight sm:text-[30px]">Журнал бракеража готовой пищевой продукции</h2>

        {!readOnly && <div className="flex flex-wrap gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] hover:bg-[#4d58f5]"><Plus className="size-5" />Добавить<ChevronDown className="ml-1 size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[300px] rounded-[24px] border-0 p-3 shadow-xl">
              <DropdownMenuItem className="h-11 rounded-2xl px-4 text-[18px]" onSelect={() => setAddModalOpen(true)}>Добавить изделие</DropdownMenuItem>
              <DropdownMenuItem className="h-11 rounded-2xl px-4 text-[18px]" onSelect={() => { const count = Number(window.prompt("Сколько изделий добавить?", "3") || "0"); if (count > 0) { for (let i = 0; i < count; i += 1) setConfig((prev) => ({ ...prev, rows: [...prev.rows, createDraft(users)] })); } }}>Добавить несколько изделий</DropdownMenuItem>
              <DropdownMenuItem className="h-11 rounded-2xl px-4 text-[18px]" onSelect={() => { const text = window.prompt("Вставьте названия изделий, каждое с новой строки:"); if (!text) return; const items = text.split("\n").map((item) => item.trim()).filter(Boolean); setConfig((prev) => ({ ...prev, rows: [...prev.rows, ...items.map((item) => createDraft(users, item))] })); }}>Добавить из файла</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" className="h-11 rounded-2xl border-0 bg-[#f5f6ff] px-4 text-[15px] text-[#3848c7] hover:bg-[#eceeff]" onClick={() => setCatalogOpen(true)}>Редактировать список изделий</Button>
          <Button type="button" variant="outline" onClick={removeSelectedRows} disabled={selectedRows.length === 0}><Trash2 className="size-4" />Удалить выбранные</Button>
          <Button type="button" onClick={() => saveConfig()} disabled={isSaving || isPending}><Save className="size-4" />{isSaving ? "Сохранение..." : "Сохранить"}</Button>
        </div>}

        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView items={cardItems} emptyLabel="Бракеража пока не зарегистрировано." />
        ) : null}

        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[1650px] w-full border-collapse text-sm">
            <thead><tr>
              <th className="w-10 border p-2" /><th className="border p-2">Дата, время изготовления</th><th className="border p-2">Время снятия бракеража</th><th className="border p-2">{config.fieldNameMode === "semi" ? "Наименование полуфабриката" : "Наименование блюд (изделий)"}</th><th className="border p-2">Органолептическая оценка</th>
              {config.showProductTemp && <th className="border p-2">T°C внутри продукта</th>}
              {config.showCorrectiveAction && <th className="border p-2">Корректирующие действия</th>}
              <th className="border p-2">Разрешение к реализации (время)</th>
              {config.showCourierTime && <th className="border p-2">Время передачи блюд курьеру</th>}
              <th className="border p-2">Ответственный исполнитель</th><th className="border p-2">{config.inspectorMode === "commission_signatures" ? "Подписи членов комиссии" : "ФИО лица, проводившего бракераж"}</th>
            </tr></thead>
            <tbody>{config.rows.map((row) => <tr key={row.id} data-focus-today={row.id === todayFocusRowId ? "" : undefined}>
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
        </MobileViewTableWrapper>
        <div className="text-[18px] underline">{config.footerNote}</div>
      </div>

      <section className="space-y-4 overflow-hidden rounded-[20px] border bg-white p-4 sm:p-6">
        <h3 className="text-[18px] font-semibold leading-tight sm:text-[24px]">Рекомендации по организации контроля за доброкачественностью готовой пищи</h3>
        {QUALITY_GUIDELINES.map((item) => <p key={item} className="text-[18px] leading-8">{item}</p>)}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[900px] w-full border-collapse text-[18px]"><thead><tr><th className="border border-black p-3">Группа</th><th className="border border-black p-3">Наименование продукта</th><th className="border border-black p-3">°C</th></tr></thead><tbody>{TEMPERATURE_GUIDELINES.map(([group, name, temperature]) => <tr key={group}><td className="border border-black p-3 text-center font-semibold">{group}</td><td className="border border-black p-3">{name}</td><td className="border border-black p-3 text-center font-semibold">{temperature}</td></tr>)}</tbody></table>
        </div>
      </section>

      <Dialog open={readOnly ? false : addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden rounded-[24px] border-0 p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#0b1024]">
              Добавление новой строки
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(92vh-160px)] space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Дата и время изготовления</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.productionDateTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, productionDateTime: mergeDateTime(e.target.value, parseDateTime(prev.productionDateTime).time) }))} />
                <Input type="time" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.productionDateTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, productionDateTime: mergeDateTime(parseDateTime(prev.productionDateTime).date, e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Время снятия бракеража</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.rejectionTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, rejectionTime: mergeDateTime(e.target.value, parseDateTime(prev.rejectionTime).time) }))} />
                <Input type="time" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.rejectionTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, rejectionTime: mergeDateTime(parseDateTime(prev.rejectionTime).date, e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Наименование изделия</Label>
              <Input className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={draftRow.productName} onChange={(e) => setDraftRow((prev) => ({ ...prev, productName: e.target.value }))} list="finished-product-items" />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Органолептическая оценка</Label>
              <Input className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={draftRow.organoleptic} onChange={(e) => setDraftRow((prev) => ({ ...prev, organoleptic: e.target.value }))} />
            </div>
            {config.showProductTemp ? (
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">T°C внутри продукта</Label>
                <Input className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={draftRow.productTemp} onChange={(e) => setDraftRow((prev) => ({ ...prev, productTemp: e.target.value }))} />
              </div>
            ) : null}
            {config.showCorrectiveAction ? (
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Корректирующие действия</Label>
                <Textarea className="rounded-2xl border-[#dcdfed] px-4 py-3 text-[15px]" value={draftRow.correctiveAction} onChange={(e) => setDraftRow((prev) => ({ ...prev, correctiveAction: e.target.value }))} />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Разрешение к реализации</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["yes", "Да", "#136b2a", "#ecfdf5"],
                    ["no", "Нет", "#d2453d", "#fff4f2"],
                  ] as const
                ).map(([value, label, fg, bg]) => {
                  const active = draftRow.releaseAllowed === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDraftRow((prev) => ({ ...prev, releaseAllowed: value }))}
                      className={`flex h-11 items-center justify-center rounded-2xl border px-4 text-[14px] font-medium transition-colors ${active ? "border-transparent text-white" : "border-[#dcdfed] bg-white text-[#0b1024] hover:bg-[#fafbff]"}`}
                      style={active ? { backgroundColor: fg, color: "white" } : { backgroundColor: bg, color: fg, borderColor: bg }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Дата и время разрешения</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.releasePermissionTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, releasePermissionTime: mergeDateTime(e.target.value, parseDateTime(prev.releasePermissionTime).time) }))} />
                <Input type="time" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.releasePermissionTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, releasePermissionTime: mergeDateTime(parseDateTime(prev.releasePermissionTime).date, e.target.value) }))} />
              </div>
            </div>
            {config.showCourierTime ? (
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">Дата и время передачи блюд курьеру</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.courierTransferTime).date} onChange={(e) => setDraftRow((prev) => ({ ...prev, courierTransferTime: mergeDateTime(e.target.value, parseDateTime(prev.courierTransferTime).time) }))} />
                  <Input type="time" className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={parseDateTime(draftRow.courierTransferTime).time} onChange={(e) => setDraftRow((prev) => ({ ...prev, courierTransferTime: mergeDateTime(parseDateTime(prev.courierTransferTime).date, e.target.value) }))} />
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">Ответственный исполнитель</Label>
              <Input className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={draftRow.responsiblePerson} onChange={(e) => setDraftRow((prev) => ({ ...prev, responsiblePerson: e.target.value }))} list="finished-product-users" />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">{config.inspectorMode === "commission_signatures" ? "Подписи членов комиссии" : "Лицо, проводившее бракераж"}</Label>
              <Input className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]" value={draftRow.inspectorName} onChange={(e) => setDraftRow((prev) => ({ ...prev, inspectorName: e.target.value }))} list="finished-product-users" />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11 w-full rounded-2xl border-[#dcdfed] px-5 text-[14px] font-medium text-[#0b1024] shadow-none hover:bg-[#fafbff] sm:w-auto" onClick={() => setAddModalOpen(false)}>Отмена</Button>
            <Button type="button" className="h-11 w-full rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] sm:w-auto" onClick={() => { void saveDraftRow(); }} disabled={isSaving}>
              {isSaving ? "Сохранение…" : "Добавить запись"}
            </Button>
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
          {Array.from(new Set(config.itemsCatalog)).map((item) => <div key={item} className="flex items-center gap-2 rounded-lg border p-2"><div className="flex-1">{item}</div><Button type="button" variant="ghost" onClick={() => setConfig((prev) => ({ ...prev, itemsCatalog: prev.itemsCatalog.filter((catalogItem) => catalogItem !== item) }))}><Trash2 className="size-4" /></Button></div>)}
          <div className="flex gap-2"><Input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Введите название нового изделия" /><Button onClick={() => { if (!newItemName.trim()) return; setConfig((prev) => ({ ...prev, itemsCatalog: Array.from(new Set([...prev.itemsCatalog, newItemName.trim()])) })); setNewItemName(""); }}><Plus className="size-4" /></Button></div>
        </div></DialogContent>
      </Dialog>
    </div>
  );
}
