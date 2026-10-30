import { useMemo } from "react";
import { useQuery, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertTask, Task } from "@shared/schema";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { parseJsonOrEmpty } from "@/lib/parse-json-or-empty";
import { applyCompletionToList } from "@/lib/task-completion";
import { haptic } from "@/lib/pwa";
import { toast } from "@/hooks/use-toast";

export function useTasks() {
  return useQuery<Task[]>({
    queryKey: [api.tasks.list.path],
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError(api.tasks.list.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      // Не используем parse чтобы сохранить weekDays и photoUrls как массивы
      return await res.json();
    },
  });
}

export function useTask(id: number) {
  return useQuery({
    queryKey: [api.tasks.get.path, id],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const url = buildUrl(api.tasks.get.path, { id });
      const res = await fetchOrFriendlyError(url, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch task");
      // Не используем parse чтобы сохранить weekDays как массив
      return await res.json();
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertTask) => {
      // Coerce workerId to number if it comes from a string select value
      const payload = {
        ...data,
        workerId: data.workerId ? Number(data.workerId) : undefined,
        requiresPhoto: data.requiresPhoto !== undefined ? Boolean(data.requiresPhoto) : false,
        weekDays: data.weekDays || null,
        monthDay: data.monthDay || null,
        price: data.price !== undefined ? Number(data.price) : 0,
      };

      const validated = api.tasks.create.input.parse(payload);
      
      const res = await fetchOrFriendlyError(api.tasks.create.path, {
        method: api.tasks.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.tasks.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create task");
      }
      return api.tasks.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertTask>) => {
      // Coerce workerId if present
      const payload = {
        ...updates,
        workerId: updates.workerId ? Number(updates.workerId) : updates.workerId,
        weekDays: updates.weekDays !== undefined ? updates.weekDays : undefined,
        monthDay: updates.monthDay !== undefined ? updates.monthDay : undefined,
        price: updates.price !== undefined ? Number(updates.price) : undefined,
      };

      const validated = api.tasks.update.input.parse(payload);
      const url = buildUrl(api.tasks.update.path, { id });
      
      const res = await fetchOrFriendlyError(url, {
        method: api.tasks.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error("Failed to update task");
      return api.tasks.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.tasks.delete.path, { id });
      const res = await fetchOrFriendlyError(url, {
        method: api.tasks.delete.method,
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error("Failed to delete task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

const COMPLETE_TASK_MUTATION_KEY = ["tasks", "complete"] as const;

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: COMPLETE_TASK_MUTATION_KEY,
    mutationFn: async ({ id, comment }: { id: number; comment?: string }) => {
      // useCompleteTask — самый горячий путь воркера: каждое нажатие
      // «Готово». 35s — server timeout 30s + 5s round-trip (на journal-
      // задачах internally делает upstream WeSetup).
      const res = await fetchOrFriendlyError(buildUrl(api.tasks.complete.path, { id }), {
        method: api.tasks.complete.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Не удалось завершить задачу");
      }
      return api.tasks.complete.responses[200].parse(await res.json());
    },
    onSuccess: (task) => {
      // Короткий отклик телефона: системный в iOS-приложении, вибрация на Android.
      haptic("success");
      // Карточка уходит в «Выполненные» сразу, до перезапроса списка —
      // без мигания между концом запроса и приходом свежих данных.
      queryClient.setQueryData<Task[]>([api.tasks.list.path], (list) => applyCompletionToList(list, task));
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tasks.get.path, task.id] });
      // Ушла на проверку (назначенный проверяющий или роль сотрудника):
      // говорим прямо, что задача ещё не закрыта и премия придёт после «Принять».
      if ((task as { verificationStatus?: string | null }).verificationStatus === "submitted") {
        toast({
          title: "Отправлено на проверку",
          description: (task as { price?: number | null }).price ? "Премия начислится, когда руководитель примет задачу" : "Руководитель посмотрит и примет задачу",
        });
      }
    },
  });
}

/**
 * id задач, чьё выполнение прямо сейчас уходит на сервер. Список задач
 * показывает по ним мгновенную галочку; при ошибке запрос завершается
 * и отметка снимается сама — без таймеров и угадывания условий.
 */
export function usePendingTaskCompletions(): ReadonlySet<number> {
  const ids = useMutationState({
    filters: { mutationKey: COMPLETE_TASK_MUTATION_KEY, status: "pending" },
    select: (mutation) => (mutation.state.variables as { id?: number } | undefined)?.id,
  });
  return useMemo(() => new Set(ids.filter((id): id is number => typeof id === "number")), [ids]);
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetchOrFriendlyError(`/api/tasks/${id}/uncomplete`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });

      const text = await res.text();
      const data = parseJsonOrEmpty(text);

      if (!res.ok) {
        throw new Error(
          (data.message as string | undefined) || "Не удалось вернуть задачу",
        );
      }

      return data;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      if (task?.id) {
        queryClient.invalidateQueries({ queryKey: [api.tasks.get.path, task.id] });
      }
    },
  });
}
