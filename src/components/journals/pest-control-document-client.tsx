"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_PAGE_TITLE,
  createEmptyPestControlEntry,
  formatPestControlDate,
  formatPestControlDateTime,
  getPestControlRoleOptions,
  getPestControlUsersForRole,
  type PestControlEntryData,
} from "@/lib/pest-control-document";
import { DocumentBackLink } from "@/components/journals/document-back-link";

type UserItem = {
  id: string;
  name: string;
  role: string;
};

type EntryItem = {
  id: string;
  data: PestControlEntryData;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  routeCode: string;
  users: UserItem[];
  initialEntries: EntryItem[];
};

type EditingEntry = {
  id: string;
  data: PestControlEntryData;
};

function HeaderTable(props: {
  organizationName: string;
  title: string;
  dateFrom: string;
  dateTo: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 w-full max-w-[1040px]">
      <table className="w-full border-collapse text-[13px] text-black">
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[200px] border border-black px-4 py-5 text-center font-semibold">
              {props.organizationName}
            </td>
            <td className="border border-black px-4 py-5 text-center">СИСТЕМА ХАССП</td>
            <td className="w-[180px] border border-black px-4 py-3 text-left">
              <div className="space-y-2">
                <div>Начат&nbsp;&nbsp;&nbsp;{formatPestControlDate(props.dateFrom)}</div>
                <div>
                  Окончен&nbsp;
                  {props.dateTo && props.dateTo !== props.dateFrom
                    ? formatPestControlDate(props.dateTo)
                    : "__________"}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td className="border border-black px-4 py-5 text-center text-[13px] italic uppercase">
              {props.title}
            </td>
            <td className="border border-black px-4 py-5 text-right">СТР. 1 ИЗ 1</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DocumentSettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTitle: string;
  initialDateFrom: string;
  onSubmit: (payload: { title: string; dateFrom: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.initialTitle);
  const [dateFrom, setDateFrom] = useState(props.initialDateFrom);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setTitle(props.initialTitle);
    setDateFrom(props.initialDateFrom);
  }, [props.open, props.initialDateFrom, props.initialTitle]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-medium text-black">
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
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Введите название документа"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || !dateFrom}
              className="h-12 rounded-xl bg-[#5863f8] px-7 text-[18px] text-white hover:bg-[#4b57f3]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit({
                    title: title.trim() || PEST_CONTROL_DOCUMENT_TITLE,
                    dateFrom,
                  });
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

