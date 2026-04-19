"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, Pencil, Plus, Rows3, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  applyCleaningAutoFillToConfig,
  CLEANING_DOCUMENT_TITLE,
  CLEANING_PAGE_TITLE,
  createCleaningResponsibleRow,
  createCleaningRoomRow,
  deleteCleaningResponsibleRow,
  deleteCleaningRoomRow,
  getCleaningPeriodLabel,
  normalizeCleaningDocumentConfig,
  setCleaningMatrixValue,
  toggleCleaningMatrixValue,
  type CleaningDocumentConfig,
  type CleaningResponsible,
  type CleaningResponsibleKind,
  type CleaningRoomItem,
} from "@/lib/cleaning-document";
import { buildDateKeys, isWeekend } from "@/lib/hygiene-document";
import { getDistinctRoleLabels, getUsersForRoleLabel } from "@/lib/user-roles";
import { DocumentBackLink } from "@/components/journals/document-back-link";
import { DocumentCloseButton } from "@/components/journals/document-close-button";
import { PositionSelectItems } from "@/components/shared/position-select";

type UserItem = { id: string; name: string; role: string };
type EntryItem = { id: string; employeeId: string; date: string; data: unknown };
type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleUserId: string | null;
  autoFill: boolean;
  users: UserItem[];
  config: CleaningDocumentConfig;
  initialEntries: EntryItem[];
};
type SettingsState = { title: string; cleaningRole: string; cleaningUserId: string; controlRole: string; controlUserId: string };
type RoomFormState = { id: string | null; name: string; detergent: string; currentScope: string; generalScope: string };
type ResponsibleFormState = { id: string | null; kind: CleaningResponsibleKind; title: string; userId: string };
type RowDescriptor =
  | { id: string; kind: "room"; room: CleaningRoomItem }
  | { id: string; kind: "cleaning"; responsible: CleaningResponsible }
  | { id: string; kind: "control"; responsible: CleaningResponsible };

const parseScope = (value: string) => value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
const primaryUserId = (users: UserItem[], roleLabel: string) => getUsersForRoleLabel(users, roleLabel)[0]?.id || "";
const userNameById = (users: UserItem[], userId: string) => users.find((user) => user.id === userId)?.name || "";
const buildSettingsState = (config: CleaningDocumentConfig): SettingsState => ({
  title: config.documentTitle || config.title || CLEANING_DOCUMENT_TITLE,
  cleaningRole: config.cleaningResponsibles[0]?.title || "",
  cleaningUserId: config.cleaningResponsibles[0]?.userId || "",
  controlRole: config.controlResponsibles[0]?.title || "",
  controlUserId: config.controlResponsibles[0]?.userId || "",
});
const buildRoomState = (room?: CleaningRoomItem): RoomFormState => ({
  id: room?.id || null,
  name: room?.name || "",
  detergent: room?.detergent || "",
  currentScope: room?.currentScope.join("\n") || "",
  generalScope: room?.generalScope.join("\n") || "",
});
const buildResponsibleState = (kind: CleaningResponsibleKind, responsible?: CleaningResponsible): ResponsibleFormState => ({
  id: responsible?.id || null,
  kind,
  title: responsible?.title || "",
  userId: responsible?.userId || "",
});

