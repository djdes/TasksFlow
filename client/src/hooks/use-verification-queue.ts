import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task } from "@shared/schema";
import { api } from "@shared/routes";
import { fetchOrFriendlyError } from "@/lib/queryClient";

const QUERY_KEY = ["awaiting-verification"] as const;

/**
 * Список задач, ждущих проверки от текущего пользователя. Сервер сам
 * фильтрует по verifier_worker_id (или всё submitted в компании, если
 * текущий юзер — admin).
 *
 * Polling: автоматический refetch раз в 30с — verifier видит новые
 * submit'ы без F5. Tabs/active-only fetching уже включён в react-query.
 */
export function useAwaitingVerification() {
  return useQuery<Task[]>({
    queryKey: QUERY_KEY,
    queryFn: async ({ signal }) => {
      const timeoutSignal = AbortSignal.timeout(30_000);
      const combined =
        "any" in AbortSignal && signal
          ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
              signal,
              timeoutSignal,
            ])
          : timeoutSignal;
      const res = await fetchOrFriendlyError("/api/tasks/awaiting-verification", {
        credentials: "include",
        signal: combined,
      });
      if (!res.ok) {
        if (res.status === 401) return [];
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useVerifyTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      taskId: number;
      decision: "approve" | "reject";
      reason?: string;
    }) => {
      // 35s: approve может тригерить proxy /complete-with-values к
      // WeSetup (30s server timeout) + запас. Hot path для верификатора.
      const res = await fetchOrFriendlyError(`/api/tasks/${args.taskId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: args.decision,
          reason: args.reason,
        }),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      // Инвалидируем оба query — задача переходит из «На проверке»
      // в «Активные» (reject) или в «Выполненные» (approve).
      // Раньше инвалидировали ["tasks"], но реальный queryKey всех
      // task-хуков — [api.tasks.list.path] = ["/api/tasks"]. Они не
      // совпадали, dashboard висел со старым state до 30s polling
      // tick'а.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      queryClient.invalidateQueries({
        queryKey: [api.tasks.get.path, vars.taskId],
      });
    },
  });
}
