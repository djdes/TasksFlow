"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductWriteoffCommissionMember,
  createProductWriteoffRow,
  getProductWriteoffDocumentListTitle,
  normalizeProductWriteoffConfig,
  type ProductWriteoffCommissionMember,
  type ProductWriteoffConfig,
  type ProductWriteoffRow,
} from "@/lib/product-writeoff-document";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

type UserItem = { id: string; name: string; role: string };

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  initialConfig: ProductWriteoffConfig;
  users: UserItem[];
};

type RowDialogState = {
  open: boolean;
  index: number | null;
  row: ProductWriteoffRow;
  newProductName: string;
};

type CommissionDialogState = {
  open: boolean;
  index: number | null;
  member: ProductWriteoffCommissionMember;
};

const ROLE_OPTIONS = USER_ROLE_LABEL_VALUES;

function emptyRow() {
  return createProductWriteoffRow();
}

function emptyCommissionMember() {
  return createProductWriteoffCommissionMember({ role: ROLE_OPTIONS[0] });
}

function getRoleLabelByUserId(users: UserItem[], userId: string) {
  const user = users.find((item) => item.id === userId);
  return user ? getUserRoleLabel(user.role) : "";
}

function actDateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "__", month: "", year: "____" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(date),
    year: String(date.getFullYear()),
  };
}