function ConfirmDialog(props: { open: boolean; title: string; submitLabel: string; onOpenChange: (open: boolean) => void; onSubmit: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[720px]">
        <DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8">
          <div className="flex items-start justify-between gap-6">
            <DialogTitle className="text-[24px] font-semibold text-black">{props.title}</DialogTitle>
            <button type="button" className="rounded-xl p-2 hover:bg-black/5" onClick={() => props.onOpenChange(false)}><X className="size-7" /></button>
          </div>
        </DialogHeader>
        <div className="flex justify-end px-5 py-6 sm:px-10 sm:py-8">
          <Button type="button" disabled={submitting} onClick={async () => { setSubmitting(true); try { await props.onSubmit(); props.onOpenChange(false); } finally { setSubmitting(false); } }} className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]">{submitting ? "Сохранение..." : props.submitLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CleaningDocumentClient(props: Props) {
  const router = useRouter();
  const printMode = false;
  const normalized = useMemo(() => normalizeCleaningDocumentConfig(props.config, { users: props.users }), [props.config, props.users]);
  const [config, setConfig] = useState(normalized);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [roomDialog, setRoomDialog] = useState<RoomFormState | null>(null);
  const [responsibleDialog, setResponsibleDialog] = useState<ResponsibleFormState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsState, setSettingsState] = useState(buildSettingsState(normalized));
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Mobile-only preference — Cards default. See hygiene-document-client.tsx
  // for the full rationale; the 920-px grid behind horizontal scroll is
  // unusable on a 320-px phone, so we collapse it into a per-row accordion
  // with tap-to-cycle day buttons. Desktop / print always use the table.
  const [mobileView, setMobileView] = useState<"cards" | "table">("cards");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("cleaning-mobile-view");
      if (saved === "table" || saved === "cards") setMobileView(saved);
    } catch {
      /* localStorage blocked — fall back to 'cards' */
    }
  }, []);
  function switchMobileView(next: "cards" | "table") {
    setMobileView(next);
    try {
      window.localStorage.setItem("cleaning-mobile-view", next);
    } catch {
      /* ignore */
    }
  }
  const roleOptions = useMemo(() => getDistinctRoleLabels(props.users), [props.users]);
  const dayKeys = useMemo(() => buildDateKeys(props.dateFrom, props.dateTo), [props.dateFrom, props.dateTo]);
  const rows = useMemo<RowDescriptor[]>(() => [
    ...config.rooms.map((room) => ({ id: room.id, kind: "room" as const, room })),
    ...config.cleaningResponsibles.map((responsible) => ({ id: responsible.id, kind: "cleaning" as const, responsible })),
    ...config.controlResponsibles.map((responsible) => ({ id: responsible.id, kind: "control" as const, responsible })),
  ], [config]);

  useEffect(() => { setConfig(normalized); setSettingsState(buildSettingsState(normalized)); }, [normalized]);
  async function patchDocument(nextConfig: CleaningDocumentConfig, overrides?: Record<string, unknown>) {
    setSaving(true);
    try {
      const payload = normalizeCleaningDocumentConfig(nextConfig, { users: props.users });
      const response = await fetch(`/api/journal-documents/${props.documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.documentTitle || payload.title,
          config: payload,
          responsibleTitle: payload.controlResponsibles[0]?.title || props.responsibleTitle || null,
          responsibleUserId: payload.controlResponsibles[0]?.userId || props.responsibleUserId || null,
          autoFill: payload.autoFill.enabled,
          ...overrides,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setConfig(payload);
      setSettingsState(buildSettingsState(payload));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function updateSettings(patch: Partial<SettingsState>) {
    const nextState = { ...settingsState, ...patch };
    setSettingsState(nextState);
    const nextConfig = normalizeCleaningDocumentConfig({
      ...config,
      title: nextState.title.trim() || CLEANING_DOCUMENT_TITLE,
      documentTitle: nextState.title.trim() || CLEANING_DOCUMENT_TITLE,
      cleaningResponsibles: config.cleaningResponsibles.map((item, index) => index === 0 ? { ...item, title: nextState.cleaningRole, userId: nextState.cleaningUserId, userName: userNameById(props.users, nextState.cleaningUserId) } : item),
      controlResponsibles: config.controlResponsibles.map((item, index) => index === 0 ? { ...item, title: nextState.controlRole, userId: nextState.controlUserId, userName: userNameById(props.users, nextState.controlUserId) } : item),
    }, { users: props.users });
    await patchDocument(nextConfig);
  }

  async function toggleAutoFill(checked: boolean) {
    const baseConfig = normalizeCleaningDocumentConfig({
      ...config,
      settings: { ...config.settings, autoFillEnabled: checked },
      autoFill: { ...config.autoFill, enabled: checked },
    }, { users: props.users });
    const nextConfig = checked ? applyCleaningAutoFillToConfig({ config: baseConfig, dateFrom: props.dateFrom, dateTo: props.dateTo }) : baseConfig;
    await patchDocument(nextConfig, { autoFill: checked });
  }

  async function toggleSkipWeekends(checked: boolean) {
    const nextConfig = normalizeCleaningDocumentConfig({
      ...config,
      settings: { ...config.settings, skipWeekends: checked },
      autoFill: { ...config.autoFill, skipWeekends: checked },
      skipWeekends: checked,
    }, { users: props.users });
    await patchDocument(nextConfig);
  }

  async function updateCell(row: RowDescriptor, dateKey: string) {
    if (props.status !== "active") return;
    const currentValue = config.matrix[row.id]?.[dateKey] || "";
    const nextValue = row.kind === "room" ? toggleCleaningMatrixValue(currentValue) : currentValue ? "" : row.responsible.code;
    await patchDocument(setCleaningMatrixValue({ config, rowId: row.id, dateKey, value: nextValue }));
  }

  async function deleteSelectedRows() {
    const count = selection.length;
    try {
      let nextConfig = config;
      for (const rowId of selection) {
        if (nextConfig.rooms.some((item) => item.id === rowId)) nextConfig = deleteCleaningRoomRow(nextConfig, rowId);
        else if (nextConfig.cleaningResponsibles.some((item) => item.id === rowId)) nextConfig = deleteCleaningResponsibleRow(nextConfig, "cleaning", rowId);
        else if (nextConfig.controlResponsibles.some((item) => item.id === rowId)) nextConfig = deleteCleaningResponsibleRow(nextConfig, "control", rowId);
      }
      setSelection([]);
      await patchDocument(nextConfig);
      toast.success(`Удалено строк: ${count}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить выбранные строки");
    }
  }

  async function submitRoom() {
    if (!roomDialog) return;
    const room = createCleaningRoomRow({ id: roomDialog.id || undefined, name: roomDialog.name, detergent: roomDialog.detergent, currentScope: parseScope(roomDialog.currentScope), generalScope: parseScope(roomDialog.generalScope) });
    const nextConfig = normalizeCleaningDocumentConfig({
      ...config,
      rooms: roomDialog.id ? config.rooms.map((item) => item.id === roomDialog.id ? room : item) : [...config.rooms, room],
    }, { users: props.users });
    setRoomDialog(null);
    await patchDocument(nextConfig);
  }

  async function submitResponsible() {
    if (!responsibleDialog) return;
    const responsible = createCleaningResponsibleRow({ kind: responsibleDialog.kind, title: responsibleDialog.title, userId: responsibleDialog.userId, userName: userNameById(props.users, responsibleDialog.userId) });
    const key = responsibleDialog.kind === "cleaning" ? "cleaningResponsibles" : "controlResponsibles";
    const currentItems = config[key];
    const nextConfig = normalizeCleaningDocumentConfig({
      ...config,
      [key]: responsibleDialog.id ? currentItems.map((item) => item.id === responsibleDialog.id ? { ...responsible, id: responsibleDialog.id } : item) : [...currentItems, responsible],
    }, { users: props.users });
    setResponsibleDialog(null);
    await patchDocument(nextConfig);
  }

  const cleaningUsers = getUsersForRoleLabel(props.users, settingsState.cleaningRole);
  const controlUsers = getUsersForRoleLabel(props.users, settingsState.controlRole);
  const responsibleUsers = responsibleDialog ? getUsersForRoleLabel(props.users, responsibleDialog.title) : [];

  return (
    <>
      <div className="space-y-8">
        {!printMode ? (
          <>
            <DocumentBackLink href="/journals/cleaning" documentId={props.documentId} />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
                onClick={() => setSettingsOpen(true)}
              >
                Настройки журнала
              </Button>
              {props.status === "active" ? (
                <DocumentCloseButton
                  documentId={props.documentId}
                  title={config.documentTitle || CLEANING_PAGE_TITLE}
                  variant="outline"
                  className="h-11 rounded-2xl border-[#dcdfed] px-4 text-[15px] text-[#3848c7] shadow-none hover:bg-[#f5f6ff]"
                >
                  Закончить журнал
                </DocumentCloseButton>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="flex items-start justify-between gap-6">
          <div><h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">{config.documentTitle || CLEANING_PAGE_TITLE}</h1><p className="mt-2 text-[18px] text-[#6d7285]">{getCleaningPeriodLabel(props.dateFrom, props.dateTo)}</p></div>
          {!printMode && saving ? <div className="text-[16px] text-[#6d7285]">Сохранение...</div> : null}
        </div>

        <section className="rounded-[24px] bg-[#f5f6ff] px-8 py-6">
          <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-start">
            <div className="flex items-center gap-4"><Switch checked={config.autoFill.enabled} onCheckedChange={toggleAutoFill} disabled={props.status !== "active" || saving} className="data-[state=checked]:bg-[#5863f8] data-[state=unchecked]:bg-[#d4d8ec]" /><span className="text-[20px] font-semibold text-black">Автоматически заполнять журнал</span></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Ответственный за уборку</Label><Select value={settingsState.cleaningUserId} disabled={props.status !== "active" || saving} onValueChange={(value) => updateSettings({ cleaningUserId: value })}><SelectTrigger className="h-14 rounded-[16px] border-[#d7dcec] bg-white text-[18px]"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger><SelectContent>{cleaningUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Ответственный за контроль</Label><Select value={settingsState.controlUserId} disabled={props.status !== "active" || saving} onValueChange={(value) => updateSettings({ controlUserId: value })}><SelectTrigger className="h-14 rounded-[16px] border-[#d7dcec] bg-white text-[18px]"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger><SelectContent>{controlUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex items-center gap-3"><Checkbox checked={config.autoFill.skipWeekends} onCheckedChange={(checked) => toggleSkipWeekends(Boolean(checked))} disabled={props.status !== "active" || saving} className="size-7 rounded-[10px]" /><span className="text-[18px] text-black">Не заполнять в выходные дни</span></div>
          </div>
        </section>

        {!printMode ? (
          <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-4 border-b border-[#dcdfed] bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button className="h-11 rounded-2xl bg-[#5863f8] px-7 text-[15px] text-white hover:bg-[#4756f6]"><Plus className="size-6" />Добавить<ChevronDown className="size-5" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-[calc(100vw-1rem)] rounded-[24px] border-0 p-3 shadow-xl sm:w-[340px]">
                  <DropdownMenuItem className="h-11 rounded-2xl text-[18px]" onSelect={() => setRoomDialog(buildRoomState())}><Plus className="mr-3 size-5 text-[#5863f8]" />Добавить помещение</DropdownMenuItem>
                  <DropdownMenuItem className="h-11 rounded-2xl text-[18px]" onSelect={() => setResponsibleDialog(buildResponsibleState("cleaning"))}><UserPlus className="mr-3 size-5 text-[#5863f8]" />Добавить отв. за уборку</DropdownMenuItem>
                  <DropdownMenuItem className="h-11 rounded-2xl text-[18px]" onSelect={() => setResponsibleDialog(buildResponsibleState("control"))}><UserPlus className="mr-3 size-5 text-[#5863f8]" />Добавить отв. за контроль</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {selection.length > 0 ? <Button type="button" variant="outline" className="h-11 rounded-2xl border-[#ffd6d3] bg-[#fff6f5] px-4 text-[15px] text-[#ff4d3d]" onClick={() => setDeleteOpen(true)}><Trash2 className="size-5" />Удалить</Button> : null}
            </div>
            {selection.length > 0 ? <div className="text-[18px] text-[#5863f8]">Выбрано: {selection.length}</div> : null}
          </div>
        ) : null}

        {!printMode ? (
          <div role="tablist" aria-label="Режим отображения" className="flex w-full rounded-2xl border border-[#ececf4] bg-white p-1 text-[13px] font-medium sm:hidden">
            <button type="button" role="tab" aria-selected={mobileView === "cards"} onClick={() => switchMobileView("cards")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition-colors ${mobileView === "cards" ? "bg-[#f5f6ff] text-[#5566f6]" : "text-[#6f7282]"}`}>
              <LayoutGrid className="size-4" />Карточки
            </button>
            <button type="button" role="tab" aria-selected={mobileView === "table"} onClick={() => switchMobileView("table")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition-colors ${mobileView === "table" ? "bg-[#f5f6ff] text-[#5566f6]" : "text-[#6f7282]"}`}>
              <Rows3 className="size-4" />Таблица
            </button>
          </div>
        ) : null}

        {/* Mobile Cards view — hidden on sm+ and print. Each row (room or
            responsible) is an accordion with per-day tap-to-cycle cells. */}
        {!printMode && mobileView === "cards" ? (
          <div className="space-y-2 sm:hidden print:hidden">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-5 text-center text-[13px] text-[#6f7282]">
                Добавьте помещение или ответственного через меню «Добавить».
              </div>
            ) : null}
            {rows.map((row) => {
              const expanded = expandedRowId === row.id;
              const title = row.kind === "room" ? row.room.name : row.kind === "cleaning" ? "Ответственный за уборку" : "Ответственный за контроль";
              const subtitle = row.kind === "room" ? row.room.detergent : `${row.responsible.code} · ${row.responsible.userName || "—"}`;
              const filledCount = dayKeys.reduce((acc, dk) => acc + (config.matrix[row.id]?.[dk] ? 1 : 0), 0);
              const isSelected = selection.includes(row.id);
              return (
                <div key={row.id} className="rounded-2xl border border-[#ececf4] bg-white">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <span onClick={(event) => event.stopPropagation()} className="shrink-0">
                      <Checkbox checked={isSelected} onCheckedChange={(checked) => setSelection((current) => Boolean(checked) ? [...current, row.id].filter((value, index, list) => list.indexOf(value) === index) : current.filter((id) => id !== row.id))} disabled={props.status !== "active"} className="size-5" />
                    </span>
                    <button type="button" onClick={() => setExpandedRowId(expanded ? null : row.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-[#0b1024]">{title}</div>
                        {subtitle ? <div className="truncate text-[12px] text-[#6f7282]">{subtitle}</div> : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[11px] font-semibold text-[#5566f6]">{filledCount}/{dayKeys.length}</span>
                      <ChevronDown className={`size-4 shrink-0 text-[#6f7282] transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {expanded ? (
                    <div className="border-t border-[#ececf4] p-3">
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
                        {dayKeys.map((dateKey) => {
                          const cellValue = config.matrix[row.id]?.[dateKey] || "";
                          const weekend = isWeekend(dateKey);
                          return (
                            <button key={dateKey} type="button" onClick={() => { updateCell(row, dateKey).catch(() => {}); }} disabled={props.status !== "active"} className={`flex h-11 flex-col items-center justify-center rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-60 ${cellValue ? "border-[#5566f6] bg-[#f5f6ff] text-[#5566f6]" : weekend ? "border-[#ececf4] bg-[#fafbff] text-[#9b9fb3]" : "border-[#ececf4] bg-white text-[#3c4053] hover:bg-[#f5f6ff]"}`}>
                              <span className="text-[12px] font-semibold tabular-nums">{Number(dateKey.slice(-2))}</span>
                              <span className="text-[11px] leading-none">{cellValue || "—"}</span>
                            </button>
                          );
                        })}
                      </div>
                      {props.status === "active" ? (
                        <div className="mt-3 text-[11px] text-[#6f7282]">
                          {row.kind === "room" ? "Тап по дню перебирает Т / Г / пусто." : "Тап по дню переключает отметку ответственного."}
                        </div>
                      ) : null}
                      {row.kind === "room" ? (
                        <div className="mt-3 space-y-1 rounded-xl border border-[#ececf4] bg-[#fafbff] p-3 text-[12px] leading-5 text-[#3c4053]">
                          <div className="font-semibold text-[#0b1024]">Текущая:</div>
                          <div>{row.room.currentScope.join(", ") || "—"}</div>
                          <div className="mt-2 font-semibold text-[#0b1024]">Генеральная:</div>
                          <div>{row.room.generalScope.join(", ") || "—"}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className={mobileView === "cards" && !printMode ? "hidden sm:block print:block" : ""}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><div className="min-w-[920px] space-y-8 sm:min-w-[1200px]">
          <table className="w-full border-collapse text-center"><thead><tr><th className="border border-black p-5 text-[24px] font-semibold">{props.organizationName}</th><th className="border border-black p-3 text-[22px] font-medium" colSpan={dayKeys.length + 1}>СИСТЕМА ХАССП<div className="mt-3 border-t border-black pt-3 italic">ЖУРНАЛ УБОРКИ</div></th><th className="border border-black p-5 text-[20px] font-medium">СТР. 1 ИЗ 1</th></tr></thead></table>
          <h2 className="text-center text-[28px] font-semibold uppercase">Журнал уборки</h2>
          <table className="w-full border-collapse text-[16px]"><thead><tr><th className="w-12 border border-black bg-white p-2">{!printMode ? <Checkbox checked={rows.length > 0 && selection.length === rows.length} onCheckedChange={(checked) => setSelection(Boolean(checked) ? rows.map((r) => r.id) : [])} className="size-5" disabled={props.status !== "active"} /> : null}</th><th className="border border-black bg-[#f6f6f6] p-3 font-semibold">Наименование помещения</th><th className="border border-black bg-[#f6f6f6] p-3 font-semibold">Моющие и дезинфицирующие средства</th><th className="border border-black bg-[#f6f6f6] p-3 font-semibold" colSpan={dayKeys.length}>Месяц {getCleaningPeriodLabel(props.dateFrom, props.dateTo)}</th></tr><tr><th className="border border-black bg-white p-2" /><th className="border border-black bg-white p-2" /><th className="border border-black bg-white p-2" />{dayKeys.map((dateKey) => <th key={dateKey} className="border border-black bg-white p-2 text-[18px] font-semibold">{Number(dateKey.slice(-2))}</th>)}</tr></thead><tbody>
            {rows.map((row) => {
              const title = row.kind === "room" ? row.room.name : row.kind === "cleaning" ? "Ответственный за уборку" : "Ответственный за контроль";
              const secondColumn = row.kind === "room" ? row.room.detergent : `${row.responsible.code} - ${row.responsible.userName || "—"}`;
              return <tr key={row.id}>
                <td className="border border-black p-2 text-center">{!printMode ? <Checkbox checked={selection.includes(row.id)} onCheckedChange={(checked) => setSelection((current) => Boolean(checked) ? [...current, row.id].filter((value, index, list) => list.indexOf(value) === index) : current.filter((id) => id !== row.id))} className="size-5" /> : null}</td>
                <td className="border border-black p-3 align-middle"><div className="flex items-center justify-between gap-3"><button type="button" className="text-left hover:text-[#5863f8]" disabled={printMode || props.status !== "active"} onClick={() => row.kind === "room" ? setRoomDialog(buildRoomState(row.room)) : setResponsibleDialog(buildResponsibleState(row.kind, row.responsible))}>{title}</button>{!printMode && props.status === "active" ? <Pencil className="size-4 text-[#7a7f93]" /> : null}</div></td>
                <td className="border border-black p-3">{secondColumn}</td>
                {dayKeys.map((dateKey) => <td key={dateKey} className={`border border-black p-2 text-center text-[18px] ${!printMode && props.status === "active" ? "cursor-pointer hover:bg-[#f5f6ff]" : ""} ${isWeekend(dateKey) ? "bg-[#fafbff]" : "bg-white"}`} onClick={() => updateCell(row, dateKey)}>{config.matrix[row.id]?.[dateKey] || ""}</td>)}
              </tr>;
            })}
          </tbody></table>
          <div className="space-y-2 text-[18px] italic">{config.legend.map((item) => <div key={item}>{item}</div>)}</div>
          <table className="w-full border-collapse text-[16px]"><thead><tr><th className="border border-black bg-[#f6f6f6] p-3 font-semibold">Наименование помещения</th><th className="border border-black bg-[#f6f6f6] p-3 font-semibold">Текущая уборка</th><th className="border border-black bg-[#f6f6f6] p-3 font-semibold">Генеральная уборка</th></tr></thead><tbody>{config.rooms.map((room) => <tr key={room.id}><td className="border border-black p-3">{room.name}</td><td className="border border-black p-3">{room.currentScope.join(", ")}</td><td className="border border-black p-3">{room.generalScope.join(", ")}</td></tr>)}</tbody></table>
        </div></div>
        </div>
      </div>

      <Dialog open={!!roomDialog} onOpenChange={(open) => !open && setRoomDialog(null)}><DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[720px]"><DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8"><div className="flex items-center justify-between"><DialogTitle className="text-[22px] font-semibold text-black">{roomDialog?.id ? "Редактирование помещения" : "Добавление нового помещения"}</DialogTitle><button type="button" className="rounded-xl p-2 hover:bg-black/5" onClick={() => setRoomDialog(null)}><X className="size-7" /></button></div></DialogHeader>{roomDialog ? <div className="space-y-4 px-10 py-8"><Input value={roomDialog.name} onChange={(event) => setRoomDialog((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Введите название помещения" className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]" /><Textarea value={roomDialog.detergent} onChange={(event) => setRoomDialog((current) => current ? { ...current, detergent: event.target.value } : current)} placeholder="Моющие и дезинфицирующие средства" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" /><Textarea value={roomDialog.currentScope} onChange={(event) => setRoomDialog((current) => current ? { ...current, currentScope: event.target.value } : current)} placeholder="Предмет текущей уборки" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" /><Textarea value={roomDialog.generalScope} onChange={(event) => setRoomDialog((current) => current ? { ...current, generalScope: event.target.value } : current)} placeholder="Предмет генеральной уборки" className="min-h-[120px] rounded-[18px] border-[#dfe1ec] px-5 py-4 text-[18px]" /><div className="flex justify-end"><Button type="button" className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={submitRoom}>Сохранить</Button></div></div> : null}</DialogContent></Dialog>
      <Dialog open={!!responsibleDialog} onOpenChange={(open) => !open && setResponsibleDialog(null)}><DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[720px]"><DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8"><div className="flex items-center justify-between"><DialogTitle className="text-[22px] font-semibold text-black">Добавление ответственного лица</DialogTitle><button type="button" className="rounded-xl p-2 hover:bg-black/5" onClick={() => setResponsibleDialog(null)}><X className="size-7" /></button></div></DialogHeader>{responsibleDialog ? <div className="space-y-5 px-5 py-6 sm:px-10 sm:py-8"><div className="space-y-2"><Label>Должность ответственного</Label><Select value={responsibleDialog.title} onValueChange={(value) => setResponsibleDialog((current) => current ? { ...current, title: value, userId: primaryUserId(props.users, value) } : current)}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Выберите значение" /></SelectTrigger><SelectContent><PositionSelectItems users={props.users} /></SelectContent></Select></div><div className="space-y-2"><Label>Сотрудник</Label><Select value={responsibleDialog.userId} onValueChange={(value) => setResponsibleDialog((current) => current ? { ...current, userId: value } : current)}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger><SelectContent>{responsibleUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div><div className="flex justify-end"><Button type="button" className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={submitResponsible}>Добавить</Button></div></div> : null}</DialogContent></Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-w-[calc(100vw-1rem)] rounded-[28px] border-0 p-0 sm:max-w-[760px]"><DialogHeader className="border-b px-5 py-6 sm:px-10 sm:py-8"><div className="flex items-center justify-between"><DialogTitle className="text-[22px] font-semibold text-black">Настройки документа</DialogTitle><button type="button" className="rounded-xl p-2 hover:bg-black/5" onClick={() => setSettingsOpen(false)}><X className="size-7" /></button></div></DialogHeader><div className="space-y-5 px-5 py-6 sm:px-10 sm:py-8"><Input value={settingsState.title} onChange={(event) => setSettingsState((current) => ({ ...current, title: event.target.value }))} className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]" /><Select value={settingsState.cleaningRole} onValueChange={(value) => setSettingsState((current) => ({ ...current, cleaningRole: value, cleaningUserId: primaryUserId(props.users, value) }))}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Должность ответственного за уборку" /></SelectTrigger><SelectContent><PositionSelectItems users={props.users} /></SelectContent></Select><Select value={settingsState.cleaningUserId} onValueChange={(value) => setSettingsState((current) => ({ ...current, cleaningUserId: value }))}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Сотрудник" /></SelectTrigger><SelectContent>{getUsersForRoleLabel(props.users, settingsState.cleaningRole).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select><Select value={settingsState.controlRole} onValueChange={(value) => setSettingsState((current) => ({ ...current, controlRole: value, controlUserId: primaryUserId(props.users, value) }))}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Должность ответственного за контроль" /></SelectTrigger><SelectContent><PositionSelectItems users={props.users} /></SelectContent></Select><Select value={settingsState.controlUserId} onValueChange={(value) => setSettingsState((current) => ({ ...current, controlUserId: value }))}><SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f2f3f8] text-[18px]"><SelectValue placeholder="Сотрудник" /></SelectTrigger><SelectContent>{getUsersForRoleLabel(props.users, settingsState.controlRole).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select><div className="flex justify-end"><Button type="button" className="h-11 rounded-2xl bg-[#5563ff] px-4 text-[15px] text-white hover:bg-[#4554ff]" onClick={async () => { await updateSettings({}); setSettingsOpen(false); }}>Сохранить</Button></div></div></DialogContent></Dialog>
      <ConfirmDialog open={deleteOpen} title="Удалить выбранные строки?" submitLabel="Удалить" onOpenChange={setDeleteOpen} onSubmit={deleteSelectedRows} />
    </>
  );
}
