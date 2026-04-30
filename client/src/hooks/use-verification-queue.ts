import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task } from "@shared/schema";

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
    queryFn: async () => {
      const res = await fetch("/api/tasks/awaiting-verification", {
        credentials: "include",
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
      const res = await fetch(`/api/tasks/${args.taskId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: args.decision,
          reason: args.reason,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Инвалидируем оба query — задача переходит из «На проверке»
      // в «Активные» (reject) или в «Выполненные» (approve).
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
