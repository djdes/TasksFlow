import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Reusable list-style card for Mini App home + journal entries.
 *
 * Large tap target (64–88 px tall), single-row layout, optional status pill
 * on the right. Deliberately not tied to the dashboard's glossy card style —
 * Mini App lives inside TG's own chrome and needs to feel like a list, not
 * a dashboard widget.
 */
export function MiniCard({
  href,
  title,
  subtitle,
  status,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  status?: { kind: "todo" | "done" | "idle"; label: string };
}) {
  const statusColors =
    status?.kind === "todo"
      ? "bg-red-50 text-red-600 ring-red-200"
      : status?.kind === "done"
        ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-slate-900">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[12px] text-slate-500">
            {subtitle}
          </div>
        ) : null}
      </div>
      {status ? (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusColors}`}
        >
          {status.label}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-active:translate-x-0.5" />
    </Link>
  );
}
