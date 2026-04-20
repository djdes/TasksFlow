"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Save,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Item = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatorySanpin: boolean;
  isMandatoryHaccp: boolean;
  enabled: boolean;
};

export function JournalsSettingsClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((item) => [item.code, item.enabled]))
  );
  const [saving, setSaving] = useState(false);

  const enabledCount = useMemo(
    () => Object.values(state).filter(Boolean).length,
    [state]
  );
  const totalCount = items.length;

  const dirty = useMemo(
    () =>
      items.some((item) => state[item.code] !== item.enabled),
    [items, state]
  );

  function toggle(code: string) {
    setState((prev) => ({ ...prev, [code]: !prev[code] }));
  }

  function selectAll() {
    setState(Object.fromEntries(items.map((item) => [item.code, true])));
  }
  function deselectAll() {
    setState(Object.fromEntries(items.map((item) => [item.code, false])));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const disabledCodes = items
        .filter((item) => !state[item.code])
        .map((item) => item.code);
      const response = await fetch("/api/settings/journals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledCodes }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Не удалось сохранить настройки");
      }
      toast.success(
        enabledCount === totalCount
          ? "Все журналы включены"
          : `Включено ${enabledCount} из ${totalCount} журналов`
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Dark hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div className="relative z-10 p-8 md:p-10">
          <Link
            href="/settings"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Настройки
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <ClipboardList className="size-6" />
              </div>
              <div>
                <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold leading-tight tracking-[-0.02em]">
                  Набор журналов
                </h1>
                <p className="mt-2 max-w-[560px] text-[15px] text-white/70">
                  Выберите журналы, которые ваша компания реально ведёт.
                  Отключённые не будут отображаться в дашборде и не пойдут в
                  расчёт готовности. Их всегда можно включить обратно.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              <CheckCircle2 className="size-3.5" />
              Включено: {enabledCount} / {totalCount}
            </div>
          </div>
        </div>
      </section>

      {/* Bulk toggles + save */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[13px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
          >
            <Eye className="size-4 text-[#5566f6]" />
            Включить все
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[13px] font-medium text-[#0b1024] transition-colors hover:border-[#d2453d]/40 hover:bg-[#fff4f2]"
          >
            <EyeOff className="size-4 text-[#d2453d]" />
            Отключить все
          </button>
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="h-11 w-full rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white hover:bg-[#4a5bf0] sm:w-auto"
        >
          <Save className="size-4" />
          {saving ? "Сохраняю…" : dirty ? "Сохранить" : "Сохранено"}
        </Button>
      </div>

      {/* Items grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const enabled = state[item.code];
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => toggle(item.code)}
              className={`flex h-full items-start gap-4 rounded-2xl border bg-white px-5 py-5 text-left shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:shadow-[0_8px_24px_-12px_rgba(85,102,246,0.18)] ${
                enabled
                  ? "border-[#ececf4] hover:border-[#d6d9ee]"
                  : "border-[#ececf4] opacity-60 hover:opacity-90"
              }`}
            >
              <Switch
                checked={enabled}
                onCheckedChange={() => toggle(item.code)}
                className="mt-0.5"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-snug text-[#0b1024]">
                  {item.name}
                </div>
                {item.description ? (
                  <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#6f7282]">
                    {item.description}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {item.isMandatorySanpin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4f2] px-2 py-0.5 text-[11px] font-medium text-[#d2453d]">
                      <ShieldCheck className="size-3" />
                      СанПиН
                    </span>
                  ) : null}
                  {item.isMandatoryHaccp ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1ff] px-2 py-0.5 text-[11px] font-medium text-[#5566f6]">
                      <ShieldAlert className="size-3" />
                      ХАССП
                    </span>
                  ) : null}
                  <span className="ml-auto rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#9b9fb3]">
                    {item.code}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
