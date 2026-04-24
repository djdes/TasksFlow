import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertTask, Task } from "@shared/schema";

export function useTasks() {
  return useQuery<Task[]>({
    queryKey: [api.tasks.list.path],
    queryFn: async () => {
      const res = await fetch(api.tasks.list.path, { credentials: "include" });
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
    queryFn: async () => {
      const url = buildUrl(api.tasks.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
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
      
      const res = await fetch(api.tasks.create.path, {
        method: api.tasks.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
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
      
      const res = await fetch(url, {
        method: api.tasks.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
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
      const res = await fetch(url, { 
        method: api.tasks.delete.method, 
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, comment }: { id: number; comment?: string }) => {
      const res = await fetch(buildUrl(api.tasks.complete.path, { id }), {
        method: api.tasks.complete.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Не удалось завершить задачу");
      }
      return api.tasks.complete.responses[200].parse(await res.json());
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tasks.get.path, task.id] });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/${id}/uncomplete`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
      });

      const text = await res.text();
      let data: any = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          // Если не JSON, игнорируем
        }
      }

      if (!res.ok) {
        throw new Error(data.message || "Не удалось вернуть задачу");
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
