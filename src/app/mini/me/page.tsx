"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { ArrowLeft, LogOut, Unlink } from "lucide-react";

/**
 * Profile screen for the Mini App.
 *
 * Read-only except for two destructive actions:
 *   - "Выйти" — drop the NextAuth session cookie; next /mini visit must
 *     re-verify initData. Useful when the bound employee changes devices.
 *   - "Отвязать Telegram" — also clears `User.telegramChatId` so even with
 *     valid initData on this device we no longer have a User mapping and
 *     the user must re-accept a fresh invite.
 */
export default function MiniMePage() {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState<"none" | "signout" | "unlink">("none");
  const [error, setError] = useState<string | null>(null);

  if (status !== "authenticated") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Загружаем…
      </div>
    );
  }

  const u = session.user;

  async function handleUnlink() {
    setError(null);
    setBusy("unlink");
    try {
      const resp = await fetch("/api/mini/unlink-tg", { method: "POST" });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      await signOut({ redirect: false });
      window.location.href = "/mini";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отвязать");
      setBusy("none");
    }
  }

  async function handleSignOut() {
    setBusy("signout");
    await signOut({ redirect: false });
    window.location.href = "/mini";
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-24">
      <Link
        href="/mini"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500"
      >
        <ArrowLeft className="size-4" />
        На главную
      </Link>

      <header className="px-1">
        <h1 className="text-[20px] font-semibold text-slate-900">Профиль</h1>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <dl className="space-y-3 text-[14px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Имя</dt>
            <dd className="font-medium text-slate-900">{u.name || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Организация</dt>
            <dd className="font-medium text-slate-900">
              {u.organizationName || "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Роль</dt>
            <dd className="font-medium text-slate-900">{u.role || "—"}</dd>
          </div>
          {u.email && !u.email.endsWith("@invite.local") ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{u.email}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {error}
        </div>
      ) : null}

      <section className="space-y-2">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy !== "none"}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-[14px] font-medium text-slate-900 active:scale-[0.98] disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2">
            <LogOut className="size-4 text-slate-500" />
            Выйти
          </span>
          <span className="text-[11px] text-slate-500">сессия сбросится</span>
        </button>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={busy !== "none"}
          className="flex w-full items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-left text-[14px] font-medium text-red-700 active:scale-[0.98] disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-2">
            <Unlink className="size-4" />
            Отвязать Telegram
          </span>
          <span className="text-[11px] text-red-700/70">
            {busy === "unlink" ? "…" : "нужен новый инвайт"}
          </span>
        </button>
      </section>
    </div>
  );
}
