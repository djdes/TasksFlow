import bcrypt from "bcryptjs";
import crypto from "node:crypto";

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_TTL_MIN = Number(
  process.env.EMAIL_VERIFICATION_TTL_MIN || 10
);
export const VERIFICATION_MAX_ATTEMPTS = 5;

/** Six-digit numeric code. Using crypto.randomInt to avoid modulo bias. */
export function generateVerificationCode(): string {
  return crypto
    .randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)
    .toString()
    .padStart(VERIFICATION_CODE_LENGTH, "0");
}

export async function hashVerificationCode(code: string): Promise<string> {
  return bcrypt.hash(code, 4);
}

export async function compareVerificationCode(
  code: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export function verificationExpiresAt(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_MIN * 60 * 1000);
}
