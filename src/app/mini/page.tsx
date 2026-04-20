"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { MiniCard } from "./_components/mini-card";
import { getTelegramWebApp } from "./_components/telegram-web-app";

type LocalState =
  | { kind: "init" }
  | { kind: "no-telegram" }
  | { kind: "error"; message: string };

type HomeUser = {
  name: string;
  organizationName: string;
};

type HomeJournal = {
  code: string;
  name: string;
  description: string | null;
  filled: boolean;
};

type StaffHomeData = {
  mode: "staff";
  user: HomeUser;
  now: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    href: string;
  }>;
  all: HomeJournal[];
};

type ManagerHomeData = {
  mode: "manager";
  user: HomeUser;
  summary: {
    total: number;
    pending: number;
    done: number;
    employeesWithPending: number;
  };
  all: HomeJournal[];
};

type HomeData = StaffHomeData | ManagerHomeData;

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
  const fullAccess = hasFullWorkspaceAccess({
    role: session?.user?.role,
    isRoot: session?.user?.isRoot,
  });
  const showStaffNow = home.mode === "staff" && home.now.length > 0;
  const showStaffDoneBanner = home.mode === "staff" && home.now.length === 0;

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

      {showStaffNow ? (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
            На сейчас · {home.now.length}
          </h2>
          {home.now.map((item) => (
            <MiniCard
              key={item.id}
              href={item.href}
              title={item.name}
              subtitle={item.description}
              status={{ kind: "todo", label: "нужно заполнить" }}
            />
          ))}
        </section>
      ) : null}

      {showStaffDoneBanner ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-[14px] text-emerald-700">
          Все журналы на сегодня заполнены. Молодец!
        </section>
      ) : null}

      {home.mode === "manager" ? (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Сводка на сегодня
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Открыто: {home.summary.pending} · Выполнено: {home.summary.done}
          </p>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Сотрудников с открытыми задачами: {home.summary.employeesWithPending}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wider text-slate-500">
          Все мои журналы
        </h2>
        {home.all.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-[14px] text-slate-500">
            Руководитель ещё не дал доступ ни к одному журналу.
          </div>
        ) : (
          home.all.map((journal) => (
            <MiniCard
              key={journal.code}
              href={`/mini/journals/${journal.code}`}
              title={journal.name}
              subtitle={journal.description}
              status={
                journal.filled
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
          {fullAccess ? "Главная" : "Журналы"}
        </Link>
        {fullAccess ? (
          <>
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
          </>
        ) : null}
      </nav>
    </div>
  );
}
