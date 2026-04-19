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
      <div>
        <h1 className="text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
          Отчёты
        </h1>
        <p className="mt-1.5 text-[14px] text-[#6f7282]">
          Выгрузки журналов за период — PDF и Excel для проверок
        </p>
      </div>
      <div className="rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] md:p-7">
        <ReportForm templates={templates} areas={areas} />
      </div>
    </div>
  );
}
