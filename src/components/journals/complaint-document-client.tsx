"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentBackLink } from "@/components/journals/document-back-link";
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
import { Textarea } from "@/components/ui/textarea";
import {
  buildComplaintRow,
  COMPLAINT_RECEIPT_OPTIONS,
  COMPLAINT_REGISTER_TEMPLATE_CODE,
  COMPLAINT_REGISTER_TITLE,
  formatComplaintDate,
  getComplaintDecisionCell,
  normalizeComplaintConfig,
  type ComplaintDocumentConfig,
} from "@/lib/complaint-document";
import {
  type RegisterDocumentConfig,
  type RegisterDocumentRow,
} from "@/lib/register-document";

import { toast } from "sonner";
type EmployeeItem = {
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
  initialConfig: RegisterDocumentConfig;
  users: EmployeeItem[];
};

function ComplaintRowDialog({
  open,
  onOpenChange,
  row,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RegisterDocumentRow | null;
  onSave: (row: RegisterDocumentRow) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<RegisterDocumentRow>(() =>
    buildComplaintRow({ receiptDate: today, decisionDate: today })
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      row ||
        buildComplaintRow({
          receiptDate: today,
          decisionDate: today,
        })
    );
  }, [open, row, today]);

  function setValue(key: string, value: string) {
    setDraft((current) => ({
      ...current,
      values: {
        ...current.values,
        [key]: value,
      },
    }));
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения строки");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-12 py-10">
          <DialogTitle className="text-[22px] font-medium text-black">
            {row ? "Редактирование строки" : "Добавление новой строки"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 px-12 py-10">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата поступления</Label>
            <Input
              type="date"
              value={draft.values.receiptDate || ""}
              onChange={(event) => setValue("receiptDate", event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="sr-only">ФИО заявителя</Label>
            <Input
              value={draft.values.applicantName || ""}
              onChange={(event) => setValue("applicantName", event.target.value)}
              placeholder="Введите ФИО заявителя"
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Форма поступления жалобы</Label>
            <Select
              value={draft.values.complaintReceiptForm || ""}
              onValueChange={(value) => setValue("complaintReceiptForm", value)}
            >
              <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                <SelectValue placeholder="- Выберите значение -" />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_RECEIPT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Реквизиты заявителя</Label>
            <Textarea
              value={draft.values.applicantDetails || ""}
              onChange={(event) => setValue("applicantDetails", event.target.value)}
              className="min-h-[160px] rounded-[18px] border-[#dfe1ec] px-6 py-4 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Содержание жалобы</Label>
            <Textarea
              value={draft.values.complaintContent || ""}
              onChange={(event) => setValue("complaintContent", event.target.value)}
              className="min-h-[160px] rounded-[18px] border-[#dfe1ec] px-6 py-4 text-[18px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата решения</Label>
            <Input
              type="date"
              value={draft.values.decisionDate || ""}
              onChange={(event) => setValue("decisionDate", event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Решение, краткое содержание</Label>
            <Textarea
              value={draft.values.decisionSummary || ""}
              onChange={(event) => setValue("decisionSummary", event.target.value)}
              className="min-h-[160px] rounded-[18px] border-[#dfe1ec] px-6 py-4 text-[18px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
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
  dateFrom,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dateFrom: string;
  onSave: (params: { title: string; dateFrom: string }) => Promise<void>;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDate, setDraftDate] = useState(dateFrom);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftTitle(title);
    setDraftDate(dateFrom);
  }, [dateFrom, open, title]);

  async function handleSave() {
    setSubmitting(true);
    try {
      await onSave({ title: draftTitle, dateFrom: draftDate });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения настроек");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-12">
          <DialogTitle className="text-[22px] font-medium text-black">
            Настройки документа
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-8 px-14 py-12">
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Название документа</Label>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-[14px] text-[#73738a]">Дата начала</Label>
            <Input
              type="date"
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
              className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              {submitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({
  open,
  onOpenChange,
  title,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onFinish: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleFinish() {
    setSubmitting(true);
    try {
      await onFinish();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка завершения журнала");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] rounded-[32px] border-0 p-0">
        <DialogHeader className="border-b px-14 py-10">
          <DialogTitle className="pr-14 text-[22px] font-medium leading-[1.15] text-black">
            {`Закончить журнал "${title}"`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-end px-14 py-12">
          <Button
            type="button"
            onClick={handleFinish}
            disabled={submitting}
            className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
          >
            {submitting ? "Завершение..." : "Закончить"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ComplaintDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  status,
  initialConfig,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(() => normalizeComplaintConfig(initialConfig));
  const [documentTitle, setDocumentTitle] = useState(title || COMPLAINT_REGISTER_TITLE);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RegisterDocumentRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setConfig(normalizeComplaintConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    setDocumentTitle(title || COMPLAINT_REGISTER_TITLE);
  }, [title]);

  const allSelected =
    config.rows.length > 0 && selectedRowIds.length === config.rows.length;

  async function persist(nextTitle: string, nextConfig: ComplaintDocumentConfig, patch?: Record<string, unknown>) {
    const response = await fetch(`/api/journal-documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextTitle,
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

  async function handleSaveRow(row: RegisterDocumentRow) {
    const nextRows = editingRow
      ? config.rows.map((item) => (item.id === editingRow.id ? row : item))
      : [...config.rows, row];

    await persist(documentTitle, {
      ...config,
      rows: nextRows,
    });
    setEditingRow(null);
  }

  async function handleDeleteSelected() {
    if (selectedRowIds.length === 0) return;
    const nextConfig = {
      ...config,
      rows: config.rows.filter((row) => !selectedRowIds.includes(row.id)),
    };
    await persist(documentTitle, nextConfig);
    setSelectedRowIds([]);
  }

  async function handleSaveSettings(params: { title: string; dateFrom: string }) {
    await persist(
      params.title.trim() || COMPLAINT_REGISTER_TITLE,
      config,
      { dateFrom: params.dateFrom, dateTo: params.dateFrom }
    );
  }

  async function handleFinish() {
    await persist(
      documentTitle,
      {
        ...config,
        finishedAt: new Date().toISOString().slice(0, 10),
      },
      { status: "closed" }
    );
    router.push(`/journals/${COMPLAINT_REGISTER_TEMPLATE_CODE}?tab=closed`);
  }

  return (
    <>
      <div className="space-y-8 bg-white text-black">
        <DocumentBackLink href="/journals/complaint_register" documentId={documentId} />
        {selectedRowIds.length > 0 && status === "active" && (
          <div className="flex items-center gap-4 rounded-[12px] bg-white px-2 py-2">
            <div className="inline-flex h-14 items-center gap-3 rounded-[12px] bg-[#fafbff] px-6 text-[18px] text-[#5b66ff]">
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
              onClick={() =>
                handleDeleteSelected().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Ошибка удаления строк")
                )
              }
              disabled={isPending}
              className="h-14 rounded-[12px] border-[#ffd7d3] px-6 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
            >
              Удалить
            </Button>
          </div>
        )}

        <div>
          <h1 className="text-[48px] font-semibold tracking-[-0.04em] text-black">
            {documentTitle}
          </h1>
        </div>

        <div className="overflow-x-auto">
          <table className="mx-auto min-w-[1200px] max-w-[1520px] border-collapse">
            <tbody>
              <tr>
                <td rowSpan={2} className="w-[240px] border border-black px-6 py-10 text-center text-[22px] font-medium">
                  {organizationName}
                </td>
                <td className="w-[980px] border border-black px-6 py-5 text-center text-[15px]">
                  СИСТЕМА ХАССП
                </td>
                <td rowSpan={2} className="w-[240px] border border-black px-6 py-4 align-top text-[18px] leading-[1.6]">
                  <div className="font-semibold">Начат&nbsp;&nbsp;&nbsp;{formatComplaintDate(dateFrom)}</div>
                  <div className="font-semibold">
                    Окончен&nbsp;{config.finishedAt ? formatComplaintDate(config.finishedAt) : "__________"}
                  </div>
                </td>
              </tr>
              <tr>
                <td className="border border-black px-6 py-4 text-center text-[18px] italic">
                  ЖУРНАЛ РЕГИСТРАЦИИ ЖАЛОБ
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="border border-black px-6 py-5 text-right text-[18px]">
                  СТР. 1 ИЗ 1
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pt-2 text-center text-[28px] font-semibold uppercase">
          Журнал регистрации жалоб
        </div>

        {status === "active" && (
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              onClick={() => {
                setEditingRow(null);
                setRowDialogOpen(true);
              }}
              className="h-11 rounded-2xl bg-[#5b66ff] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
            >
              <Plus className="size-5" />
              Добавить
            </Button>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                Настройки журнала
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFinishOpen(true)}
                className="h-11 rounded-2xl border-[#eef0fb] px-4 text-[15px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              >
                Закончить журнал
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-[1520px] w-full border-collapse text-[16px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[42px] border border-black p-2 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedRowIds(checked === true ? config.rows.map((row) => row.id) : [])
                    }
                    disabled={status !== "active" || config.rows.length === 0}
                  />
                </th>
                <th className="w-[90px] border border-black p-3 text-center font-semibold">Рег. № п/п</th>
                <th className="w-[150px] border border-black p-3 text-center font-semibold">Дата поступления</th>
                <th className="w-[190px] border border-black p-3 text-center font-semibold">ФИО заявителя</th>
                <th className="w-[260px] border border-black p-3 text-center font-semibold">
                  Форма поступления жалобы (по почте, по телефону, по факсу, по электронной почте, в книге отзывов и предложений)
                </th>
                <th className="w-[290px] border border-black p-3 text-center font-semibold">
                  Реквизиты заявителя, указанные в жалобе заявителя для отправки ответа
                </th>
                <th className="w-[360px] border border-black p-3 text-center font-semibold">Содержание жалобы</th>
                <th className="w-[260px] border border-black p-3 text-center font-semibold">
                  Решение, дата, краткое содержание
                </th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="border border-black p-2 text-center align-top">
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
                  <td className="border border-black p-3 text-center align-top">{index + 1}</td>
                  <td className="border border-black p-3 align-top">
                    <button
                      type="button"
                      disabled={status !== "active"}
                      onClick={() => {
                        if (status !== "active") return;
                        setEditingRow(row);
                        setRowDialogOpen(true);
                      }}
                      className="w-full text-left disabled:cursor-default"
                    >
                      {formatComplaintDate(row.values.receiptDate || "") || "—"}
                    </button>
                  </td>
                  <td className="border border-black p-3 align-top">{row.values.applicantName || "—"}</td>
                  <td className="border border-black p-3 align-top">{row.values.complaintReceiptForm || "—"}</td>
                  <td className="border border-black p-3 align-top whitespace-pre-wrap">{row.values.applicantDetails || "—"}</td>
                  <td className="border border-black p-3 align-top whitespace-pre-wrap">{row.values.complaintContent || "—"}</td>
                  <td className="border border-black p-3 align-top whitespace-pre-wrap">
                    {getComplaintDecisionCell(row) || "—"}
                  </td>
                </tr>
              ))}
              {config.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="border border-black px-4 py-10 text-center text-[18px] text-[#666a80]">
                    Записей пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ComplaintRowDialog
        open={rowDialogOpen}
        onOpenChange={(open) => {
          setRowDialogOpen(open);
          if (!open) setEditingRow(null);
        }}
        row={editingRow}
        onSave={handleSaveRow}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={documentTitle}
        dateFrom={dateFrom}
        onSave={handleSaveSettings}
      />

      <FinishDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title={documentTitle}
        onFinish={handleFinish}
      />
    </>
  );
}
