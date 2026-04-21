/**
 * Best-effort auto-link: when a WeSetup user is created/updated with a
 * phone, check if the org's enabled TasksFlow integration already has a
 * worker with the same (normalised) phone and create
 * `TasksFlowUserLink` on the spot. Manager doesn't have to open the
 * integration page for every new hire.
 *
 * Silent-failure: network hiccup, integration disabled, TF user
 * doesn't exist yet, phone doesn't match. The owner can still link
 * manually; this helper just saves clicks when stars align.
 */
import { db } from "@/lib/db";
import { TasksFlowError, tasksflowClientFor } from "@/lib/tasksflow-client";
import { normalizePhone } from "@/lib/phone";

type Args = {
  organizationId: string;
  weSetupUserId: string;
  phone: string;
};

type Result =
  | { ok: true; linked: boolean; reason?: string }
  | { ok: false; reason: string };

export async function tryAutolinkTasksflowByPhone(args: Args): Promise<Result> {
  const normalized = normalizePhone(args.phone);
  if (!normalized) return { ok: false, reason: "invalid-phone" };

  const integration = await db.tasksFlowIntegration.findFirst({
    where: { organizationId: args.organizationId, enabled: true },
  });
  if (!integration) return { ok: true, linked: false, reason: "no-integration" };

  const existingLink = await db.tasksFlowUserLink.findFirst({
    where: {
      integrationId: integration.id,
      wesetupUserId: args.weSetupUserId,
    },
  });
  if (existingLink?.tasksflowUserId) {
    return { ok: true, linked: true, reason: "already-linked" };
  }

  let tfUsers;
  try {
    tfUsers = await tasksflowClientFor(integration).listUsers();
  } catch (err) {
    if (err instanceof TasksFlowError) {
      return {
        ok: false,
        reason: `tasksflow-${err.status}`,
      };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "tasksflow-unreachable",
    };
  }

  const match = tfUsers.find((u) => normalizePhone(u.phone) === normalized);
  if (!match) return { ok: true, linked: false, reason: "no-tf-user-with-phone" };

  // If a link row already exists (e.g. for another user) we can't write
  // — `@@unique([integrationId, wesetupUserId])`. Use upsert by
  // (integrationId, wesetupUserId).
  await db.tasksFlowUserLink.upsert({
    where: {
      integrationId_wesetupUserId: {
        integrationId: integration.id,
        wesetupUserId: args.weSetupUserId,
      },
    },
    create: {
      integrationId: integration.id,
      wesetupUserId: args.weSetupUserId,
      tasksflowUserId: match.id,
      phone: normalized,
      source: "auto",
    },
    update: { tasksflowUserId: match.id, phone: normalized },
  });
  return { ok: true, linked: true };
}
