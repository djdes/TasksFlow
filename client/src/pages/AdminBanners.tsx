import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Megaphone, Loader2, Plus, Trash2, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

interface BannerRow {
  id: number;
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
  placement: "top" | "content" | "both";
  bgColor: string | null;
  textColor: string | null;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
  position: number;
}

const PLACEMENTS: { value: BannerRow["placement"]; label: string }[] = [
  { value: "top", label: "Полоса сверху" },
  { value: "content", label: "Блок в контенте" },
  { value: "both", label: "И там, и там" },
];

// unix sec -> значение для <input type="datetime-local"> (в локальном времени)
function secToLocal(sec: number | null): string {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
// значение datetime-local -> unix sec (или null)
function localToSec(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

const emptyForm = {
  text: "",
  linkUrl: "",
  linkLabel: "",
  placement: "top" as BannerRow["placement"],
  active: true,
  position: 0,
  startsAt: "",
  endsAt: "",
};

export default function AdminBannersPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const isRoot = !!(user as any)?.isRoot;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: banners = [], isLoading } = useQuery<BannerRow[]>({
    queryKey: ["admin-banners"],
    queryFn: async ({ signal }) => {
      const r = await fetchOrFriendlyError("/api/admin/banners", {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!r.ok) throw new Error("Не удалось загрузить баннеры");
      return r.json();
    },
    enabled: isRoot,
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const buildPayload = () => ({
    text: form.text.trim(),
    linkUrl: form.linkUrl.trim() || null,
    linkLabel: form.linkLabel.trim() || null,
    placement: form.placement,
    active: form.active,
    position: Number(form.position) || 0,
    startsAt: localToSec(form.startsAt),
    endsAt: localToSec(form.endsAt),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      const url = editingId ? `/api/admin/banners/${editingId}` : "/api/admin/banners";
      const r = await fetchOrFriendlyError(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || "Не удалось сохранить");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast({ title: editingId ? "Баннер обновлён" : "Баннер создан" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (b: BannerRow) => {
      const r = await fetchOrFriendlyError(`/api/admin/banners/${b.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !b.active }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error("Не удалось переключить");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-banners"] }),
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetchOrFriendlyError(`/api/admin/banners/${id}`, {
        method: "DELETE",
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error("Не удалось удалить");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast({ title: "Баннер удалён" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const startEdit = (b: BannerRow) => {
    setEditingId(b.id);
    setForm({
      text: b.text,
      linkUrl: b.linkUrl ?? "",
      linkLabel: b.linkLabel ?? "",
      placement: b.placement,
      active: b.active,
      position: b.position,
      startsAt: secToLocal(b.startsAt),
      endsAt: secToLocal(b.endsAt),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!isRoot) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Раздел доступен только для root</p>
          <Button onClick={() => setLocation("/dashboard")}>На главную</Button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full";
  const labelCls = "text-sm font-medium text-foreground mb-1.5 block";

  return (
    <div className="page-screen">
      <div className="page-container">
        <Button variant="ghost" onClick={() => setLocation("/admin/settings")} className="page-back">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к настройкам
        </Button>

        <div className="page-header flex items-center gap-3">
          <Megaphone className="w-8 h-8 text-primary" />
          <div>
            <h1 className="page-title">Промо-баннеры</h1>
            <p className="page-subtitle">Полоса акции сверху сайта и блок в контенте. Управляет владелец.</p>
          </div>
        </div>

        {/* Форма создания / правки */}
        <div className="content-panel mb-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            {editingId ? <Pencil className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
            {editingId ? "Изменить баннер" : "Новый баннер"}
          </h2>

          <div className="space-y-4">
            <div>
              <label className={labelCls}>Текст</label>
              <Input
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="🎉 Скидка 30% до конца недели по промокоду START"
                maxLength={500}
                className={inputCls}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Ссылка (необязательно)</label>
                <Input
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  placeholder="/#pricing или https://..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Подпись кнопки</label>
                <Input
                  value={form.linkLabel}
                  onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                  placeholder="Забрать"
                  maxLength={120}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Где показывать</label>
                <select
                  value={form.placement}
                  onChange={(e) => setForm({ ...form, placement: e.target.value as BannerRow["placement"] })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PLACEMENTS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Порядок</label>
                <Input
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
                  className={inputCls}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-10 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">Включён</span>
                </label>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Показывать с (необязательно)</label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Показывать до (необязательно)</label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  <X className="w-4 h-4 mr-2" />
                  Отмена
                </Button>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.text.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                {editingId ? "Сохранить" : "Создать баннер"}
              </Button>
            </div>
          </div>
        </div>

        {/* Список */}
        <div className="content-panel overflow-hidden !p-0">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Баннеры ({banners.length})</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : banners.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Баннеров пока нет</div>
          ) : (
            <div className="divide-y">
              {banners.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium truncate">{b.text}</span>
                      {b.active ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 dark:text-green-400">включён</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">выключен</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {PLACEMENTS.find((p) => p.value === b.placement)?.label}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {b.linkUrl ? `→ ${b.linkUrl}` : "без ссылки"} · порядок {b.position}
                      {(b.startsAt || b.endsAt) && (
                        <> · {b.startsAt ? secToLocal(b.startsAt).replace("T", " ") : "…"} — {b.endsAt ? secToLocal(b.endsAt).replace("T", " ") : "…"}</>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => toggleMutation.mutate(b)} disabled={toggleMutation.isPending}>
                      {b.active ? "Выключить" : "Включить"}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => startEdit(b)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Изменить
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => { if (confirm(`Удалить баннер «${b.text.slice(0, 40)}»?`)) deleteMutation.mutate(b.id); }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
