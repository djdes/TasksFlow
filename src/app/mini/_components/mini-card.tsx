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
      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 transition active:scale-[0.98] sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium leading-5 text-slate-900">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-[12px] leading-4 text-slate-500">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-2 self-stretch sm:items-center">
        {status ? (
          <span
            className={`max-w-[110px] rounded-full px-2 py-0.5 text-right text-[11px] font-medium leading-4 ring-1 ${statusColors}`}
          >
            {status.label}
          </span>
        ) : null}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400 transition group-active:translate-x-0.5 sm:mt-0" />
      </div>
    </Link>
  );
}
