"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DocumentBackLink } from "@/components/journals/document-back-link";
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

  function saveDraftRow() {
    if (readOnly) return;
    const user = users.find((u) => u.id === draftUserId);
    const responsible = user
      ? `${user.name}, ${draftPosition}`
      : draftPosition;
    setConfig((prev) => ({
      ...prev,
      rows: [...prev.rows, { ...draftRow, responsiblePerson: responsible }],
    }));
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

  return (
    <div className="space-y-6 text-black">
      <DocumentBackLink href="/journals/perishable_rejection" documentId={documentId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[48px] font-semibold tracking-[-0.03em]">
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
            Р—Р°РєРѕРЅС‡РёС‚СЊ Р¶СѓСЂРЅР°Р»
          </DocumentCloseButton>
        </div>
      ) : null}

      <div className="space-y-4 rounded-[20px] border bg-white p-6">
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
                  className="bg-[#5b66ff] hover:bg-[#4d58f5]"
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
            className="bg-[#5b66ff] hover:bg-[#4d58f5]"
            onClick={() => setAddModalOpen(true)}
            disabled={readOnly}
          >
            <Plus className="size-4" />
            Добавить изделие
          </Button>
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

        {/* Main data table */}
        <div className="overflow-x-auto">
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
                <tr key={row.id}>
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
        </div>
      </div>

      {/* Add Row Dialog */}
      <Dialog open={readOnly ? false : addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Добавление новой строки</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            {/* Дата и время поступления */}
            <Label>Дата и время поступления</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="date"
                value={draftRow.arrivalDate}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    arrivalDate: e.target.value,
                  }))
                }
              />
              <select
                className="rounded-md border px-3 py-2 text-sm"
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
                className="rounded-md border px-3 py-2 text-sm"
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

            {/* Наименование изделия */}
            <Label>Наименование изделия</Label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={draftRow.productName}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  productName: e.target.value,
                }))
              }
            >
              <option value="">- Выберите значение -</option>
              {productOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Input
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

            {/* Дата выработки */}
            <Label>Дата выработки</Label>
            <Input
              type="date"
              value={draftRow.productionDate}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  productionDate: e.target.value,
                }))
              }
            />

            {/* Изготовитель */}
            <Label>Изготовитель</Label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={draftRow.manufacturer}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  manufacturer: e.target.value,
                }))
              }
            >
              <option value="">- Выберите значение -</option>
              {config.manufacturers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Input
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

            {/* Поставщик */}
            <Label>Поставщик</Label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={draftRow.supplier}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  supplier: e.target.value,
                }))
              }
            >
              <option value="">- Выберите значение -</option>
              {config.suppliers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Input
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

            {/* Фасовка */}
            <Label>Фасовка</Label>
            <Input
              value={draftRow.packaging}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, packaging: e.target.value }))
              }
            />

            {/* Кол-во */}
            <Label>Кол-во</Label>
            <Input
              value={draftRow.quantity}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, quantity: e.target.value }))
              }
            />

            {/* Номер документа */}
            <Label>Номер документа</Label>
            <Input
              value={draftRow.documentNumber}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  documentNumber: e.target.value,
                }))
              }
            />

            {/* Органолептическая оценка */}
            <Label>Органолептическая оценка</Label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draftRow.organolepticResult === "compliant"}
                  onChange={() =>
                    setDraftRow((prev) => ({
                      ...prev,
                      organolepticResult: "compliant",
                    }))
                  }
                />
                Соответствует
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draftRow.organolepticResult === "non_compliant"}
                  onChange={() =>
                    setDraftRow((prev) => ({
                      ...prev,
                      organolepticResult: "non_compliant",
                    }))
                  }
                />
                Не соответствует
              </label>
            </div>

            {/* Условия хранения */}
            <Label>Условия хранения</Label>
            <div className="flex flex-col gap-2 text-sm">
              {(
                Object.entries(STORAGE_CONDITION_LABELS) as [string, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draftRow.storageCondition === key}
                    onChange={() =>
                      setDraftRow((prev) => ({
                        ...prev,
                        storageCondition: key as PerishableRejectionRow["storageCondition"],
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Конечный срок реализации */}
            <Label>Конечный срок реализации</Label>
            <Input
              type="date"
              value={draftRow.expiryDate}
              onChange={(e) =>
                setDraftRow((prev) => ({
                  ...prev,
                  expiryDate: e.target.value,
                }))
              }
            />

            {/* Дата и время фактической реализации */}
            <Label>Дата и время фактической реализации</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="date"
                value={draftRow.actualSaleDate}
                onChange={(e) =>
                  setDraftRow((prev) => ({
                    ...prev,
                    actualSaleDate: e.target.value,
                  }))
                }
              />
              <select
                className="rounded-md border px-3 py-2 text-sm"
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
                className="rounded-md border px-3 py-2 text-sm"
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

            {/* Должность ответственного */}
            <Label>Должность ответственного</Label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
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
              {RESPONSIBLE_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>

            {/* Сотрудник */}
            <Label>Сотрудник</Label>
            <select
              className="rounded-md border px-3 py-2 text-sm"
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
            >
              <option value="">- Выберите значение -</option>
              {getUsersForRoleLabel(users, draftPosition).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            {/* Примечание */}
            <Label>Примечание</Label>
            <Input
              value={draftRow.note}
              onChange={(e) =>
                setDraftRow((prev) => ({ ...prev, note: e.target.value }))
              }
            />

            <div className="flex justify-end">
              <Button onClick={saveDraftRow}>Добавить</Button>
            </div>
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
                      ? "bg-[#5b66ff] text-white"
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
                    className="text-[#5b66ff] underline"
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
                  className="text-[#5b66ff] underline"
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
                  className="text-[#5b66ff] underline"
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
