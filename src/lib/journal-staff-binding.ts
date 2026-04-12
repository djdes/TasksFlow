import { getUserDisplayTitle } from "@/lib/user-roles";
import {
  AUDIT_PLAN_TEMPLATE_CODE,
  normalizeAuditPlanConfig,
} from "@/lib/audit-plan-document";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  normalizeTrainingPlanConfig,
} from "@/lib/training-plan-document";
import {
  SANITATION_DAY_TEMPLATE_CODE,
  normalizeSanitationDayConfig,
} from "@/lib/sanitation-day-document";
import {
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  normalizeTraceabilityDocumentConfig,
} from "@/lib/traceability-document";
import {
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  normalizeProductWriteoffConfig,
} from "@/lib/product-writeoff-document";
import {
  DISINFECTANT_TEMPLATE_CODE,
  normalizeDisinfectantConfig,
} from "@/lib/disinfectant-document";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  normalizeStaffTrainingConfig,
} from "@/lib/staff-training-document";
import {
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  normalizeEquipmentMaintenanceConfig,
} from "@/lib/equipment-maintenance-document";
import {
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
  normalizeEquipmentCalibrationConfig,
} from "@/lib/equipment-calibration-document";
import {
  METAL_IMPURITY_TEMPLATE_CODE,
  normalizeMetalImpurityConfig,
} from "@/lib/metal-impurity-document";

export type StaffBindingUser = {
  id: string;
  name: string;
  role?: string | null;
  positionTitle?: string | null;
};

