import { redirect } from "next/navigation";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { isManagementRole } from "@/lib/user-roles";
import { StaffPageClient } from "@/components/staff/staff-page-client";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    // Non-managers don't manage staff. Push them to the generic settings hub.
    redirect("/settings");
  }

  const orgId = getActiveOrgId(session);

  const [organization, positions, employees, workOffDays, vacations, sickLeaves, dismissals] =
    await Promise.all([
      db.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      }),
      db.jobPosition.findMany({
        where: { organizationId: orgId },
        orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      db.user.findMany({
        where: { organizationId: orgId, archivedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          jobPositionId: true,
          positionTitle: true,
          role: true,
          isActive: true,
          isRoot: true,
          archivedAt: true,
        },
      }),
      db.staffWorkOffDay.findMany({
        where: { user: { organizationId: orgId } },
        select: { userId: true, date: true },
      }),
      db.staffVacation.findMany({
        where: { user: { organizationId: orgId } },
        orderBy: { dateFrom: "asc" },
        include: {
          user: { select: { name: true, jobPositionId: true, positionTitle: true, role: true } },
        },
      }),
      db.staffSickLeave.findMany({
        where: { user: { organizationId: orgId } },
        orderBy: { dateFrom: "asc" },
        include: {
          user: { select: { name: true, jobPositionId: true, positionTitle: true, role: true } },
        },
      }),
      db.staffDismissal.findMany({
        where: { user: { organizationId: orgId } },
        orderBy: { date: "desc" },
        include: {
          user: { select: { name: true, jobPositionId: true, positionTitle: true, role: true } },
        },
      }),
    ]);

  return (
    <StaffPageClient
      organization={{
        id: organization?.id ?? orgId,
        name: organization?.name ?? "Организация",
      }}
      positions={positions.map((p) => ({
        id: p.id,
        categoryKey: p.categoryKey as "management" | "staff",
        name: p.name,
        sortOrder: p.sortOrder,
      }))}
      employees={employees.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        jobPositionId: u.jobPositionId,
        positionTitle: u.positionTitle,
        role: u.role,
        isActive: u.isActive,
        isRoot: u.isRoot,
        isSelf: u.id === session.user.id,
      }))}
      workOffDays={workOffDays.map((w) => ({
        userId: w.userId,
        date: w.date.toISOString().slice(0, 10),
      }))}
      vacations={vacations.map((v) => ({
        id: v.id,
        userId: v.userId,
        userName: v.user.name,
        jobPositionId: v.user.jobPositionId,
        positionLabel: v.user.positionTitle || v.user.role || "—",
        dateFrom: v.dateFrom.toISOString().slice(0, 10),
        dateTo: v.dateTo.toISOString().slice(0, 10),
      }))}
      sickLeaves={sickLeaves.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: s.user.name,
        jobPositionId: s.user.jobPositionId,
        positionLabel: s.user.positionTitle || s.user.role || "—",
        dateFrom: s.dateFrom.toISOString().slice(0, 10),
        dateTo: s.dateTo.toISOString().slice(0, 10),
      }))}
      dismissals={dismissals.map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        jobPositionId: d.user.jobPositionId,
        positionLabel: d.user.positionTitle || d.user.role || "—",
        date: d.date.toISOString().slice(0, 10),
      }))}
    />
  );
}
