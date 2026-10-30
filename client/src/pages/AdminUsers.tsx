import { QueryError } from "@/components/QueryError";
import { PageSkeleton, ListSkeleton } from "@/components/PageSkeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserPlus, Users, Coins, RotateCcw, Pencil, X, Check, Trash2, KeyRound, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { insertUserSchema, updateUserSchema } from "@shared/schema";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { PhoneInput } from "@/components/PhoneInput";
import { AdminPinField } from "@/components/AdminPinField";
import { PinShareNote, UserPinPanel } from "@/components/UserPinPanel";
import { LocationsPanel, UserLocationSelect } from "@/components/LocationsPanel";
import { useLocations } from "@/hooks/use-locations";
import { useWesetupConfiguration } from "@/hooks/use-wesetup";
import { generatePin, newPinSchema } from "@shared/pin";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { matchesQuery } from "@/lib/cabinet-nav";
import { formatPhoneDisplay, getUserInitials, personLabel, personSearchText } from "@/lib/user-display";
import { RolesPanel } from "@/components/RolesPanel";
import { useRoles } from "@/hooks/use-roles";
import { usePermissions } from "@/hooks/use-permissions";
import { canGrantRole, canManageUser, type CompanyRole } from "@shared/roles";

/** Поиск по списку — когда людей больше, чем видно на экране. */
const SEARCH_FROM = 6;

type ListUser = {
  id: number;
  phone: string | null;
  name: string | null;
  isAdmin: boolean;
  position?: string | null;
  bonusBalance: number;
  locationId?: number | null;
  hasPin?: boolean;
  pinLocked?: boolean;
  roleId?: number | null;
  /** Руководитель из WeSetup — его, как и админа, меняет только админ. */
  managedWorkerIds?: string | null;
};

/**
 * Роль в селекте: "employee" — «Сотрудник», "admin" — администратор,
 * "role-<id>" — своя роль компании.
 */
const roleValueOf = (u: { isAdmin: boolean; roleId?: number | null }): string =>
  u.isAdmin ? "admin" : u.roleId ? `role-${u.roleId}` : "employee";
const roleIdOf = (value: string): number | null => (value.startsWith("role-") ? Number(value.slice(5)) : null);

// PIN задаёт руководитель: сотрудник войдёт по номеру и этому PIN.
const formSchema = insertUserSchema
  .pick({ phone: true, name: true, position: true })
  .extend({ pin: newPinSchema, role: z.string() });
const editFormSchema = updateUserSchema;

type FormValues = z.infer<typeof formSchema>;
type EditFormValues = z.infer<typeof editFormSchema>;

/** Выбор роли: админу — все, руководителю — без права на людей и без админа. */
function RoleSelect({
  value,
  onChange,
  roles,
  canGrant,
  id,
  className = "location-select",
}: {
  value: string;
  onChange: (value: string) => void;
  roles: CompanyRole[];
  canGrant: (grant: "admin" | CompanyRole | null) => boolean;
  id?: string;
  className?: string;
}) {
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Роль">
      <option value="employee">Сотрудник</option>
      {roles.filter((r) => canGrant(r) || value === `role-${r.id}`).map((r) => (
        <option key={r.id} value={`role-${r.id}`} disabled={!canGrant(r)}>
          {r.name}
        </option>
      ))}
      {(canGrant("admin") || value === "admin") && (
        <option value="admin" disabled={!canGrant("admin")}>
          Администратор
        </option>
      )}
    </select>
  );
}

