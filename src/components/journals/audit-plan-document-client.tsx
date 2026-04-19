"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, X } from "lucide-react";
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
import { buildStaffOptionLabel } from "@/lib/journal-staff-binding";
import { getDistinctRoleLabels, getUserRoleLabel, getUsersForRoleLabel } from "@/lib/user-roles";
import {
  AUDIT_PLAN_DOCUMENT_TITLE,
  createAuditPlanRow,
  createAuditPlanSection,
  getAuditPlanPrintDateLabel,
  normalizeAuditPlanConfig,
  type AuditPlanConfig,
  type AuditPlanSection,
} from "@/lib/audit-plan-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";

import { toast } from "sonner";
import { PositionSelectItems } from "@/components/shared/position-select";
type UserItem = { id: string; name: string; role: string };

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  users: UserItem[];
  config: unknown;
};

type SettingsState = {
  title: string;
  documentDate: string;
  year: string;
  approveRole: string;
  approveEmployeeId: string;
  approveEmployee: string;
};

function roleOptionsFromUsers(users: UserItem[]) {
  return getDistinctRoleLabels(users);
}

function usersForRole(users: UserItem[], roleLabel: string) {
  return getUsersForRoleLabel(users, roleLabel);
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function DocumentSettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  initial: SettingsState;
  onSubmit: (value: SettingsState) => Promise<void>;
}) {
  const [state, setState] = useState<SettingsState>(props.initial);
  const [submitting, setSubmitting] = useState(false);
  const roles = useMemo(() => roleOptionsFromUsers(props.users), [props.users]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (v) setState(props.initial);
        props.onOpenChange(v);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              Настройки документа
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Название документа</Label>
            <Input
              value={state.title}
              onChange={(e) => setState({ ...state, title: e.target.value })}
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Дата документа</Label>
            <Input
              type="date"
              value={state.documentDate}
              onChange={(e) => setState({ ...state, documentDate: toIsoDate(e.target.value) })}
              className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Год</Label>
            <Select value={state.year} onValueChange={(value) => setState({ ...state, year: value })}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }).map((_, idx) => {
                  const year = String(new Date().getFullYear() - 3 + idx);
                  return (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Должность &quot;Утверждаю&quot;</Label>
            <Select
              value={state.approveRole}
              onValueChange={(value) => {
                const user = usersForRole(props.users, value)[0];
                setState({
                  ...state,
                  approveRole: value,
                  approveEmployeeId: user?.id || "",
                  approveEmployee: user?.name || state.approveEmployee,
                });
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <PositionSelectItems users={props.users} />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
            <Select value={state.approveEmployeeId || "__empty__"} onValueChange={(value) => {
              if (value === "__empty__") {
                setState({ ...state, approveEmployeeId: "", approveEmployee: "" });
                return;
              }
              const user = props.users.find((item) => item.id === value);
              setState({
                ...state,
                approveEmployeeId: value,
                approveEmployee: user?.name || "",
                approveRole: user ? getUserRoleLabel(user.role) : state.approveRole,
              });
            }}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">- Выберите значение -</SelectItem>
                {usersForRole(props.users, state.approveRole).map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {buildStaffOptionLabel(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit(state);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageSectionsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  sections: AuditPlanSection[];
  onRename: (id: string, title: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [value, setValue] = useState("");

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          setEditingId(null);
          setValue("");
        }
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              Список &quot;Разделы&quot;
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-8 py-6">
          {props.sections.map((section) => (
            <div key={section.id} className="flex items-center gap-4 rounded-2xl bg-[#f5f6fb] px-4 py-4">
              <Checkbox checked={false} />
              {editingId === section.id ? (
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-12 flex-1 rounded-2xl border-[#d8dae6] px-4 text-[18px]"
                />
              ) : (
                <div className="flex-1 text-[15px] text-black">{section.title}</div>
              )}
              {editingId === section.id ? (
                <Button
                  type="button"
                  className="h-10 rounded-2xl bg-[#5563ff] px-4 text-white"
                  onClick={async () => {
                    if (!value.trim()) return;
                    await props.onRename(section.id, value.trim());
                    setEditingId(null);
                    setValue("");
                  }}
                >
                  Сохранить
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-2xl px-4 text-[#5563ff]"
                  onClick={() => {
                    setEditingId(section.id);
                    setValue(section.title);
                  }}
                >
                  Изменить
                </Button>
              )}
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button type="button" className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={() => props.onOpenChange(false)}>
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddSectionDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreate: (title: string) => Promise<void>;
  title: string;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setValue("");
      setSubmitting(false);
    }
  }, [props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              {props.title}
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={props.placeholder}
            className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || !value.trim()}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onCreate(value.trim());
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Добавление..." : "Добавить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddRowDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  sections: AuditPlanSection[];
  onCreate: (sectionId: string, text: string) => Promise<void>;
  onOpenAddSection: () => void;
  onOpenManageSections: () => void;
}) {
  const [sectionId, setSectionId] = useState(props.sections[0]?.id || "");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) {
      setSectionId(props.sections[0]?.id || "");
      setText("");
      setSubmitting(false);
    }
  }, [props.open, props.sections]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-black">
              Добавление новой строки
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Раздел</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="h-11 rounded-2xl border-[#d8dae6] bg-[#f1f2f8] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {props.sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[14px] text-[#73738a]">Текст</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[160px] rounded-2xl border-[#d8dae6] px-4 py-3 text-[18px]"
            />
          </div>
          <div className="space-y-1 text-[16px]">
            <button type="button" className="block text-[#5563ff] hover:underline" onClick={props.onOpenAddSection}>
              Добавить новый раздел
            </button>
            <button type="button" className="block text-[#5563ff] hover:underline" onClick={props.onOpenManageSections}>
              Редактировать список &quot;разделов&quot;
            </button>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || !sectionId || !text.trim()}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onCreate(sectionId, text.trim());
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CellValueDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  initialValue: string;
  title: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) {
      setValue(props.initialValue);
      setSubmitting(false);
    }
  }, [props.initialValue, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[24px] font-semibold text-black">{props.title}</DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-8 py-6">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Например: 29-05-2023 или X"
            className="h-11 rounded-2xl border-[#d8dae6] px-4 text-[15px]"
          />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave("");
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Очистить
            </Button>
            <Button
              type="button"
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSave(value.trim());
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuditPlanDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  users,
  config,
}: Props) {
  const router = useRouter();
  const normalized = normalizeAuditPlanConfig(config, { organizationName, users });
  const readOnly = status === "closed";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manageSectionsOpen, setManageSectionsOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [cellEditor, setCellEditor] = useState<{
    rowId: string;
    columnId: string;
    title: string;
    value: string;
  } | null>(null);

  const rowsBySection = useMemo(
    () =>
      normalized.sections.map((section) => ({
        section,
        rows: normalized.rows.filter((row) => row.sectionId === section.id),
      })),
    [normalized.rows, normalized.sections]
  );

  const settingsState: SettingsState = {
    title,
    documentDate: normalized.documentDate,
    year: String(normalized.year),
    approveRole: normalized.approveRole,
    approveEmployeeId: normalized.approveEmployeeId || "",
    approveEmployee: normalized.approveEmployee,
  };

  async function patchConfig(nextConfig: AuditPlanConfig, nextTitle = title) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextConfig.documentDate,
        dateTo: nextConfig.documentDate,
        config: nextConfig,
      }),
    });
    if (!response.ok) {
      toast.error("Не удалось сохранить документ");
      return;
    }
    router.refresh();
  }

  async function renameSection(id: string, nextTitle: string) {
    await patchConfig({
      ...normalized,
      sections: normalized.sections.map((section) =>
        section.id === id ? { ...section, title: nextTitle } : section
      ),
    });
  }

  async function addSection(nextTitle: string) {
    await patchConfig({
      ...normalized,
      sections: [...normalized.sections, createAuditPlanSection(nextTitle)],
    });
  }

  async function addColumn(nextTitle: string) {
    const nextColumnId = `audit-${normalized.columns.length + 1}`;
    await patchConfig({
      ...normalized,
      columns: [...normalized.columns, { id: nextColumnId, title: nextTitle, auditorName: "" }],
      rows: normalized.rows.map((row) => ({
        ...row,
        values: { ...row.values, [nextColumnId]: "" },
      })),
    });
  }

  async function addRow(sectionId: string, textValue: string) {
    await patchConfig({
      ...normalized,
      rows: [
        ...normalized.rows,
        createAuditPlanRow(sectionId, textValue, normalized.columns.map((column) => column.id)),
      ],
    });
  }

  async function updateRowChecked(rowId: string, checked: boolean) {
    await patchConfig({
      ...normalized,
      rows: normalized.rows.map((row) => (row.id === rowId ? { ...row, checked } : row)),
    });
  }

  async function deleteSelectedRows() {
    if (selectedRowIds.length === 0) return;
    setSelectedRowIds([]);
    await patchConfig({
      ...normalized,
      rows: normalized.rows.filter((row) => !selectedRowIds.includes(row.id)),
    });
  }

  async function updateCellValue(rowId: string, columnId: string, value: string) {
    await patchConfig({
      ...normalized,
      rows: normalized.rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [columnId]: value } } : row
      ),
    });
  }

  async function updateColumnAuditor(columnId: string, auditorName: string) {
    await patchConfig({
      ...normalized,
      columns: normalized.columns.map((column) =>
        column.id === columnId ? { ...column, auditorName } : column
      ),
    });
  }

  const allSelected =
    normalized.rows.length > 0 && selectedRowIds.length === normalized.rows.length;

  return (
    <div className="space-y-8">
      <DocumentBackLink href="/journals/audit_plan" documentId={documentId} />
      <div className="flex items-center justify-between print:hidden">
        <div />
        {!readOnly && (
          <Button
            variant="outline"
            className="h-12 rounded-xl border-[#e8ebf7] px-5 text-[14px] text-[#5566f6]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
            Настройки журнала
          </Button>
        )}
      </div>

      <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024] print:hidden">
        {title}
      </h1>

      {selectedRowIds.length > 0 && !readOnly && (
        <div className="flex items-center gap-4 rounded-2xl bg-[#f3f4fe] px-6 py-3 print:hidden">
          <button type="button" className="flex items-center gap-1 text-[16px] text-[#5566f6]" onClick={() => setSelectedRowIds([])}>
            <X className="size-4" /> Выбрано: {selectedRowIds.length}
          </button>
          <button type="button" className="flex items-center gap-1 text-[16px] text-[#ff3b30]" onClick={deleteSelectedRows}>
            <Trash2 className="size-4" /> Удалить
          </button>
        </div>
      )}

      <section className="space-y-4 rounded-[18px] border border-[#dadde9] bg-white p-8 print:border-0 print:p-0">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[220px_1fr_120px] border border-black/70">
          <div className="flex items-center justify-center border-r border-black/70 py-10 text-[16px] font-semibold">{organizationName}</div>
          <div className="grid grid-rows-2">
            <div className="flex items-center justify-center border-b border-black/70 py-4 text-[14px]">СИСТЕМА ХАССП</div>
            <div className="flex items-center justify-center py-4 text-[14px] italic">ПЛАН-ПРОГРАММА ВНУТРЕННИХ АУДИТОВ</div>
          </div>
          <div className="flex items-center justify-center border-l border-black/70 text-[14px]">СТР. 1 ИЗ 1</div>
        </div>

        <div className="ml-auto w-[420px] text-right text-[14px] leading-tight">
          <div className="font-semibold">УТВЕРЖДАЮ</div>
          <div>{normalized.approveRole}</div>
          <div>{normalized.approveEmployee}</div>
          <div>{getAuditPlanPrintDateLabel(normalized.documentDate)}</div>
        </div>

        <div className="py-4 text-center text-[24px] font-semibold">
          План-программа внутренних аудитов на {normalized.year} г.
        </div>

        {!readOnly && (
          <div className="flex gap-3 print:hidden">
            <Button className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={() => setAddRowOpen(true)}>
              <Plus className="size-5" /> Добавить
            </Button>
            <Button className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={() => setAddColumnOpen(true)}>
              <Plus className="size-5" /> Добавить подразделение
            </Button>
          </div>
        )}

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-full border-collapse border border-black/70 bg-white text-[14px]">
            <thead>
              <tr>
                <th rowSpan={3} className="w-14 border border-black/70 px-2 py-2">
                  {!readOnly && <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedRowIds(checked === true ? normalized.rows.map((row) => row.id) : [])} />}
                </th>
                <th rowSpan={3} className="w-[60px] border border-black/70 px-2 py-2">№ п/п</th>
                <th rowSpan={3} className="min-w-[620px] border border-black/70 px-3 py-2">Требования</th>
                <th colSpan={normalized.columns.length} className="border border-black/70 px-3 py-2 text-center">Дата аудита в подразделениях / назначенный(е) аудитор(ы):</th>
              </tr>
              <tr>
                {normalized.columns.map((column) => (
                  <th key={column.id} className="min-w-[150px] border border-black/70 px-2 py-2 text-center italic">{column.title}</th>
                ))}
              </tr>
              <tr>
                {normalized.columns.map((column) => (
                  <th key={column.id} className="border border-black/70 px-2 py-2 text-center">
                    {readOnly ? (
                      column.auditorName || "—"
                    ) : (
                      <select className="w-full bg-transparent text-center text-[16px] outline-none" value={users.find((user) => user.name === column.auditorName)?.id || ""} onChange={(e) => void updateColumnAuditor(column.id, users.find((user) => user.id === e.target.value)?.name || "")}>
                        <option value="">Добавить ФИО</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>{user.name}</option>
                        ))}
                      </select>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsBySection.map(({ section, rows }) => (
                <Fragment key={section.id}>
                  <tr key={`${section.id}-title`}>
                    <td colSpan={3 + normalized.columns.length} className="border border-black/70 px-3 py-2 text-center font-semibold">{section.title}</td>
                  </tr>
                  {rows.map((row) => {
                    const rowNumber = normalized.rows.findIndex((item) => item.id === row.id) + 1;
                    return (
                      <tr key={row.id}>
                        <td className="border border-black/70 px-2 py-2 text-center">
                          {!readOnly && (
                            <Checkbox checked={selectedRowIds.includes(row.id)} onCheckedChange={(checked) => setSelectedRowIds((current) => checked === true ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id))} />
                          )}
                        </td>
                        <td className="border border-black/70 px-2 py-2 text-center">{rowNumber}</td>
                        <td className="border border-black/70 px-3 py-2">
                          <div className="flex items-start gap-3">
                            {!readOnly && <Checkbox checked={row.checked} onCheckedChange={(checked) => void updateRowChecked(row.id, checked === true)} />}
                            <span>{row.text}</span>
                          </div>
                        </td>
                        {normalized.columns.map((column) => (
                          <td key={column.id} className="border border-black/70 px-2 py-2 text-center">
                            {readOnly ? (
                              row.values[column.id] || ""
                            ) : (
                              <button type="button" className="min-h-[28px] w-full rounded px-1 text-center hover:bg-[#f5f6ff]" onClick={() => setCellEditor({ rowId: row.id, columnId: column.id, title: `${row.text} / ${column.title}`, value: row.values[column.id] || "" })}>
                                {row.values[column.id] || ""}
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DocumentSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} users={users} initial={settingsState} onSubmit={async (value) => {
        const nextConfig = normalizeAuditPlanConfig({ ...normalized, year: Number(value.year), documentDate: value.documentDate, approveRole: value.approveRole, approveEmployeeId: value.approveEmployeeId || null, approveEmployee: value.approveEmployee });
        await patchConfig(nextConfig, value.title.trim() || title);
      }} />

      <ManageSectionsDialog open={manageSectionsOpen} onOpenChange={setManageSectionsOpen} sections={normalized.sections} onRename={renameSection} />
      <AddSectionDialog open={addSectionOpen} onOpenChange={setAddSectionOpen} onCreate={addSection} title="Добавить новый раздел" placeholder="Введите название раздела" />
      <AddSectionDialog open={addColumnOpen} onOpenChange={setAddColumnOpen} onCreate={addColumn} title="Добавление нового подразделения" placeholder="Введите название подразделения" />
      <AddRowDialog open={addRowOpen} onOpenChange={setAddRowOpen} sections={normalized.sections} onCreate={addRow} onOpenAddSection={() => setAddSectionOpen(true)} onOpenManageSections={() => setManageSectionsOpen(true)} />
      <CellValueDialog open={!!cellEditor} onOpenChange={(open) => { if (!open) setCellEditor(null); }} initialValue={cellEditor?.value || ""} title={cellEditor?.title || "Редактирование ячейки"} onSave={async (value) => {
        if (!cellEditor) return;
        await updateCellValue(cellEditor.rowId, cellEditor.columnId, value);
      }} />
    </div>
  );
}
