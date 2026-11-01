import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, KeyRound, LockOpen, LogOut, Search, Send, Trash2, UserRound } from "lucide-react";
import { generatePin, pinProblem } from "@shared/pin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/PhoneInput";
import { AdminPinField } from "@/components/AdminPinField";
import { PinShareNote } from "@/components/UserPinPanel";
import { ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { ApiError, apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { formatPhoneDisplay } from "@/lib/user-display";
import { useToast } from "@/hooks/use-toast";

/** Строка человека из /api/root/* (server/root-users.ts RootUserRow). */
export type RootPerson = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  companyId: number | null;
  companyName: string | null;
  isAdmin: boolean;
  isRoot: boolean;
  roleId: number | null;
  roleName: string | null;
  hasPin: boolean;
  pinUpdatedAt: number | null;
  lockedUntil: number | null;
  failedAttempts: number;
  telegramLinked: boolean;
  telegramUsername: string | null;
  createdAt: number;
};
type CompanyPeople = { company: { id: number; name: string }; users: RootPerson[]; roles: Array<{ id: number; name: string }> };

const ROOT_USERS_KEY = ["root-users"];
const shortDate = (sec: number | null) => (sec ? new Date(sec * 1000).toLocaleDateString("ru-RU") : "—");
const time = (sec: number) => new Date(sec * 1000).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function roleLabel(u: Pick<RootPerson, "isRoot" | "isAdmin" | "roleName">): string {
  if (u.isRoot) return "Root";
  if (u.isAdmin) return "Администратор";
  return u.roleName ?? "Сотрудник";
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchOrFriendlyError(url, { credentials: "include", signal: withTimeout(signal, 30_000) });
  if (!res.ok) throw new Error("Не удалось загрузить");
  return res.json();
}

function PersonLine({ person, showCompany, onOpen }: { person: RootPerson; showCompany?: boolean; onOpen: () => void }) {
  const locked = person.lockedUntil != null;
  return (
    <button type="button" className="root-person" onClick={onOpen} data-root-person={person.id}>
      <span className="root-person-avatar" aria-hidden="true">
        <UserRound className="h-4 w-4" />
      </span>
      <span className="root-person-main">
        <span className="root-person-name">{person.name || "Без имени"}</span>
        <span className="root-person-meta">
          {showCompany && <span>{person.companyName ? `«${person.companyName}»` : "без компании"}</span>}
          <span>{roleLabel(person)}</span>
          {person.position && <span>{person.position}</span>}
          {person.phone && <span>{formatPhoneDisplay(person.phone)}</span>}
          {!person.hasPin && <span className="root-person-flag">без PIN</span>}
          {locked && <span className="root-person-flag is-danger">вход закрыт</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Поиск человека по телефону, имени, почте или id во всех компаниях. */
export function RootPeopleSearch({ onOpen }: { onOpen: (person: RootPerson) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const ready = q.replace(/^#/, "").length >= 2;
  const query = useQuery<{ users: RootPerson[] }>({
    queryKey: [...ROOT_USERS_KEY, "search", q],
    queryFn: ({ signal }) => getJson(`/api/root/users?q=${encodeURIComponent(q)}`, signal),
    enabled: ready,
    placeholderData: (prev) => prev,
  });

  return (
    <section className="content-panel" aria-labelledby="root-people-title">
      <h2 id="root-people-title" className="text-lg font-semibold mb-1">
        Люди
      </h2>
      <p className="text-sm text-muted-foreground mb-3">Телефон, имя, почта или #id — во всех компаниях.</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например, 999 100 11 01 или Лариса"
          aria-label="Найти человека"
          className="pl-9"
        />
      </div>
      {ready && (
        <div className="mt-3" aria-live="polite">
          {query.isLoading ? (
            <ListSkeleton rows={2} />
          ) : query.isError ? (
            <QueryError onRetry={() => void query.refetch()} />
          ) : query.data?.users.length ? (
            <div className="root-people">
              {query.data.users.map((p) => (
                <PersonLine key={p.id} person={p} showCompany onOpen={() => onOpen(p)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Никого не нашли.</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Окно «Люди компании»: список и правка человека. Без компании (companyId
 * null) — сразу правка найденного человека, без выбора роли.
 */
export function RootPeopleDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  initialPerson,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number | null;
  companyName: string | null;
  initialPerson?: RootPerson | null;
}) {
  const [selected, setSelected] = useState<number | null>(initialPerson?.id ?? null);
  useEffect(() => {
    if (open) setSelected(initialPerson?.id ?? null);
  }, [open, initialPerson?.id]);
  const query = useQuery<CompanyPeople>({
    queryKey: [...ROOT_USERS_KEY, "company", companyId],
    queryFn: ({ signal }) => getJson(`/api/root/companies/${companyId}/users`, signal),
    enabled: open && companyId != null,
  });
  const people = query.data?.users ?? [];
  const person = selected != null ? people.find((p) => p.id === selected) ?? (initialPerson?.id === selected ? initialPerson : null) : null;
  const backToList = companyId != null ? () => setSelected(null) : () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-root-people-dialog>
        <DialogHeader>
          <DialogTitle>{person ? person.name || "Без имени" : `Люди · ${companyName ?? ""}`}</DialogTitle>
          <DialogDescription>
            {person
              ? `${person.companyName ? `«${person.companyName}»` : "Без компании"} · #${person.id} · с ${shortDate(person.createdAt)}`
              : "Нажмите на человека, чтобы поменять данные, роль или PIN."}
          </DialogDescription>
        </DialogHeader>
        {person ? (
          <RootPersonEditor
            key={person.id}
            person={person}
            roles={query.data?.roles ?? []}
            canSetRole={companyId != null}
            onBack={backToList}
            backLabel={companyId != null ? "Все люди компании" : "Закрыть"}
          />
        ) : companyId == null ? null : query.isLoading ? (
          <ListSkeleton rows={4} />
        ) : query.isError ? (
          <QueryError onRetry={() => void query.refetch()} />
        ) : people.length ? (
          <div className="root-people">
            {people.map((p) => (
              <PersonLine key={p.id} person={p} onOpen={() => setSelected(p.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">В компании пока никого нет.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type RoleValue = "admin" | "employee" | `role:${number}`;
const roleValueOf = (p: RootPerson): RoleValue => (p.isAdmin ? "admin" : p.roleId != null ? `role:${p.roleId}` : "employee");
const roleBody = (v: RoleValue): "admin" | number | null => (v === "admin" ? "admin" : v === "employee" ? null : Number(v.slice(5)));

function RootPersonEditor({
  person,
  roles,
  canSetRole,
  onBack,
  backLabel,
}: {
  person: RootPerson;
  roles: Array<{ id: number; name: string }>;
  canSetRole: boolean;
  onBack: () => void;
  backLabel: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [current, setCurrent] = useState(person);
  useEffect(() => setCurrent(person), [person]);

  const initial = {
    name: current.name ?? "",
    phone: current.phone ?? "+7",
    position: current.position ?? "",
    email: current.email ?? "",
    role: roleValueOf(current),
  };
  const [form, setForm] = useState(initial);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  // Форма сбрасывается, только когда поменялись сохранённые данные: снятие
  // блокировки или выход на устройствах не стирают несохранённую правку.
  useEffect(() => {
    setForm({
      name: current.name ?? "",
      phone: current.phone ?? "+7",
      position: current.position ?? "",
      email: current.email ?? "",
      role: roleValueOf(current),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.name, current.phone, current.position, current.email, current.isAdmin, current.roleId]);

  const refresh = async (next?: RootPerson) => {
    if (next) setCurrent(next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ROOT_USERS_KEY }),
      queryClient.invalidateQueries({ queryKey: ["root-companies"] }),
    ]);
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await apiRequest(method, `/api/root/users/${current.id}${path}`, body);
    return res.json();
  };
  const fail = (err: Error) => toast({ title: "Не получилось", description: err.message, variant: "destructive" });

  const changes: Record<string, unknown> = {};
  if (form.name.trim() !== (current.name ?? "")) changes.name = form.name;
  if (form.phone !== (current.phone ?? "+7")) changes.phone = form.phone;
  if (form.position.trim() !== (current.position ?? "")) changes.position = form.position;
  if (form.email.trim().toLowerCase() !== (current.email ?? "")) changes.email = form.email;
  if (canSetRole && form.role !== roleValueOf(current)) changes.role = roleBody(form.role);
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => call("PATCH", "", changes),
    onSuccess: async (data: { user: RootPerson }) => {
      setFieldError(null);
      await refresh(data.user);
      toast({ title: "Сохранено" });
    },
    onError: (err: Error) => {
      const field = err instanceof ApiError ? (err.body?.field as string | undefined) : undefined;
      setFieldError({ field, message: err.message });
    },
  });
  const useAction = (method: string, path: string, done: string) =>
    useMutation({
      mutationFn: () => call(method, path),
      onSuccess: async (data: { user: RootPerson; ended?: number }) => {
        await refresh(data.user);
        toast({ title: done, description: data.ended != null ? `Завершено сессий: ${data.ended}` : undefined });
      },
      onError: fail,
    });
  const clearPin = useAction("DELETE", "/pin", "PIN сброшен — придумает при входе");
  const unlock = useAction("POST", "/unlock", "Блокировка снята");
  const unlinkTg = useAction("POST", "/telegram/unlink", "Telegram отвязан");
  const logout = useAction("POST", "/logout", "Вышел на всех устройствах");
  const remove = useMutation({
    mutationFn: () => call("DELETE", ""),
    onSuccess: async () => {
      toast({ title: `«${current.name || "Без имени"}» удалён(а)` });
      await refresh();
      onBack();
    },
    onError: fail,
  });

  const [pinOpen, setPinOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorFor = (field: string) =>
    fieldError && fieldError.field === field ? (
      <p className="text-xs text-destructive mt-1" role="alert">
        {fieldError.message}
      </p>
    ) : null;

  if (current.isRoot) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Root-аккаунт здесь не меняется — свой аккаунт правьте в «Моём аккаунте».</p>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    );
  }

  const busy = save.isPending || clearPin.isPending || unlock.isPending || unlinkTg.isPending || logout.isPending || remove.isPending;

  return (
    <div className="root-person-editor">
      <button type="button" className="root-person-back" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </button>

      <form
        className="root-person-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (dirty) save.mutate();
        }}
      >
        <label className="root-field">
          <span>Имя</span>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={255} />
          {errorFor("name")}
        </label>
        <label className="root-field">
          <span>Телефон</span>
          {/* Пустой className — обычный вид поля, а не крупный, как на экране входа. */}
          <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} className="" />
          {errorFor("phone")}
        </label>
        <label className="root-field">
          <span>Должность</span>
          <Input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} maxLength={120} placeholder="Например, повар" />
          {errorFor("position")}
        </label>
        <label className="root-field">
          <span>Почта</span>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Не указана" />
          {errorFor("email")}
        </label>
        {canSetRole && (
          <label className="root-field">
            <span>Роль</span>
            <select
              className="reports-select w-full"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as RoleValue }))}
            >
              <option value="admin">Администратор — всё</option>
              {roles.map((r) => (
                <option key={r.id} value={`role:${r.id}`}>
                  {r.name}
                </option>
              ))}
              <option value="employee">Сотрудник — свои задачи</option>
            </select>
            {errorFor("role")}
          </label>
        )}
        {fieldError && !["name", "phone", "position", "email", "role"].includes(fieldError.field ?? "") && (
          <p className="text-sm text-destructive" role="alert">
            {fieldError.message}
          </p>
        )}
        <div className="root-person-save">
          <Button type="submit" size="sm" disabled={!dirty || busy} loading={save.isPending} loadingLabel="Сохраняем…">
            Сохранить
          </Button>
        </div>
      </form>

      <div className="root-person-block">
        <p className="root-person-block-title">Вход</p>
        <p className="text-sm text-muted-foreground">
          {current.hasPin ? `PIN задан${current.pinUpdatedAt ? `, обновлён ${shortDate(current.pinUpdatedAt)}` : ""}.` : "PIN не задан — придумает сам при входе."}
          {current.lockedUntil != null && (
            <span className="text-destructive"> Вход закрыт до {time(current.lockedUntil)} после {current.failedAttempts} неверных PIN.</span>
          )}
        </p>
        {pinOpen ? (
          <RootPinForm person={current} onDone={() => setPinOpen(false)} onSaved={(next) => void refresh(next)} />
        ) : (
          <div className="root-person-actions">
            <Button type="button" size="sm" variant="outline" onClick={() => setPinOpen(true)} disabled={busy}>
              <KeyRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Задать PIN
            </Button>
            {current.hasPin && (
              <Button type="button" size="sm" variant="outline" onClick={() => clearPin.mutate()} disabled={busy} loading={clearPin.isPending}>
                Сбросить PIN
              </Button>
            )}
            {current.lockedUntil != null && (
              <Button type="button" size="sm" variant="outline" onClick={() => unlock.mutate()} disabled={busy} loading={unlock.isPending}>
                <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Снять блокировку
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => logout.mutate()} disabled={busy} loading={logout.isPending}>
              <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Выйти на всех устройствах
            </Button>
          </div>
        )}
      </div>

      <div className="root-person-block">
        <p className="root-person-block-title">Telegram</p>
        {current.telegramLinked ? (
          <div className="root-person-actions">
            <span className="text-sm text-muted-foreground">
              <Send className="mr-1 inline h-4 w-4" aria-hidden="true" />
              Привязан{current.telegramUsername ? ` — @${current.telegramUsername}` : ""}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => unlinkTg.mutate()} disabled={busy} loading={unlinkTg.isPending}>
              Отвязать
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Не привязан.</p>
        )}
      </div>

      <div className="root-person-block is-danger">
        {confirmDelete ? (
          <div className="space-y-2" role="alert">
            <p className="text-sm">
              Удалить «{current.name || "Без имени"}» навсегда? Его задачи останутся без исполнителя, вход и уведомления закроются.
            </p>
            <div className="root-person-actions">
              <Button type="button" size="sm" variant="destructive" onClick={() => remove.mutate()} loading={remove.isPending} disabled={busy}>
                Удалить навсегда
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Удалить человека
          </Button>
        )}
      </div>
    </div>
  );
}

function RootPinForm({ person, onDone, onSaved }: { person: RootPerson; onDone: () => void; onSaved: (next: RootPerson) => void }) {
  const [pin, setPin] = useState(() => generatePin());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const setPinMutation = useMutation({
    mutationFn: async (value: string) => (await apiRequest("POST", `/api/root/users/${person.id}/pin`, { pin: value })).json(),
    onSuccess: (data: { user: RootPerson }, value) => {
      setSaved(value);
      onSaved(data.user);
    },
    onError: (err: Error) => setError(err.message),
  });
  if (saved) return <PinShareNote phone={person.phone} pin={saved} onDone={onDone} />;
  const errorId = `root-pin-error-${person.id}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = pinProblem(pin);
        if (problem) return setError(problem);
        setError(null);
        setPinMutation.mutate(pin);
      }}
    >
      <label htmlFor={`root-pin-${person.id}`} className="block text-xs text-muted-foreground">
        Новый PIN — снимет и блокировку
      </label>
      <AdminPinField
        id={`root-pin-${person.id}`}
        value={pin}
        onChange={(v) => {
          setPin(v);
          setError(null);
        }}
        disabled={setPinMutation.isPending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoFocus
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="root-person-actions">
        <Button type="submit" size="sm" loading={setPinMutation.isPending} loadingLabel="Сохраняем…">
          Сохранить PIN
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={setPinMutation.isPending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
