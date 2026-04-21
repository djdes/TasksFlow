/**
 * Server-side обёртка поверх src/lib/permissions.ts — подгружает user +
 * jobPosition и возвращает resolved permission-набор. Отдельный файл,
 * потому что pure-data lib/permissions.ts не должен импортировать Prisma
 * (иначе Client Components потянут db bundle).
 */
import { db } from "@/lib/db";
import {
  actorHasPermission,
  resolveActorPermissions,
  type Permission,
  type PermissionActor,
} from "@/lib/permissions";
import { isManagementRole } from "@/lib/user-roles";

type SessionLike = {
  user?: {
    id?: string | null;
    role?: string | null;
    isRoot?: boolean | null;
  } | null;
};

async function loadActor(userId: string): Promise<PermissionActor> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      isRoot: true,
      role: true,
      permissionsJson: true,
      jobPosition: {
        select: {
          categoryKey: true,
          permissionsJson: true,
        },
      },
    },
  });
  if (!user) {
    return { fallbackCategoryKey: "staff" };
  }
  return {
    isRoot: user.isRoot,
    userPermissionsJson: user.permissionsJson,
    positionPermissionsJson: user.jobPosition?.permissionsJson ?? null,
    positionCategoryKey: user.jobPosition?.categoryKey ?? null,
    fallbackCategoryKey: isManagementRole(user.role) ? "management" : "staff",
  };
}

export async function getUserPermissions(
  userId: string
): Promise<Set<Permission>> {
  const actor = await loadActor(userId);
  return resolveActorPermissions(actor);
}

export async function userHasPermission(
  userId: string,
  permission: Permission
): Promise<boolean> {
  const actor = await loadActor(userId);
  return actorHasPermission(actor, permission);
}

export async function sessionHasPermission(
  session: SessionLike | null | undefined,
  permission: Permission
): Promise<boolean> {
  if (!session?.user?.id) return false;
  if (session.user.isRoot === true) return true;
  return userHasPermission(session.user.id, permission);
}