export type StaffBindingResult = {
  userId: string | null;
  userName: string | null;
  title: string | null;
  matchedBy: "id" | "name" | "none";
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getDbStaffTitle(
  userOrRole: string | null | undefined | { role?: string | null; positionTitle?: string | null }
) {
  const user =
    userOrRole && typeof userOrRole === "object"
      ? userOrRole
      : { role: userOrRole ?? null, positionTitle: null };
  const label = normalizeText(getUserDisplayTitle(user));
  return label || "Сотрудник";
}

export function findStaffUserById(
  users: StaffBindingUser[],
  userId: unknown
): StaffBindingUser | null {
  const id = normalizeText(userId);
  if (!id) return null;
  return users.find((user) => user.id === id) || null;
}

export function findStaffUserByUniqueName(
  users: StaffBindingUser[],
  userName: unknown
): StaffBindingUser | null {
  const name = normalizeText(userName);
  if (!name) return null;

  const matches = users.filter(
    (user) => normalizeText(user.name).toLowerCase() === name.toLowerCase()
  );

  return matches.length === 1 ? matches[0] : null;
}

export function resolveStaffUser(
  users: StaffBindingUser[],
  params: { userId?: unknown; userName?: unknown }
): StaffBindingResult {
  const byId = findStaffUserById(users, params.userId);
  if (byId) {
    return {
      userId: byId.id,
      userName: byId.name,
      title: getDbStaffTitle(byId),
      matchedBy: "id",
    };
  }

  const byName = findStaffUserByUniqueName(users, params.userName);
  if (byName) {
    return {
      userId: byName.id,
      userName: byName.name,
      title: getDbStaffTitle(byName),
      matchedBy: "name",
    };
  }

  return {
    userId: null,
    userName: normalizeText(params.userName) || null,
    title: null,
    matchedBy: "none",
  };
}

export function reconcileResponsibleAssignment(
  users: StaffBindingUser[],
  params: {
    responsibleUserId?: unknown;
    responsibleTitle?: unknown;
    fallbackTitle?: unknown;
  }
) {
  const resolved = resolveStaffUser(users, {
    userId: params.responsibleUserId,
  });

  if (resolved.userId) {
    return {
      responsibleUserId: resolved.userId,
      responsibleTitle: resolved.title,
      responsibleUserName: resolved.userName,
      matchedBy: resolved.matchedBy,
    };
  }

  const fallbackTitle =
    normalizeText(params.responsibleTitle) ||
    normalizeText(params.fallbackTitle) ||
    null;

  return {
    responsibleUserId: null,
    responsibleTitle: fallbackTitle,
    responsibleUserName: null,
    matchedBy: "none" as const,
  };
}

export function reconcileNamedStaffSelection(
  users: StaffBindingUser[],
  params: {
    userId?: unknown;
    userName?: unknown;
    title?: unknown;
    fallbackTitle?: unknown;
  }
) {
  const resolved = resolveStaffUser(users, {
    userId: params.userId,
    userName: params.userName,
  });

  if (resolved.userId) {
    return {
      userId: resolved.userId,
      userName: resolved.userName,
      title: resolved.title,
      matchedBy: resolved.matchedBy,
    };
  }

  return {
    userId: null,
    userName: normalizeText(params.userName) || null,
    title:
      normalizeText(params.title) ||
      normalizeText(params.fallbackTitle) ||
      null,
    matchedBy: "none" as const,
  };
}

export function buildStaffOptionLabel(user: StaffBindingUser) {
  return `${getDbStaffTitle(user)} - ${user.name}`;
}

export function reconcileEntryStaffFields(
  value: unknown,
  user: StaffBindingUser
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const title = getDbStaffTitle(user);
  const record = { ...(value as Record<string, unknown>) };

  if ("positionTitle" in record) record.positionTitle = title;
  if ("responsibleTitle" in record) record.responsibleTitle = title;
  if ("employeeName" in record) record.employeeName = user.name;
  if ("responsibleEmployee" in record) record.responsibleEmployee = user.name;
  if ("employeeId" in record) record.employeeId = user.id;
  if ("responsibleEmployeeId" in record) record.responsibleEmployeeId = user.id;

  return record;
}

function reconcileAuditPlanConfigUsers(users: StaffBindingUser[], value: unknown) {
  const config = normalizeAuditPlanConfig(value);
  const approve = reconcileNamedStaffSelection(users, {
    userId: (value as { approveEmployeeId?: unknown } | null | undefined)?.approveEmployeeId,
    userName: config.approveEmployee,
    title: config.approveRole,
    fallbackTitle: config.approveRole,
  });

  return {
    ...config,
    approveEmployeeId: approve.userId,
    approveEmployee: approve.userName ?? config.approveEmployee,
    approveRole: approve.title ?? config.approveRole,
  };
}

function reconcileTrainingPlanConfigUsers(users: StaffBindingUser[], value: unknown) {
  const config = normalizeTrainingPlanConfig(value);
  const approve = reconcileNamedStaffSelection(users, {
    userId: (value as { approveEmployeeId?: unknown } | null | undefined)?.approveEmployeeId,
    userName: config.approveEmployee,
    title: config.approveRole,
    fallbackTitle: config.approveRole,
  });

  return {
    ...config,
    approveEmployeeId: approve.userId,
    approveEmployee: approve.userName ?? config.approveEmployee,
    approveRole: approve.title ?? config.approveRole,
  };
}

function reconcileSanitationDayConfigUsers(
  users: StaffBindingUser[],
  value: unknown
) {
  const raw = value as
    | {
        approveEmployeeId?: unknown;
        responsibleEmployeeId?: unknown;
      }
    | null
    | undefined;
  const config = normalizeSanitationDayConfig(value);
  const approve = reconcileNamedStaffSelection(users, {
    userId: raw?.approveEmployeeId,
    userName: config.approveEmployee,
    title: config.approveRole,
    fallbackTitle: config.approveRole,
  });
  const responsible = reconcileNamedStaffSelection(users, {
    userId: raw?.responsibleEmployeeId,
    userName: config.responsibleEmployee,
    title: config.responsibleRole,
    fallbackTitle: config.responsibleRole,
  });

  return {
    ...config,
    approveEmployeeId: approve.userId,
    approveEmployee: approve.userName ?? config.approveEmployee,
    approveRole: approve.title ?? config.approveRole,
    responsibleEmployeeId: responsible.userId,
    responsibleEmployee: responsible.userName ?? config.responsibleEmployee,
    responsibleRole: responsible.title ?? config.responsibleRole,
  };
}

function reconcileTraceabilityConfigUsers(users: StaffBindingUser[], value: unknown) {
  const raw = value as
    | {
        defaultResponsibleEmployeeId?: unknown;
        rows?: Array<{ responsibleEmployeeId?: unknown }>;
      }
    | null
    | undefined;
  const config = normalizeTraceabilityDocumentConfig(value);
  const defaultResponsible = reconcileNamedStaffSelection(users, {
    userId: raw?.defaultResponsibleEmployeeId,
    userName: config.defaultResponsibleEmployee,
    title: config.defaultResponsibleRole,
    fallbackTitle: config.defaultResponsibleRole,
  });

  return {
    ...config,
    defaultResponsibleEmployeeId: defaultResponsible.userId,
    defaultResponsibleEmployee:
      defaultResponsible.userName ?? config.defaultResponsibleEmployee,
    defaultResponsibleRole:
      defaultResponsible.title ?? config.defaultResponsibleRole,
    rows: config.rows.map((row, index) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: raw?.rows?.[index]?.responsibleEmployeeId,
        userName: row.responsibleEmployee,
        title: row.responsibleRole,
        fallbackTitle:
          row.responsibleRole || defaultResponsible.title || config.defaultResponsibleRole,
      });

      return {
        ...row,
        responsibleEmployeeId: selection.userId,
        responsibleEmployee: selection.userName ?? row.responsibleEmployee,
        responsibleRole:
          selection.title ??
          row.responsibleRole ??
          defaultResponsible.title ??
          config.defaultResponsibleRole,
      };
    }),
  };
}

