/**
 * Escape user-provided strings for safe interpolation into HTML contexts.
 * Use for:
 *  - Email templates (nodemailer HTML body)
 *  - Telegram messages sent with parse_mode: "HTML"
 *  - Any other place where untrusted strings are concatenated into markup.
 *
 * Handles null/undefined/numbers gracefully by coercing to string first.
 */
const REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => REPLACEMENTS[ch] ?? ch);
}
