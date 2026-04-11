import Link from "next/link";
import { Package, Plus, AlertTriangle } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    received: { label: "Принята", variant: "secondary" },
    in_production: { label: "В производстве", variant: "default" },
    finished: { label: "Готова", variant: "default" },
    shipped: { label: "Отгружена", variant: "outline" },
    expired: { label: "Просрочена", variant: "destructive" },
    written_off: { label: "Списана", variant: "destructive" },
  };
  const info = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function daysUntilExpiry(date: Date | null): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const filters = await searchParams;
  const session = await requireAuth();

  const where: Record<string, unknown> = {
    organizationId: session.user.organizationId,
  };
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  const [batches, stats] = await Promise.all([
    db.batch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    Promise.all([
      db.batch.count({ where: { organizationId: session.user.organizationId, status: "received" } }),
      db.batch.count({ where: { organizationId: session.user.organizationId, status: "in_production" } }),
      db.batch.count({
        where: {
          organizationId: session.user.organizationId,
          expiryDate: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
          status: { notIn: ["expired", "written_off", "shipped"] },
        },
      }),
    ]),
  ]);

  const [receivedCount, inProductionCount, expiringCount] = stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Партии</h1>
          <p className="mt-1 text-muted-foreground">
            Партионный учёт и прослеживаемость
          </p>
        </div>
        <Button asChild>
          <Link href="/batches/new">
            <Plus className="size-4" />
            Новая партия
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">На складе</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receivedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">В производстве</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProductionCount}</div>
          </CardContent>
        </Card>
        <Card className={expiringCount > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Истекает ≤3 дня</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${expiringCount > 0 ? "text-red-600" : ""}`}>
              {expiringCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "received", "in_production", "finished", "shipped", "expired"].map((s) => (
          <Button
            key={s}
            variant={(!filters.status && s === "all") || filters.status === s ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link href={s === "all" ? "/batches" : `/batches?status=${s}`}>
              {s === "all" ? "Все" : s === "received" ? "Принято" : s === "in_production" ? "В работе" : s === "finished" ? "Готово" : s === "shipped" ? "Отгружено" : "Просрочено"}
            </Link>
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Код</TableHead>
              <TableHead>Продукт</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead>Кол-во</TableHead>
              <TableHead>Срок годности</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch: (typeof batches)[number]) => {
              const days = daysUntilExpiry(batch.expiryDate);
              const isExpiring = days !== null && days <= 3 && days >= 0;
              const isExpired = days !== null && days < 0;

              return (
                <TableRow key={batch.id} className={isExpiring ? "bg-yellow-50" : isExpired ? "bg-red-50" : ""}>
                  <TableCell>
                    <Link href={`/batches/${batch.id}`} className="font-mono font-medium text-primary hover:underline">
                      {batch.code}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{batch.productName}</TableCell>
                  <TableCell>{batch.supplier || "—"}</TableCell>
                  <TableCell>{batch.quantity} {batch.unit}</TableCell>
                  <TableCell>
                    {batch.expiryDate ? (
                      <div className="flex items-center gap-1.5">
                        {(isExpiring || isExpired) && <AlertTriangle className="size-3.5 text-red-500" />}
                        <span className={isExpired ? "text-red-600 font-medium" : isExpiring ? "text-yellow-700 font-medium" : ""}>
                          {batch.expiryDate.toLocaleDateString("ru-RU")}
                        </span>
                        {days !== null && (
                          <span className="text-xs text-muted-foreground">
                            ({days > 0 ? `${days} дн` : days === 0 ? "сегодня" : "просрочена"})
                          </span>
                        )}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={batch.status} />
                  </TableCell>
                </TableRow>
              );
            })}
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Партий пока нет
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