function reconcileProductWriteoffConfigUsers(users: StaffBindingUser[], value: unknown) {
  const config = normalizeProductWriteoffConfig(value);

  return {
    ...config,
    commissionMembers: config.commissionMembers.map((member) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: member.employeeId,
        userName: member.employeeName,
        title: member.role,
        fallbackTitle: member.role,
      });

      return {
        ...member,
        employeeId: selection.userId ?? member.employeeId,
        employeeName: selection.userName ?? member.employeeName,
        role: selection.title ?? member.role,
      };
    }),
  };
}

function reconcileEquipmentMaintenanceConfigUsers(
  users: StaffBindingUser[],
  value: unknown
) {
  const raw = value as
    | {
        approveEmployeeId?: unknown;
        responsibleEmployeeId?: unknown;
      }
    | null
    | undefined;
  const config = normalizeEquipmentMaintenanceConfig(value);
  const approve = reconcileNamedStaffSelection(users, {
    userId: raw?.approveEmployeeId,
    userName: config.approveEmployee,
    title: config.approveRole,
    fallbackTitle: config.approveRole,
  });
  const responsible = reconcileNamedStaffSelection(users, {
    userId: raw?.responsibleEmployeeId,
    userName: config.responsibleEmployee,
    title: config.responsibleRole,
    fallbackTitle: config.responsibleRole,
  });

  return {
    ...config,
    approveEmployeeId: approve.userId,
    approveEmployee: approve.userName ?? config.approveEmployee,
    approveRole: approve.title ?? config.approveRole,
    responsibleEmployeeId: responsible.userId,
    responsibleEmployee: responsible.userName ?? config.responsibleEmployee,
    responsibleRole: responsible.title ?? config.responsibleRole,
  };
}

function reconcileEquipmentCalibrationConfigUsers(
  users: StaffBindingUser[],
  value: unknown
) {
  const config = normalizeEquipmentCalibrationConfig(value);
  const approve = reconcileNamedStaffSelection(users, {
    userId: (value as { approveEmployeeId?: unknown } | null | undefined)?.approveEmployeeId,
    userName: config.approveEmployee,
    title: config.approveRole,
    fallbackTitle: config.approveRole,
  });

  return {
    ...config,
    approveEmployeeId: approve.userId,
    approveEmployee: approve.userName ?? config.approveEmployee,
    approveRole: approve.title ?? config.approveRole,
  };
}

function reconcileDisinfectantConfigUsers(users: StaffBindingUser[], value: unknown) {
  const raw = value as
    | {
        responsibleEmployeeId?: unknown;
        receipts?: Array<{ responsibleEmployeeId?: unknown }>;
        consumptions?: Array<{ responsibleEmployeeId?: unknown }>;
      }
    | null
    | undefined;
  const config = normalizeDisinfectantConfig(value);
  const responsible = reconcileNamedStaffSelection(users, {
    userId: raw?.responsibleEmployeeId,
    userName: config.responsibleEmployee,
    title: config.responsibleRole,
    fallbackTitle: config.responsibleRole,
  });

  return {
    ...config,
    responsibleEmployeeId: responsible.userId,
    responsibleEmployee: responsible.userName ?? config.responsibleEmployee,
    responsibleRole: responsible.title ?? config.responsibleRole,
    receipts: config.receipts.map((receipt, index) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: raw?.receipts?.[index]?.responsibleEmployeeId,
        userName: receipt.responsibleEmployee,
        title: receipt.responsibleRole,
        fallbackTitle: receipt.responsibleRole,
      });
      return {
        ...receipt,
        responsibleEmployeeId: selection.userId,
        responsibleEmployee: selection.userName ?? receipt.responsibleEmployee,
        responsibleRole: selection.title ?? receipt.responsibleRole,
      };
    }),
    consumptions: config.consumptions.map((consumption, index) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: raw?.consumptions?.[index]?.responsibleEmployeeId,
        userName: consumption.responsibleEmployee,
        title: consumption.responsibleRole,
        fallbackTitle: consumption.responsibleRole,
      });
      return {
        ...consumption,
        responsibleEmployeeId: selection.userId,
        responsibleEmployee: selection.userName ?? consumption.responsibleEmployee,
        responsibleRole: selection.title ?? consumption.responsibleRole,
      };
    }),
  };
}

