import { Users } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";
import { EditUserDialog } from "@/components/settings/edit-user-dialog";
import { DeleteButton } from "@/components/settings/delete-button";
import { getUserDisplayTitle, isManagerRole } from "@/lib/user-roles";

export default async function UsersSettingsPage() {
  const session = await requireAuth();

  const users = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      positionTitle: true,
      isActive: true,
      phone: true,
    },
  });

  const isManager = isManagerRole(session.user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="mt-1 text-muted-foreground">
            Управление сотрудниками организации
          </p>
        </div>
        {isManager && <InviteUserDialog />}
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Users className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Сотрудников пока нет</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Пригласите первого сотрудника
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Должность</TableHead>
                <TableHead>Статус</TableHead>
                {isManager && <TableHead className="w-[100px]">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell className="text-sm">{user.phone ?? "—"}</TableCell>
                  <TableCell>{getUserDisplayTitle(user)}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="default">Активен</Badge>
                    ) : (
                      <Badge variant="secondary">Неактивен</Badge>
                    )}
                  </TableCell>
                  {isManager && (
                    <TableCell>
                      <div className="flex gap-1">
                        <EditUserDialog
                          user={user}
                          isSelf={user.id === session.user.id}
                        />
                        {user.id !== session.user.id && (
                          <DeleteButton
                            id={user.id}
                            endpoint="/api/users"
                            entityName={`сотрудника "${user.name}"`}
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
