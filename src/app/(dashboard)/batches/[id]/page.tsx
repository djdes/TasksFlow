import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
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
import { BatchStatusActions } from "@/components/batches/batch-status-actions";

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
  return <Badge variant={info.variant} className="text-sm">{info.label}</Badge>;
}

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  const batch = await db.batch.findUnique({ where: { id } });
  if (!batch || batch.organizationId !== session.user.organizationId) {
    notFound();
  }

  // Find related journal entries
  const relatedEntries = await db.journalEntry.findMany({
    where: {
      organizationId: session.user.organizationId,
      data: { path: ["batchCode"], equals: batch.code },
    },
    include: {
      template: { select: { name: true, code: true } },
      filledBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/batches">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-muted-foreground" />
            <h1 className="text-xl font-bold font-mono">{batch.code}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{batch.productName}</p>
        </div>
        <StatusBadge status={batch.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Поставщик</CardTitle>
          </CardHeader>
          <CardContent><p className="font-medium text-sm">{batch.supplier || "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Количество</CardTitle>
          </CardHeader>
          <CardContent><p className="font-medium text-sm">{batch.quantity} {batch.unit}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Дата приёмки</CardTitle>
          </CardHeader>
          <CardContent><p className="font-medium text-sm">{batch.receivedAt.toLocaleDateString("ru-RU")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Срок годности</CardTitle>
          </CardHeader>
          <CardContent><p className="font-medium text-sm">{batch.expiryDate ? batch.expiryDate.toLocaleDateString("ru-RU") : "—"}</p></CardContent>
        </Card>
      </div>

      {batch.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Примечания</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm">{batch.notes}</p></CardContent>
        </Card>
      )}

      <BatchStatusActions batchId={batch.id} currentStatus={batch.status} />

      {/* Traceability chain */}
      {relatedEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Цепочка прослеживаемости</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {relatedEntries.map((entry: (typeof relatedEntries)[number]) => (
                <Link
                  key={entry.id}
                  href={`/journals/${entry.template.code}/${entry.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.createdAt.toLocaleString("ru-RU")} — {entry.filledBy.name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