function reconcileStaffTrainingConfigUsers(users: StaffBindingUser[], value: unknown) {
  const raw = value as
    | {
        rows?: Array<{ employeeId?: unknown }>;
      }
    | null
    | undefined;
  const config = normalizeStaffTrainingConfig(value);

  return {
    ...config,
    rows: config.rows.map((row, index) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: raw?.rows?.[index]?.employeeId,
        userName: row.employeeName,
        title: row.employeePosition,
        fallbackTitle: row.employeePosition,
      });

      return {
        ...row,
        employeeId: selection.userId,
        employeeName: selection.userName ?? row.employeeName,
        employeePosition: selection.title ?? row.employeePosition,
      };
    }),
  };
}

function reconcileMetalImpurityConfigUsers(users: StaffBindingUser[], value: unknown) {
  const raw = value as
    | {
        responsibleEmployeeId?: unknown;
        rows?: Array<{ responsibleEmployeeId?: unknown }>;
      }
    | null
    | undefined;
  const config = normalizeMetalImpurityConfig(value);
  const responsible = reconcileNamedStaffSelection(users, {
    userId: raw?.responsibleEmployeeId,
    userName: config.responsibleEmployee,
    title: config.responsiblePosition,
    fallbackTitle: config.responsiblePosition,
  });

  return {
    ...config,
    responsibleEmployeeId: responsible.userId,
    responsibleEmployee: responsible.userName ?? config.responsibleEmployee,
    responsiblePosition: responsible.title ?? config.responsiblePosition,
    rows: config.rows.map((row, index) => {
      const selection = reconcileNamedStaffSelection(users, {
        userId: raw?.rows?.[index]?.responsibleEmployeeId,
        userName: row.responsibleName,
        title: row.responsibleRole,
        fallbackTitle: row.responsibleRole || responsible.title || config.responsiblePosition,
      });

      return {
        ...row,
        responsibleEmployeeId: selection.userId,
        responsibleName: selection.userName ?? row.responsibleName,
        responsibleRole:
          selection.title ?? row.responsibleRole ?? responsible.title ?? config.responsiblePosition,
      };
    }),
  };
}

export function normalizeJournalStaffBoundConfig(
  templateCode: string,
  value: unknown,
  users: StaffBindingUser[]
) {
  switch (templateCode) {
    case AUDIT_PLAN_TEMPLATE_CODE:
      return reconcileAuditPlanConfigUsers(users, value);
    case TRAINING_PLAN_TEMPLATE_CODE:
      return reconcileTrainingPlanConfigUsers(users, value);
    case SANITATION_DAY_TEMPLATE_CODE:
      return reconcileSanitationDayConfigUsers(users, value);
    case TRACEABILITY_DOCUMENT_TEMPLATE_CODE:
      return reconcileTraceabilityConfigUsers(users, value);
    case PRODUCT_WRITEOFF_TEMPLATE_CODE:
      return reconcileProductWriteoffConfigUsers(users, value);
    case EQUIPMENT_MAINTENANCE_TEMPLATE_CODE:
      return reconcileEquipmentMaintenanceConfigUsers(users, value);
    case EQUIPMENT_CALIBRATION_TEMPLATE_CODE:
      return reconcileEquipmentCalibrationConfigUsers(users, value);
    case DISINFECTANT_TEMPLATE_CODE:
      return reconcileDisinfectantConfigUsers(users, value);
    case STAFF_TRAINING_TEMPLATE_CODE:
      return reconcileStaffTrainingConfigUsers(users, value);
    case METAL_IMPURITY_TEMPLATE_CODE:
      return reconcileMetalImpurityConfigUsers(users, value);
    default:
      return value;
  }
}
