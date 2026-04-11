import Link from "next/link";
import { AlertTriangle, Plus, Clock } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  open: { label: "Открыто", color: "bg-red-100 text-red-800" },
  investigating: { label: "Расследование", color: "bg-yellow-100 text-yellow-800" },
  corrective_action: { label: "Корректировка", color: "bg-blue-100 text-blue-800" },
  verification: { label: "Верификация", color: "bg-purple-100 text-purple-800" },
  closed: { label: "Закрыто", color: "bg-green-100 text-green-800" },
};

const PRIORITY_INFO: Record<string, { label: string; color: string }> = {
  critical: { label: "Критический", color: "bg-red-600 text-white" },
  high: { label: "Высокий", color: "bg-orange-500 text-white" },
  medium: { label: "Средний", color: "bg-yellow-500 text-white" },
  low: { label: "Низкий", color: "bg-gray-400 text-white" },
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

function isSlaBreached(ticket: { createdAt: Date; slaHours: number; status: string }): boolean {
  if (ticket.status === "closed") return false;
  const slaDeadline = new Date(ticket.createdAt.getTime() + ticket.slaHours * 60 * 60 * 1000);
  return Date.now() > slaDeadline.getTime();
}

export default async function CapaPage() {
  const session = await requireAuth();

  const tickets: Awaited<ReturnType<typeof db.capaTicket.findMany>> = await db.capaTicket.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const statuses = ["open", "investigating", "corrective_action", "verification", "closed"];

  // Top-3 causes this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  type Ticket = (typeof tickets)[number];
  const weekTickets = tickets.filter((t: Ticket) => t.createdAt >= weekAgo && t.status !== "closed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CAPA</h1>
          <p className="mt-1 text-muted-foreground">
            Корректирующие и предупреждающие действия
          </p>
        </div>
        <Button asChild>
          <Link href="/capa/new">
            <Plus className="size-4" />
            Новый CAPA
          </Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className={weekTickets.filter((t: Ticket) => t.priority === "critical").length > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Открыто</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tickets.filter((t: Ticket) => t.status !== "closed").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Критических</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{tickets.filter((t: Ticket) => t.priority === "critical" && t.status !== "closed").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">SLA нарушено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{tickets.filter((t: Ticket) => isSlaBreached(t)).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Закрыто за неделю</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{tickets.filter((t: Ticket) => t.status === "closed" && t.closedAt && t.closedAt >= weekAgo).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban columns */}
      <div className="grid gap-4 lg:grid-cols-5">
        {statuses.map((status) => {
          const statusTickets = tickets.filter((t: Ticket) => t.status === status);
          const info = STATUS_INFO[status] || { label: status, color: "" };

          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
                  {info.label}
                </span>
                <span className="text-xs text-muted-foreground">{statusTickets.length}</span>
              </div>
              <div className="space-y-2">
                {statusTickets.slice(0, 10).map((ticket: Ticket) => {
                  const pInfo = PRIORITY_INFO[ticket.priority] || { label: ticket.priority, color: "" };
                  const breached = isSlaBreached(ticket);

                  return (
                    <Link key={ticket.id} href={`/capa/${ticket.id}`}>
                      <Card className={`transition-shadow hover:shadow-md cursor-pointer ${breached ? "border-red-300" : ""}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-medium line-clamp-2">{ticket.title}</p>
                            <Badge className={`shrink-0 text-[10px] ${pInfo.color}`}>
                              {pInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{CATEGORY_LABELS[ticket.category] || ticket.category}</span>
                            {breached && (
                              <span className="flex items-center gap-0.5 text-red-600">
                                <Clock className="size-3" />
                                SLA
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
                {statusTickets.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Пусто</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
