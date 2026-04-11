"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Printer, Save, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  createFinishedProductRow,
  normalizeFinishedProductDocumentConfig,
  type FinishedProductDocumentConfig,
  type FinishedProductDocumentRow,
} from "@/lib/finished-product-document";

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

type NewRowDraft = FinishedProductDocumentRow;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const dt = new Date();
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function dateTimeParts(value: string) {
  if (!value) return { date: nowDate(), time: nowTime() };
  const [date, time = "00:00"] = value.split(" ");
  return { date, time };
}

function mergeDateTime(date: string, time: string) {
  return `${date} ${time}`;
}

const QUALITY_GUIDELINES = [
  "Контроль за доброкачественностью пищи заключается в проведении бракеража готовой продукции, который проводится органолептическим методом.",
  "Органолептическую оценку начинают с внешнего осмотра образцов пищи. Осмотр лучше проводить при дневном свете.",
  "Затем определяют запах пищи. Лучше всего запах определяется при затаенном дыхании.",
  "Вкус пищи, как и запах, следует устанавливать при характерной для нее температуре.",
];

const QUALITY_CRITERIA = [
  "«Отлично» - блюдо приготовлено в соответствии с технологией.",
  "«Хорошо» - незначительные изменения в технологии, которые можно исправить.",
  "«Удовлетворительно» - изменения в технологии привели к изменению вкуса и качества, но дефекты еще можно исправить.",
  "«Неудовлетворительно» - блюдо к раздаче не допускается, требуется замена блюда.",
];

