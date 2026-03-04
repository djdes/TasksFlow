import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ClipboardList, Wifi } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Черновик</Badge>;
    case "submitted":
      return <Badge variant="secondary">Отправлено</Badge>;
    case "approved":
      return <Badge variant="default">Утверждено</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Type guard for entry data
type EntryData = Record<string, unknown>;

function getEntryData(data: unknown): EntryData {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as EntryData;
  }
  return {};
}

export default async function JournalEntriesPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code },
  });

  if (!template) {
    notFound();
  }

  const entries = await db.journalEntry.findMany({
    where: {
      templateId: template.id,
      organizationId: session.user.organizationId,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      filledBy: { select: { name: true } },
      area: { select: { name: true } },
      equipment: { select: { name: true } },
    },
  });

  const isTempControl = code === "temp_control";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description && (
            <p className="mt-1 text-muted-foreground">
              {template.description}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href={`/journals/${code}/new`}>
            <Plus className="size-4" />
            Новая запись
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <ClipboardList className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Записей пока нет</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Создайте первую запись в этом журнале
          </p>
          <Button asChild className="mt-4">
            <Link href={`/journals/${code}/new`}>
              <Plus className="size-4" />
              Новая запись
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                {isTempControl && <TableHead>Оборудование</TableHead>}
                {isTempControl && <TableHead>Температура</TableHead>}
                <TableHead>Заполнил</TableHead>
                <TableHead>Участок</TableHead>
                {isTempControl && <TableHead>Источник</TableHead>}
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const data = getEntryData(entry.data);
                const source = data.source as string | undefined;
                const isIoT =
                  source === "tuya_auto" || source === "tuya_sensor";
                const temp = data.temperature as number | undefined;

                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.createdAt)}</TableCell>
                    {isTempControl && (
                      <TableCell className="font-medium">
                        {entry.equipment?.name ?? "—"}
                      </TableCell>
                    )}
                    {isTempControl && (
                      <TableCell>
                        {temp != null ? (
                          <span className="font-mono font-semibold">
                            {temp}°C
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell>{entry.filledBy.name}</TableCell>
                    <TableCell>{entry.area?.name ?? "—"}</TableCell>
                    {isTempControl && (
                      <TableCell>
                        {isIoT ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <Wifi className="size-3" />
                            {source === "tuya_auto" ? "Авто" : "Датчик"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Вручную
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
