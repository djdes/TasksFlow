"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { getUsersForRoleLabel } from "@/lib/user-roles";
import { DocumentPageHeader } from "@/components/journals/document-page-header";
import { useRouter } from "next/navigation";
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
  PPE_ISSUANCE_DOCUMENT_TITLE,
  formatPpeIssuanceDate,
  getPpeIssuanceIssuerLabel,
  getPpeIssuanceRecipientLabel,
  normalizePpeIssuanceConfig,
  createPpeIssuanceRow,
  type PpeIssuanceConfig,
  type PpeIssuanceRow,
} from "@/lib/ppe-issuance-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";

import { toast } from "sonner";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  status: string;
  config: unknown;
  users: UserItem[];
};

type RowDialogState = {
  issueDate: string;
  maskCount: string;
  gloveCount: string;
  shoePairsCount: string;
  clothingSetsCount: string;
  capCount: string;
  recipientUserId: string;
  recipientTitle: string;
  issuerUserId: string;
  issuerTitle: string;
};

function roleOptions(users: UserItem[]) {
  return [...new Set(users.map((user) => getHygienePositionLabel(user.role)))];
}

function rowToState(row: PpeIssuanceRow): RowDialogState {
  return {
    issueDate: row.issueDate,
    maskCount: String(row.maskCount || ""),
    gloveCount: String(row.gloveCount || ""),
    shoePairsCount: String(row.shoePairsCount || ""),
    clothingSetsCount: String(row.clothingSetsCount || ""),
    capCount: String(row.capCount || ""),
    recipientUserId: row.recipientUserId,
    recipientTitle: row.recipientTitle,
    issuerUserId: row.issuerUserId,
    issuerTitle: row.issuerTitle,
  };
}

function stateToRow(state: RowDialogState, initialRow: PpeIssuanceRow | null) {
  return createPpeIssuanceRow({
    id: initialRow?.id,
    issueDate: state.issueDate,
    maskCount: Number(state.maskCount || 0),
    gloveCount: Number(state.gloveCount || 0),
    shoePairsCount: Number(state.shoePairsCount || 0),
    clothingSetsCount: Number(state.clothingSetsCount || 0),
    capCount: Number(state.capCount || 0),
    recipientUserId: state.recipientUserId,
    recipientTitle: state.recipientTitle,
    issuerUserId: state.issuerUserId,
    issuerTitle: state.issuerTitle,
  });
}

function FieldToggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className="flex items-center gap-4 text-left"
    >
      <span
        className={`relative h-8 w-16 rounded-full transition-colors ${
          checked ? "bg-[#5863f8]" : "bg-[#d6d6db]"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
            checked ? "left-9" : "left-1"
          }`}
        />
      </span>
      <span className="text-[18px] text-black">{label}</span>
    </button>
  );
}

