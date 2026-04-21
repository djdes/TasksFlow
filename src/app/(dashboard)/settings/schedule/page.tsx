import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { ScheduleEditor } from "@/components/settings/schedule-editor";

export const dynamic = "force-dynamic";

function weekAnchor(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export default async function ScheduleSettingsPage() {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    redirect("/settings");
  }
  const organizationId = getActiveOrgId(session);
  const now = new Date();
  const start = weekAnchor(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 13);

  const [users, positions, shifts] = await Promise.all([
    db.user.findMany({
      where: {
        organizationId,
        isActive: true,
        archivedAt: null,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        jobPositionId: true,
        jobPosition: {
          select: { id: true, name: true, categoryKey: true },
        },
      },
    }),
    db.jobPosition.findMany({
      where: { organizationId },
      orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, categoryKey: true },
    }),
    db.workShift.findMany({
      where: {
        organizationId,
        date: { gte: start, lte: end },
      },
      select: {
        userId: true,
        date: true,
        status: true,
        jobPositionId: true,
      },
    }),
  ]);

  const shiftsInitial = shifts.map((s) => ({
    userId: s.userId,
    date: s.date.toISOString().slice(0, 10),
    status: s.status,
    jobPositionId: s.jobPositionId,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-[13px] text-[#6f7282] hover:text-[#0b1024]"
        >
          <ArrowLeft className="size-4" />
          К настройкам
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
            <CalendarRange className="size-5" />
          </span>
          <div>
            <h1 className="text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
              График смен
            </h1>
            <p className="mt-1.5 max-w-[680px] text-[14px] leading-relaxed text-[#6f7282]">
              Отмечайте, кто и в какой должности сегодня на смене, кто в
              отпуске или на больничном. WeSetup использует это расписание,
              чтобы назначать задачи и CAPA не «на Иванова», а на актуального
              дежурного — Бракераж уходит тому, кто сегодня за плитой, а не
              фиксированному повару.
            </p>
          </div>
        </div>
      </div>

      <ScheduleEditor
        startYmd={start.toISOString().slice(0, 10)}
        endYmd={end.toISOString().slice(0, 10)}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          jobPositionId: u.jobPositionId,
          jobPositionName: u.jobPosition?.name ?? null,
          categoryKey: u.jobPosition?.categoryKey ?? null,
        }))}
        positions={positions}
        shifts={shiftsInitial}
      />
    </div>
  );
}
