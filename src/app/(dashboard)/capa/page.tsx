import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

const STATUS_INFO: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: "Открыто", bg: "#fff4f2", fg: "#a13a32" },
  investigating: { label: "Расследование", bg: "#fff8eb", fg: "#b25f00" },
  corrective_action: { label: "Корректировка", bg: "#eef1ff", fg: "#3848c7" },
  verification: { label: "Верификация", bg: "#f5f0ff", fg: "#5d3ab3" },
  closed: { label: "Закрыто", bg: "#ecfdf5", fg: "#116b2a" },
};

const PRIORITY_INFO: Record<string, { label: string; bg: string; fg: string }> = {
  critical: { label: "Критический", bg: "#a13a32", fg: "#ffffff" },
  high: { label: "Высокий", bg: "#d95f2a", fg: "#ffffff" },
  medium: { label: "Средний", bg: "#d9a02a", fg: "#ffffff" },
  low: { label: "Низкий", bg: "#9b9fb3", fg: "#ffffff" },
};

const CATEGORY_LABELS: Record<string, string> = {
  temperature: "Температура",
  hygiene: "Гигиена",
  packaging: "Упаковка",
  quality: "Качество",
  process: "Процесс",
  equipment: "Оборудование",
  other: "Другое",
};

function isSlaBreached(
  ticket: { createdAt: Date; slaHours: number; status: string },
  now: Date
): boolean {
  if (ticket.status === "closed") return false;
  const slaDeadline = new Date(
    ticket.createdAt.getTime() + ticket.slaHours * 60 * 60 * 1000
  );
  return now.getTime() > slaDeadline.getTime();
}

export default async function CapaPage() {
  const session = await requireAuth();

  const tickets: Awaited<ReturnType<typeof db.capaTicket.findMany>> =
    await db.capaTicket.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });

  const statuses = ["open", "investigating", "corrective_action", "verification", "closed"];
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  type Ticket = (typeof tickets)[number];
  const weekTickets = tickets.filter(
    (t: Ticket) => t.createdAt >= weekAgo && t.status !== "closed"
  );

  const openCount = tickets.filter((t: Ticket) => t.status !== "closed").length;
  const criticalCount = tickets.filter(
    (t: Ticket) => t.priority === "critical" && t.status !== "closed"
  ).length;
  const slaBreached = tickets.filter((t: Ticket) => isSlaBreached(t, now)).length;
  const closedWeek = tickets.filter(
    (t: Ticket) => t.status === "closed" && t.closedAt && t.closedAt >= weekAgo
  ).length;
  const hasCritical = weekTickets.some((t: Ticket) => t.priority === "critical");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[#0b1024] sm:text-[32px]">
            CAPA
          </h1>
          <p className="mt-1.5 text-[14px] text-[#6f7282]">
            Корректирующие и предупреждающие действия
          </p>
        </div>
        <Link
          href="/capa/new"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0] sm:w-auto sm:justify-start sm:self-start"
        >
          <Plus className="size-4" />
          Новый CAPA
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Открыто"
          value={openCount}
          tone={hasCritical ? "warn" : "default"}
        />
        <StatCard label="Критических" value={criticalCount} tone="critical" />
        <StatCard label="SLA нарушено" value={slaBreached} tone="warn" />
        <StatCard label="Закрыто за неделю" value={closedWeek} tone="success" />
      </div>

      {/* Kanban columns — horizontal scroll on mobile */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="grid min-w-[820px] grid-cols-5 gap-4 lg:min-w-0">
          {statuses.map((status) => {
            const statusTickets = tickets.filter((t: Ticket) => t.status === status);
            const info = STATUS_INFO[status];

            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider"
                    style={{ backgroundColor: info.bg, color: info.fg }}
                  >
                    {info.label}
                  </span>
                  <span className="text-[12px] text-[#9b9fb3] tabular-nums">
                    {statusTickets.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {statusTickets.slice(0, 10).map((ticket: Ticket) => {
                    const pInfo = PRIORITY_INFO[ticket.priority] ?? PRIORITY_INFO.low;
                    const breached = isSlaBreached(ticket, now);

                    return (
                      <Link
                        key={ticket.id}
                        href={`/capa/${ticket.id}`}
                        className={`block rounded-2xl border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-[#5566f6]/40 hover:shadow-[0_12px_28px_-16px_rgba(85,102,246,0.22)] ${
                          breached ? "border-[#ffd2cd]" : "border-[#ececf4]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-[13px] font-medium text-[#0b1024]">
                            {ticket.title}
                          </p>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: pInfo.bg, color: pInfo.fg }}
                          >
                            {pInfo.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6f7282]">
                          <span>
                            {CATEGORY_LABELS[ticket.category] || ticket.category}
                          </span>
                          {breached && (
                            <span className="flex items-center gap-0.5 text-[#a13a32]">
                              <Clock className="size-3" />
                              SLA
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {statusTickets.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] px-3 py-5 text-center text-[12px] text-[#9b9fb3]">
                      Пусто
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "critical" | "success";
}) {
  const valueColor =
    tone === "critical"
      ? "text-[#a13a32]"
      : tone === "warn"
      ? "text-[#b25f00]"
      : tone === "success"
      ? "text-[#116b2a]"
      : "text-[#0b1024]";
  return (
    <div className="rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
      <div className="text-[12px] font-medium text-[#6f7282]">{label}</div>
      <div className={`mt-1 text-[28px] font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}
