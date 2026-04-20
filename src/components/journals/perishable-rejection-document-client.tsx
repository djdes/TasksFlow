"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { FocusTodayScroller } from "@/components/journals/focus-today-scroller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUsersForRoleLabel } from "@/lib/user-roles";
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
  createPerishableRejectionRow,
  normalizePerishableRejectionConfig,
  STORAGE_CONDITION_LABELS,
  ORGANOLEPTIC_LABELS,
  type PerishableRejectionConfig,
  type PerishableRejectionRow,
} from "@/lib/perishable-rejection-document";
import { DocumentCloseButton } from "@/components/journals/document-close-button";
import { PositionNativeOptions } from "@/components/shared/position-select";
import { useMobileView } from "@/lib/use-mobile-view";
import {
  MobileViewToggle,
  MobileViewTableWrapper,
} from "@/components/journals/mobile-view-toggle";
import {
  RecordCardsView,
  type RecordCardItem,
} from "@/components/journals/record-cards-view";

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig: PerishableRejectionConfig;
  users: { id: string; name: string; role: string }[];
};

const RESPONSIBLE_POSITIONS = USER_ROLE_LABEL_VALUES;

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowHour() {
  return String(new Date().getHours()).padStart(2, "0");
}

function nowMinute() {
  return String(new Date().getMinutes()).padStart(2, "0");
}

function padTwo(n: number) {
  return String(n).padStart(2, "0");
}

function parseTimeToHM(time: string): { h: string; m: string } {
  if (!time) return { h: nowHour(), m: nowMinute() };
  const [h = "00", m = "00"] = time.split(":");
  return { h, m };
}

function mergeHM(h: string, m: string) {
  return `${h}:${m}`;
}

