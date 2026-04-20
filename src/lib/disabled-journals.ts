import { db } from "@/lib/db";

/**
 * Returns the set of journal template codes the organization has toggled
 * off in /settings/journals. Empty set = every journal is enabled
 * (default for newly-registered orgs).
 */
export async function getDisabledJournalCodes(
  organizationId: string
): Promise<Set<string>> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { disabledJournalCodes: true },
  });
  return parseDisabledCodes(org?.disabledJournalCodes);
}

/**
 * Pure parser — use when the caller already loaded the organization
 * row (e.g. the dashboard, which selects many fields at once).
 */
export function parseDisabledCodes(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<string>();
  for (const value of raw) {
    if (typeof value === "string" && value.length > 0) out.add(value);
  }
  return out;
}

/**
 * Write back the set. Wipes whatever was there — caller is responsible
 * for sending the full desired list. Returns the normalized array that
 * was stored (dedup + strings only), useful for echoing back to the UI.
 */
export async function setDisabledJournalCodes(
  organizationId: string,
  codes: string[]
): Promise<string[]> {
  const normalized = [...new Set(codes.filter((c) => typeof c === "string" && c.length > 0))];
  await db.organization.update({
    where: { id: organizationId },
    data: { disabledJournalCodes: normalized },
  });
  return normalized;
}
