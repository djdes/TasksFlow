import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

interface AuditParams {
  organizationId: string;
  userId?: string;
  userName?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({ data: params });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
