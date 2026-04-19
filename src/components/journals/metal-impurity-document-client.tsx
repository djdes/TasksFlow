"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createMetalImpurityRow,
  getMetalImpurityEmployeeOptions,
  getMetalImpurityOptionName,
  getMetalImpurityValuePerKg,
  METAL_IMPURITY_DOCUMENT_TITLE,
  METAL_IMPURITY_PAGE_TITLE,
  METAL_IMPURITY_RESPONSIBLE_POSITIONS,
  METAL_IMPURITY_TEMPLATE_CODE,
  normalizeMetalImpurityConfig,
  type MetalImpurityDocumentConfig,
  type MetalImpurityOption,
  type MetalImpurityRow,
  type MetalImpurityUser,
} from "@/lib/metal-impurity-document";
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import { DocumentBackLink } from "@/components/journals/document-back-link";
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
import { PositionSelectItems } from "@/components/shared/position-select";
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  config: unknown;
  users: MetalImpurityUser[];
};

type RowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MetalImpurityRow | null;
  materials: MetalImpurityOption[];
  suppliers: MetalImpurityOption[];
  users: MetalImpurityUser[];
  responsiblePosition: string;
  responsibleEmployeeId?: string | null;
  responsibleEmployee: string;
  onSave: (row: MetalImpurityRow, additions?: { materialName?: string; supplierName?: string }) => Promise<void>;
};

type ListEditorSectionProps = {
  title: string;
  items: MetalImpurityOption[];
  draftValue: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  editingId: string | null;
  editingValue: string;
  onEditStart: (id: string, value: string) => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  addPlaceholder: string;
  onImportClick: () => void;
  onImportFile: (file: File) => void;
};

