import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Pencil, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import {
  MANAGER_PRESET,
  NO_PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_TEXT,
  type CompanyRole,
  type RoleInput,
  type RolePermissions,
  type RolesResponse,
} from "@shared/roles";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { QueryError } from "@/components/QueryError";
import { ListSkeleton } from "@/components/PageSkeleton";
import { ROLES_KEY, useRoles } from "@/hooks/use-roles";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Порядок пунктов в форме: права, затем проверка выполненного. */
const FORM_KEYS: ReadonlyArray<keyof RolePermissions> = [...PERMISSION_KEYS, "requiresApproval"];

/** Короткие ярлыки прав в карточке роли. */
const CHIP: Record<keyof RolePermissions, string> = {
  manageTasks: "Задачи",
  manageUsers: "Сотрудники",
  verifyTasks: "Проверка",
  viewReports: "Отчёты",
  requiresApproval: "Своё — на проверку",
};

type Draft = { id: number | null; name: string; permissions: RolePermissions };

/**
 * «Роли и права» в «Сотрудниках» (только админ). Встроенные роли —
 * Администратор и Сотрудник; свои — например «Руководитель»: ставит задачи
 * себе и другим, добавляет людей, принимает работу, видит отчёты. Своя роль
 * никогда не видит настройки компании и оплату и не меняет админов и
 * других руководителей. Здесь же — уходит ли выполненное сотрудником на
 * проверку.
 */
