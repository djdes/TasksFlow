/**
 * Phone-number helpers shared by register, invite, and the TasksFlow
 * auto-link path. Normalises Russian-market numbers to `+7XXXXXXXXXX`
 * so we can match against TasksFlow (which stores `+7…`) without
 * per-site format guessing.
 *
 *   "+7 (985) 123-45-67"  →  "+79851234567"
 *   "8 985 123 45 67"     →  "+79851234567"
 *   "79851234567"         →  "+79851234567"
 *   "+380 44 123 45 67"   →  "+380441234567"   (non-RU preserved)
 *
 * Returns `null` for anything that doesn't look like at least 10 digits.
 */

export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip everything except digits and the leading +.
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length < 10) return null;

  // Russian-market convention: «8XXXXXXXXXX» is local, convert to «+7».
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  // «7XXXXXXXXXX» without + → prepend +.
  if (digits.length === 11 && digits.startsWith("7") && !hasPlus) {
    return `+${digits}`;
  }
  // «XXXXXXXXXX» (10 digits, no country code) → assume RU.
  if (digits.length === 10 && !hasPlus) {
    return `+7${digits}`;
  }
  // Anything else: keep as-is if user explicitly typed +.
  if (hasPlus) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Pretty, human-friendly rendering of a normalized `+7…` phone. Non-RU
 * numbers get the raw string back — rendering international formats is
 * out of scope.
 *
 *   "+79851234567"  →  "+7 985 123-45-67"
 */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "";
  if (!normalized.startsWith("+7") || normalized.length !== 12)
    return normalized;
  const d = normalized.slice(2);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

/** Basic client-side validity check matching `normalizePhone`. */
export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}
