/**
 * Pure-data file (no Prisma, no db imports) listing journal templates
 * that legitimately expect at least one row for today every working
 * day AND store their rows as `JournalDocumentEntry` records (which
 * the today-compliance helper can count).
 *
 * Config-based daily journals (cleaning, general_cleaning — stored
 * inside `JournalDocument.config.rows` / `config.matrix`) are NOT
 * included here for now — the helper can't count their rows without
 * per-template config introspection. They'll be treated as aperiodic
 * and always show as «filled» on the dashboard, which is a small
 * lie-by-omission but better than a permanent false «не заполнено».
 * TODO: add per-template config inspector so these can be promoted
 * back to the daily set.
 *
 * Lives in its own module so Client Components can import the set
 * without dragging the Prisma client into the browser bundle. Keep
 * in sync with the product definition. When a journal's cadence
 * changes, update here.
 */
export const DAILY_JOURNAL_CODES = new Set<string>([
  "hygiene",
  "health_check",
  "climate_control",
  "cold_equipment_control",
  "cleaning_ventilation_checklist",
  "uv_lamp_runtime",
  "fryer_oil",
]);
