/**
 * Pure-data file (no Prisma, no db imports) listing journal templates
 * that legitimately expect at least one row for today every working
 * day. Lives in its own module so Client Components can import the set
 * without dragging the Prisma client into the browser bundle.
 *
 * Keep in sync with the product definition. When a journal's cadence
 * changes, update here.
 */
export const DAILY_JOURNAL_CODES = new Set<string>([
  "hygiene",
  "health_check",
  "climate_control",
  "cold_equipment_control",
  "cleaning",
  "general_cleaning",
  "cleaning_ventilation_checklist",
  "uv_lamp_runtime",
  "fryer_oil",
  "finished_product",
  "perishable_rejection",
]);
