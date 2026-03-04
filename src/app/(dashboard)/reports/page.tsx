import { requireRole } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { ReportForm } from "@/components/reports/report-form";

export default async function ReportsPage() {
  const session = await requireRole(["owner", "technologist"]);

  const [templates, areas] = await Promise.all([
    db.journalTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.area.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Отчёты</h1>
      <ReportForm templates={templates} areas={areas} />
    </div>
  );
}
