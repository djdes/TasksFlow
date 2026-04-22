"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Play,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Item = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatory: boolean;
  enabled: boolean;
  hasActiveDocumentToday: boolean;
};

type Props = {
  items: Item[];
};

/**
 * UI for /settings/auto-journals. Две колонки:
 *   - слева: список всех активных (non-disabled) журналов с чекбоксом
 *     «автосоздание». Поиск, фильтр «только обязательные» и действия
 *     «Выбрать все / Снять все».
 *   - справа: summary-плитки + действие «Создать сейчас» (ручной
 *     запуск, без ожидания cron'a).
 */
export function AutoJournalsClient({ items }: Props) {
  const router = useRouter();
  const [state, setState] = useState<Item[]>(items);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyMandatory, setOnlyMandatory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.filter((item) => {
      if (onlyMandatory && !item.isMandatory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [state, search, onlyMandatory]);

  const enabledCount = state.filter((i) => i.enabled).length;
  const activeCount = state.filter((i) => i.hasActiveDocumentToday).length;
  const neededCount = state.filter(
    (i) => i.enabled && !i.hasActiveDocumentToday
  ).length;

  function toggle(code: string) {
    setState((prev) =>
      prev.map((i) => (i.code === code ? { ...i, enabled: !i.enabled } : i))
    );
    setDirty(true);
  }

  function selectAll(enabled: boolean) {
    setState((prev) =>
      prev.map((i) =>
        filtered.some((f) => f.code === i.code) ? { ...i, enabled } : i
      )
    );
    setDirty(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const codes = state.filter((i) => i.enabled).map((i) => i.code);
      const response = await fetch("/api/organizations/auto-journals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Не удалось сохранить");
        return;
      }
      toast.success(
        codes.length === 0
          ? "Автосоздание выключено для всех журналов"
          : `Сохранено · автосоздание для ${codes.length} журнал(ов)`
      );
      setDirty(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (running) return;
    if (dirty) {
      toast.error("Сначала сохраните изменения");
      return;
    }
    if (enabledCount === 0) {
      toast.error("Ни один журнал не включён в автосоздание");
      return;
    }
    setRunning(true);
    try {
      const response = await fetch(
        "/api/journal-documents/auto-create",
        { method: "POST" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Не удалось запустить");
        return;
      }
      if (data.created === 0 && data.skipped === 0) {
        toast.info(data.message ?? "Нечего создавать");
      } else {
        toast.success(
          `Создано: ${data.created}, уже были: ${data.skipped}`
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* LEFT — journals list */}
      <section className="min-w-0 rounded-3xl border border-[#ececf4] bg-white p-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] sm:p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ececf4] pb-4">
          <div className="relative w-full flex-1 sm:w-auto sm:min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9b9fb3]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск журнала"
              className="h-10 rounded-2xl border-[#dcdfed] pl-9"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] text-[#3c4053]">
            <Checkbox
              checked={onlyMandatory}
              onCheckedChange={(v) => setOnlyMandatory(v === true)}
            />
            Только обязательные
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => selectAll(true)}
              className="rounded-full border border-[#dcdfed] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3c4053] hover:bg-[#f5f6ff]"
            >
              Выбрать все
            </button>
            <button
              type="button"
              onClick={() => selectAll(false)}
              className="rounded-full border border-[#dcdfed] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3c4053] hover:bg-[#f5f6ff]"
            >
              Снять все
            </button>
          </div>
        </div>

        <ul className="mt-3 divide-y divide-[#ececf4]">
          {filtered.map((item) => (
            <li key={item.code}>
              <label className="flex cursor-pointer items-start gap-3 py-3 px-1 transition-colors hover:bg-[#fafbff]">
                <Checkbox
                  checked={item.enabled}
                  onCheckedChange={() => toggle(item.code)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium text-[#0b1024]">
                      {item.name}
                    </span>
                    {item.isMandatory ? (
                      <span className="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a13a32]">
                        обязательный
                      </span>
                    ) : null}
                    {item.hasActiveDocumentToday ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#116b2a]">
                        <CheckCircle2 className="size-3" />
                        есть документ на сегодня
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#fff8eb] px-2 py-0.5 text-[10px] font-medium text-[#b25f00]">
                        документа на сегодня нет
                      </span>
                    )}
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 truncate text-[12px] leading-snug text-[#6f7282]">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </label>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="py-10 text-center text-[13px] text-[#9b9fb3]">
              Ничего не найдено по запросу
            </li>
          ) : null}
        </ul>
      </section>

      {/* RIGHT — summary + actions */}
      <aside className="space-y-4">
        <div className="rounded-3xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6f7282]">
            Сводка
          </div>
          <ul className="mt-3 space-y-2.5 text-[13px]">
            <li className="flex items-center justify-between gap-2">
              <span className="text-[#3c4053]">
                В автосоздании сейчас
              </span>
              <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[12px] font-semibold text-[#3848c7] tabular-nums">
                {enabledCount}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-[#3c4053]">
                С активным документом сегодня
              </span>
              <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[12px] font-semibold text-[#116b2a] tabular-nums">
                {activeCount}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-[#3c4053]">Будут созданы по запуску</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums ${
                  neededCount > 0
                    ? "bg-[#fff8eb] text-[#b25f00]"
                    : "bg-[#f0f2f7] text-[#6f7282]"
                }`}
              >
                {neededCount}
              </span>
            </li>
          </ul>
        </div>

        <div className="rounded-3xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6f7282]">
            Действия
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="h-11 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] disabled:bg-[#c8cbe0]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Сохранить список
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={runNow}
              disabled={running || dirty || neededCount === 0}
              className="h-11 rounded-2xl border-[#dcdfed] px-5 text-[14px] text-[#3848c7]"
              title={
                dirty
                  ? "Сначала сохраните список"
                  : neededCount === 0
                    ? "Всё уже создано — нечего запускать"
                    : "Создать недостающие документы прямо сейчас"
              }
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Создать сейчас ({neededCount})
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-[#ececf4] bg-[#fafbff] p-5">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6f7282]">
            <Sparkles className="size-3.5" />
            Автоматика
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#3c4053]">
            Каждый день в 01:00 проверяем включённые здесь журналы и
            создаём недостающие документы на текущий месяц. Вам не
            нужно заходить сюда каждое 1-е число — WeSetup заведёт
            апрельский документ 1 апреля, майский 1 мая и так далее.
          </p>
        </div>
      </aside>
    </div>
  );
}
