"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";

type NotificationItem = {
  id: string;
  label: string;
  hint?: string;
};

type NotificationRow = {
  id: string;
  title: string;
  linkHref: string | null;
  linkLabel: string | null;
  items: NotificationItem[];
  readAt: string | null;
  createdAt: string;
};

type ApiResponse = {
  unread: NotificationRow[];
  read: NotificationRow[];
  unreadCount: number;
};

function asItems(raw: unknown): NotificationItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      id: typeof v.id === "string" ? v.id : "",
      label: typeof v.label === "string" ? v.label : "",
      hint: typeof v.hint === "string" ? v.hint : undefined,
    }))
    .filter((it) => it.id && it.label);
}

const REFRESH_INTERVAL_MS = 60 * 1000;

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "read">("unread");
  const [data, setData] = useState<ApiResponse>({
    unread: [],
    read: [],
    unreadCount: 0,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as {
        unread: Array<Record<string, unknown>>;
        read: Array<Record<string, unknown>>;
        unreadCount: number;
      };
      const normalise = (rows: Array<Record<string, unknown>>): NotificationRow[] =>
        rows.map((r) => ({
          id: r.id as string,
          title: r.title as string,
          linkHref: (r.linkHref as string | null) ?? null,
          linkLabel: (r.linkLabel as string | null) ?? null,
          items: asItems(r.items),
          readAt: (r.readAt as string | null) ?? null,
          createdAt: r.createdAt as string,
        }));
      setData({
        unread: normalise(j.unread),
        read: normalise(j.read),
        unreadCount: j.unreadCount,
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Poll /api/notifications on mount + every minute. setState inside load
    // happens after an async fetch resolves — not in the effect body itself —
    // so the react-hooks/set-state-in-effect rule's concern (synchronous
    // cascading renders) doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const openPanel = useCallback(() => {
    setOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setOpen(false);
    setSelected(new Set());
  }, []);

  const rows = tab === "unread" ? data.unread : data.read;
  const headerCount = data.unreadCount;

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedInView = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  async function markReadSelected() {
    if (selectedInView.length === 0) {
      toast.info("Отметьте уведомления слева, чтобы прочитать.");
      return;
    }
    await Promise.all(
      selectedInView.map((r) =>
        fetch(`/api/notifications/${r.id}`, { method: "PATCH" })
      )
    );
    setSelected(new Set());
    await load();
  }

  async function removeSelected() {
    if (selectedInView.length === 0) {
      toast.info("Отметьте уведомления, чтобы удалить.");
      return;
    }
    await Promise.all(
      selectedInView.map((r) =>
        fetch(`/api/notifications/${r.id}`, { method: "DELETE" })
      )
    );
    setSelected(new Set());
    await load();
  }

  async function removeAll() {
    if (!confirm("Удалить все уведомления? Это не отменить.")) return;
    await fetch("/api/notifications", { method: "DELETE" });
    setSelected(new Set());
    await load();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Уведомления"
        onClick={() => (open ? closePanel() : openPanel())}
        className="relative inline-flex size-9 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-[#dcdfed] hover:bg-[#f5f6ff] hover:text-[#5566f6]"
      >
        <Bell className="size-4" />
        {headerCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] font-semibold text-white">
            {headerCount > 99 ? "99+" : headerCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-end bg-[#0b1024]/15 p-4 pt-20 sm:p-8 sm:pt-24"
          onClick={closePanel}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border border-[#ececf4] bg-white shadow-[0_30px_80px_-20px_rgba(11,16,36,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="flex items-center justify-between border-b border-[#ececf4] px-6 py-4">
              <div className="flex items-center gap-2 text-[22px] font-semibold tracking-[-0.01em]">
                <span>Уведомления</span>
                {headerCount > 0 && (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#ff3b30] text-[12px] font-semibold text-white">
                    {headerCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={closePanel}
                className="flex size-8 items-center justify-center rounded-xl text-[#6f7282] transition-colors hover:bg-[#f5f6ff] hover:text-[#0b1024]"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* TABS */}
            <div className="flex gap-6 border-b border-[#ececf4] px-6">
              <button
                type="button"
                onClick={() => setTab("unread")}
                className={`relative py-3 text-[15px] font-medium transition-colors ${
                  tab === "unread" ? "text-[#0b1024]" : "text-[#9b9fb3]"
                }`}
              >
                Новые
                {tab === "unread" && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#5566f6]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("read")}
                className={`relative py-3 text-[15px] font-medium transition-colors ${
                  tab === "read" ? "text-[#0b1024]" : "text-[#9b9fb3]"
                }`}
              >
                Прочитанные
                {tab === "read" && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#5566f6]" />
                )}
              </button>
            </div>

            {/* ACTIONS */}
            {rows.length > 0 && (
              <div className="flex flex-wrap gap-2 px-6 pt-4">
                {tab === "unread" && (
                  <button
                    type="button"
                    onClick={markReadSelected}
                    className="rounded-xl bg-[#eef1ff] px-4 py-2 text-[13px] font-medium text-[#3848c7] transition-colors hover:bg-[#e3e7ff]"
                  >
                    Прочитать
                  </button>
                )}
                <button
                  type="button"
                  onClick={removeSelected}
                  className="rounded-xl bg-[#fff4f2] px-4 py-2 text-[13px] font-medium text-[#d2453d] transition-colors hover:bg-[#ffe6e1]"
                >
                  Удалить
                </button>
                <button
                  type="button"
                  onClick={removeAll}
                  className="rounded-xl bg-[#fff4f2] px-4 py-2 text-[13px] font-medium text-[#d2453d] transition-colors hover:bg-[#ffe6e1]"
                >
                  Удалить все
                </button>
              </div>
            )}

            {/* BODY */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {rows.length === 0 ? (
                <div className="py-6 text-[14px] text-[#9b9fb3]">
                  {tab === "unread"
                    ? "Нет новых уведомлений."
                    : "Нет прочитанных уведомлений."}
                </div>
              ) : (
                <div className="space-y-4">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="overflow-hidden rounded-2xl border border-[#ececf4] bg-[#fafbff]"
                    >
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-[#dcdfed] text-[#5566f6] focus:ring-[#5566f6]"
                        />
                        <div className="min-w-0 text-[14px] font-medium leading-[1.45] text-[#0b1024]">
                          {row.title}
                          {row.linkHref && row.linkLabel && (
                            <>
                              {" "}
                              <Link
                                href={row.linkHref}
                                className="text-[#5566f6] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.linkLabel}
                              </Link>
                            </>
                          )}
                        </div>
                      </label>
                      {row.items.length > 0 && (
                        <ul className="divide-y divide-[#ececf4] border-t border-[#ececf4]">
                          {row.items.map((item) => (
                            <li
                              key={item.id}
                              onClick={() => toggleSelected(row.id)}
                              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-white/60"
                            >
                              <input
                                type="checkbox"
                                aria-label={item.label}
                                checked={selected.has(row.id)}
                                readOnly
                                tabIndex={-1}
                                className="pointer-events-none size-4 shrink-0 rounded border-[#dcdfed] text-[#5566f6] focus:ring-[#5566f6]"
                              />
                              <span className="text-[14px] text-[#0b1024]">
                                {item.label}
                              </span>
                              {item.hint && (
                                <span className="ml-auto text-[12px] text-[#9b9fb3]">
                                  {item.hint}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
