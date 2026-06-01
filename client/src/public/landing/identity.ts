/**
 * Определение, что ввёл пользователь в единое поле входа — телефон или
 * email (стиль Госуслуг: один вход и для телефона, и для почты).
 */

/** Нормализует РФ-телефон к виду +7XXXXXXXXXX или возвращает null. */
export function normalizePhoneRu(v: string): string | null {
  let d = v.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "8" || d[0] === "7")) d = d.slice(1);
  if (d.length === 10) return "+7" + d;
  return null;
}

export type Identity =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string }
  | { kind: "unknown" };

export function detectIdentity(value: string): Identity {
  const t = value.trim();
  if (!t) return { kind: "unknown" };
  if (t.includes("@")) return { kind: "email", email: t.toLowerCase() };
  const phone = normalizePhoneRu(t);
  if (phone) return { kind: "phone", phone };
  return { kind: "unknown" };
}
