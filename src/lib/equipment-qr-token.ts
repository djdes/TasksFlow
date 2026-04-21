import crypto from "node:crypto";

/**
 * Long-lived HMAC token for physical QR stickers on equipment.
 * Format: `<equipmentId>.<issuedAtMs>.<sig>`.
 *
 * Signed with `EQUIPMENT_QR_TOKEN_SECRET` — separate from the
 * short-lived task-fill secret because the threat model is different:
 *
 *   • task-fill tokens live 30 minutes and gate a single task
 *   • equipment QR tokens are printed on a sticker, need to survive
 *     30+ days, and gate writing a temperature reading (low blast
 *     radius even if leaked — attacker could only add plausible
 *     temperature rows that are trivially distinguishable in the audit
 *     log).
 *
 * TTL: 60 days. Regenerate the sticker if the manager fears abuse.
 */

const TTL_MS = 60 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const raw =
    process.env.EQUIPMENT_QR_TOKEN_SECRET ||
    process.env.TELEGRAM_LINK_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      "EQUIPMENT_QR_TOKEN_SECRET не настроен (или слишком короткий)."
    );
  }
  return raw;
}

export function mintEquipmentQrToken(equipmentId: string): string {
  const issued = Date.now();
  const payload = `${equipmentId}.${issued}`;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export type EquipmentTokenVerification =
  | { ok: true; equipmentId: string }
  | { ok: false; reason: "bad-format" | "bad-sig" | "expired" };

export function verifyEquipmentQrToken(
  token: string
): EquipmentTokenVerification {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad-format" };
  const [equipmentId, issuedRaw, sig] = parts;
  if (!equipmentId || !issuedRaw || !sig) {
    return { ok: false, reason: "bad-format" };
  }
  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued)) return { ok: false, reason: "bad-format" };
  if (Date.now() - issued > TTL_MS) return { ok: false, reason: "expired" };

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(`${equipmentId}.${issuedRaw}`)
    .digest("base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  const sigBuf = Buffer.from(sig, "base64url");
  if (expectedBuf.length !== sigBuf.length) {
    return { ok: false, reason: "bad-sig" };
  }
  if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    return { ok: false, reason: "bad-sig" };
  }
  return { ok: true, equipmentId };
}