export default function AdminUsers() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const permissions = usePermissions();
  const canOpen = permissions.isAdmin || permissions.canManageUsers;
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRole, setEditRole] = useState("employee");
  const [pinUserId, setPinUserId] = useState<number | null>(null);
  const [created, setCreated] = useState<{ phone: string; pin: string } | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "delete" | "reset"; user: ListUser } | null>(null);
  // ?add=1 — сразу к форме (быстрый переход «Добавить сотрудника»),
  // ?user=ID — показать человека в списке (поиск по имени там же).
  const params = new URLSearchParams(useSearch());
  const focusUserId = Number(params.get("user")) || null;
  const wantsAdd = params.get("add") === "1";
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const phoneFieldRef = useRef<HTMLDivElement>(null);
  const { data: locations = [] } = useLocations(canOpen);
  const { data: rolesData } = useRoles(canOpen);
  const roles = rolesData?.roles ?? [];
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const planInfo = (useWesetupConfiguration().data as { planInfo?: { name: string; maxUsers: number | null; enforced: boolean } } | null)?.planInfo;
  const access = permissions.access;
  const canGrant = (grant: "admin" | CompanyRole | null) => !!access && canGrantRole(access, grant);
  /** Руководитель меняет только обычных людей (не админов, не руководителей, не себя). */
  const canEditUser = (u: ListUser) => !!access && canManageUser(access, u, u.roleId ? roleById.get(u.roleId) : null);

  // Получаем список пользователей (хук должен быть до early return)
  const { data: users = [], isLoading, isError, refetch } = useQuery<ListUser[]>({
    queryKey: [api.users.list.path],
    queryFn: async ({ signal }) => {
      const response = await fetchOrFriendlyError(api.users.list.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      return response.json();
    },
    enabled: canOpen,
  });

  // Мутация для создания пользователя
  const createUserMutation = useMutation({
    mutationFn: async ({ role, position, ...data }: FormValues) => {
      const body = {
        ...data,
        position: position?.trim() ? position.trim() : null,
        ...(role === "admin" ? { role: "admin" } : roleIdOf(role) ? { roleId: roleIdOf(role) } : {}),
      };
      const response = await fetchOrFriendlyError(api.users.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: async (_user, data) => {
      await queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      setCreated({ phone: data.phone, pin: data.pin });
      form.reset({ phone: "+7", name: "", position: "", role: "employee", pin: generatePin() });
      toast({ title: "Сотрудник добавлен" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для обновления пользователя
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditFormValues }) => {
      const response = await fetchOrFriendlyError(buildUrl(api.users.update.path, { id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      setEditingUserId(null);
      toast({ title: "Сохранено" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для сброса баланса
  const resetBalanceMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetchOrFriendlyError(`/api/users/${userId}/reset-balance`, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset balance");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      setConfirm(null);
      toast({ title: "Баланс сброшен" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // Мутация для удаления пользователя
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetchOrFriendlyError(`/api/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
      setConfirm(null);
      toast({ title: "Сотрудник удалён" });
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "+7",
      name: "",
      position: "",
      role: "employee",
      pin: generatePin(),
    },
  });

  const onSubmit = (values: FormValues) => {
    createUserMutation.mutate(values);
  };

  // Поиск — только пока есть поле поиска: иначе фильтр остался бы без способа его снять.
  const searchable = users.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const q = query.trim();
    if (!q || !searchable) return users;
    return users.filter((u) => matchesQuery(q, personSearchText(u)));
  }, [users, query, searchable]);

  // Пришли из быстрого перехода: к форме или к человеку в списке.
  const listReady = !isLoading && users.length > 0;
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (wantsAdd) phoneFieldRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [wantsAdd, canOpen]);
  useEffect(() => {
    // Нужного человека не должен прятать старый поиск.
    shownFor.current = null;
    if (focusUserId) setQuery("");
  }, [focusUserId]);
  useEffect(() => {
    if (!focusUserId || !listReady || shownFor.current === focusUserId) return;
    const row = document.querySelector<HTMLElement>(`[data-user-row="${focusUserId}"]`);
    if (!row) return;
    shownFor.current = focusUserId;
    setHighlightId(focusUserId);
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.focus({ preventScroll: true });
  }, [focusUserId, listReady, shown]);
  useEffect(() => {
    if (highlightId === null) return;
    const timer = window.setTimeout(() => setHighlightId(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // Проверка загрузки авторизации
  if (authLoading) return <PageSkeleton />;

  // Раздел — админу и роли «Добавляет сотрудников»
  if (!user || !canOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Сотрудников добавляет администратор или руководитель</p>
          <Button onClick={() => setLocation("/")}>На главную</Button>
        </div>
      </div>
    );
  }

  const startEditing = (u: ListUser) => {
    setPinUserId(null);
    setEditingUserId(u.id);
    setEditPhone(u.phone ?? "+7");
    setEditName(u.name || "");
    setEditPosition(u.position || "");
    setEditRole(roleValueOf(u));
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditPhone("");
    setEditName("");
    setEditPosition("");
  };

  const saveEditing = () => {
    if (editingUserId === null) return;
    const before = users.find((u) => u.id === editingUserId);
    const roleChanged = !!before && roleValueOf(before) !== editRole;
    updateUserMutation.mutate({
      id: editingUserId,
      data: {
        phone: editPhone,
        name: editName || null,
        position: editPosition.trim() || null,
        // Роль отправляем, только если её поменяли: сервер проверит, можно ли.
        ...(roleChanged ? { role: editRole === "admin" ? "admin" : roleIdOf(editRole) } : {}),
      },
    });
  };

  const roleLabelOf = (u: ListUser): string | null =>
    u.isAdmin ? "Админ" : u.roleId ? roleById.get(u.roleId)?.name ?? null : null;

  return (
    <div className="page-screen">
      <div className="page-container">
        <div className="page-header">
          <button
            onClick={() => setLocation("/")}
            data-home-back className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="page-icon">
              <Users className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title">Сотрудники</h1>
          </div>
          <p className="page-subtitle sm:ml-[60px]">
            {permissions.isAdmin
              ? "Кто работает в компании: добавляйте людей, задавайте PIN, должность, роль и точки"
              : "Добавляйте людей и задавайте им PIN и должность. Админов и других руководителей меняет администратор"}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Форма добавления пользователя */}
          <div className="content-panel">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Добавить сотрудника
            </h2>
            {planInfo?.enforced && planInfo.maxUsers !== null && (permissions.isAdmin || users.length >= planInfo.maxUsers) && (
              <p className={`mb-5 rounded-xl px-3 py-2 text-sm ${users.length >= planInfo.maxUsers ? "bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>
                {permissions.isAdmin ? (
                  <>
                    Тариф «{planInfo.name}»: {users.length} из {planInfo.maxUsers} человек.
                    {users.length >= planInfo.maxUsers && (
                      <> Чтобы добавить ещё, <Link className="font-medium underline" href="/admin/billing">смените тариф</Link>.</>
                    )}
                  </>
                ) : (
                  // Оплату руководитель не видит — только что упёрлись в лимит.
                  <>Мест в компании больше нет. Попросите администратора сменить тариф.</>
                )}
              </p>
            )}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem ref={phoneFieldRef}>
                      <FormLabel>Номер телефона</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          className="things-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя (необязательно)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Например, Анна Петрова"
                          className="things-input"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Должность</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Например, Повар"
                            className="things-input"
                            maxLength={120}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="new-user-role">Роль</FormLabel>
                        <RoleSelect
                          id="new-user-role"
                          value={field.value}
                          onChange={field.onChange}
                          roles={roles}
                          canGrant={canGrant}
                          className="reports-select user-role-select"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {permissions.isAdmin && roles.length === 0 && (
                  <p className="-mt-3 text-xs text-muted-foreground">
                    Нужен руководитель, который ставит задачи и добавляет людей?{" "}
                    <a href="#roles" className="font-medium text-primary underline-offset-2 hover:underline">Создайте роль ниже</a>.
                  </p>
                )}

                <FormField
                  control={form.control}
                  name="pin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PIN для входа</FormLabel>
                      <FormControl>
                        <AdminPinField value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Сотрудник войдёт по номеру и этому PIN, потом сможет сменить его сам.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {created && (
                  <PinShareNote phone={created.phone} pin={created.pin} onDone={() => setCreated(null)} />
                )}

                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {createUserMutation.isPending ? "Добавляем…" : "Добавить сотрудника"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Список сотрудников */}
          <div className="content-panel">
            <h2 className="text-xl font-semibold mb-4">
              Все сотрудники{users.length > 0 && <span className="ml-2 text-base font-medium text-muted-foreground">{users.length}</span>}
            </h2>
            {searchable && (
              <label className="users-search">
                <Search aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Имя, телефон или должность"
                  aria-label="Найти сотрудника"
                />
              </label>
            )}
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : isError && users.length === 0 ? (
              <QueryError onRetry={() => { void refetch(); }} />
            ) : users.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Пока никого — добавьте первого сотрудника слева</p>
            ) : shown.length === 0 ? (
              <p className="text-muted-foreground text-center py-8" role="status">Никого не нашли. Попробуйте часть имени или последние цифры телефона.</p>
            ) : (
              <ul className="space-y-3" aria-label="Сотрудники">
                {shown.map((u) => {
                  const label = personLabel(u);
                  return (
                  <li
                    key={u.id}
                    data-user-row={u.id}
                    tabIndex={-1}
                    className={`user-row p-4 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors ${highlightId === u.id ? "is-highlighted" : ""}`}
                  >
                    {pinUserId === u.id ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <UserPinPanel user={u} onClose={() => setPinUserId(null)} />
                      </div>
                    ) : editingUserId === u.id ? (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Телефон</label>
                          <PhoneInput
                            value={editPhone}
                            onChange={setEditPhone}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Имя</label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Например, Анна Петрова"
                            className="mt-1"
                            maxLength={255}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-muted-foreground" htmlFor={`edit-position-${u.id}`}>Должность</label>
                            <Input
                              id={`edit-position-${u.id}`}
                              value={editPosition}
                              onChange={(e) => setEditPosition(e.target.value)}
                              placeholder="Например, Повар"
                              className="mt-1"
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground" htmlFor={`edit-role-${u.id}`}>Роль</label>
                            {u.id === user.id ? (
                              <p className="mt-1 text-sm text-muted-foreground">Свою роль поменять нельзя</p>
                            ) : (
                              <RoleSelect
                                id={`edit-role-${u.id}`}
                                value={editRole}
                                onChange={setEditRole}
                                roles={roles}
                                canGrant={canGrant}
                                className="reports-select user-role-select mt-1"
                              />
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={updateUserMutation.isPending}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Отмена
                          </Button>
                          <Button
                            size="sm"
                            onClick={saveEditing}
                            disabled={updateUserMutation.isPending}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {updateUserMutation.isPending ? "Сохранение..." : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <span className="user-row-avatar" aria-hidden>{getUserInitials(u)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground break-words">
                            {label}
                            {roleLabelOf(u) && (
                              <span className="role-badge ml-2 align-[2px]" title={u.isAdmin ? "Администратор" : "Роль"}>
                                {roleLabelOf(u)}
                              </span>
                            )}
                          </p>
                          {(u.name || u.position) && (
                            <p className="text-sm text-muted-foreground">
                              {[u.name ? formatPhoneDisplay(u.phone) : null, u.position].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {locations.length > 0 && (canEditUser(u) ? (
                            <div className="mt-1.5">
                              <UserLocationSelect userId={u.id} value={u.locationId ?? null} locations={locations} />
                            </div>
                          ) : u.locationId ? (
                            <p className="mt-1 text-xs text-muted-foreground">{locations.find((l) => l.id === u.locationId)?.name}</p>
                          ) : null)}
                          {!u.isAdmin && (u.pinLocked || u.hasPin === false) && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {u.pinLocked ? (
                                <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                                  Вход заблокирован
                                </span>
                              ) : (
                                <span
                                  className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                                  title="Сотрудник придумает PIN при первом входе. Надёжнее задать его самому."
                                >
                                  Без PIN
                                </span>
                              )}
                            </div>
                          )}
                          {!u.isAdmin && u.bonusBalance > 0 && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <Coins className="w-3.5 h-3.5 text-green-600" />
                              <span className="text-sm font-medium text-green-600">
                                {u.bonusBalance} ₽
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {!u.isAdmin && canEditUser(u) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                cancelEditing();
                                setPinUserId(u.id);
                              }}
                              className="text-xs"
                              aria-label={`PIN: ${label}`}
                              title="PIN для входа"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canEditUser(u) && (!u.isAdmin || (permissions.isAdmin && u.id !== user.id)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(u)}
                              className="text-xs"
                              aria-label={`Изменить: ${label}`}
                              title="Изменить имя, телефон, должность и роль"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!u.isAdmin && canEditUser(u) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirm({ kind: "delete", user: u })}
                              className="text-xs text-destructive hover:text-destructive"
                              aria-label={`Удалить: ${label}`}
                              title="Удалить сотрудника"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {!u.isAdmin && u.bonusBalance > 0 && canEditUser(u) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirm({ kind: "reset", user: u })}
                              className="text-xs"
                              aria-label={`Сбросить премию: ${label}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Сброс
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Роли и права, проверка выполненного — только админ */}
          {permissions.isAdmin && <RolesPanel />}

          {/* Точки сети: привязка сотрудников, фильтры задач и отчётов */}
          {permissions.isAdmin && <LocationsPanel />}
        </div>
      </div>
      {confirm && (() => {
        const who = personLabel(confirm.user);
        const isDelete = confirm.kind === "delete";
        const mutation = isDelete ? deleteUserMutation : resetBalanceMutation;
        return (
          <ConfirmDialog
            open
            onOpenChange={(open) => { if (!open) setConfirm(null); }}
            title={isDelete ? `Удалить ${who}?` : `Сбросить премию ${who}?`}
            description={
              isDelete
                ? "Сотрудник больше не войдёт. Его задачи останутся без исполнителя — назначьте их другому. История выполнений сохранится."
                : `Накопленные ${confirm.user.bonusBalance} ₽ обнулятся — обычно так делают после выплаты.`
            }
            confirmLabel={isDelete ? "Удалить" : "Сбросить"}
            destructive={isDelete}
            busy={mutation.isPending}
            onConfirm={() => mutation.mutate(confirm.user.id)}
          />
        );
      })()}
    </div>
  );
}