export function RolesPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useRoles();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<CompanyRole | null>(null);
  const roles = data?.roles ?? [];

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
      queryClient.invalidateQueries({ queryKey: [api.users.list.path] }),
      queryClient.invalidateQueries({ queryKey: ["company-me"] }),
    ]);
  const fail = (err: Error) => toast({ title: "Не получилось", description: err.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body: RoleInput = { name: d.name.trim(), permissions: d.permissions };
      return d.id ? apiRequest("PUT", `/api/roles/${d.id}`, body) : apiRequest("POST", "/api/roles", body);
    },
    onSuccess: async (_res, d) => {
      setDraft(null);
      await refresh();
      toast({ title: d.id ? "Роль сохранена" : `Роль «${d.name.trim()}» добавлена`, description: d.id ? undefined : "Выдайте её человеку в списке сотрудников" });
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/roles/${id}`),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
      toast({ title: "Роль удалена", description: "Её люди теперь «Сотрудники»" });
    },
    onError: fail,
  });
  // Выбор в переключателе — сразу, в том же событии: иначе React до ответа
  // сервера на миг возвращает галочку назад (управляемый checkbox).
  const [approvalChoice, setApprovalChoice] = useState<boolean | null>(null);
  const approval = useMutation({
    mutationFn: async (employeeApproval: boolean) =>
      (await (await apiRequest("PUT", "/api/roles/settings", { employeeApproval })).json()) as RolesResponse,
    onSuccess: async (fresh, on) => {
      // Ответ — уже новое состояние: переключатель не мигает обратно до перезапроса.
      queryClient.setQueryData(ROLES_KEY, fresh);
      setApprovalChoice(null);
      await queryClient.invalidateQueries({ queryKey: ["company-me"] });
      toast({ title: on ? "Выполненное сотрудниками — на проверку" : "Задачи сотрудников закрываются сразу" });
    },
    onError: (err: Error) => {
      setApprovalChoice(null);
      fail(err);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft && draft.name.trim()) save.mutate(draft);
  };
  const toggle = (key: keyof RolePermissions, on: boolean) =>
    setDraft((d) => (d ? { ...d, permissions: { ...d.permissions, [key]: on } } : d));

  // Пока запрос идёт — показываем выбранное, а не старое значение.
  const employeeApproval = approvalChoice ?? data?.employeeApproval ?? false;

  return (
    <div className="content-panel roles-panel" id="roles">
      <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
        Роли и права
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Создайте роль — например «Руководитель» — и выдайте её человеку в списке сотрудников.
        Своя роль не видит настройки компании и оплату и не меняет админов и других руководителей.
      </p>

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : isError && !data ? (
        <QueryError onRetry={() => { void refetch(); }} />
      ) : (
        <ul className="roles-list" aria-label="Роли компании">
          <li className="role-card">
            <div className="role-card-head">
              <Crown className="w-4 h-4 text-primary" aria-hidden="true" />
              <span className="role-card-name">Администратор</span>
              <span className="role-card-tag">встроенная</span>
            </div>
            <p className="role-card-text">Всё: задачи и сотрудники, роли, настройки компании, приглашения, тариф и оплата.</p>
          </li>

          <li className="role-card">
            <div className="role-card-head">
              <UserRound className="w-4 h-4 text-primary" aria-hidden="true" />
              <span className="role-card-name">Сотрудник</span>
              <span className="role-card-tag">встроенная</span>
            </div>
            <p className="role-card-text">Видит и выполняет свои задачи, свою историю.</p>
            <label className="role-approval">
              <input
                type="checkbox"
                className="schedule-check"
                checked={employeeApproval}
                disabled={approval.isPending}
                onChange={(e) => {
                  setApprovalChoice(e.target.checked);
                  approval.mutate(e.target.checked);
                }}
              />
              <span>
                <b>{PERMISSION_TEXT.requiresApproval.title}</b>
                <small>
                  Ежедневная или разовая задача после «Готово» попадает в «На проверке» к руководителю или админу.
                  Премия начисляется после «Принять», при возврате сотрудник видит причину. Принимайте до конца дня:
                  непринятая ежедневная задача ждёт проверки и на следующий день.
                </small>
              </span>
            </label>
          </li>

          {roles.map((role) =>
            draft?.id === role.id ? (
              <li key={role.id} className="role-card is-editing">
                <RoleForm draft={draft} busy={save.isPending} onName={(name) => setDraft({ ...draft, name })} onToggle={toggle} onSubmit={submit} onCancel={() => setDraft(null)} />
              </li>
            ) : (
              <li key={role.id} className="role-card">
                <div className="role-card-head">
                  <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span className="role-card-name">{role.name}</span>
                  <span className="ml-auto flex items-center">
                    <Button type="button" size="sm" variant="ghost" aria-label={`Изменить роль: ${role.name}`} onClick={() => setDraft({ id: role.id, name: role.name, permissions: { ...role.permissions } })}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Удалить роль: ${role.name}`} onClick={() => setRemoving(role)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </span>
                </div>
                <div className="role-chips">
                  {FORM_KEYS.filter((k) => role.permissions[k]).map((k) => (
                    <span key={k} className="role-chip" title={PERMISSION_TEXT[k].title}>{CHIP[k]}</span>
                  ))}
                  {!FORM_KEYS.some((k) => role.permissions[k]) && <span className="role-card-text">Как сотрудник — только свои задачи</span>}
                </div>
              </li>
            ),
          )}

          {draft && draft.id === null && (
            <li className="role-card is-editing">
              <RoleForm draft={draft} busy={save.isPending} onName={(name) => setDraft({ ...draft, name })} onToggle={toggle} onSubmit={submit} onCancel={() => setDraft(null)} />
            </li>
          )}
        </ul>
      )}

      {!draft && data && (
        <div className="flex flex-wrap gap-2 mt-4">
          {!roles.some((r) => r.name.toLowerCase() === MANAGER_PRESET.name.toLowerCase()) && (
            <Button type="button" onClick={() => setDraft({ id: null, name: MANAGER_PRESET.name, permissions: { ...MANAGER_PRESET.permissions } })}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Роль «Руководитель»
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setDraft({ id: null, name: "", permissions: { ...NO_PERMISSIONS } })}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Своя роль
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Удалить роль «${removing?.name ?? ""}»?`}
        description="Люди с этой ролью станут обычными сотрудниками. Их задачи и история останутся."
        confirmLabel="Удалить"
        destructive
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

function RoleForm({
  draft,
  busy,
  onName,
  onToggle,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  busy: boolean;
  onName: (name: string) => void;
  onToggle: (key: keyof RolePermissions, on: boolean) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="role-form" aria-label={draft.id ? "Изменить роль" : "Новая роль"}>
      <label className="block">
        <span className="text-sm font-medium text-foreground mb-1.5 block">Название роли</span>
        <Input value={draft.name} onChange={(e) => onName(e.target.value)} maxLength={60} placeholder="Например, Руководитель" className="things-input" autoFocus />
      </label>
      <fieldset className="role-perms">
        <legend className="sr-only">Права роли</legend>
        {FORM_KEYS.map((key) => (
          <label key={key} className="role-perm">
            <input type="checkbox" className="schedule-check" checked={draft.permissions[key]} onChange={(e) => onToggle(key, e.target.checked)} />
            <span>
              <b>{PERMISSION_TEXT[key].title}</b>
              <small>{PERMISSION_TEXT[key].hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="w-4 h-4" aria-hidden="true" />
          Отмена
        </Button>
        <Button type="submit" disabled={!draft.name.trim()} loading={busy} loadingLabel="Сохраняем…">
          {draft.id ? "Сохранить" : "Добавить роль"}
        </Button>
      </div>
    </form>
  );
}
