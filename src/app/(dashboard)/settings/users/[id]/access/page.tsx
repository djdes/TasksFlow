import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { isManagementRole } from "@/lib/user-roles";
import { db } from "@/lib/db";
import { ACTIVE_JOURNAL_CATALOG } from "@/lib/journal-catalog";
import { UserAccessEditor } from "./user-access-editor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserJournalAccessPage({ params }: PageProps) {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    notFound();
  }
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      journalAccessMigrated: true,
    },
  });
  if (!user) notFound();

  const activeOrg = getActiveOrgId(session);
  if (!session.user.isRoot && user.organizationId !== activeOrg) {
    notFound();
  }

  const accessRows = await db.userJournalAccess.findMany({
    where: { userId: id },
    select: {
      templateCode: true,
      canRead: true,
      canWrite: true,
      canFinalize: true,
    },
  });

  return (
    <div className="space-y-6">
      <Link
        href="/settings/users"
        className="inline-flex h-11 items-center gap-2 rounded-2xl px-3 text-[15px] text-[#5566f6] hover:bg-[#eef1ff]"
      >
        <ArrowLeft className="size-5" />
        Назад
      </Link>

      <div>
        <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold tracking-[-0.03em] text-black">
          Доступ к журналам
        </h1>
        <p className="mt-2 text-[15px] text-[#6f7282]">
          {user.name} · {user.email}
        </p>
        {!user.journalAccessMigrated && (
          <p className="mt-3 text-[14px] text-[#b87a00]">
            Этому сотруднику пока открыт доступ ко всем журналам. После
            сохранения он увидит только отмеченные журналы.
          </p>
        )}
      </div>

      <UserAccessEditor
        userId={user.id}
        catalog={ACTIVE_JOURNAL_CATALOG.map((item) => ({ ...item }))}
        initialAccess={accessRows}
      />
    </div>
  );
}