const TEMPERATURE_GUIDELINES = [
  { group: "A", name: "Натуральные рубленые изделия из мяса", temperature: "+85" },
  { group: "B", name: "Изделия из фарша: котлеты, биточки, тефтели, зразы", temperature: "+90" },
  { group: "C", name: "Мясо, рыба, ракообразные", temperature: "+68" },
  { group: "D", name: "Домашняя птица, яйца, рыба, мясо измельченное", temperature: "+74" },
  { group: "E", name: "Цельная говядина, баранина, рыба для употребления в холодном виде", temperature: "+65" },
  { group: "G", name: "Холодные блюда: салаты, десерты", temperature: "+2..+5" },
  { group: "H", name: "Горячие блюда: супы, соусы", temperature: ">+75" },
];

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
  const readOnly = status === "closed";
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [activeListId, setActiveListId] = useState<string>("");
  const [draftRow, setDraftRow] = useState<NewRowDraft>(() =>
    createFinishedProductRow({
      productionDateTime: mergeDateTime(nowDate(), nowTime()),
      rejectionTime: mergeDateTime(nowDate(), nowTime()),
      releasePermissionTime: mergeDateTime(nowDate(), nowTime()),
      courierTransferTime: mergeDateTime(nowDate(), nowTime()),
      responsiblePerson: users[0]?.name || "",
      inspectorName: users[1]?.name || users[0]?.name || "",
      releaseAllowed: "yes",
    })
  );

  const personOptions = useMemo(() => users.map((u) => u.name), [users]);
  const productOptions = useMemo(() => {
    const fromLists = config.productLists.flatMap((list) => list.items);
    return Array.from(new Set([...config.itemsCatalog, ...fromLists])).filter(Boolean);
  }, [config.itemsCatalog, config.productLists]);

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
      window.alert("Не удалось сохранить журнал");
    } finally {
      setIsSaving(false);
    }
  }

  function updateRow(id: string, patch: Partial<FinishedProductDocumentRow>) {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }

  function toggleRow(id: string, checked: boolean) {
    if (readOnly) return;
    setSelectedRows((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  function removeSelectedRows() {
    if (readOnly) return;
    if (selectedRows.length === 0) return;
    setConfig((prev) => ({ ...prev, rows: prev.rows.filter((row) => !selectedRows.includes(row.id)) }));
    setSelectedRows([]);
  }

  function addSingleRow(productName = "") {
    if (readOnly) return;
    setConfig((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        createFinishedProductRow({
          productName,
          productionDateTime: mergeDateTime(nowDate(), nowTime()),
          rejectionTime: mergeDateTime(nowDate(), nowTime()),
          releasePermissionTime: mergeDateTime(nowDate(), nowTime()),
          courierTransferTime: mergeDateTime(nowDate(), nowTime()),
          responsiblePerson: users[0]?.name || "",
          inspectorName: users[1]?.name || users[0]?.name || "",
          releaseAllowed: "yes",
        }),
      ],
    }));
  }

  function addRowsFromList() {
    if (readOnly) return;
    const list = config.productLists.find((l) => l.id === activeListId);
    if (!list) return;
    list.items.forEach((item) => addSingleRow(item));
  }

  function addFromFile() {
    if (readOnly) return;
    const text = window.prompt("Вставьте названия изделий, каждое с новой строки:");
    if (!text) return;
    text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((item) => addSingleRow(item));
  }

  function addList() {
    if (readOnly) return;
    if (!newListName.trim()) return;
    const id = `list-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      productLists: [...prev.productLists, { id, name: newListName.trim(), items: [] }],
    }));
    setNewListName("");
  }

  function addItemToCatalog() {
    if (readOnly) return;
    if (!newItemName.trim()) return;
    setConfig((prev) => ({
      ...prev,
      itemsCatalog: [...prev.itemsCatalog, newItemName.trim()],
    }));
    setNewItemName("");
  }

  function addItemToActiveList(item: string) {
    if (readOnly) return;
    if (!activeListId) return;
    setConfig((prev) => ({
      ...prev,
      productLists: prev.productLists.map((list) =>
        list.id === activeListId && !list.items.includes(item)
          ? { ...list, items: [...list.items, item] }
          : list
      ),
    }));
  }

  function saveDraftRow() {
    if (readOnly) return;
    setConfig((prev) => ({ ...prev, rows: [...prev.rows, draftRow] }));
    setDraftRow(
      createFinishedProductRow({
        productionDateTime: mergeDateTime(nowDate(), nowTime()),
        rejectionTime: mergeDateTime(nowDate(), nowTime()),
        releasePermissionTime: mergeDateTime(nowDate(), nowTime()),
        courierTransferTime: mergeDateTime(nowDate(), nowTime()),
        responsiblePerson: users[0]?.name || "",
        inspectorName: users[1]?.name || users[0]?.name || "",
        releaseAllowed: "yes",
      })
    );
    setAddModalOpen(false);
  }

  return (
    <div className="space-y-6 text-black">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[#7a7f93]">{organizationName}</div>
          <h1 className="text-[48px] font-semibold tracking-[-0.03em]">{title}</h1>
        </div>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Печать журнала
        </Button>
      </div>

      <div className="space-y-4 rounded-[20px] border bg-white p-6">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-[18%] border border-black p-3 text-center font-semibold">{organizationName}</td>
              <td className="border border-black p-2 text-center">СИСТЕМА ХАССП</td>
              <td className="w-[20%] border border-black p-2">Начат &nbsp; {new Date(dateFrom).toLocaleDateString("ru-RU")}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-sm uppercase">ЖУРНАЛ БРАКЕРАЖА ГОТОВОЙ ПИЩЕВОЙ ПРОДУКЦИИ</td>
              <td className="border border-black p-2">Окончен &nbsp; {status === "closed" ? new Date(dateTo).toLocaleDateString("ru-RU") : "________"}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-center text-[36px] font-semibold">ЖУРНАЛ БРАКЕРАЖА ГОТОВОЙ ПИЩЕВОЙ ПРОДУКЦИИ</h2>

        <div className="flex flex-wrap gap-3">
          {!readOnly && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" className="bg-[#5b66ff] hover:bg-[#4d58f5]">
                <Plus className="size-4" />
                Добавить
                <ChevronDown className="ml-1 size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[280px] rounded-2xl border-0 p-2">
              <DropdownMenuItem onSelect={() => setAddModalOpen(true)}>Добавить изделие</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  const count = Number(window.prompt("Сколько изделий добавить?", "3") || "0");
                  if (count > 0) for (let i = 0; i < count; i += 1) addSingleRow();
                }}
              >
                Добавить несколько изделий
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={addRowsFromList}>Добавить из списка</DropdownMenuItem>
              <DropdownMenuItem onSelect={addFromFile}>Добавить из файла</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.alert("Интеграция iiko будет подключена отдельно")}>
                Добавить из Айко
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
          <Button type="button" className="bg-[#5b66ff] hover:bg-[#4d58f5]" onClick={() => setAddModalOpen(true)} disabled={readOnly}>
            <Plus className="size-4" />
            Добавить изделие
          </Button>
          <Button type="button" variant="outline" onClick={() => setListModalOpen(true)} disabled={readOnly}>
            Редактировать список изделий
          </Button>
          <Button type="button" variant="outline" onClick={removeSelectedRows} disabled={readOnly || selectedRows.length === 0}>
            <Trash2 className="size-4" />
            Удалить выбранные
          </Button>
          <Button type="button" onClick={() => saveConfig()} disabled={readOnly || isSaving || isPending}>
            <Save className="size-4" />
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1800px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-10 border p-2" />
                <th className="border p-2">Дата, время изготовления</th>
                <th className="border p-2">Время снятия бракеража</th>
                <th className="border p-2">
                  {config.fieldNameMode === "semi"
                    ? "Наименование полуфабриката"
                    : "Наименование блюд (изделий)"}
                </th>
                <th className="border p-2">Органолептическая оценка (включая оценку степени готовности)</th>
                {config.showProductTemp && <th className="border p-2">Т°С внутри продукта</th>}
                {config.showCorrectiveAction && <th className="border p-2">Корректирующие действия</th>}
                {config.showOxygenLevel && <th className="border p-2">Остаточный уровень кислорода, % об.</th>}
                <th className="border p-2">Разрешение к реализации (время)</th>
                {config.showCourierTime && <th className="border p-2">Время передачи блюд курьеру</th>}
                <th className="border p-2">Ответственный исполнитель (ФИО, должность)</th>
                <th className="border p-2">
                  {config.inspectorMode === "commission_signatures"
                    ? "Подписи членов бракеражной комиссии"
                    : "ФИО лица, проводившего бракераж"}
                </th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row) => (
                <tr key={row.id}>
                  <td className="border p-2 align-top">
                    <Checkbox
                      checked={selectedRows.includes(row.id)}
                      onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.productionDateTime}
                      onChange={(e) => updateRow(row.id, { productionDateTime: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.rejectionTime}
                      onChange={(e) => updateRow(row.id, { rejectionTime: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.productName}
                      onChange={(e) => updateRow(row.id, { productName: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.organoleptic}
                      onChange={(e) => updateRow(row.id, { organoleptic: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  {config.showProductTemp && (
                    <td className="border p-1 align-top">
                      <Input
                        value={row.productTemp}
                        onChange={(e) => updateRow(row.id, { productTemp: e.target.value })}
                        className="border-0 shadow-none"
                        disabled={readOnly}
                      />
                    </td>
                  )}
                  {config.showCorrectiveAction && (
                    <td className="border p-1 align-top">
                      <Input
                        value={row.correctiveAction}
                        onChange={(e) => updateRow(row.id, { correctiveAction: e.target.value })}
                        className="border-0 shadow-none"
                        disabled={readOnly}
                      />
                    </td>
                  )}
                  {config.showOxygenLevel && (
                    <td className="border p-1 align-top">
                      <Input
                        value={row.oxygenLevel}
                        onChange={(e) => updateRow(row.id, { oxygenLevel: e.target.value })}
                        className="border-0 shadow-none"
                        disabled={readOnly}
                      />
                    </td>
                  )}
                  <td className="border p-1 align-top">
                    <Input
                      value={row.releasePermissionTime}
                      onChange={(e) => updateRow(row.id, { releasePermissionTime: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  {config.showCourierTime && (
                    <td className="border p-1 align-top">
                      <Input
                        value={row.courierTransferTime}
                        onChange={(e) => updateRow(row.id, { courierTransferTime: e.target.value })}
                        className="border-0 shadow-none"
                        disabled={readOnly}
                      />
                    </td>
                  )}
                  <td className="border p-1 align-top">
                    <Input
                      value={row.responsiblePerson}
                      onChange={(e) => updateRow(row.id, { responsiblePerson: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.inspectorName}
                      onChange={(e) => updateRow(row.id, { inspectorName: e.target.value })}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-2 text-[18px] underline">{config.footerNote}</div>
      </div>

      <Dialog open={readOnly ? false : addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Добавление новой строки</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <Label>Дата и время изготовления</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateTimeParts(draftRow.productionDateTime).date}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    productionDateTime: mergeDateTime(
                      e.target.value,
                      dateTimeParts(prev.productionDateTime).time
                    ),
                  }))
                }
              />
              <Input
                type="time"
                value={dateTimeParts(draftRow.productionDateTime).time}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    productionDateTime: mergeDateTime(
                      dateTimeParts(prev.productionDateTime).date,
                      e.target.value
                    ),
                  }))
                }
              />
            </div>

            <Label>Время снятия бракеража</Label>
            <Input
              value={draftRow.rejectionTime}
              onChange={(e) => setDraftRow((prev) => ({ ...prev, rejectionTime: e.target.value }))}
            />

            <Label>Наименование изделия</Label>
            <Input
              value={draftRow.productName}
              onChange={(e) => setDraftRow((prev) => ({ ...prev, productName: e.target.value }))}
              list="finished-product-items"
            />
            <datalist id="finished-product-items">
              {productOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            <Label>Органолептическая оценка</Label>
            <Input
              value={draftRow.organoleptic}
              onChange={(e) => setDraftRow((prev) => ({ ...prev, organoleptic: e.target.value }))}
            />

            {config.showProductTemp && (
              <>
                <Label>Введите Т°С внутри продукта</Label>
                <Input
                  value={draftRow.productTemp}
                  onChange={(e) => setDraftRow((prev) => ({ ...prev, productTemp: e.target.value }))}
                />
              </>
            )}

            {config.showCorrectiveAction && (
              <>
                <Label>Корректирующие действия</Label>
                <Textarea
                  value={draftRow.correctiveAction}
                  onChange={(e) =>
                    setDraftRow((prev) => ({ ...prev, correctiveAction: e.target.value }))
                  }
                />
              </>
            )}

            <Label>Разрешение к реализации</Label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draftRow.releaseAllowed === "yes"}
                  onChange={() => setDraftRow((prev) => ({ ...prev, releaseAllowed: "yes" }))}
                />
                Да
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draftRow.releaseAllowed === "no"}
                  onChange={() => setDraftRow((prev) => ({ ...prev, releaseAllowed: "no" }))}
                />
                Нет
              </label>
            </div>

            <Label>Дата и время разрешения</Label>
            <Input
              value={draftRow.releasePermissionTime}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, releasePermissionTime: e.target.value }))
              }
            />

            {config.showCourierTime && (
              <>
                <Label>Дата и время передачи блюд курьеру</Label>
                <Input
                  value={draftRow.courierTransferTime}
                  onChange={(e) =>
                    setDraftRow((prev) => ({ ...prev, courierTransferTime: e.target.value }))
                  }
                />
              </>
            )}

            {config.showOxygenLevel && (
              <>
                <Label>Остаточный уровень кислорода, % об.</Label>
                <Input
                  value={draftRow.oxygenLevel}
                  onChange={(e) => setDraftRow((prev) => ({ ...prev, oxygenLevel: e.target.value }))}
                />
              </>
            )}

            <Label>Ответственный исполнитель</Label>
            <Input
              value={draftRow.responsiblePerson}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, responsiblePerson: e.target.value }))
              }
              list="finished-product-users"
            />

            <Label>
              {config.inspectorMode === "commission_signatures"
                ? "Подписи членов комиссии"
                : "Лицо, проводившее бракераж"}
            </Label>
            <Input
              value={draftRow.inspectorName}
              onChange={(e) => setDraftRow((prev) => ({ ...prev, inspectorName: e.target.value }))}
              list="finished-product-users"
            />
            <datalist id="finished-product-users">
              {personOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            <div className="flex justify-end">
              <Button onClick={saveDraftRow}>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={readOnly ? false : listModalOpen} onOpenChange={setListModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Редактировать список изделий
              <button type="button" onClick={() => setListModalOpen(false)}>
                <X className="size-5" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Списки изделий</Label>
              {config.productLists.map((list) => (
                <div key={list.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <Checkbox
                    checked={activeListId === list.id}
                    onCheckedChange={(v) => setActiveListId(v === true ? list.id : "")}
                  />
                  <Input
                    value={list.name}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        productLists: prev.productLists.map((x) =>
                          x.id === list.id ? { ...x, name: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        productLists: prev.productLists.filter((x) => x.id !== list.id),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Введите название нового списка"
                />
                <Button onClick={addList}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Изделия</Label>
              {config.itemsCatalog.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="flex-1">{item}</div>
                  {activeListId && (
                    <Button type="button" variant="ghost" onClick={() => addItemToActiveList(item)}>
                      <Plus className="size-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        itemsCatalog: prev.itemsCatalog.filter((x) => x !== item),
                        productLists: prev.productLists.map((list) => ({
                          ...list,
                          items: list.items.filter((x) => x !== item),
                        })),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Введите название нового изделия"
                />
                <Button onClick={addItemToCatalog}>
                  <Plus className="size-4" />
                </Button>
              </div>
              <button
                type="button"
                className="text-[#5b66ff] underline"
                onClick={() => {
                  const text = window.prompt("Вставьте изделия, каждое с новой строки:");
                  if (!text) return;
                  const items = text
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean);
                  setConfig((prev) => ({
                    ...prev,
                    itemsCatalog: Array.from(new Set([...prev.itemsCatalog, ...items])),
                  }));
                }}
              >
                Добавить из файла
              </button>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setListModalOpen(false);
                  saveConfig();
                }}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
