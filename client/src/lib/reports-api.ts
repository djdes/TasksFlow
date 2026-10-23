import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { HistoryDayResponse, ReportSummaryResponse } from "@shared/history";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

/** Ключи — префиксы для живых обновлений (use-live-updates). */
export const HISTORY_KEY = "history-day";
export const SUMMARY_KEY = "report-summary";

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function getJson<T>(url: string, signal: AbortSignal | undefined): Promise<T> {
  const res = await fetchOrFriendlyError(url, { credentials: "include", signal: withTimeout(signal, 30_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.message === "string" ? body.message : "Не удалось загрузить данные");
  return body as T;
}

/** Журнал дня; day не задан — сегодня по поясу компании. */
export function useHistoryDay(day: string | null, workerId: number | null, locationId: number | null = null) {
  return useQuery({
    queryKey: [HISTORY_KEY, day, workerId, locationId],
    queryFn: ({ signal }) => getJson<HistoryDayResponse>(`/api/history${query({ day, workerId, locationId })}`, signal),
    // Перезапрос держит прежний кадр, без мигания скелетоном.
    placeholderData: keepPreviousData,
  });
}

export function useReportSummary(range: { from: string; to: string } | null, workerId: number | null, locationId: number | null = null) {
  return useQuery({
    queryKey: [SUMMARY_KEY, range?.from ?? null, range?.to ?? null, workerId, locationId],
    queryFn: ({ signal }) =>
      getJson<ReportSummaryResponse>(`/api/reports/summary${query({ from: range?.from, to: range?.to, workerId, locationId })}`, signal),
    placeholderData: keepPreviousData,
  });
}

export function csvUrl(range: { from: string; to: string }, workerId: number | null, locationId: number | null = null): string {
  return `/api/reports/export.csv${query({ from: range.from, to: range.to, workerId, locationId })}`;
}
