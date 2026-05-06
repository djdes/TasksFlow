import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertWorker } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { fetchOrFriendlyError } from "@/lib/queryClient";

// Helper: combine TanStack Query signal с timeout signal через AbortSignal.any.
// (Node 20+, Chrome 118+; fallback на pure timeout если any недоступен.)
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  if ("any" in AbortSignal && signal) {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
      signal,
      timeoutSignal,
    ]);
  }
  return timeoutSignal;
}

export function useWorkers() {
  return useQuery({
    queryKey: [api.workers.list.path],
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError(api.workers.list.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!res.ok) throw new Error("Failed to fetch workers");
      return api.workers.list.responses[200].parse(await res.json());
    },
  });
}

export function useWorker(id: number) {
  return useQuery({
    queryKey: [api.workers.get.path, id],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const url = buildUrl(api.workers.get.path, { id });
      const res = await fetchOrFriendlyError(url, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch worker");
      return api.workers.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateWorker() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertWorker) => {
      const validated = api.workers.create.input.parse(data);
      const res = await fetchOrFriendlyError(api.workers.create.path, {
        method: api.workers.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.workers.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create worker");
      }
      return api.workers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.workers.list.path] });
      toast({ title: "Success", description: "Worker created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateWorker() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & InsertWorker) => {
      const validated = api.workers.update.input.parse(updates);
      const url = buildUrl(api.workers.update.path, { id });
      const res = await fetchOrFriendlyError(url, {
        method: api.workers.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error("Failed to update worker");
      return api.workers.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.workers.list.path] });
      toast({ title: "Success", description: "Worker updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteWorker() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.workers.delete.path, { id });
      const res = await fetchOrFriendlyError(url, {
        method: api.workers.delete.method,
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error("Failed to delete worker");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.workers.list.path] });
      toast({ title: "Success", description: "Worker deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
