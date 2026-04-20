"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type BulkAssignResult = {
  created: number;
  alreadyLinked: number;
  skipped: number;
  errors: number;
  message?: string;
  byJournal?: Array<{ label: string; skipReason?: string }>;
};

/**
 * One-click fan-out button: for every daily journal that isn't filled
 * today, creates a TasksFlow task for every responsible employee that
 * doesn't already have one. Idempotent — re-clicking after a new
 * employee was added just creates the missing slots.
 */
export function BulkAssignTodayButton({
  unfilledCount,
}: {
  unfilledCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        "/api/integrations/tasksflow/bulk-assign-today",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
      const data = (await response.json().catch(() => null)) as
        | BulkAssignResult
        | { error: string }
        | null;
      if (!response.ok) {
        const msg =
          (data && "error" in data && data.error) || "Не удалось отправить";
        toast.error(msg);
        return;
      }
      const result = data as BulkAssignResult;
      if (result.created === 0 && result.alreadyLinked === 0) {
        toast.success(
          result.message ?? "Нечего отправлять — всё уже на заполнении"
        );
      } else {
        const parts: string[] = [];
        if (result.created > 0) parts.push(`создано: ${result.created}`);
        if (result.alreadyLinked > 0)
          parts.push(`уже назначено: ${result.alreadyLinked}`);
        if (result.skipped > 0)
          parts.push(`без Telegram: ${result.skipped}`);
        if (result.errors > 0) parts.push(`ошибок: ${result.errors}`);
        toast.success(`Задачи отправлены · ${parts.join(" · ")}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Ошибка сети"
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || unfilledCount === 0;
  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={
        unfilledCount === 0
          ? "Всё уже заполнено на сегодня"
          : `Создать задачи в TasksFlow для всех ${unfilledCount} незаполненных журналов`
      }
      className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[13px] font-medium text-white shadow-[0_10px_26px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0] disabled:cursor-not-allowed disabled:bg-[#c8cbe0] disabled:shadow-none"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
      {busy ? "Отправляем…" : "Отправить всем на заполнение"}
    </button>
  );
}