function formatRuDate(value: string) {
  if (!value) return "__________";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function formatHeaderDate(value: string) {
  if (!value) return "__________";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU").replace(/\./g, "-");
}

function AddableSelectField(props: {
  label: string;
  value: string;
  options: MetalImpurityOption[];
  selectPlaceholder: string;
  addPlaceholder: string;
  addValue: string;
  onValueChange: (value: string) => void;
  onAddValueChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-[14px] text-[#73738a]">{props.label}</Label>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-white px-5 text-[16px]">
          <SelectValue placeholder={props.selectPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-3">
        <Input
          value={props.addValue}
          placeholder={props.addPlaceholder}
          onChange={(event) => props.onAddValueChange(event.target.value)}
          className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
        />
        <Button
          type="button"
          onClick={props.onAdd}
          className="size-14 rounded-[14px] bg-[#5566f6] p-0 text-white hover:bg-[#4b57ff]"
        >
          <Plus className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function RowDialog({
  open,
  onOpenChange,
  row,
  materials,
  suppliers,
  users,
  responsiblePosition,
  responsibleEmployeeId,
  responsibleEmployee,
  onSave,
}: RowDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<MetalImpurityRow>(
    createMetalImpurityRow({
      date: today,
      responsibleEmployeeId: responsibleEmployeeId || null,
      responsibleName: responsibleEmployee,
    })
  );
  const [draftPosition, setDraftPosition] = useState(responsiblePosition);
  const [draftEmployeeId, setDraftEmployeeId] = useState(responsibleEmployeeId || "");
  const [newSupplier, setNewSupplier] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [materialOptions, setMaterialOptions] = useState<MetalImpurityOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<MetalImpurityOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const employeeOptions = useMemo(
    () =>
      getMetalImpurityEmployeeOptions(
        users,
        draftPosition,
        draftEmployeeId || responsibleEmployeeId || null,
        [responsibleEmployeeId, draft.responsibleEmployeeId]
      ),
    [draft.responsibleEmployeeId, draftEmployeeId, draftPosition, responsibleEmployeeId, users]
  );

  useEffect(() => {
    if (!open) return;
    const initialRow =
      row ||
      createMetalImpurityRow({
        date: today,
        materialId: materials[0]?.id || "",
        supplierId: suppliers[0]?.id || "",
        responsibleRole: responsiblePosition,
        responsibleEmployeeId: responsibleEmployeeId || null,
        responsibleName: responsibleEmployee,
      });
    setDraft(initialRow);
    setDraftPosition(initialRow.responsibleRole || responsiblePosition);
    setDraftEmployeeId(initialRow.responsibleEmployeeId || responsibleEmployeeId || "");
    setNewSupplier("");
    setNewMaterial("");
    setMaterialOptions(materials);
    setSupplierOptions(suppliers);
    setSubmitting(false);
  }, [materials, open, responsibleEmployee, responsibleEmployeeId, responsiblePosition, row, suppliers, today]);

  function appendOption(items: MetalImpurityOption[], nextItem: MetalImpurityOption) {
    if (items.some((item) => item.id === nextItem.id || item.name.toLowerCase() === nextItem.name.toLowerCase())) {
      return items;
    }
    return [...items, nextItem];
  }

  useEffect(() => {
    if (!open || employeeOptions.length === 0) return;
    if (!employeeOptions.some((employee) => employee.id === draftEmployeeId)) {
      const nextEmployee = employeeOptions[0] || null;
      setDraftEmployeeId(nextEmployee?.id || "");
      setDraft((current) => ({
        ...current,
        responsibleEmployeeId: nextEmployee?.id || null,
        responsibleName: nextEmployee?.name || "",
      }));
    }
  }, [draftEmployeeId, employeeOptions, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8">
          <DialogTitle className="text-[22px] font-medium text-black">
            {row ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 py-6 sm:px-10 sm:py-8">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата</Label>
            <div className="relative">
              <Input
                type="date"
                value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 pr-12 text-[16px]"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#767b90]" />
            </div>
          </div>

          <AddableSelectField
            label="Поставщик"
            value={draft.supplierId}
            options={supplierOptions}
            selectPlaceholder="Выберите из списка или добавьте новое"
            addPlaceholder="Добавить название нового поставщика"
            addValue={newSupplier}
            onValueChange={(value) => setDraft({ ...draft, supplierId: value })}
            onAddValueChange={setNewSupplier}
            onAdd={() => {
              const value = newSupplier.trim();
              if (!value) return;
              const nextId = `new-supplier:${value}`;
              setSupplierOptions((current) => appendOption(current, { id: nextId, name: value }));
              setDraft({ ...draft, supplierId: nextId });
              setNewSupplier("");
            }}
          />

          <AddableSelectField
            label="Сырье"
            value={draft.materialId}
            options={materialOptions}
            selectPlaceholder="Выберите из списка или добавьте новое"
            addPlaceholder="Добавить название нового сырья"
            addValue={newMaterial}
            onValueChange={(value) => setDraft({ ...draft, materialId: value })}
            onAddValueChange={setNewMaterial}
            onAdd={() => {
              const value = newMaterial.trim();
              if (!value) return;
              const nextId = `new-material:${value}`;
              setMaterialOptions((current) => appendOption(current, { id: nextId, name: value }));
              setDraft({ ...draft, materialId: nextId });
              setNewMaterial("");
            }}
          />

          <div className="space-y-3">
            <Input
              value={draft.consumedQuantityKg}
              placeholder="Введите кол-во израсходованного сырья, кг"
              onChange={(event) =>
                setDraft({ ...draft, consumedQuantityKg: event.target.value })
              }
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Input
              value={draft.impurityQuantityG}
              placeholder="Введите кол-во металломагнитной примеси, г"
              onChange={(event) =>
                setDraft({ ...draft, impurityQuantityG: event.target.value })
              }
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Input
              value={draft.impurityCharacteristic}
              placeholder="Введите хар-ку металломагнитной примеси"
              onChange={(event) =>
                setDraft({ ...draft, impurityCharacteristic: event.target.value })
              }
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select
              value={draftPosition}
              onValueChange={(value) => {
                const nextEmployee =
                  getMetalImpurityEmployeeOptions(users, value, draftEmployeeId, [
                    responsibleEmployeeId,
                    draft.responsibleEmployeeId,
                  ])[0] || null;
                setDraftPosition(value);
                setDraftEmployeeId(nextEmployee?.id || "");
                setDraft((current) => ({
                  ...current,
                  responsibleRole: value,
                  responsibleEmployeeId: nextEmployee?.id || null,
                  responsibleName: nextEmployee?.name || "",
                }));
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={users} />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={draftEmployeeId || "__empty__"}
              onValueChange={(value) => {
                if (value === "__empty__") {
                  setDraftEmployeeId("");
                  setDraft({ ...draft, responsibleEmployeeId: null, responsibleName: "" });
                  return;
                }
                const user = users.find((item) => item.id === value) || null;
                setDraftEmployeeId(value);
                setDraft({
                  ...draft,
                  responsibleEmployeeId: value,
                  responsibleName: user?.name || "",
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {buildStaffOptionLabel(employee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSave(
                    {
                      ...draft,
                      responsibleRole: draftPosition,
                      responsibleEmployeeId: draftEmployeeId || null,
                      responsibleName:
                        users.find((user) => user.id === draftEmployeeId)?.name || draft.responsibleName,
                    },
                    {
                      materialName: newMaterial.trim() || undefined,
                      supplierName: newSupplier.trim() || undefined,
                    }
                  );
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5566f6] px-8 text-[16px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : row ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  title,
  config,
  users,
  employeeOptions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  config: MetalImpurityDocumentConfig;
  users: MetalImpurityUser[];
  employeeOptions: MetalImpurityUser[];
  onSave: (params: { title: string; config: MetalImpurityDocumentConfig }) => Promise<void>;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftConfig, setDraftConfig] = useState(config);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftTitle(title);
    setDraftConfig(config);
    setSubmitting(false);
  }, [config, open, title]);

  const filteredEmployees = useMemo(
    () =>
      getMetalImpurityEmployeeOptions(
        users,
        draftConfig.responsiblePosition,
        draftConfig.responsibleEmployeeId || null,
        employeeOptions.map((employee) => employee.id)
      ),
    [draftConfig.responsibleEmployeeId, draftConfig.responsiblePosition, employeeOptions, users]
  );

  useEffect(() => {
    if (!open || filteredEmployees.length === 0) return;
    if (!filteredEmployees.some((employee) => employee.id === draftConfig.responsibleEmployeeId)) {
      setDraftConfig((current) => ({
        ...current,
        responsibleEmployeeId: filteredEmployees[0]?.id || null,
        responsibleEmployee: filteredEmployees[0]?.name || "",
      }));
    }
  }, [draftConfig.responsibleEmployeeId, filteredEmployees, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 py-6 sm:px-10 sm:py-8">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Название документа</Label>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата начала</Label>
            <div className="relative">
              <Input
                type="date"
                value={draftConfig.startDate}
                onChange={(event) =>
                  setDraftConfig({ ...draftConfig, startDate: event.target.value })
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-5 pr-12 text-[16px]"
              />
              <CalendarDays className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#767b90]" />
            </div>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
            <Select
              value={draftConfig.responsiblePosition}
              onValueChange={(value) => {
                const nextEmployee =
                  getMetalImpurityEmployeeOptions(users, value, draftConfig.responsibleEmployeeId)[0] ||
                  null;
                setDraftConfig({
                  ...draftConfig,
                  responsiblePosition: value,
                  responsibleEmployeeId: nextEmployee?.id || draftConfig.responsibleEmployeeId || null,
                  responsibleEmployee: nextEmployee?.name || draftConfig.responsibleEmployee,
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={users} />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
            <Select
              value={draftConfig.responsibleEmployeeId || "__empty__"}
              onValueChange={(value) => {
                if (value === "__empty__") {
                  setDraftConfig({
                    ...draftConfig,
                    responsibleEmployeeId: null,
                    responsibleEmployee: "",
                  });
                  return;
                }
                const user = users.find((item) => item.id === value) || null;
                setDraftConfig({
                  ...draftConfig,
                  responsibleEmployeeId: value,
                  responsibleEmployee: user?.name || "",
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[16px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {filteredEmployees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {buildStaffOptionLabel(employee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSave({ title: draftTitle, config: draftConfig });
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5566f6] px-8 text-[16px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListEditorSection({
  title,
  items,
  draftValue,
  onDraftChange,
  onAdd,
  editingId,
  editingValue,
  onEditStart,
  onEditChange,
  onEditCommit,
  addPlaceholder,
  onImportClick,
  onImportFile,
}: ListEditorSectionProps) {
  return (
    <div className="space-y-4">
      <div className="text-[24px] font-semibold text-black">{title}</div>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-[18px] bg-[#f6f7fb] px-4 py-4"
          >
            <span className="size-6 rounded-[8px] border-2 border-[#73788d] bg-white" />
            {editingId === item.id ? (
              <Input
                autoFocus
                value={editingValue}
                onChange={(event) => onEditChange(event.target.value)}
                onBlur={onEditCommit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onEditCommit();
                }}
                className="h-10 border-0 bg-transparent px-0 text-[16px] shadow-none"
              />
            ) : (
              <div className="flex-1 text-[16px] text-black">{item.name}</div>
            )}
            <button
              type="button"
              onClick={() => onEditStart(item.id, item.name)}
              className="rounded-md p-1 text-[#5566f6]"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        ))}

        <div className="flex gap-3">
          <Input
            value={draftValue}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={addPlaceholder}
            className="h-11 rounded-2xl border-[#dfe1ec] px-5 text-[16px]"
          />
          <Button
            type="button"
            onClick={onAdd}
            className="size-14 rounded-[14px] bg-[#5566f6] p-0 text-white hover:bg-[#4b57ff]"
          >
            <Plus className="size-5" />
          </Button>
        </div>

          <div className="space-y-3 pt-1 text-[14px] text-[#6d7288]">
            <button
              type="button"
              onClick={onImportClick}
            className="text-left text-[#5f66ff] underline underline-offset-2"
          >
            Добавить из файла
          </button>
          <div>
            Список должен быть в файле Excel, на первом листе в первом столбце и начинаться с
            первой строки.
          </div>
            <div
              role="button"
              tabIndex={0}
              onClick={onImportClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onImportClick();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) onImportFile(file);
              }}
              className="flex min-h-[96px] cursor-pointer items-center justify-center rounded-[18px] border border-dashed border-[#cfd4e9] bg-white text-center transition-colors hover:border-[#5566f6] hover:bg-[#f5f6ff]"
            >
              <div className="flex flex-col items-center gap-2 text-[#727890]">
                <Paperclip className="size-5" />
                <span>Выберите файл или перетащите его сюда</span>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListsDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MetalImpurityDocumentConfig;
  onSave: (config: MetalImpurityDocumentConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const [newMaterial, setNewMaterial] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const materialFileInputRef = useRef<HTMLInputElement>(null);
  const supplierFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(config);
    setNewMaterial("");
    setNewSupplier("");
    setEditingMaterialId(null);
    setEditingSupplierId(null);
    setEditingValue("");
    setSubmitting(false);
  }, [config, open]);

  function commitMaterialEdit() {
    if (!editingMaterialId) return;
    const value = editingValue.trim();
    if (value) {
      setDraft((current) => ({
        ...current,
        materials: current.materials.map((item) =>
          item.id === editingMaterialId ? { ...item, name: value } : item
        ),
      }));
    }
    setEditingMaterialId(null);
    setEditingValue("");
  }

  function commitSupplierEdit() {
    if (!editingSupplierId) return;
    const value = editingValue.trim();
    if (value) {
      setDraft((current) => ({
        ...current,
        suppliers: current.suppliers.map((item) =>
          item.id === editingSupplierId ? { ...item, name: value } : item
        ),
      }));
    }
    setEditingSupplierId(null);
    setEditingValue("");
  }

  async function importItems(file: File, target: "materials" | "suppliers") {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
      const items = rows.map((row) => String(row[0] ?? "").trim()).filter(Boolean);
      if (items.length === 0) throw new Error("empty");
      setDraft((current) => {
        const currentItems = target === "materials" ? current.materials : current.suppliers;
        const existingNames = new Set(currentItems.map((item) => item.name.toLowerCase()));
        const imported = items
          .filter((item) => !existingNames.has(item.toLowerCase()))
          .map((name, index) => ({
            id: `${target.slice(0, -1)}-import-${Date.now()}-${index}`,
            name,
          }));
        return target === "materials"
          ? { ...current, materials: [...current.materials, ...imported] }
          : { ...current, suppliers: [...current.suppliers, ...imported] };
      });
    } catch {
      toast.error("Не удалось импортировать файл");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b px-8 py-6">
          <DialogTitle className="text-[24px] font-medium text-black">
            Редактировать список
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 px-8 py-6">
          <ListEditorSection
            title="Сырье"
            items={draft.materials}
            draftValue={newMaterial}
            onDraftChange={setNewMaterial}
            onAdd={() => {
              const value = newMaterial.trim();
              if (!value) return;
              setDraft((current) => ({
                ...current,
                materials: [
                  ...current.materials,
                  { id: `material-${Date.now()}`, name: value },
                ],
              }));
              setNewMaterial("");
            }}
            editingId={editingMaterialId}
            editingValue={editingValue}
            onEditStart={(id, value) => {
              commitSupplierEdit();
              setEditingMaterialId(id);
              setEditingValue(value);
            }}
            onEditChange={setEditingValue}
            onEditCommit={commitMaterialEdit}
            addPlaceholder="Введите название нового сырья"
            onImportClick={() => materialFileInputRef.current?.click()}
            onImportFile={(file) => {
              importItems(file, "materials").catch(() => undefined);
            }}
          />

          <ListEditorSection
            title="Поставщики"
            items={draft.suppliers}
            draftValue={newSupplier}
            onDraftChange={setNewSupplier}
            onAdd={() => {
              const value = newSupplier.trim();
              if (!value) return;
              setDraft((current) => ({
                ...current,
                suppliers: [
                  ...current.suppliers,
                  { id: `supplier-${Date.now()}`, name: value },
                ],
              }));
              setNewSupplier("");
            }}
            editingId={editingSupplierId}
            editingValue={editingValue}
            onEditStart={(id, value) => {
              commitMaterialEdit();
              setEditingSupplierId(id);
              setEditingValue(value);
            }}
            onEditChange={setEditingValue}
            onEditCommit={commitSupplierEdit}
            addPlaceholder="Введите название нового поставщика"
            onImportClick={() => supplierFileInputRef.current?.click()}
            onImportFile={(file) => {
              importItems(file, "suppliers").catch(() => undefined);
            }}
          />

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSave(draft);
                  onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5566f6] px-8 text-[16px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : "Закрыть"}
            </Button>
          </div>
        </div>
        <input
          ref={materialFileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importItems(file, "materials").catch(() => undefined);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={supplierFileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importItems(file, "suppliers").catch(() => undefined);
            event.currentTarget.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function MetalImpurityDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  config: initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documentTitle, setDocumentTitle] = useState(title || METAL_IMPURITY_DOCUMENT_TITLE);
  const [config, setConfig] = useState(() => normalizeMetalImpurityConfig(initialConfig));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MetalImpurityRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  useEffect(() => {
    setConfig(normalizeMetalImpurityConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    setDocumentTitle(title || METAL_IMPURITY_DOCUMENT_TITLE);
  }, [title]);

  const allSelected = config.rows.length > 0 && selectedRowIds.length === config.rows.length;
  const { mobileView, switchMobileView } = useMobileView("metal_impurity");

  const supplierNameById = useMemo(
    () => new Map(config.suppliers.map((s) => [s.id, s.name])),
    [config.suppliers]
  );
  const materialNameById = useMemo(
    () => new Map(config.materials.map((m) => [m.id, m.name])),
    [config.materials]
  );

  const cardItems: RecordCardItem[] = config.rows.map((row, index) => ({
    id: row.id,
    title: `№${index + 1} · ${formatRuDate(row.date) || "—"}`,
    subtitle: supplierNameById.get(row.supplierId) || undefined,
    leading: status === "active" ? (
      <Checkbox
        checked={selectedRowIds.includes(row.id)}
        onCheckedChange={(checked) =>
          setSelectedRowIds((current) =>
            checked === true
              ? [...new Set([...current, row.id])]
              : current.filter((id) => id !== row.id)
          )
        }
        className="size-5"
      />
    ) : null,
    fields: [
      { label: "Наименование сырья", value: materialNameById.get(row.materialId) || "", hideIfEmpty: true },
      { label: "Количество сырья, кг", value: row.consumedQuantityKg, hideIfEmpty: true },
      { label: "Количество примеси, г", value: row.impurityQuantityG, hideIfEmpty: true },
      { label: "Характеристика примеси", value: row.impurityCharacteristic, hideIfEmpty: true },
      { label: "Ответственный", value: row.responsibleName, hideIfEmpty: true },
    ],
    onClick: status === "active"
      ? () => {
          setEditingRow(row);
          setRowDialogOpen(true);
        }
      : undefined,
    actions: status === "active" ? (
      <button
        type="button"
        onClick={() => {
          setEditingRow(row);
          setRowDialogOpen(true);
        }}
        className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#5563ff] px-4 text-[14px] font-medium text-white hover:bg-[#4452ee]"
      >
        Редактировать
      </button>
    ) : null,
  }));
  const employeeOptions = useMemo(
    () =>
      getMetalImpurityEmployeeOptions(
        users,
        config.responsiblePosition,
        editingRow?.responsibleEmployeeId || config.responsibleEmployeeId || null,
        config.rows.map((row) => row.responsibleEmployeeId)
      ),
    [config.responsibleEmployeeId, config.responsiblePosition, config.rows, editingRow?.responsibleEmployeeId, users]
  );

  async function persist(
    nextTitle: string,
    nextConfig: MetalImpurityDocumentConfig,
    patch?: Record<string, unknown>
  ) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextConfig.startDate,
        dateTo: nextConfig.endDate || nextConfig.startDate,
        responsibleTitle: nextConfig.responsiblePosition,
        responsibleUserId: nextConfig.responsibleEmployeeId || null,
        config: nextConfig,
        ...patch,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Не удалось сохранить журнал");
    }

    setDocumentTitle(nextTitle);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function saveRow(
    row: MetalImpurityRow,
    additions?: { materialName?: string; supplierName?: string }
  ) {
    let nextConfig = { ...config };
    const normalizedRow = { ...row };

    if (additions?.materialName) {
      const item = { id: `material-${Date.now()}`, name: additions.materialName };
      nextConfig = { ...nextConfig, materials: [...nextConfig.materials, item] };
      normalizedRow.materialId = item.id;
    } else if (normalizedRow.materialId.startsWith("new-material:")) {
      const name = normalizedRow.materialId.slice("new-material:".length);
      const item = { id: `material-${Date.now()}`, name };
      nextConfig = { ...nextConfig, materials: [...nextConfig.materials, item] };
      normalizedRow.materialId = item.id;
    }

    if (additions?.supplierName) {
      const item = { id: `supplier-${Date.now()}`, name: additions.supplierName };
      nextConfig = { ...nextConfig, suppliers: [...nextConfig.suppliers, item] };
      normalizedRow.supplierId = item.id;
    } else if (normalizedRow.supplierId.startsWith("new-supplier:")) {
      const name = normalizedRow.supplierId.slice("new-supplier:".length);
      const item = { id: `supplier-${Date.now()}`, name };
      nextConfig = { ...nextConfig, suppliers: [...nextConfig.suppliers, item] };
      normalizedRow.supplierId = item.id;
    }

    const nextRows = editingRow
      ? nextConfig.rows.map((item) => (item.id === editingRow.id ? normalizedRow : item))
      : [...nextConfig.rows, normalizedRow];
    await persist(documentTitle, { ...nextConfig, rows: nextRows });
    setEditingRow(null);
  }

  async function deleteSelectedRows() {
    if (selectedRowIds.length === 0) return;
    await persist(documentTitle, {
      ...config,
      rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
    });
    setSelectedRowIds([]);
  }

  async function finishJournal() {
    const today = new Date().toISOString().slice(0, 10);
    await persist(
      documentTitle,
      { ...config, endDate: today },
      { status: "closed", dateTo: today }
    );
    router.push(`/journals/${METAL_IMPURITY_TEMPLATE_CODE}?tab=closed`);
  }

  const rows = useMemo(
    () =>
      config.rows.map((row) => ({
        ...row,
        materialName: getMetalImpurityOptionName(config.materials, row.materialId),
        supplierName: getMetalImpurityOptionName(config.suppliers, row.supplierId),
        valuePerKg: getMetalImpurityValuePerKg(
          row.impurityQuantityG,
          row.consumedQuantityKg
        ),
      })),
    [config.materials, config.rows, config.suppliers]
  );

  return (
    <>
      <div className="space-y-8 bg-white text-black">
        {selectedRowIds.length > 0 && status === "active" && (
          <div className="flex items-center gap-4 rounded-[12px] bg-white px-2 py-2 print:hidden">
            <div className="inline-flex h-14 items-center gap-3 rounded-[12px] bg-[#fafbff] px-6 text-[18px] text-[#5566f6]">
              <button
                type="button"
                onClick={() => setSelectedRowIds([])}
                className="flex size-6 items-center justify-center"
              >
                <X className="size-5" />
              </button>
              Выбрано: {selectedRowIds.length}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                deleteSelectedRows().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Ошибка удаления")
                )
              }
              className="h-14 rounded-[12px] border-[#ffd7d3] px-6 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
            >
              <Trash2 className="size-5" />
              Удалить
            </Button>
          </div>
        )}

        <DocumentBackLink href={`/journals/${METAL_IMPURITY_TEMPLATE_CODE}`} documentId={documentId} />
        <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <h1 className="mt-4 text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              {documentTitle}
            </h1>
          </div>
          {status === "active" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#dcdfed] px-6 text-[16px] text-[#3848c7] shadow-none self-start sm:self-auto"
            >
              Настройки журнала
            </Button>
          )}
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="mx-auto min-w-[1040px] max-w-[1250px] border-collapse">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="w-[180px] border border-black px-6 py-10 text-center text-[18px] font-medium"
                >
                  {organizationName}
                </td>
                <td className="border border-black px-6 py-4 text-center text-[18px]">
                  СИСТЕМА ХАССП
                </td>
                <td className="w-[180px] border border-black px-4 py-2 align-top text-[16px]">
                  <div className="font-semibold">Начат {formatHeaderDate(config.startDate)}</div>
                  <div className="font-semibold">
                    Окончен {config.endDate ? formatHeaderDate(config.endDate) : "__________"}
                  </div>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-6 py-3 text-center text-[16px] italic">
                  ЖУРНАЛ УЧЕТА МЕТАЛЛОПРИМЕСЕЙ В СЫРЬЕ
                </td>
                <td className="border border-black px-4 py-3 text-right text-[16px]">
                  СТР. 1 ИЗ 1
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="text-center text-[16px] font-semibold uppercase tracking-[0.02em]">
          Журнал учета металлопримесей в сырье
        </div>

        {status === "active" && (
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => {
                  setEditingRow(null);
                  setRowDialogOpen(true);
                }}
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
              >
                <Plus className="size-5" />
                Добавить
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setListsOpen(true)}
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
              >
                Редактировать списки
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFinishOpen(true)}
              className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            >
              Закончить журнал
            </Button>
          </div>
        )}

        <div className="sm:hidden print:hidden">
          <MobileViewToggle mobileView={mobileView} onChange={switchMobileView} />
        </div>

        {mobileView === "cards" ? (
          <RecordCardsView items={cardItems} emptyLabel="Записей пока нет." />
        ) : null}

        <MobileViewTableWrapper mobileView={mobileView} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[1540px] w-full border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[42px] border border-black p-2 text-center print:hidden">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? config.rows.map((row) => row.id) : [])
                    }
                    disabled={status !== "active" || config.rows.length === 0}
                  />
                </th>
                <th className="w-[130px] border border-black p-3 text-center font-semibold">
                  Дата
                </th>
                <th className="w-[220px] border border-black p-3 text-center font-semibold">
                  Поставщик
                </th>
                <th className="w-[220px] border border-black p-3 text-center font-semibold">
                  Наименование сырья
                </th>
                <th className="w-[180px] border border-black p-3 text-center font-semibold">
                  Количество израсходованного сырья, кг
                </th>
                <th className="w-[180px] border border-black p-3 text-center font-semibold">
                  Количество металломагнитной примеси, г
                </th>
                <th className="w-[260px] border border-black p-3 text-center font-semibold">
                  Характеристика металломагнитной примеси
                </th>
                <th className="w-[170px] border border-black p-3 text-center font-semibold">
                  Количество в мг на 1 кг муки (N - не более 3 мг)
                </th>
                <th className="w-[220px] border border-black p-3 text-center font-semibold">
                  ФИО ответственного
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={status === "active" ? "cursor-pointer hover:bg-[#f5f6ff]" : undefined}
                  onClick={() => {
                    if (status !== "active") return;
                    setEditingRow(row);
                    setRowDialogOpen(true);
                  }}
                >
                  <td
                    className="border border-black p-2 text-center align-top print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRowIds((current) =>
                          checked === true
                            ? [...new Set([...current, row.id])]
                            : current.filter((id) => id !== row.id)
                        )
                      }
                      disabled={status !== "active"}
                    />
                  </td>
                  <td className="border border-black p-3 align-top">
                    <button
                      type="button"
                      disabled={status !== "active"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (status !== "active") return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                      className="w-full text-left disabled:cursor-default"
                    >
                      {formatRuDate(row.date)}
                    </button>
                  </td>
                  <td className="border border-black p-3 align-top">{row.supplierName}</td>
                  <td className="border border-black p-3 align-top">{row.materialName}</td>
                  <td className="border border-black p-3 align-top">
                    {row.consumedQuantityKg || "—"}
                  </td>
                  <td className="border border-black p-3 align-top">
                    {row.impurityQuantityG || "—"}
                  </td>
                  <td className="border border-black p-3 align-top whitespace-pre-wrap">
                    {row.impurityCharacteristic || "—"}
                  </td>
                  <td className="border border-black p-3 align-top">{row.valuePerKg || "—"}</td>
                  <td className="border border-black p-3 align-top">
                    {row.responsibleName || "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-black px-4 py-10 text-center text-[18px] text-[#666a80]"
                  >
                    Записей пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </MobileViewTableWrapper>
      </div>

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(open) => {
          setRowDialogOpen(open);
          if (!open) setEditingRow(null);
        }}
        row={editingRow}
        materials={config.materials}
        suppliers={config.suppliers}
        users={users}
        responsiblePosition={config.responsiblePosition}
        responsibleEmployeeId={config.responsibleEmployeeId}
        responsibleEmployee={config.responsibleEmployee}
        onSave={saveRow}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        config={config}
        users={users}
        employeeOptions={employeeOptions}
        onSave={async ({ title: nextTitle, config: nextConfig }) => {
          await persist(nextTitle.trim() || METAL_IMPURITY_DOCUMENT_TITLE, nextConfig);
        }}
      />

      <ListsDialog
        open={listsOpen}
        onOpenChange={setListsOpen}
        config={config}
        onSave={async (nextConfig) => {
          await persist(documentTitle, nextConfig);
        }}
      />

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[680px]">
          <DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8">
            <DialogTitle className="pr-10 text-[22px] font-medium text-black">
              {`Закончить журнал "${documentTitle}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end px-5 py-6 sm:px-10 sm:py-8">
            <Button
              type="button"
              onClick={() =>
                finishJournal().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Ошибка закрытия")
                )
              }
              className="h-11 rounded-2xl bg-[#5566f6] px-8 text-[16px] text-white hover:bg-[#4b57ff]"
            >
              Закончить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