export function ProductWriteoffDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isClosed = status === "closed";
  const [config, setConfig] = useState(() => normalizeProductWriteoffConfig(initialConfig));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [rowDialog, setRowDialog] = useState<RowDialogState>({
    open: false,
    index: null,
    row: emptyRow(),
    newProductName: "",
  });
  const [rowDialogProductOptions, setRowDialogProductOptions] = useState<string[]>([]);
  const [commissionDialog, setCommissionDialog] = useState<CommissionDialogState>({
    open: false,
    index: null,
    member: emptyCommissionMember(),
  });

  const productOptions = useMemo(
    () => Array.from(new Set(config.productLists.flatMap((list) => list.items).filter(Boolean))),
    [config.productLists]
  );

  const actDate = actDateParts(config.documentDate || dateFrom);

  async function persistConfig(nextConfig: ProductWriteoffConfig) {
    setSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextConfig.documentName || title,
          dateFrom: nextConfig.documentDate || dateFrom,
          dateTo: nextConfig.documentDate || dateFrom,
          config: nextConfig,
        }),
      });

      if (!response.ok) throw new Error();
      setConfig(nextConfig);
      router.refresh();
      return true;
    } catch {
      toast.error("Не удалось сохранить акт");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateConfig(patch: Partial<ProductWriteoffConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  async function saveSettings() {
    const ok = await persistConfig(config);
    if (ok) setSettingsOpen(false);
  }

  async function saveRow() {
    const nextRow = {
      ...rowDialog.row,
      productName: rowDialog.newProductName.trim() || rowDialog.row.productName,
    };

    if (!nextRow.productName.trim()) {
      toast.error("Укажите наименование ТМЦ");
      return;
    }

    const nextConfig = structuredClone(config) as ProductWriteoffConfig;
    if (rowDialog.index === null) nextConfig.rows.push(nextRow);
    else nextConfig.rows[rowDialog.index] = nextRow;

    if (rowDialog.newProductName.trim() && nextConfig.productLists[0]) {
      nextConfig.productLists[0].items = Array.from(
        new Set([...nextConfig.productLists[0].items, rowDialog.newProductName.trim()])
      );
    }

    const ok = await persistConfig(nextConfig);
    if (ok) {
      setRowDialog({ open: false, index: null, row: emptyRow(), newProductName: "" });
      setRowDialogProductOptions([]);
    }
  }

  async function deleteSelectedRows() {
    if (selectedRows.length === 0) return;
    const ok = await persistConfig({
      ...config,
      rows: config.rows.filter((row) => !selectedRows.includes(row.id)),
    });
    if (ok) setSelectedRows([]);
  }

  async function saveCommissionMember() {
    if (!commissionDialog.member.employeeName.trim()) {
      toast.error("Выберите сотрудника");
      return;
    }
    const normalizedMember = {
      ...commissionDialog.member,
      role:
        getRoleLabelByUserId(users, commissionDialog.member.employeeId) ||
        commissionDialog.member.role,
    };
    const nextConfig = structuredClone(config) as ProductWriteoffConfig;
    if (commissionDialog.index === null) nextConfig.commissionMembers.push(normalizedMember);
    else nextConfig.commissionMembers[commissionDialog.index] = normalizedMember;
    const ok = await persistConfig(nextConfig);
    if (ok) setCommissionDialog({ open: false, index: null, member: emptyCommissionMember() });
  }

  async function deleteCommissionMember(index: number) {
    await persistConfig({
      ...config,
      commissionMembers: config.commissionMembers.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function importItemsFromFile(file: File) {
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
      const items = rows.map((row) => String(row[0] ?? "").trim()).filter(Boolean);
      if (items.length === 0) throw new Error();
      await persistConfig({
        ...config,
        productLists: config.productLists.map((list, index) =>
          index === 0 ? { ...list, items: Array.from(new Set([...list.items, ...items])) } : list
        ),
      });
      toast.success(`Импортировано ${items.length} позиций`);
    } catch {
      toast.error("Не удалось импортировать файл");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6 text-black">
      <DocumentBackLink href="/journals/product_writeoff" documentId={documentId} />
      {selectedRows.length > 0 && !isClosed && (
        <div className="flex items-center gap-4 rounded-[20px] bg-white px-6 py-4 shadow-sm">
          <button type="button" className="rounded-xl px-4 py-2 text-[18px] text-[#5b66ff]" onClick={() => setSelectedRows([])}>
            <X className="mr-2 inline size-5" />
            Выбрано: {selectedRows.length}
          </button>
          <Button type="button" variant="outline" className="h-12 rounded-2xl border-[#ffd7d3] px-5 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]" onClick={() => deleteSelectedRows().catch(() => undefined)}>
            <Trash2 className="size-5" />
            Удалить
          </Button>
        </div>
      )}

      <div className="rounded-[28px] bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="flex items-center justify-end gap-3 print:hidden">
          <Button type="button" variant="outline" className="h-12 rounded-2xl border-[#eef0fb] px-5 text-[18px] text-[#5464ff]" onClick={() => setSettingsOpen(true)} disabled={isClosed}>
            Настройки журнала
          </Button>
        </div>

        {!isClosed ? (
          <div className="mb-6 flex justify-end print:hidden">
            <DocumentCloseButton
              documentId={documentId}
              title={title}
              variant="outline"
              className="h-12 rounded-2xl border-[#eef0fb] px-5 text-[18px] text-[#5464ff]"
            >
              Р—Р°РєРѕРЅС‡РёС‚СЊ Р¶СѓСЂРЅР°Р»
            </DocumentCloseButton>
          </div>
        ) : null}

        <div className="mx-auto mt-8 max-w-[1120px] space-y-8 print:mt-0">
          <table className="w-full border-collapse text-[16px]">
            <tbody>
              <tr>
                <td rowSpan={2} className="w-[18%] border border-black p-4 text-center font-semibold">{organizationName}</td>
                <td className="border border-black p-3 text-center font-medium">СИСТЕМА ХАССП</td>
                <td rowSpan={2} className="w-[10%] border border-black p-3 text-center">СТР. 1 ИЗ 1</td>
              </tr>
              <tr>
                <td className="border border-black p-3 text-center italic">{config.documentName}</td>
              </tr>
            </tbody>
          </table>

          <div className="space-y-4 text-center">
            <div className="text-[30px] font-semibold">АКТ</div>
            <div className="text-[24px] font-semibold">№ {config.actNumber || "1"} от « {actDate.day} » {actDate.month} {actDate.year} г.</div>
          </div>

          <div className="flex gap-4 print:hidden">
            {!isClosed && (
              <>
                <Button type="button" className="h-14 rounded-2xl bg-[#5563ff] px-6 text-[18px] text-white hover:bg-[#4957fb]" onClick={() => { setRowDialog({ open: true, index: null, row: emptyRow(), newProductName: "" }); setRowDialogProductOptions(productOptions); }}>
                  <Plus className="size-6" />
                  Добавить
                </Button>
                <Button type="button" variant="outline" className="h-14 rounded-2xl border-[#eef0fb] px-6 text-[18px] text-[#5464ff]" onClick={() => setListsOpen(true)}>
                  Редактировать списки
                </Button>
              </>
            )}
          </div>

          <div className="space-y-5 text-[18px] leading-8">
            <div>
              Комиссия в составе:
              <div className="ml-5 mt-1 space-y-1">
                {config.commissionMembers.map((member, index) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <button type="button" className="underline" disabled={isClosed} onClick={() => !isClosed && setCommissionDialog({ open: true, index, member })}>
                      {member.role} {member.employeeName}
                    </button>
                    {!isClosed && <button type="button" className="rounded-full p-1 text-[#5b66ff]" onClick={() => setCommissionDialog({ open: true, index, member })}><Pencil className="size-4" /></button>}
                  </div>
                ))}
                {!isClosed && <button type="button" className="text-left underline" onClick={() => setCommissionDialog({ open: true, index: null, member: emptyCommissionMember() })}>Добавить</button>}
              </div>
            </div>

            <p>составила настоящий АКТ о том, что « {actDate.day} » {actDate.month} {actDate.year} г. на предприятии выявлены ТМЦ с несоответствиями по качеству и (или) безопасности согласно списку ниже.</p>
            <p className="flex flex-wrap items-center gap-2">
              Указанные ТМЦ были выработаны
              <input value={config.supplierName} disabled={isClosed} onChange={(event) => updateConfig({ supplierName: event.target.value })} onBlur={() => persistConfig(config).catch(() => undefined)} className="min-w-[280px] flex-1 border-b border-black bg-transparent px-1 outline-none" />
              и поставлены...
            </p>
            <p>Комиссия постановила выполнить в отношении выявленных ТМЦ следующие действия:</p>
          </div>

          <table className="w-full border-collapse text-[16px]">
            <thead>
              <tr>
                {!isClosed && <th className="w-[34px] border border-black p-2 print:hidden" />}
                <th className="w-[70px] border border-black p-2">№ п/п</th>
                <th className="border border-black p-2">Наименование ТМЦ</th>
                <th className="border border-black p-2">№ партии, дата выработки</th>
                <th className="border border-black p-2">Количество (кг, шт)</th>
                <th className="border border-black p-2">Описание несоответствия</th>
                <th className="border border-black p-2">Действия с ТМЦ</th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => (
                <tr key={row.id} className={!isClosed ? "cursor-pointer hover:bg-[#fbfbff]" : undefined} onClick={(event) => {
                  if (isClosed) return;
                  if ((event.target as HTMLElement).closest("button")) return;
                  setRowDialog({ open: true, index, row, newProductName: "" });
                  setRowDialogProductOptions(productOptions);
                }}>
                  {!isClosed && <td className="border border-black p-2 text-center align-top print:hidden"><Checkbox checked={selectedRows.includes(row.id)} onCheckedChange={(checked) => setSelectedRows((prev) => checked === true ? [...new Set([...prev, row.id])] : prev.filter((id) => id !== row.id))} /></td>}
                  <td className="border border-black p-2 text-center align-top">{index + 1}</td>
                  <td className="border border-black p-2 align-top">{row.productName}</td>
                  <td className="border border-black p-2 align-top"><div>{row.batchNumber}</div><div>{row.productionDate}</div></td>
                  <td className="border border-black p-2 align-top text-center">{row.quantity}</td>
                  <td className="border border-black p-2 align-top text-center">{row.discrepancyDescription}</td>
                  <td className="border border-black p-2 align-top text-center">{row.action}</td>
                </tr>
              ))}
              <tr>
                {!isClosed && <td className="border border-black p-2 print:hidden" />}
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
              </tr>
            </tbody>
          </table>

          <div className="space-y-2 pt-8 text-[18px]">
            <div>Подписи членов комиссии:</div>
            {config.commissionMembers.length === 0 && <div>________________</div>}
            {config.commissionMembers.map((member) => (
              <div key={member.id} className="flex items-end gap-3">
                <span>{member.employeeName}</span>
                <span className="min-w-[180px] border-b border-black" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[720px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[24px] font-medium text-black">Настройки документа</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2">
              <Label>Название документа</Label>
              <Input value={config.documentName} onChange={(event) => updateConfig({ documentName: event.target.value })} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>№ акта</Label>
              <Input value={config.actNumber} onChange={(event) => updateConfig({ actNumber: event.target.value })} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Дата документа</Label>
              <Input type="date" value={config.documentDate} onChange={(event) => updateConfig({ documentDate: event.target.value })} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea value={config.comment} onChange={(event) => updateConfig({ comment: event.target.value })} className="min-h-[160px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[18px]" />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => saveSettings().catch(() => undefined)} disabled={saving} className="h-14 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4c58ff]">
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rowDialog.open} onOpenChange={(open) => {
        if (open) return;
        setRowDialog({ open: false, index: null, row: emptyRow(), newProductName: "" });
        setRowDialogProductOptions([]);
      }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[720px] overflow-y-auto rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[24px] font-medium text-black">{rowDialog.index === null ? "Добавление новой строки" : "Редактирование строки"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2">
              <Label>Наименование ТМЦ</Label>
              <select value={rowDialog.row.productName} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, productName: event.target.value } }))} className="h-14 w-full rounded-2xl border border-[#dfe1ec] bg-white px-5 text-[18px]">
                <option value="">Выберите из списка</option>
                {(rowDialogProductOptions.length > 0 ? rowDialogProductOptions : productOptions).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <Input value={rowDialog.newProductName} onChange={(event) => setRowDialog((prev) => ({ ...prev, newProductName: event.target.value }))} placeholder="Добавить название новых ТМЦ" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
                <Button type="button" className="h-14 rounded-2xl bg-[#5563ff] px-5 text-[22px] text-white" onClick={() => {
                  const item = rowDialog.newProductName.trim();
                  if (!item) return;
                  setRowDialogProductOptions((current) => (
                    current.some((value) => value.toLowerCase() === item.toLowerCase())
                      ? current
                      : [...current, item]
                  ));
                  setRowDialog((prev) => ({ ...prev, row: { ...prev.row, productName: item }, newProductName: "" }));
                }}>
                  <Plus className="size-6" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>№ партии</Label>
              <Input value={rowDialog.row.batchNumber} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, batchNumber: event.target.value } }))} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Дата выработки</Label>
              <Input value={rowDialog.row.productionDate} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, productionDate: event.target.value } }))} placeholder="02.04.2025" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Количество (кг, шт)</Label>
              <Input value={rowDialog.row.quantity} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, quantity: event.target.value } }))} className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Описание несоответствия</Label>
              <Textarea value={rowDialog.row.discrepancyDescription} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, discrepancyDescription: event.target.value } }))} className="min-h-[140px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[18px]" />
            </div>
            <div className="space-y-2">
              <Label>Действия с ТМЦ</Label>
              <Textarea value={rowDialog.row.action} onChange={(event) => setRowDialog((prev) => ({ ...prev, row: { ...prev.row, action: event.target.value } }))} className="min-h-[120px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[18px]" />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => saveRow().catch(() => undefined)} disabled={saving} className="h-14 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4c58ff]">
                {saving ? "Сохранение..." : rowDialog.index === null ? "Добавить" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={commissionDialog.open} onOpenChange={(open) => !open && setCommissionDialog({ open: false, index: null, member: emptyCommissionMember() })}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[620px] rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[24px] font-medium text-black">Редактирование строки</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            <div className="space-y-2">
              <Label>Должность</Label>
              <select value={commissionDialog.member.role} onChange={(event) => setCommissionDialog((prev) => ({ ...prev, member: { ...prev.member, role: event.target.value } }))} className="h-14 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[18px]">
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Сотрудник</Label>
              <select value={commissionDialog.member.employeeId} onChange={(event) => {
                const user = users.find((item) => item.id === event.target.value);
                setCommissionDialog((prev) => ({ ...prev, member: { ...prev.member, employeeId: event.target.value, employeeName: user?.name || "", role: user ? getUserRoleLabel(user.role) : prev.member.role } }));
              }} className="h-14 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[18px]">
                <option value="">Выберите сотрудника</option>
                {(commissionDialog.member.role
                  ? getUsersForRoleLabel(users, commissionDialog.member.role)
                  : users
                ).map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between pt-2">
              {commissionDialog.index !== null ? (
                <Button type="button" variant="outline" className="h-12 rounded-2xl border-[#ffd7d3] px-5 text-[18px] text-[#ff3b30]" onClick={() => deleteCommissionMember(commissionDialog.index ?? 0).catch(() => undefined)}>
                  Удалить
                </Button>
              ) : <span />}
              <Button type="button" onClick={() => saveCommissionMember().catch(() => undefined)} disabled={saving} className="h-14 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4c58ff]">
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={listsOpen} onOpenChange={setListsOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[720px] overflow-y-auto rounded-[28px] border-0 p-0">
          <DialogHeader className="border-b px-8 py-6">
            <DialogTitle className="text-[24px] font-medium text-black">Редактировать список продукции</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-8 py-6">
            {config.productLists[0]?.items.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-2xl bg-[#f8f9ff] px-4 py-3">
                <div className="flex-1 text-[20px]">{item}</div>
                {!isClosed && (
                  <button
                    type="button"
                    className="rounded-full p-2 text-[#ff3b30]"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        productLists: prev.productLists.map((list, listIndex) =>
                          listIndex === 0 ? { ...list, items: list.items.filter((listItem) => listItem !== item) } : list
                        ),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}

            {!isClosed && (
              <>
                <div className="flex gap-3">
                  <Input value={rowDialog.newProductName} onChange={(event) => setRowDialog((prev) => ({ ...prev, newProductName: event.target.value }))} placeholder="Введите наименование продукции" className="h-14 rounded-2xl border-[#dfe1ec] px-5 text-[18px]" />
                  <Button type="button" className="h-14 rounded-2xl bg-[#5563ff] px-5 text-[22px] text-white" onClick={() => {
                    const item = rowDialog.newProductName.trim();
                    if (!item) return;
                    setConfig((prev) => ({
                      ...prev,
                      productLists: prev.productLists.map((list, index) => index === 0 ? { ...list, items: Array.from(new Set([...list.items, item])) } : list),
                    }));
                    setRowDialog((prev) => ({ ...prev, newProductName: "" }));
                  }}>
                    <Plus className="size-6" />
                  </Button>
                </div>

                <button type="button" className="text-[18px] text-[#6c77ff] underline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                  Добавить из файла
                </button>

                <div className="rounded-[24px] border border-[#e6e9f5] bg-[#fbfbff] px-5 py-4 text-[15px] leading-7 text-[#505469]">
                  Список должен быть в файле Excel, на первом листе в первом столбце и начинаться с первой строки.
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={() => persistConfig(config).then((ok) => ok && setListsOpen(false))} disabled={saving} className="h-14 rounded-2xl bg-[#5b66ff] px-8 text-[18px] text-white hover:bg-[#4c58ff]">
                {saving ? "Сохранение..." : "Закрыть"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) importItemsFromFile(file).catch(() => undefined);
          event.currentTarget.value = "";
        }}
      />

      {importing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20">
          <div className="rounded-2xl bg-white px-6 py-4 text-[18px]">
            <Loader2 className="mr-3 inline size-5 animate-spin" />
            Импортируем Excel...
          </div>
        </div>
      )}
    </div>
  );
}
