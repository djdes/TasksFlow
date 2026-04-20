/**
 * HMAC tokens for the public `/task-fill/[taskId]` page.
 *
 * A TasksFlow worker lands on WeSetup with a token; WeSetup verifies
 * it matches `HMAC(taskId, issuedAt)` signed with the integration's
 * `webhookSecret`, then renders the add-row form. No WeSetup session
 * is required — the token itself is the authentication.
 *
 * Token format: `<taskId>.<issuedAt>.<signatureBase64url>`
 * Signature:    HMAC-SHA256(webhookSecret, `${taskId}.${issuedAt}`)
 * TTL:          30 minutes (enough for a worker to fill the form on a
 *               slow connection + confirm). Fresh token is minted
 *               every time TasksFlow redirects.
 */
import crypto from "node:crypto";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function mintTaskFillToken(
  taskId: number,
  webhookSecret: string
): string {
  const issuedAt = Date.now();
  const payload = `${taskId}.${issuedAt}`;
  const sig = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export type TaskFillTokenVerifyResult =
  | { ok: true; taskId: number; issuedAt: number }
  | { ok: false; reason: "shape" | "expired" | "signature" };

export function verifyTaskFillToken(
  token: string,
  webhookSecret: string
): TaskFillTokenVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "shape" };
  const [taskIdRaw, issuedAtRaw, sig] = parts;
  const taskId = Number(taskIdRaw);
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(taskId) || !Number.isFinite(issuedAt)) {
    return { ok: false, reason: "shape" };
  }
  const age = Date.now() - issuedAt;
  if (age < 0 || age > TOKEN_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${taskId}.${issuedAt}`)
    .digest("base64url");
  // Constant-time compare to avoid timing oracles.
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "signature" };
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }
  return { ok: true, taskId, issuedAt };
}
