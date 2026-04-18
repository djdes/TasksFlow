"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { getTelegramWebApp } from "./_components/telegram-web-app";
import { MiniCard } from "./_components/mini-card";

type LocalState =
  | { kind: "init" }
  | { kind: "no-telegram" }
  | { kind: "error"; message: string };

type HomeData = {
  user: { name: string; organizationName: string };
  today: Array<{ code: string; name: string; description: string | null }>;
  all: Array<{ code: string; name: string; description: string | null; filled: boolean }>;
};

/**
 * Mini App root: "На сегодня" home.
 *
 * Auth bootstrap: on first `unauthenticated` tick we read
 * `Telegram.WebApp.initData` and hand it to `signIn("telegram", ...)`. Once
 * NextAuth flips to `authenticated` we fetch `/api/mini/home` which returns
 * the user's pending-today journals + the full ACL-filtered catalogue in a
 * single payload.
 */
export default function MiniHomePage() {
  const { data: session, status } = useSession();
  const [localState, setLocalState] = useState<LocalState>({ kind: "init" });
  const [home, setHome] = useState<HomeData | null>(null);
  const signInStarted = useRef(false);
  const fetchStarted = useRef(false);

  useEffect(() => {
    if (status !== "unauthenticated" || signInStarted.current) return;

    const webApp = getTelegramWebApp();
    if (!webApp || !webApp.initData) {
      signInStarted.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalState({ kind: "no-telegram" });
      return;
    }
    try {
      webApp.ready();
      webApp.expand();
    } catch {
      /* older TG clients don't expose every method */
    }
    signInStarted.current = true;
    void (async () => {
      const result = await signIn("telegram", {
        initData: webApp.initData,
        redirect: false,
      });
      if (!result || result.error) {
        setLocalState({
          kind: "error",
          message: result?.error || "Сессия Telegram не получена",
        });
      }
    })();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || fetchStarted.current) return;
    fetchStarted.current = true;
    void (async () => {
      try {
        const resp = await fetch("/api/mini/home", { cache: "no-store" });
        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({ error: "" }))) as {
            error?: string;
          };
          throw new Error(body.error || `HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as HomeData;
        setHome(data);
      } catch (err) {
        setLocalState({
          kind: "error",
          message: err instanceof Error ? err.message : "Не удалось загрузить данные",
        });
      }
    })();
  }, [status]);

  if (localState.kind === "no-telegram") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-semibold">Откройте внутри Telegram</h1>
        <p className="text-sm text-slate-500">
          Рабочий кабинет сотрудника доступен только как Mini App в Telegram.
          Попросите у руководителя персональную ссылку-приглашение.
        </p>
      </div>
    );
  }
  if (localState.kind === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-semibold">Не получилось войти</h1>
        <p className="text-sm text-red-500">{localState.message}</p>
      </div>
    );
  }
  if (status !== "authenticated" || !home) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Загружаем…
      </div>
    );
  }

  const displayName = session?.user?.name ?? home.user.name;

  return (
    <div className="flex flex-1 flex-col gap-6 pb-24">
      <header className="pt-2">
        <h1 className="text-[22px] font-semibold text-slate-900">
          Привет, {displayName}!
        </h1>
        {home.user.organizationName ? (
          <p className="mt-0.5 text-[13px] text-slate-500">
            {home.user.organizationName}
          </p>
        ) : null}
      </header>

      {home.today.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
            На сегодня · {home.today.length}
          </h2>
          {home.today.map((t) => (
            <MiniCard
              key={t.code}
              href={`/mini/journals/${t.code}`}
              title={t.name}
              subtitle={t.description}
              status={{ kind: "todo", label: "не заполнено" }}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-[14px] text-emerald-700">
          Все журналы на сегодня заполнены. Молодец!
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
          Все мои журналы
        </h2>
        {home.all.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-[14px] text-slate-500">
            Руководитель ещё не дал доступ ни к одному журналу.
          </div>
        ) : (
          home.all.map((t) => (
            <MiniCard
              key={t.code}
              href={`/mini/journals/${t.code}`}
              title={t.name}
              subtitle={t.description}
              status={
                t.filled
                  ? { kind: "done", label: "заполнено" }
                  : { kind: "idle", label: "—" }
              }
            />
          ))
        )}
      </section>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link
          href="/mini"
          className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-slate-900"
        >
          Главная
        </Link>
        <Link
          href="/mini/shift"
          className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-slate-500"
        >
          Смена
        </Link>
        <Link
          href="/mini/me"
          className="flex flex-col items-center gap-0.5 text-[11px] font-medium text-slate-500"
        >
          Профиль
        </Link>
      </nav>
    </div>
  );
}