function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  dateFrom: string;
  users: UserItem[];
  config: PpeIssuanceConfig;
  onSave: (params: {
    title: string;
    dateFrom: string;
    config: PpeIssuanceConfig;
  }) => Promise<void>;
}) {
  const [documentTitle, setDocumentTitle] = useState(props.title);
  const [documentDate, setDocumentDate] = useState(props.dateFrom);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState(() => props.config);
  const titles = useMemo(() => roleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.open) return;
    setDocumentTitle(props.title);
    setDocumentDate(props.dateFrom);
    setState(props.config);
  }, [props.config, props.dateFrom, props.open, props.title]);

  async function handleSave() {
    setSubmitting(true);
    try {
      await props.onSave({
        title: documentTitle.trim() || PPE_ISSUANCE_DOCUMENT_TITLE,
        dateFrom: documentDate,
        config: state,
      });
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">
              Настройки документа
            </DialogTitle>
            <button type="button" className="rounded-xl p-2 text-[#0b1024]" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>
        <div className="space-y-6 px-10 py-8">
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Название документа</Label>
            <Input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Дата начала</Label>
            <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />
          </div>
          <fieldset className="space-y-4 rounded-[28px] border border-[#d8dae6] px-6 py-5">
            <legend className="px-2 text-[20px] font-semibold text-black">Добавить поля</legend>
            <FieldToggle checked={state.showGloves} onCheckedChange={(checked) => setState({ ...state, showGloves: checked })} label="Выдача перчаток" />
            <FieldToggle checked={state.showShoes} onCheckedChange={(checked) => setState({ ...state, showShoes: checked })} label="Выдача обуви" />
            <FieldToggle checked={state.showClothing} onCheckedChange={(checked) => setState({ ...state, showClothing: checked })} label="Выдача спец. одежды" />
            <FieldToggle checked={state.showCaps} onCheckedChange={(checked) => setState({ ...state, showCaps: checked })} label="Выдача шапочек" />
          </fieldset>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Сотрудник по умолчанию, выдавший СИЗ</Label>
            <Select value={state.defaultIssuerUserId || ""} onValueChange={(value) => {
              const user = props.users.find((item) => item.id === value);
              setState({
                ...state,
                defaultIssuerUserId: value,
                defaultIssuerTitle: state.defaultIssuerTitle || (user ? getHygienePositionLabel(user.role) : null),
              });
            }}>
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {props.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[18px] text-[#7a7c8e]">Должность лица, выдавшего СИЗ</Label>
            <Select value={state.defaultIssuerTitle || ""} onValueChange={(value) => setState({ ...state, defaultIssuerTitle: value })}>
              <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {titles.map((title) => (
                  <SelectItem key={title} value={title}>{title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleSave} disabled={submitting} className="h-16 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4554ff]">
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  users: UserItem[];
  config: PpeIssuanceConfig;
  initialRow: PpeIssuanceRow | null;
  onSave: (row: PpeIssuanceRow) => Promise<void>;
}) {
  const [state, setState] = useState<RowDialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titles = useMemo(() => roleOptions(props.users), [props.users]);

  useEffect(() => {
    if (!props.open) return;
    setState(
      rowToState(
        props.initialRow ||
          createPpeIssuanceRow({
            issueDate: new Date().toISOString().slice(0, 10),
            issuerUserId: props.config.defaultIssuerUserId || "",
            issuerTitle: props.config.defaultIssuerTitle || "",
          })
      )
    );
  }, [props.config.defaultIssuerTitle, props.config.defaultIssuerUserId, props.initialRow, props.open]);

  async function handleSave() {
    if (!state) return;
    setSubmitting(true);
    try {
      await props.onSave(stateToRow(state, props.initialRow));
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[720px] overflow-y-auto rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-10 py-8">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[32px] font-semibold tracking-[-0.03em] text-black">
              {props.initialRow ? "Редактирование строки" : "Добавление новой строки"}
            </DialogTitle>
            <button type="button" className="rounded-xl p-2 text-[#0b1024]" onClick={() => props.onOpenChange(false)}>
              <X className="size-8" />
            </button>
          </div>
        </DialogHeader>
        {state && (
          <div className="space-y-5 px-10 py-8">
            <Input type="date" value={state.issueDate} onChange={(e) => setState({ ...state, issueDate: e.target.value })} className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />
            <Input value={state.maskCount} onChange={(e) => setState({ ...state, maskCount: e.target.value })} placeholder="Введите количество масок" className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />
            {props.config.showGloves && <Input value={state.gloveCount} onChange={(e) => setState({ ...state, gloveCount: e.target.value })} placeholder="Введите количество перчаток" className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />}
            {props.config.showShoes && <Input value={state.shoePairsCount} onChange={(e) => setState({ ...state, shoePairsCount: e.target.value })} placeholder="Введите количество пар обуви" className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />}
            {props.config.showClothing && <Input value={state.clothingSetsCount} onChange={(e) => setState({ ...state, clothingSetsCount: e.target.value })} placeholder="Введите количество комплектов одежды" className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />}
            {props.config.showCaps && <Input value={state.capCount} onChange={(e) => setState({ ...state, capCount: e.target.value })} placeholder="Введите количество шапочек" className="h-16 rounded-3xl border-[#d8dae6] px-7 text-[22px]" />}
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Должность лица, получившего СИЗ</Label>
              <Select value={state.recipientTitle} onValueChange={(value) => setState({ ...state, recipientTitle: value })}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {titles.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Сотрудник</Label>
              <Select value={state.recipientUserId} onValueChange={(value) => {
                const user = props.users.find((item) => item.id === value);
                setState({ ...state, recipientUserId: value, recipientTitle: state.recipientTitle || (user ? getHygienePositionLabel(user.role) : "") });
              }}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {(state.recipientTitle
                    ? getUsersForRoleLabel(props.users, state.recipientTitle)
                    : props.users
                  ).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Должность лица, выдавшего СИЗ</Label>
              <Select value={state.issuerTitle} onValueChange={(value) => setState({ ...state, issuerTitle: value })}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {titles.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[18px] text-[#7a7c8e]">Сотрудник</Label>
              <Select value={state.issuerUserId} onValueChange={(value) => {
                const user = props.users.find((item) => item.id === value);
                setState({ ...state, issuerUserId: value, issuerTitle: state.issuerTitle || (user ? getHygienePositionLabel(user.role) : "") });
              }}>
                <SelectTrigger className="h-16 rounded-3xl border-[#d8dae6] bg-[#f1f2f8] px-7 text-[22px]"><SelectValue placeholder="- Выберите значение -" /></SelectTrigger>
                <SelectContent>
                  {(state.issuerTitle
                    ? getUsersForRoleLabel(props.users, state.issuerTitle)
                    : props.users
                  ).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={handleSave} disabled={submitting} className="h-16 rounded-3xl bg-[#5563ff] px-10 text-[20px] text-white hover:bg-[#4554ff]">
                {submitting ? "Сохранение..." : props.initialRow ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog(props: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await props.onConfirm();
      props.onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[760px] rounded-[28px] border-0 p-0">
        <DialogHeader className="border-b px-8 py-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[24px] font-semibold text-black">
              Закончить журнал &quot;{props.title}&quot;
            </DialogTitle>
            <button type="button" className="rounded-xl p-2" onClick={() => props.onOpenChange(false)}>
              <X className="size-7" />
            </button>
          </div>
        </DialogHeader>
        <div className="flex justify-end px-8 py-6">
          <Button type="button" onClick={handleConfirm} disabled={submitting} className="h-12 rounded-2xl bg-[#5563ff] px-8 text-[18px] text-white hover:bg-[#4554ff]">
            {submitting ? "Завершение..." : "Закончить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PpeIssuanceDocumentClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [config, setConfig] = useState(() =>
    normalizePpeIssuanceConfig(props.config, props.users)
  );
  const [title, setTitle] = useState(props.title || PPE_ISSUANCE_DOCUMENT_TITLE);
  const [dateFrom, setDateFrom] = useState(props.dateFrom);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PpeIssuanceRow | null>(null);

  const rows = config.rows;
  const isClosed = props.status === "closed";
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  const columns = useMemo(
    () =>
      [
        {
          key: "maskCount",
          label: "Количество масок, выданных на 1 рабочую неделю",
          visible: true,
        },
        {
          key: "gloveCount",
          label: "Количество пар перчаток, выданных на 1 рабочую неделю",
          visible: config.showGloves,
        },
        {
          key: "shoePairsCount",
          label: "Количество пар обуви, выданных на 1 рабочую неделю",
          visible: config.showShoes,
        },
        {
          key: "clothingSetsCount",
          label: "Количество комплектов одежды, выданных на 1 рабочую неделю",
          visible: config.showClothing,
        },
        {
          key: "capCount",
          label: "Количество шапочек, выданных на 1 рабочую неделю",
          visible: config.showCaps,
        },
      ].filter((item) => item.visible),
    [config.showCaps, config.showClothing, config.showGloves, config.showShoes]
  );

  async function persist(
    nextTitle: string,
    nextDateFrom: string,
    nextConfig: PpeIssuanceConfig
  ) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
        dateFrom: nextDateFrom,
        dateTo: nextDateFrom,
        config: nextConfig,
      }),
    });
    if (!response.ok) {
      throw new Error("Не удалось сохранить документ");
    }
    setTitle(nextTitle);
    setDateFrom(nextDateFrom);
    setConfig(nextConfig);
    startTransition(() => router.refresh());
  }

  async function handleSaveRow(row: PpeIssuanceRow) {
    const nextConfig = {
      ...config,
      rows: editingRow
        ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
        : [...config.rows, row],
    };
    await persist(title, dateFrom, nextConfig);
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const count = selectedRowIds.length;
    if (!window.confirm(`Удалить выбранные строки (${count})?`)) return;
    try {
      const nextConfig = {
        ...config,
        rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
      };
      await persist(title, dateFrom, nextConfig);
      setSelectedRowIds([]);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function handleCloseJournal() {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!response.ok) {
      throw new Error("Не удалось закрыть журнал");
    }
    router.refresh();
  }

  return (
    <div className="bg-white text-black">
      <div className="mx-auto max-w-[1860px] space-y-6 px-6 py-6">
        {selectedRowIds.length > 0 && !isClosed && (
          <div className="sticky top-0 z-30 -mx-6 flex items-center gap-3 border-b border-[#eef0fb] bg-white/95 px-6 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => setSelectedRowIds([])}
              className="rounded-md p-1 text-[#7c7c93] hover:text-black"
            >
              <X className="size-4" />
            </button>
            <span className="text-[14px]">Выбрано: {selectedRowIds.length}</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                handleDeleteSelected().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Ошибка")
                )
              }
              className="h-9 px-3 text-[13px] text-[#ff3b30] hover:bg-[#fff2f1] hover:text-[#ff3b30]"
            >
              <Trash2 className="mr-1 size-4" /> Удалить
            </Button>
          </div>
        )}

        <DocumentPageHeader
          backHref="/journals/ppe_issuance"
          documentId={props.documentId}
          rightActions={
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
            >
              Настройки журнала
            </Button>
          }
        />

        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {title}
          </h1>
        </div>

        <table className="w-full border-collapse text-[15px]">
          <tbody>
            <tr>
              <td
                rowSpan={2}
                className="w-[220px] border border-black px-4 py-3 text-center font-semibold"
              >
                {props.organizationName || 'ООО "Тест"'}
              </td>
              <td className="border border-black px-4 py-2 text-center">СИСТЕМА ХАССП</td>
              <td rowSpan={2} className="w-[200px] border border-black px-3 py-2">
                <div className="text-sm font-semibold">
                  Начат {formatPpeIssuanceDate(dateFrom)}
                </div>
                <div className="mt-1 text-sm">Окончен __________</div>
              </td>
            </tr>
            <tr>
              <td className="border border-black px-4 py-2 text-center italic">
                ЖУРНАЛ УЧЕТА ВЫДАЧИ СИЗ
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-center text-[20px] font-semibold">
          ЖУРНАЛ УЧЕТА ВЫДАЧИ СИЗ
        </div>

        {!isClosed && (
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="h-14 rounded-2xl bg-[#5b66ff] px-6 text-[16px] text-white hover:bg-[#4b57ff]"
                >
                  <Plus className="mr-2 size-5" />
                  Добавить
                  <ChevronDown className="ml-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[220px] rounded-2xl border-0 p-2 shadow-xl"
              >
                <DropdownMenuItem
                  className="h-11 rounded-xl px-3 text-[15px] text-[#5b66ff]"
                  onSelect={() => {
                    setEditingRow(null);
                    setRowDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 size-4" /> Добавить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setCloseDialogOpen(true)}
              className="rounded-[20px] bg-[#f5f6ff] px-8 py-5 text-[14px] text-[#5b66ff]"
            >
              Закончить журнал
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1450px] w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[44px] border border-black p-2 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(value) =>
                      setSelectedRowIds(value === true ? rows.map((row) => row.id) : [])
                    }
                    disabled={rows.length === 0 || isClosed}
                  />
                </th>
                <th className="border border-black p-2 text-center">Дата выдачи СИЗ</th>
                {columns.map((column) => (
                  <th key={column.key} className="border border-black p-2 text-center">
                    {column.label}
                  </th>
                ))}
                <th className="border border-black p-2 text-center">
                  Должность и ФИО лица, получившего СИЗ
                </th>
                <th className="border border-black p-2 text-center">
                  ФИО лица, выдавшего СИЗ
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border border-black p-2 text-center">
                    <Checkbox
                      checked={selectedRowIds.includes(row.id)}
                      onCheckedChange={(value) =>
                        setSelectedRowIds((current) =>
                          value === true
                            ? [...new Set([...current, row.id])]
                            : current.filter((item) => item !== row.id)
                        )
                      }
                      disabled={isClosed}
                    />
                  </td>
                  <td className="border border-black p-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (isClosed) return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                      className="w-full text-center hover:text-[#5464ff]"
                    >
                      {formatPpeIssuanceDate(row.issueDate)}
                    </button>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={`${row.id}:${column.key}`}
                      className="border border-black p-2 text-center"
                    >
                      {String(row[column.key as keyof PpeIssuanceRow] || "")}
                    </td>
                  ))}
                  <td className="border border-black p-2 text-center">
                    {getPpeIssuanceRecipientLabel(row, props.users)}
                  </td>
                  <td className="border border-black p-2 text-center">
                    {getPpeIssuanceIssuerLabel(row, props.users)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border border-black p-2 text-center">
                  <Checkbox disabled />
                </td>
                <td colSpan={columns.length + 2} className="border border-black p-2" />
              </tr>
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
        onSave={async (params) => {
          await persist(params.title, params.dateFrom, params.config);
        }}
      />

      <RowDialog
        open={rowDialogOpen}
        onOpenChange={(value) => {
          setRowDialogOpen(value);
          if (!value) setEditingRow(null);
        }}
        users={props.users}
        config={config}
        initialRow={editingRow}
        onSave={handleSaveRow}
      />

      <CloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title={title}
        onConfirm={handleCloseJournal}
      />
    </div>
  );
}
