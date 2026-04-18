"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLE_LABEL_VALUES, getUserRoleLabel, getUsersForRoleLabel, pickPrimaryManager } from "@/lib/user-roles";
import {
  GLASS_LIST_PAGE_TITLE,
  createGlassListRow,
  formatGlassListDateLong,
  normalizeGlassListConfig,
  type GlassListConfig,
  type GlassListRow,
} from "@/lib/glass-list-document";
import { DocumentCloseButton } from "@/components/journals/document-close-button";

import { toast } from "sonner";
import { PositionNativeOptions } from "@/components/shared/position-select";
type UserItem = {
  id: string;
  name: string;
  role: string;
};

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  initialConfig: GlassListConfig;
  users: UserItem[];
};

type RowDialogState = {
  open: boolean;
  rowIndex: number | null;
  row: GlassListRow;
};

const RESPONSIBLE_TITLES = USER_ROLE_LABEL_VALUES;

function emptyRow(location: string) {
  return createGlassListRow({ location });
}

export function GlassListDocumentClient({
  documentId,
  title,
  organizationName,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const isClosed = status === "closed";
  const [config, setConfig] = useState(() => normalizeGlassListConfig(initialConfig));
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowDialog, setRowDialog] = useState<RowDialogState>({
    open: false,
    rowIndex: null,
    row: emptyRow(config.location),
  });
  const [saving, setSaving] = useState(false);

  const responsibleUser = useMemo(
    () => users.find((user) => user.id === config.responsibleUserId) || null,
    [config.responsibleUserId, users]
  );

  async function persist(nextConfig: GlassListConfig) {
    setSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextConfig.documentName || title,
          dateFrom: nextConfig.documentDate,
          dateTo: nextConfig.documentDate,
          responsibleTitle: nextConfig.responsibleTitle || null,
          responsibleUserId: nextConfig.responsibleUserId || null,
          config: nextConfig,
        }),
      });

      if (!response.ok) {
        throw new Error();
      }

      setConfig(nextConfig);
      router.refresh();
      return true;
    } catch {
      toast.error("Не удалось сохранить документ");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    const ok = await persist(config);
    if (ok) setSettingsOpen(false);
  }

  async function saveRow() {
    const nextConfig = structuredClone(config) as GlassListConfig;
    if (rowDialog.rowIndex === null) nextConfig.rows.push(rowDialog.row);
    else nextConfig.rows[rowDialog.rowIndex] = rowDialog.row;

    const ok = await persist(nextConfig);
    if (ok) {
      setRowDialog({
        open: false,
        rowIndex: null,
        row: emptyRow(nextConfig.location),
      });
    }
  }

  async function deleteSelectedRows() {
    if (selectedRows.length === 0) return;
    const nextConfig: GlassListConfig = {
      ...config,
      rows: config.rows.filter((row) => !selectedRows.includes(row.id)),
    };
    const ok = await persist(nextConfig);
    if (ok) setSelectedRows([]);
  }

  return (
    <div className="space-y-6 text-black">
      <DocumentBackLink href="/journals/glass_items_list" documentId={documentId} />
      {selectedRows.length > 0 && !isClosed && (
        <div className="flex items-center gap-4 rounded-[20px] bg-white px-6 py-4 shadow-sm">
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-[18px] text-[#5566f6]"
            onClick={() => setSelectedRows([])}
          >
            <X className="mr-2 inline size-5" />
            Выбрано: {selectedRows.length}
          </button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl border-[#ffd7d3] px-5 text-[18px] text-[#ff3b30] hover:bg-[#fff3f2]"
            onClick={() => deleteSelectedRows().catch(() => undefined)}
          >
            <Trash2 className="size-5" />
            Удалить
          </Button>
        </div>
      )}

      <div className="rounded-[28px] bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-end gap-3 text-[14px] text-[#73738a]">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
            onClick={() => setSettingsOpen(true)}
            disabled={isClosed}
          >
            Настройки журнала
          </Button>
        </div>

        {!isClosed ? (
          <div className="mb-6 flex justify-end">
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

        <h1 className="mb-10 text-[32px] font-semibold tracking-[-0.02em] text-[#0b1024]">{title}</h1>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0 print:mx-0 print:overflow-visible print:px-0">
        <div className="mx-auto min-w-[1100px] max-w-[1300px] space-y-8 sm:min-w-0">
          <table className="w-full border-collapse text-[16px]">
            <tbody>
              <tr>
                <td rowSpan={2} className="w-[18%] border border-black p-4 text-center font-semibold">
                  {organizationName}
                </td>
                <td className="border border-black p-3 text-center font-medium">СИСТЕМА ХАССП</td>
                <td rowSpan={2} className="w-[11%] border border-black p-3 text-center">
                  СТР. 1 ИЗ 1
                </td>
              </tr>
              <tr>
                <td className="border border-black p-3 text-center italic">
                  ПЕРЕЧЕНЬ ИЗДЕЛИЙ ИЗ СТЕКЛА И ХРУПКОГО ПЛАСТИКА
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="min-w-[360px] space-y-2 text-right text-[18px]">
              <div className="font-semibold uppercase">УТВЕРЖДАЮ</div>
              <div>{config.responsibleTitle || "Управляющий"}</div>
              <div>
                ____________________ {responsibleUser?.name || "Иванов И.И."}
              </div>
              <div>« {formatGlassListDateLong(config.documentDate)} г.</div>
            </div>
          </div>

          <h2 className="text-center text-[28px] font-semibold uppercase">
            ПЕРЕЧЕНЬ ИЗДЕЛИЙ ИЗ СТЕКЛА И ХРУПКОГО ПЛАСТИКА
          </h2>

          {!isClosed && (
            <div className="flex items-center gap-4">
              <Button
                type="button"
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
                onClick={() =>
                  setRowDialog({
                    open: true,
                    rowIndex: null,
                    row: emptyRow(config.location),
                  })
                }
              >
                <Plus className="size-5" />
                Добавить
              </Button>
            </div>
          )}

          <table className="w-full border-collapse text-[16px]">
            <thead>
              <tr className="bg-[#efefef]">
                <th className="w-[42px] border border-black p-2" />
                <th className="w-[260px] border border-black p-2">Место расположения (участок)</th>
                <th className="border border-black p-2">Наименование объекта контроля (предмета)</th>
                <th className="w-[120px] border border-black p-2">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={!isClosed ? "cursor-pointer hover:bg-[#fbfbff]" : undefined}
                  onClick={(event) => {
                    if (isClosed) return;
                    if ((event.target as HTMLElement).closest("button")) return;
                    setRowDialog({ open: true, rowIndex: index, row });
                  }}
                >
                  <td className="border border-black p-2 text-center align-top">
                    <Checkbox
                      checked={selectedRows.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelectedRows((prev) =>
                          checked === true
                            ? [...new Set([...prev, row.id])]
                            : prev.filter((id) => id !== row.id)
                        )
                      }
                    />
                  </td>
                  <td className="border border-black p-2 align-top">{row.location}</td>
                  <td className="border border-black p-2 align-top">{row.itemName}</td>
                  <td className="border border-black p-2 text-center align-top">{row.quantity}</td>
                </tr>
              ))}
              <tr>
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
                <td className="border border-black p-4" />
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[760px]">
          <DialogHeader className="border-b px-14 py-10">
            <DialogTitle className="text-[22px] font-medium text-black">
              Настройки документа
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 px-14 py-12">
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Название документа</Label>
              <Input
                value={config.documentName}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, documentName: event.target.value }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Место расположения (участок)</Label>
              <Input
                value={config.location}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, location: event.target.value }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Дата документа</Label>
              <Input
                type="date"
                value={config.documentDate}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, documentDate: event.target.value }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Должность</Label>
              <select
                value={config.responsibleTitle}
                onChange={(event) => {
                  const newTitle = event.target.value;
                  setConfig((prev) => {
                    const candidates = getUsersForRoleLabel(users, newTitle);
                    const stillValid = candidates.some((u) => u.id === prev.responsibleUserId);
                    return {
                      ...prev,
                      responsibleTitle: newTitle,
                      responsibleUserId: stillValid ? prev.responsibleUserId : "",
                    };
                  });
                }}
                className="h-18 w-full rounded-[22px] border border-[#dfe1ec] bg-[#f3f4fb] px-7 text-[15px]"
              >
                <PositionNativeOptions users={users} />
              </select>
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
              <select
                value={config.responsibleUserId}
                onChange={(event) => {
                  const userId = event.target.value;
                  setConfig((prev) => {
                    if (!prev.responsibleTitle && userId) {
                      const user = users.find((u) => u.id === userId);
                      if (user) {
                        return { ...prev, responsibleUserId: userId, responsibleTitle: getUserRoleLabel(user.role) };
                      }
                    }
                    return { ...prev, responsibleUserId: userId };
                  });
                }}
                className="h-18 w-full rounded-[22px] border border-[#dfe1ec] bg-[#f3f4fb] px-7 text-[15px]"
              >
                <option value="">- Выберите значение -</option>
                {(config.responsibleTitle ? getUsersForRoleLabel(users, config.responsibleTitle) : users).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={saving}
                onClick={() => saveSettings().catch(() => undefined)}
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rowDialog.open}
        onOpenChange={(open) =>
          !open &&
          setRowDialog({
            open: false,
            rowIndex: null,
            row: emptyRow(config.location),
          })
        }
      >
        <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[32px] border-0 p-0 sm:max-w-[760px]">
          <DialogHeader className="border-b px-14 py-10">
            <DialogTitle className="text-[22px] font-medium text-black">
              {rowDialog.rowIndex === null ? "Добавление новой строки" : "Редактирование строки"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 px-14 py-12">
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Место расположения (участок)</Label>
              <Input
                value={rowDialog.row.location}
                onChange={(event) =>
                  setRowDialog((prev) => ({
                    ...prev,
                    row: { ...prev.row, location: event.target.value },
                  }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Наименование объекта контроля (предмета)</Label>
              <Input
                value={rowDialog.row.itemName}
                onChange={(event) =>
                  setRowDialog((prev) => ({
                    ...prev,
                    row: { ...prev.row, itemName: event.target.value },
                  }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-[14px] text-[#73738a]">Кол-во</Label>
              <Input
                value={rowDialog.row.quantity}
                onChange={(event) =>
                  setRowDialog((prev) => ({
                    ...prev,
                    row: { ...prev.row, quantity: event.target.value },
                  }))
                }
                className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={saving}
                onClick={() => saveRow().catch(() => undefined)}
                className="h-11 rounded-2xl bg-[#5566f6] px-4 text-[15px] text-white hover:bg-[#4b57ff]"
              >
                {saving ? "Сохранение..." : rowDialog.rowIndex === null ? "Добавить" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
