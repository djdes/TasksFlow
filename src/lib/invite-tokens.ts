import crypto from "node:crypto";

/** Invite URL tokens are 32 bytes base64url (= 43 chars). */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hash of the raw token. Only the hash is stored in the DB so a
 * database read (backup leak, SQL inspection, etc.) cannot produce usable
 * invite links. Bcrypt would be overkill — these tokens are high-entropy
 * random, the attacker has no dictionary to probe.
 */
export function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const INVITE_TTL_DAYS = 7;

export function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildInviteUrl(raw: string): string {
  const base =
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "https://haccp.magday.ru";
  return `${base.replace(/\/+$/, "")}/invite/${raw}`;
}
