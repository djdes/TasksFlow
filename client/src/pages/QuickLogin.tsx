import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthShell } from "@/components/AuthShell";
import { PinInput } from "@/components/PinInput";
import { PageSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { QUICK_LOGIN_PATH, type QuickLoginDirectory } from "@shared/quick-login";

export default function QuickLogin() {
  const [, params] = useRoute("/quick-login/:token");
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<QuickLoginDirectory["users"][number] | null>(null);
  const [pin, setPin] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [logoutError, setLogoutError] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const endpoint = `${QUICK_LOGIN_PATH}/by-token/${encodeURIComponent(params?.token ?? "")}`;
  const directory = useQuery<QuickLoginDirectory>({
    queryKey: [QUICK_LOGIN_PATH, params?.token],
    queryFn: async () => (await apiRequest("GET", endpoint)).json(),
    retry: false,
  });
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)));
    tick();
    if (!lockedUntil) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);
  const login = useMutation({
    mutationFn: async () => { await apiRequest("POST", `${endpoint}/login`, { userId: selected!.id, pin }); },
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      await qc.refetchQueries({ queryKey: ["auth", "me"] });
      setLocation("/dashboard");
    },
    onError: (error) => {
      setPin("");
      const seconds = error instanceof ApiError ? Number(error.body?.retryAfterSec) : 0;
      if (seconds > 0) setLockedUntil(Date.now() + seconds * 1000);
      else requestAnimationFrame(() => pinRef.current?.focus());
    },
  });
  const changeUser = async () => {
    setLeaving(true);
    setLogoutError(false);
    try { await logout(); qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" }); }
    catch { setLogoutError(true); }
    finally { setLeaving(false); }
  };
  const choose = (person: QuickLoginDirectory["users"][number] | null) => {
    setSelected(person); setPin(""); setLockedUntil(0); login.reset();
  };
  const filtered = directory.data?.users.filter((person) => `${person.name} ${person.position ?? ""}`.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"))) ?? [];

  return <AuthShell title={selected ? "Введите PIN" : "Вход в организацию"} subtitle={directory.data?.companyName}>
    {directory.isPending ? <PageSkeleton /> : directory.isError && !directory.data
      ? <><QueryError message={directory.error.message} onRetry={() => { void directory.refetch(); }} /><a className="login-link" href="/login">Войти по телефону</a></>
      : user ? <div className="space-y-4">
        <p className="text-sm">Вы вошли как <strong>{user.name || "сотрудник"}</strong>.</p>
        <Button className="w-full" onClick={() => setLocation("/dashboard")}>Открыть мои задачи</Button>
        <Button variant="outline" className="w-full" onClick={() => { void changeUser(); }} disabled={leaving}>{leaving ? "Выходим…" : "Войти другим сотрудником"}</Button>
        {logoutError && <p role="alert" className="text-sm text-destructive">Не удалось выйти. Повторите попытку.</p>}
      </div> : selected ? <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (pin.length === 4 && !remaining && !login.isPending) login.mutate(); }}>
        <p className="text-center font-semibold break-words">{selected.name}</p>
        {!selected.hasPin ? <p role="status" className="text-sm text-muted-foreground">PIN ещё не задан. Обратитесь к руководителю, чтобы он задал PIN для входа.</p> : <>
          <PinInput value={pin} onChange={(value) => { setPin(value); if (login.isError) login.reset(); }} label="Ваш PIN" autoFocus inputRef={pinRef} disabled={login.isPending || remaining > 0} invalid={login.isError} describedBy={login.isError ? "quick-pin-error" : undefined} />
          {login.isError && <p id="quick-pin-error" role="alert" className="text-sm text-destructive">{login.error.message}</p>}
          {remaining > 0 && <p role="status" className="text-sm text-muted-foreground">Повторите через {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>}
          <Button type="submit" className="w-full" disabled={pin.length !== 4 || login.isPending || remaining > 0}>{login.isPending ? "Входим…" : "Войти к задачам"}</Button>
        </>}
        <Button type="button" variant="ghost" className="w-full" disabled={login.isPending} onClick={() => choose(null)}>Выбрать другого сотрудника</Button>
      </form> : <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="employee-search">Найдите себя</Label><Input id="employee-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или должность" autoComplete="off" /></div>
        {!directory.data?.users.length ? <p className="text-sm text-muted-foreground">В организации пока нет сотрудников. Обратитесь к руководителю.</p>
          : !filtered.length ? <p role="status" className="text-sm text-muted-foreground">Никого не нашли. Проверьте имя или очистите поиск.</p>
          : <ul className="divide-y divide-border">{filtered.map((person) => <li key={person.id}>
            <button type="button" className="w-full rounded-lg px-3 py-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => choose(person)}>
              <span className="block font-semibold break-words">{person.name} <span className="text-xs font-normal text-muted-foreground">#{person.id}</span></span>
              {person.position && <span className="block text-sm text-muted-foreground break-words">{person.position}</span>}
            </button>
          </li>)}</ul>}
        <a href="/login" className="login-link">Войти по телефону</a>
      </div>}
  </AuthShell>;
}