export function PerishableRejectionDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState(() =>
    normalizePerishableRejectionConfig(initialConfig)
  );
  const readOnly = status === "closed";
  const { mobileView, switchMobileView } = useMobileView("perishable_rejection");

  const cardItems: RecordCardItem[] = config.rows.map((row, index) => ({
    id: row.id,
    title: `№${index + 1} · ${row.productName || "—"}`,
    subtitle:
      [row.arrivalDate, row.arrivalTime].filter(Boolean).join(" ") || undefined,
    leading: !readOnly ? (
      <Checkbox
        checked={selectedRows.includes(row.id)}
        onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
        className="size-5"
      />
    ) : null,
    fields: [
      { label: "Дата выработки", value: row.productionDate, hideIfEmpty: true },
      { label: "Изготовитель/поставщик", value: row.manufacturer, hideIfEmpty: true },
      { label: "Количество", value: row.quantity, hideIfEmpty: true },
      { label: "Документ безопасности", value: row.documentNumber, hideIfEmpty: true },
      {
        label: "Органолептика",
        value: ORGANOLEPTIC_LABELS[row.organolepticResult] || row.organolepticResult,
        hideIfEmpty: true,
      },
      {
        label: "Условия хранения",
        value: STORAGE_CONDITION_LABELS[row.storageCondition] || row.storageCondition,
        hideIfEmpty: true,
      },
      { label: "Реализовано", value: `${row.actualSaleDate || ""} ${row.actualSaleTime || ""}`.trim(), hideIfEmpty: true },
      { label: "Ответственный", value: row.responsiblePerson, hideIfEmpty: true },
      { label: "Примечание", value: row.note, hideIfEmpty: true },
    ],
  }));
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [activeListSection, setActiveListSection] = useState<
    "products" | "manufacturers" | "suppliers"
  >("products");
  const [newListName, setNewListName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [activeListId, setActiveListId] = useState<string>("");

  const [draftRow, setDraftRow] = useState<PerishableRejectionRow>(() =>
    createPerishableRejectionRow({
      arrivalDate: nowDate(),
      arrivalTime: mergeHM(nowHour(), nowMinute()),
      organolepticResult: "compliant",
      storageCondition: "2_6",
      responsiblePerson: users[0]?.name || "",
    })
  );
  const [draftPosition, setDraftPosition] = useState(RESPONSIBLE_POSITIONS[0]);
  const [draftUserId, setDraftUserId] = useState("");

  const productOptions = useMemo(() => {
    const fromLists = config.productLists.flatMap((list) => list.items);
    return Array.from(new Set(fromLists)).filter(Boolean);
  }, [config.productLists]);

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

  function updateRow(id: string, patch: Partial<PerishableRejectionRow>) {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row
      ),
    }));
  }

  function toggleRow(id: string, checked: boolean) {
    if (readOnly) return;
    setSelectedRows((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
    );
  }

  function removeSelectedRows() {
    if (readOnly) return;
    if (selectedRows.length === 0) return;
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => !selectedRows.includes(row.id)),
    }));
    setSelectedRows([]);
  }

  function addSingleRow(productName = "") {
    if (readOnly) return;
    setConfig((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        createPerishableRejectionRow({
          productName,
          arrivalDate: nowDate(),
          arrivalTime: mergeHM(nowHour(), nowMinute()),
          organolepticResult: "compliant",
          storageCondition: "2_6",
          responsiblePerson: users[0]?.name || "",
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
    const text = window.prompt(
      "Вставьте названия изделий, каждое с новой строки:"
    );
    if (!text) return;
    text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((item) => addSingleRow(item));
  }

  function resetDraftRow() {
    setDraftRow(
      createPerishableRejectionRow({
        arrivalDate: nowDate(),
        arrivalTime: mergeHM(nowHour(), nowMinute()),
        organolepticResult: "compliant",
        storageCondition: "2_6",
        responsiblePerson: users[0]?.name || "",
      })
    );
    setDraftPosition(RESPONSIBLE_POSITIONS[0]);
    setDraftUserId("");
  }

  async function saveDraftRow() {
    if (readOnly) return;
    const user = users.find((u) => u.id === draftUserId);
    const responsible = user
      ? `${user.name}, ${draftPosition}`
      : draftPosition;
    const nextConfig = {
      ...config,
      rows: [...config.rows, { ...draftRow, responsiblePerson: responsible }],
    };
    setConfig(nextConfig);
    await saveConfig(nextConfig);
    resetDraftRow();
    setAddModalOpen(false);
  }

  /* ---------- List modal helpers ---------- */

  function addProductList() {
    if (readOnly) return;
    if (!newListName.trim()) return;
    const id = `list-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      productLists: [
        ...prev.productLists,
        { id, name: newListName.trim(), items: [] },
      ],
    }));
    setNewListName("");
  }

  function addItemToProductList(item: string) {
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

  function addProductItem() {
    if (readOnly) return;
    if (!newItemName.trim()) return;
    const list = config.productLists[0];
    if (!list) return;
    setConfig((prev) => ({
      ...prev,
      productLists: prev.productLists.map((l) =>
        l.id === list.id && !l.items.includes(newItemName.trim())
          ? { ...l, items: [...l.items, newItemName.trim()] }
          : l
      ),
    }));
    setNewItemName("");
  }

  function addManufacturerItem() {
    if (readOnly) return;
    if (!newItemName.trim()) return;
    setConfig((prev) => ({
      ...prev,
      manufacturers: [...prev.manufacturers, newItemName.trim()],
    }));
    setNewItemName("");
  }

  function addSupplierItem() {
    if (readOnly) return;
    if (!newItemName.trim()) return;
    setConfig((prev) => ({
      ...prev,
      suppliers: [...prev.suppliers, newItemName.trim()],
    }));
    setNewItemName("");
  }

  function importItemsFromText(section: "products" | "manufacturers" | "suppliers") {
    if (readOnly) return;
    const text = window.prompt("Вставьте элементы, каждый с новой строки:");
    if (!text) return;
    const items = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (section === "products") {
      const list = config.productLists[0];
      if (!list) return;
      setConfig((prev) => ({
        ...prev,
        productLists: prev.productLists.map((l) =>
          l.id === list.id
            ? { ...l, items: Array.from(new Set([...l.items, ...items])) }
            : l
        ),
      }));
    } else if (section === "manufacturers") {
      setConfig((prev) => ({
        ...prev,
        manufacturers: Array.from(new Set([...prev.manufacturers, ...items])),
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        suppliers: Array.from(new Set([...prev.suppliers, ...items])),
      }));
    }
  }

  const arrivalHM = parseTimeToHM(draftRow.arrivalTime);
  const saleHM = parseTimeToHM(draftRow.actualSaleTime);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayFocusRowId = config.rows.find((row) => row.arrivalDate === todayKey)?.id;

  return (
    <div className="space-y-6 text-black">
      <FocusTodayScroller
        onCreate={!readOnly ? () => setAddModalOpen(true) : undefined}
      />
      <DocumentBackLink href="/journals/perishable_rejection" documentId={documentId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
            {title}
          </h1>
        </div>
      </div>

      {!readOnly ? (
        <div className="flex justify-end">
          <DocumentCloseButton
            documentId={documentId}
            title={title}
            variant="outline"
          >
            Закончить журнал
          </DocumentCloseButton>
        </div>
      ) : null}

      <div className="space-y-4 overflow-hidden rounded-[20px] border bg-white p-4 sm:p-6">
        {/* HACCP header table */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[18%] border border-black p-3 text-center font-semibold"
              >
                {organizationName}
              </td>
              <td className="border border-black p-2 text-center">
                СИСТЕМА ХАССП
              </td>
              <td className="w-[20%] border border-black p-2 text-[18px] font-medium">
                Начат&nbsp;&nbsp;{new Date(dateFrom).toLocaleDateString("ru-RU")}
                <div className="mt-2 font-normal">Окончен&nbsp;__________</div>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 text-center text-sm uppercase italic">
                ЖУРНАЛ БРАКЕРАЖА СКОРОПОРТЯЩЕЙСЯ ПИЩЕВОЙ ПРОДУКЦИИ
              </td>
              <td className="border border-black p-2 text-center text-[18px]">
                СТР. 1 ИЗ 1
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-center text-[36px] font-semibold">
          ЖУРНАЛ БРАКЕРАЖА СКОРОПОРТЯЩЕЙСЯ ПИЩЕВОЙ ПРОДУКЦИИ
        </h2>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="bg-[#5566f6] hover:bg-[#4d58f5]"
                >
                  <Plus className="size-4" />
                  Добавить
                  <ChevronDown className="ml-1 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[280px] rounded-2xl border-0 p-2">
                <DropdownMenuItem onSelect={() => setAddModalOpen(true)}>
                  Добавить изделие
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const count = Number(
                      window.prompt("Сколько изделий добавить?", "3") || "0"
                    );
                    if (count > 0)
                      for (let i = 0; i < count; i += 1) addSingleRow();
                  }}
                >
                  Добавить несколько изделий
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={addRowsFromList}>
                  Добавить из списка
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={addFromFile}>
                  Добавить из файла
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setListModalOpen(true)}
            disabled={readOnly}
          >
            Редактировать список изделий
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={removeSelectedRows}
            disabled={readOnly || selectedRows.length === 0}
          >
            <Trash2 className="size-4" />
            Удалить выбранные
          </Button>
          <Button
            type="button"
            onClick={() => saveConfig()}
            disabled={readOnly || isSaving || isPending}
          >
            <Save className="size-4" />
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>

        {/* View toggle */}
        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView items={cardItems} emptyLabel="Записей пока нет." />
        ) : null}

        {/* Main data table */}
        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[2200px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-10 border p-2" />
                <th className="border p-2">
                  Дата, время поступления пищ. продукции
                </th>
                <th className="border p-2">Наименование</th>
                <th className="border p-2">Дата выработки</th>
                <th className="border p-2">Изготовитель/поставщик</th>
                <th className="border p-2">
                  Фасовка/Кол-во поступившего продукта (в кг, литрах, шт)
                </th>
                <th className="border p-2">
                  Номер документа, подтверждающего безопасность
                </th>
                <th className="border p-2">
                  Результаты органолептической оценки
                </th>
                <th className="border p-2">
                  Условия хранения, конечный срок реализации
                </th>
                <th className="border p-2">
                  Дата, время фактической реализации
                </th>
                <th className="border p-2">
                  Ответственное лицо (ФИО, должность)
                </th>
                <th className="border p-2">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row) => (
                <tr key={row.id} data-focus-today={row.id === todayFocusRowId ? "" : undefined}>
                  <td className="border p-2 align-top">
                    <Checkbox
                      checked={selectedRows.includes(row.id)}
                      onCheckedChange={(checked) =>
                        toggleRow(row.id, checked === true)
                      }
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={`${row.arrivalDate} ${row.arrivalTime}`}
                      onChange={(e) => {
                        const [date = "", time = ""] =
                          e.target.value.split(" ");
                        updateRow(row.id, {
                          arrivalDate: date,
                          arrivalTime: time,
                        });
                      }}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.productName}
                      onChange={(e) =>
                        updateRow(row.id, { productName: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.productionDate}
                      onChange={(e) =>
                        updateRow(row.id, { productionDate: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={
                        [row.manufacturer, row.supplier]
                          .filter(Boolean)
                          .join(" / ") || ""
                      }
                      onChange={(e) =>
                        updateRow(row.id, { manufacturer: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={
                        [row.packaging, row.quantity]
                          .filter(Boolean)
                          .join(" / ") || ""
                      }
                      onChange={(e) =>
                        updateRow(row.id, { packaging: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.documentNumber}
                      onChange={(e) =>
                        updateRow(row.id, {
                          documentNumber: e.target.value,
                        })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={
                        ORGANOLEPTIC_LABELS[row.organolepticResult] ||
                        row.organolepticResult
                      }
                      onChange={(e) =>
                        updateRow(row.id, {
                          organolepticResult: e.target.value
                            .toLowerCase()
                            .includes("не соответ")
                            ? "non_compliant"
                            : "compliant",
                        })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={`${STORAGE_CONDITION_LABELS[row.storageCondition] || row.storageCondition}, ${row.expiryDate}`}
                      onChange={(e) =>
                        updateRow(row.id, { expiryDate: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={`${row.actualSaleDate} ${row.actualSaleTime}`}
                      onChange={(e) => {
                        const [date = "", time = ""] =
                          e.target.value.split(" ");
                        updateRow(row.id, {
                          actualSaleDate: date,
                          actualSaleTime: time,
                        });
                      }}
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.responsiblePerson}
                      onChange={(e) =>
                        updateRow(row.id, {
                          responsiblePerson: e.target.value,
                        })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="border p-1 align-top">
                    <Input
                      value={row.note}
                      onChange={(e) =>
                        updateRow(row.id, { note: e.target.value })
                      }
                      className="border-0 shadow-none"
                      disabled={readOnly}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </MobileViewTableWrapper>
      </div>

      {/* Add Row Dialog — design-system shape: padded header, body
       * sections, bottom-stuck footer with secondary + primary buttons. */}
      <Dialog open={readOnly ? false : addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden rounded-[24px] border-0 p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#0b1024]">
              Добавление новой строки
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(92vh-160px)] space-y-5 overflow-y-auto px-6 py-5">
            {/* Дата и время поступления */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Дата и время поступления
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
                <Input
                  type="date"
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  value={draftRow.arrivalDate}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      arrivalDate: e.target.value,
                    }))
                  }
                />
                <select
                  className="h-11 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={arrivalHM.h}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      arrivalTime: mergeHM(e.target.value, arrivalHM.m),
                    }))
                  }
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={padTwo(i)}>
                      {padTwo(i)} ч
                    </option>
                  ))}
                </select>
                <select
                  className="h-11 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={arrivalHM.m}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      arrivalTime: mergeHM(arrivalHM.h, e.target.value),
                    }))
                  }
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={padTwo(i)}>
                      {padTwo(i)} мин
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Наименование изделия */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Наименование изделия
              </Label>
              <select
                className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                value={
                  productOptions.includes(draftRow.productName)
                    ? draftRow.productName
                    : ""
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    productName: e.target.value,
                  }))
                }
              >
                <option value="">— выберите из списка —</option>
                {productOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Input
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                placeholder="Или введите новое наименование"
                value={
                  productOptions.includes(draftRow.productName)
                    ? ""
                    : draftRow.productName
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    productName: e.target.value,
                  }))
                }
              />
            </div>

            {/* Дата выработки */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Дата выработки
              </Label>
              <Input
                type="date"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                value={draftRow.productionDate}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    productionDate: e.target.value,
                  }))
                }
              />
            </div>

            {/* Изготовитель */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Изготовитель
              </Label>
              <select
                className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                value={
                  config.manufacturers.includes(draftRow.manufacturer)
                    ? draftRow.manufacturer
                    : ""
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    manufacturer: e.target.value,
                  }))
                }
              >
                <option value="">— выберите из списка —</option>
                {config.manufacturers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Input
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                placeholder="Или введите нового изготовителя"
                value={
                  config.manufacturers.includes(draftRow.manufacturer)
                    ? ""
                    : draftRow.manufacturer
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    manufacturer: e.target.value,
                  }))
                }
              />
            </div>

            {/* Поставщик */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Поставщик
              </Label>
              <select
                className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                value={
                  config.suppliers.includes(draftRow.supplier)
                    ? draftRow.supplier
                    : ""
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    supplier: e.target.value,
                  }))
                }
              >
                <option value="">— выберите из списка —</option>
                {config.suppliers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Input
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                placeholder="Или введите нового поставщика"
                value={
                  config.suppliers.includes(draftRow.supplier)
                    ? ""
                    : draftRow.supplier
                }
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    supplier: e.target.value,
                  }))
                }
              />
            </div>

            {/* Фасовка + Кол-во side-by-side */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">
                  Фасовка
                </Label>
                <Input
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  value={draftRow.packaging}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      packaging: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">
                  Количество
                </Label>
                <Input
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  value={draftRow.quantity}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Номер документа */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Номер документа
              </Label>
              <Input
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                value={draftRow.documentNumber}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    documentNumber: e.target.value,
                  }))
                }
              />
            </div>

            {/* Органолептическая оценка — pill-style segmented control */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Органолептическая оценка
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["compliant", "Соответствует", "#136b2a", "#ecfdf5"],
                    ["non_compliant", "Не соответствует", "#d2453d", "#fff4f2"],
                  ] as const
                ).map(([value, label, fg, bg]) => {
                  const active = draftRow.organolepticResult === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setDraftRow((prev) => ({
                          ...prev,
                          organolepticResult: value,
                        }))
                      }
                      className={`flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-[14px] font-medium transition-colors ${
                        active
                          ? "border-transparent text-white"
                          : "border-[#dcdfed] bg-white text-[#0b1024] hover:bg-[#fafbff]"
                      }`}
                      style={
                        active ? { backgroundColor: fg, color: "white" } : { backgroundColor: bg, color: fg, borderColor: bg }
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Условия хранения — radio cards */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Условия хранения
              </Label>
              <div className="flex flex-col gap-2">
                {(
                  Object.entries(STORAGE_CONDITION_LABELS) as [string, string][]
                ).map(([key, label]) => {
                  const active = draftRow.storageCondition === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setDraftRow((prev) => ({
                          ...prev,
                          storageCondition: key as PerishableRejectionRow["storageCondition"],
                        }))
                      }
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-[14px] transition-colors ${
                        active
                          ? "border-[#5566f6] bg-[#f5f6ff] text-[#0b1024]"
                          : "border-[#dcdfed] bg-white text-[#3c4053] hover:bg-[#fafbff]"
                      }`}
                    >
                      <span className="font-medium">{label}</span>
                      <span
                        className={`flex size-5 items-center justify-center rounded-full border-2 ${
                          active ? "border-[#5566f6]" : "border-[#c7ccea]"
                        }`}
                      >
                        {active ? (
                          <span className="size-2 rounded-full bg-[#5566f6]" />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Конечный срок реализации */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Конечный срок реализации
              </Label>
              <Input
                type="date"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                value={draftRow.expiryDate}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    expiryDate: e.target.value,
                  }))
                }
              />
            </div>

            {/* Дата и время фактической реализации */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Дата и время фактической реализации
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
                <Input
                  type="date"
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                  value={draftRow.actualSaleDate}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      actualSaleDate: e.target.value,
                    }))
                  }
                />
                <select
                  className="h-11 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={saleHM.h}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      actualSaleTime: mergeHM(e.target.value, saleHM.m),
                    }))
                  }
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={padTwo(i)}>
                      {padTwo(i)} ч
                    </option>
                  ))}
                </select>
                <select
                  className="h-11 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={saleHM.m}
                  onChange={(e) =>
                    setDraftRow((prev) => ({
                      ...prev,
                      actualSaleTime: mergeHM(saleHM.h, e.target.value),
                    }))
                  }
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={padTwo(i)}>
                      {padTwo(i)} мин
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Должность + Сотрудник side-by-side */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">
                  Должность ответственного
                </Label>
                <select
                  className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={draftPosition}
                  onChange={(e) => {
                    const pos = e.target.value;
                    setDraftPosition(pos);
                    const candidates = getUsersForRoleLabel(users, pos);
                    if (draftUserId && !candidates.some((u) => u.id === draftUserId)) {
                      setDraftUserId("");
                    }
                  }}
                >
                  <PositionNativeOptions users={users} />
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium text-[#3c4053]">
                  Сотрудник
                </Label>
                <select
                  className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024]"
                  value={draftUserId}
                  onChange={(e) => setDraftUserId(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {getUsersForRoleLabel(users, draftPosition).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Примечание */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-[#3c4053]">
                Примечание
              </Label>
              <Input
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px]"
                value={draftRow.note}
                onChange={(e) =>
                  setDraftRow((prev) => ({ ...prev, note: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl border-[#dcdfed] px-5 text-[14px] font-medium text-[#0b1024] shadow-none hover:bg-[#fafbff] sm:w-auto"
              onClick={() => setAddModalOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="h-11 w-full rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] sm:w-auto"
              onClick={() => {
                void saveDraftRow();
              }}
              disabled={isSaving}
            >
              {isSaving ? "Сохранение…" : "Добавить запись"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Lists Dialog */}
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
          <div className="space-y-6">
            {/* Section tabs */}
            <div className="flex gap-2 border-b pb-2">
              {(
                [
                  ["products", "Изделия"],
                  ["manufacturers", "Изготовители"],
                  ["suppliers", "Поставщики"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-t-md px-4 py-2 text-sm font-medium ${
                    activeListSection === key
                      ? "bg-[#5566f6] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => {
                    setActiveListSection(key);
                    setNewItemName("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Products section */}
            {activeListSection === "products" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Списки изделий</Label>
                  {config.productLists.map((list) => (
                    <div
                      key={list.id}
                      className="flex items-center gap-2 rounded-lg border p-2"
                    >
                      <Checkbox
                        checked={activeListId === list.id}
                        onCheckedChange={(v) =>
                          setActiveListId(v === true ? list.id : "")
                        }
                      />
                      <Input
                        value={list.name}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            productLists: prev.productLists.map((x) =>
                              x.id === list.id
                                ? { ...x, name: e.target.value }
                                : x
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
                            productLists: prev.productLists.filter(
                              (x) => x.id !== list.id
                            ),
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
                    <Button onClick={addProductList}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Изделия</Label>
                  {config.productLists
                    .find((l) => l.id === activeListId)
                    ?.items.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 rounded-lg border p-2"
                      >
                        <div className="flex-1">{item}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              productLists: prev.productLists.map((list) =>
                                list.id === activeListId
                                  ? {
                                      ...list,
                                      items: list.items.filter(
                                        (x) => x !== item
                                      ),
                                    }
                                  : list
                              ),
                            }))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )) ??
                    productOptions.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 rounded-lg border p-2"
                      >
                        <div className="flex-1">{item}</div>
                        {activeListId && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => addItemToProductList(item)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  <div className="flex gap-2">
                    <Input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Введите название нового изделия"
                    />
                    <Button onClick={addProductItem}>
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="text-[#5566f6] underline"
                    onClick={() => importItemsFromText("products")}
                  >
                    Добавить из файла
                  </button>
                </div>
              </div>
            )}

            {/* Manufacturers section */}
            {activeListSection === "manufacturers" && (
              <div className="space-y-2">
                <Label>Изготовители</Label>
                {config.manufacturers.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <div className="flex-1">{item}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          manufacturers: prev.manufacturers.filter(
                            (x) => x !== item
                          ),
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
                    placeholder="Введите название изготовителя"
                  />
                  <Button onClick={addManufacturerItem}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <button
                  type="button"
                  className="text-[#5566f6] underline"
                  onClick={() => importItemsFromText("manufacturers")}
                >
                  Добавить из файла
                </button>
              </div>
            )}

            {/* Suppliers section */}
            {activeListSection === "suppliers" && (
              <div className="space-y-2">
                <Label>Поставщики</Label>
                {config.suppliers.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <div className="flex-1">{item}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          suppliers: prev.suppliers.filter((x) => x !== item),
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
                    placeholder="Введите название поставщика"
                  />
                  <Button onClick={addSupplierItem}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <button
                  type="button"
                  className="text-[#5566f6] underline"
                  onClick={() => importItemsFromText("suppliers")}
                >
                  Добавить из файла
                </button>
              </div>
            )}

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
