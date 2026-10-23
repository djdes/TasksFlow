import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MapPin, Pencil, Trash2, X } from "lucide-react";
import type { Location } from "@shared/schema";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LOCATIONS_KEY, useLocations } from "@/hooks/use-locations";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * «Точки» — кафе, магазины или объекты одной компании. Сотрудника
 * привязывают к точке в его строке ниже, а задачи и отчёты фильтруются
 * по точке. Пока точка одна, блок можно не трогать.
 */
export function LocationsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: locations = [] } = useLocations();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = useState<Location | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] }),
    ]);
  const fail = (err: Error) => toast({ title: "Не получилось", description: err.message, variant: "destructive" });

  const create = useMutation({
    mutationFn: (value: string) => apiRequest("POST", "/api/locations", { name: value }),
    onSuccess: async () => {
      setName("");
      await refresh();
    },
    onError: fail,
  });
  const rename = useMutation({
    mutationFn: (v: { id: number; name: string }) => apiRequest("PUT", `/api/locations/${v.id}`, { name: v.name }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/locations/${id}`),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
      toast({ title: "Точка удалена", description: "Её сотрудники теперь без точки, история сохранена" });
    },
    onError: fail,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };

  return (
    <div className="content-panel">
      <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" aria-hidden="true" />
        Точки
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Если у вас несколько заведений — добавьте их и привяжите сотрудников. Задачи и отчёты можно будет смотреть по каждой точке.
      </p>

      {locations.length > 0 && (
        <ul className="locations-list">
          {locations.map((loc) => (
            <li key={loc.id}>
              {editing?.id === loc.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) rename.mutate({ id: loc.id, name: editing.name.trim() });
                  }}
                >
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ id: loc.id, name: e.target.value })}
                    maxLength={120}
                    aria-label="Название точки"
                    autoFocus
                    className="h-9"
                  />
                  <Button type="submit" size="sm" variant="ghost" aria-label="Сохранить" disabled={rename.isPending}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label="Отмена" onClick={() => setEditing(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate font-medium">{loc.name}</span>
                  <Button type="button" size="sm" variant="ghost" aria-label={`Переименовать: ${loc.name}`} onClick={() => setEditing({ id: loc.id, name: loc.name })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Удалить: ${loc.name}`}
                    onClick={() => setRemoving(loc)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={locations.length ? "Ещё точка" : "Например, «Кафе на Ленина»"}
          aria-label="Новая точка"
          maxLength={120}
          className="things-input"
        />
        <Button type="submit" disabled={!name.trim()} loading={create.isPending} loadingLabel="Добавляем…">
          Добавить
        </Button>
      </form>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Удалить точку «${removing?.name ?? ""}»?`}
        description="Сотрудники точки останутся в компании без точки. История и отчёты прошлых дней не пропадут."
        confirmLabel="Удалить"
        destructive
        busy={archive.isPending}
        onConfirm={() => removing && archive.mutate(removing.id)}
      />
    </div>
  );
}

/** Выбор точки в строке сотрудника. */
export function UserLocationSelect({ userId, value, locations }: { userId: number; value: number | null; locations: Location[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const assign = useMutation({
    mutationFn: (locationId: number | null) => apiRequest("PUT", `/api/users/${userId}/location`, { locationId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.users.list.path] }),
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });
  return (
    <select
      className="location-select"
      aria-label="Точка сотрудника"
      value={value ?? ""}
      disabled={assign.isPending}
      onChange={(e) => assign.mutate(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Без точки</option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.name}
        </option>
      ))}
    </select>
  );
}
