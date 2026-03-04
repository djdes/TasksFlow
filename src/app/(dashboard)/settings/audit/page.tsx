import { requireRole } from "@/lib/auth-helpers";
import { AuditLogViewer } from "@/components/settings/audit-log-viewer";

export default async function AuditPage() {
  await requireRole(["owner"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Журнал действий</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Все действия пользователей в системе
        </p>
      </div>
      <AuditLogViewer />
    </div>
  );
}
