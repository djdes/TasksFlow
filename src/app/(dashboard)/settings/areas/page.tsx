import { Building2 } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaDialog } from "@/components/settings/area-dialog";
import { DeleteButton } from "@/components/settings/delete-button";

export default async function AreasSettingsPage() {
  const session = await requireAuth();

  const areas = await db.area.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { equipment: true } },
    },
  });

  const canManage = ["owner", "technologist"].includes(session.user.role);
  const canDelete = session.user.role === "owner";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Цеха и участки</h1>
          <p className="mt-1 text-muted-foreground">
            Управление производственными зонами
          </p>
        </div>
        {canManage && <AreaDialog />}
      </div>

      {areas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Building2 className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Цехов пока нет</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Добавьте первый цех или участок
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead>Оборудование</TableHead>
                {canManage && <TableHead className="w-[100px]">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((area) => (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{area.name}</TableCell>
                  <TableCell>{area.description ?? "—"}</TableCell>
                  <TableCell>{area._count.equipment}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <AreaDialog area={{ id: area.id, name: area.name, description: area.description }} />
                        {canDelete && (
                          <DeleteButton
                            id={area.id}
                            endpoint="/api/areas"
                            entityName={`цех "${area.name}"`}
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
