import { requireRole } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { SubscriptionManager } from "@/components/settings/subscription-manager";

export default async function SubscriptionPage() {
  const session = await requireRole(["owner"]);

  const org = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      subscriptionPlan: true,
      subscriptionEnd: true,
      _count: { select: { users: { where: { isActive: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Управление подпиской</h1>
      <SubscriptionManager
        currentPlan={org?.subscriptionPlan || "trial"}
        subscriptionEnd={org?.subscriptionEnd?.toISOString() || null}
        activeUsers={org?._count.users || 1}
      />
    </div>
  );
}
