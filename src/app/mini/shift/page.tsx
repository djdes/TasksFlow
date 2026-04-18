import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { getServerSession } from "@/lib/server-session";
import { getUserRoleLabel } from "@/lib/user-roles";

/**
 * Shift screen for the Mini App.
 *
 * v1 is intentionally minimal: a list of active coworkers in the caller's
 * organisation, grouped by job position where available, so the cook/waiter
 * can see "who's with me today". Real time-based shift windows come later —
 * the schema doesn't carry shift rosters yet (see design doc §5.5).
 */
export default async function MiniShiftPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/mini");

  const orgId = getActiveOrgId(session);
  const coworkers = await db.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      archivedAt: null,
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      positionTitle: true,
      jobPosition: { select: { name: true } },
    },
  });

  const my = coworkers.find((c) => c.id === session.user.id);

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
        <h1 className="text-[20px] font-semibold text-slate-900">Смена</h1>
        {my ? (
          <p className="mt-0.5 text-[13px] text-slate-500">
            Вы:{" "}
            <span className="font-medium text-slate-700">
              {my.jobPosition?.name || my.positionTitle || getUserRoleLabel(my.role)}
            </span>
          </p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Сегодня работают · {coworkers.length}
        </h2>
        {coworkers.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-[14px] text-slate-500">
            В организации пока нет активных сотрудников.
          </div>
        ) : (
          <ul className="space-y-2">
            {coworkers.map((c) => {
              const title =
                c.jobPosition?.name ||
                c.positionTitle ||
                getUserRoleLabel(c.role);
              const isMe = c.id === session.user.id;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600">
                    {(c.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-slate-900">
                      {c.name}
                      {isMe ? (
                        <span className="ml-1.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          вы
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[12px] text-slate-500">
                      {title}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