function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-medium text-black">
            {props.title}
          </DialogTitle>
          <button
            type="button"
            className="rounded-md p-1 text-black/80 hover:bg-black/5"
            onClick={() => props.onOpenChange(false)}
          >
            <X className="size-6" />
          </button>
        </DialogHeader>
        <div className="flex justify-end px-7 py-6">
          <Button
            type="button"
            disabled={submitting}
            className="h-12 rounded-xl bg-[#5863f8] px-7 text-[18px] text-white hover:bg-[#4b57f3]"
            onClick={async () => {
              setSubmitting(true);
              try {
                await props.onSubmit();
                props.onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Подождите..." : props.submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserItem[];
  title: string;
  submitLabel: string;
  initial: EditingEntry | null;
  onSubmit: (payload: PestControlEntryData, entryId?: string) => Promise<void>;
}) {
  const roleOptions = useMemo(() => getPestControlRoleOptions(props.users), [props.users]);
  const [entry, setEntry] = useState<PestControlEntryData>(
    createEmptyPestControlEntry(props.users)
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setEntry(
      props.initial?.data || createEmptyPestControlEntry(props.users, new Date().toISOString().slice(0, 10))
    );
  }, [props.initial, props.open, props.users]);

  const employeeOptions = getPestControlUsersForRole(props.users, entry.acceptedRole);

  function updateAcceptedRole(nextRole: string) {
    const nextUsers = getPestControlUsersForRole(props.users, nextRole);
    setEntry((current) => ({
      ...current,
      acceptedRole: nextRole,
      acceptedEmployeeId:
        nextUsers.find((item) => item.id === current.acceptedEmployeeId)?.id ||
        nextUsers[0]?.id ||
        "",
    }));
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-7 py-5">
          <DialogTitle className="text-[24px] font-medium text-black">
            {props.title}
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
          <div className="rounded-[24px] border border-[#dfe1ec] p-4">
            <div className="mb-3 text-[18px] font-medium">Дата и время проведения</div>
            <Input
              type="date"
              value={entry.performedDate}
              onChange={(event) =>
                setEntry((current) => ({ ...current, performedDate: event.target.value }))
              }
              className="mb-3 h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                value={entry.timeSpecified ? entry.performedHour || "__" : "__"}
                onValueChange={(value) =>
                  setEntry((current) => ({
                    ...current,
                    timeSpecified: value !== "__" || current.performedMinute !== "",
                    performedHour: value === "__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                  <SelectValue placeholder="Часы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">--</SelectItem>
                  {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((hour) => (
                    <SelectItem key={hour} value={hour}>
                      {hour}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={entry.timeSpecified ? entry.performedMinute || "__" : "__"}
                onValueChange={(value) =>
                  setEntry((current) => ({
                    ...current,
                    timeSpecified: value !== "__" || current.performedHour !== "",
                    performedMinute: value === "__" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                  <SelectValue placeholder="Минуты" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">--</SelectItem>
                  {Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0")).map((minute) => (
                    <SelectItem key={minute} value={minute}>
                      {minute}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Input
            value={entry.event}
            onChange={(event) =>
              setEntry((current) => ({ ...current, event: event.target.value }))
            }
            placeholder="Введите мероприятие (вид, место)"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Input
            value={entry.areaOrVolume}
            onChange={(event) =>
              setEntry((current) => ({ ...current, areaOrVolume: event.target.value }))
            }
            placeholder="Введите площадь и (или) объем"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Input
            value={entry.treatmentProduct}
            onChange={(event) =>
              setEntry((current) => ({ ...current, treatmentProduct: event.target.value }))
            }
            placeholder="Введите средство обработки"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Textarea
            value={entry.note}
            onChange={(event) =>
              setEntry((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Примечание"
            className="min-h-[140px] rounded-2xl border-[#dfe1ec] px-4 py-3 text-[18px]"
          />
          <Input
            value={entry.performedBy}
            onChange={(event) =>
              setEntry((current) => ({ ...current, performedBy: event.target.value }))
            }
            placeholder="Введите кем проведено"
            className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
          />
          <Select value={entry.acceptedRole} onValueChange={updateAcceptedRole}>
            <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
              <SelectValue placeholder="Должность принявшего работы" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={entry.acceptedEmployeeId}
            onValueChange={(value) =>
              setEntry((current) => ({ ...current, acceptedEmployeeId: value }))
            }
          >
            <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
              <SelectValue placeholder="Сотрудник" />
            </SelectTrigger>
            <SelectContent>
              {employeeOptions.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={submitting || !entry.performedDate || !entry.event.trim() || !entry.acceptedEmployeeId}
              className="h-12 rounded-xl bg-[#5863f8] px-7 text-[18px] text-white hover:bg-[#4b57f3]"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await props.onSubmit(entry, props.initial?.id);
                  props.onOpenChange(false);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Подождите..." : props.submitLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PestControlDocumentClient(props: Props) {
  const router = useRouter();
  const entries = props.initialEntries;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const userMap = useMemo(
    () => Object.fromEntries(props.users.map((user) => [user.id, user])),
    [props.users]
  );
  const readOnly = props.status === "closed";
  const allSelected = entries.length > 0 && selectedIds.length === entries.length;

  async function createEntry(data: PestControlEntryData) {
    const response = await fetch(
      `/api/journal-documents/${props.documentId}/pest-control-entries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      toast.error(result?.error || "Не удалось добавить строку");
      return;
    }

    router.refresh();
  }

  async function updateEntry(data: PestControlEntryData, entryId?: string) {
    if (!entryId) return;

    const response = await fetch(
      `/api/journal-documents/${props.documentId}/pest-control-entries`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, ...data }),
      }
    );

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      toast.error(result?.error || "Не удалось сохранить строку");
      return;
    }

    router.refresh();
  }

  async function deleteEntries(ids: string[]) {
    const response = await fetch(
      `/api/journal-documents/${props.documentId}/pest-control-entries`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }
    );

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      toast.error(result?.error || "Не удалось удалить строки");
      return;
    }

    setSelectedIds([]);
    router.refresh();
  }

  async function saveDocumentSettings(payload: { title: string; dateFrom: string }) {
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        dateFrom: payload.dateFrom,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось сохранить настройки документа");
      return;
    }

    router.refresh();
  }

  async function closeDocument() {
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`/api/journal-documents/${props.documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "closed",
        dateTo: today,
      }),
    });

    if (!response.ok) {
      toast.error("Не удалось завершить журнал");
      return;
    }

    router.push(`/journals/${props.routeCode}?tab=closed`);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <DocumentBackLink href={`/journals/${props.routeCode}`} documentId={props.documentId} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
          {props.title || PEST_CONTROL_DOCUMENT_TITLE}
        </h1>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl border-[#dcdfed] px-5 text-[14px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            onClick={() => setSettingsOpen(true)}
          >
            Настройки журнала
          </Button>
        )}
      </div>

      <HeaderTable
        organizationName={props.organizationName}
        title={props.title || PEST_CONTROL_DOCUMENT_TITLE}
        dateFrom={props.dateFrom}
        dateTo={props.dateTo}
      />

      <div className="text-center text-[18px] font-semibold uppercase leading-tight tracking-[-0.02em] sm:text-[26px]">
        {PEST_CONTROL_PAGE_TITLE}
      </div>

      {!readOnly && selectedIds.length > 0 && (
        <div className="flex items-center gap-4 rounded-[16px] border border-[#eceef5] bg-white px-6 py-4">
          <button
            type="button"
            className="flex items-center gap-2 text-[#3848c7]"
            onClick={() => setSelectedIds([])}
          >
            <X className="size-5" />
            Выбрано: {selectedIds.length}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 text-[#ff3b30]"
            onClick={() => deleteEntries(selectedIds)}
          >
            <Trash2 className="size-5" />
            Удалить
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!readOnly ? (
          <Button
            type="button"
            className="h-11 rounded-2xl bg-[#5863f8] px-4 text-[15px] text-white hover:bg-[#4b57f3]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-5" />
            Добавить
          </Button>
        ) : <div />}

        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            onClick={() => setCloseOpen(true)}
          >
            Закончить журнал
          </Button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="min-w-full border-collapse border border-black bg-white text-[14px]">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="w-12 border border-black px-2 py-3 text-center">
                {!readOnly && (
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked === true ? entries.map((entry) => entry.id) : [])
                    }
                  />
                )}
              </th>
              <th className="min-w-[110px] border border-black px-3 py-3 text-center sm:min-w-[140px]">Дата и время проведения</th>
              <th className="min-w-[170px] border border-black px-3 py-3 text-center sm:min-w-[220px]">Мероприятие (вид, место)</th>
              <th className="min-w-[120px] border border-black px-3 py-3 text-center sm:min-w-[150px]">Площадь и (или) объем</th>
              <th className="min-w-[150px] border border-black px-3 py-3 text-center sm:min-w-[190px]">Средство обработки</th>
              <th className="min-w-[220px] border border-black px-3 py-3 text-center sm:min-w-[320px]">Примечание</th>
              <th className="min-w-[120px] border border-black px-3 py-3 text-center sm:min-w-[150px]">Кем проведено</th>
              <th className="min-w-[170px] border border-black px-3 py-3 text-center sm:min-w-[220px]">ФИО принявшего работы</th>
            </tr>
          </thead>
          <tbody>
            {(entries.length > 0 ? entries : [{ id: "empty", data: createEmptyPestControlEntry(props.users, props.dateFrom) }]).map((entry) => {
              const acceptedUser = userMap[entry.data.acceptedEmployeeId];
              const dateTime = formatPestControlDateTime(entry.data);
              const isPlaceholder = entry.id === "empty";

              return (
                <tr
                  key={entry.id}
                  className={!readOnly && !isPlaceholder ? "cursor-pointer hover:bg-[#f5f6ff]" : ""}
                  onClick={() => {
                    if (readOnly || isPlaceholder) return;
                    setEditing({ id: entry.id, data: entry.data });
                  }}
                >
                  <td className="border border-black px-2 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                    {!readOnly && !isPlaceholder && (
                      <Checkbox
                        checked={selectedIds.includes(entry.id)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((current) =>
                            checked === true
                              ? [...new Set([...current, entry.id])]
                              : current.filter((id) => id !== entry.id)
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="border border-black px-3 py-3 text-center">
                    {isPlaceholder ? "" : (
                      <>
                        <div>{dateTime.dateLabel}</div>
                        <div>{dateTime.timeLabel}</div>
                      </>
                    )}
                  </td>
                  <td className="border border-black px-3 py-3 text-center">{isPlaceholder ? "" : entry.data.event}</td>
                  <td className="border border-black px-3 py-3 text-center">{isPlaceholder ? "" : entry.data.areaOrVolume}</td>
                  <td className="border border-black px-3 py-3 text-center">{isPlaceholder ? "" : entry.data.treatmentProduct}</td>
                  <td className="border border-black px-3 py-3 text-center">{isPlaceholder ? "" : entry.data.note}</td>
                  <td className="border border-black px-3 py-3 text-center">{isPlaceholder ? "" : entry.data.performedBy}</td>
                  <td className="border border-black px-3 py-3 text-center">
                    {isPlaceholder
                      ? ""
                      : [entry.data.acceptedRole, acceptedUser?.name].filter(Boolean).join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DocumentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTitle={props.title || PEST_CONTROL_DOCUMENT_TITLE}
        initialDateFrom={props.dateFrom}
        onSubmit={saveDocumentSettings}
      />

      <EntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={props.users}
        title="Добавление новой строки"
        submitLabel="Добавить"
        initial={null}
        onSubmit={(payload) => createEntry(payload)}
      />

      <EntryDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        users={props.users}
        title="Редактирование строки"
        submitLabel="Сохранить"
        initial={editing}
        onSubmit={(payload, entryId) => updateEntry(payload, entryId)}
      />

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title={`Закончить журнал "${props.title || PEST_CONTROL_DOCUMENT_TITLE}"`}
        submitLabel="Закончить"
        onSubmit={closeDocument}
      />
    </div>
  );
}
