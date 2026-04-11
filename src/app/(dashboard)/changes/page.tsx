import Link from "next/link";
import { GitBranch, Plus } from "lucide-react"; // Link is still used by "Новое изменение" button below
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// NOTE: detail page /changes/[id] is not yet implemented — show title as plain
// text instead of a link so clicks don't land on a 404.

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  requested: { label: "Заявка", variant: "outline" },
  risk_review: { label: "Оценка рисков", variant: "secondary" },
  testing: { label: "Тестирование", variant: "secondary" },
  approved: { label: "Одобрено", variant: "default" },
  rejected: { label: "Отклонено", variant: "destructive" },
  implemented: { label: "Внедрено", variant: "default" },
};

const TYPE_LABELS: Record<string, string> = {
  recipe: "Рецептура",
  process: "Процесс",
  packaging: "Упаковка",
  supplier: "Поставщик",
  equipment: "Оборудование",
};

export default async function ChangesPage() {
  const session = await requireAuth();

  const changes = await db.changeRequest.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="size-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Управление изменениями</h1>
          </div>
          <p className="mt-1 text-muted-foreground">Change Control: рецептуры, процессы, упаковка</p>
        </div>
        <Button asChild>
          <Link href="/changes/new">
            <Plus className="size-4" />
            Новое изменение
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>v.</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((c: (typeof changes)[number]) => {
              const sInfo = STATUS_LABELS[c.status] || { label: c.status, variant: "outline" as const };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-muted-foreground">#{c.version}</TableCell>
                  <TableCell>
                    <span className="font-medium">{c.title}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[c.changeType] || c.changeType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sInfo.variant}>{sInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{c.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              );
            })}
            {changes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Изменений пока нет
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
