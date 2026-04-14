import assert from "node:assert/strict";
import {
  createEmptySanitationRow,
  getSanitationDayDefaultConfig,
} from "@/lib/sanitation-day-document";

const emptyRow = createEmptySanitationRow("Test room");
for (const [month, value] of Object.entries(emptyRow.plan)) {
  assert.notEqual(value, "", `plan.${month} should not be empty`);
}
for (const [month, value] of Object.entries(emptyRow.fact)) {
  assert.notEqual(value, "", `fact.${month} should not be empty`);
}

const defaultConfig = getSanitationDayDefaultConfig(
  new Date("2026-01-01T00:00:00.000Z"),
);
for (const row of defaultConfig.rows) {
  for (const [month, value] of Object.entries(row.plan)) {
    assert.notEqual(
      value,
      "",
      `default row ${row.id} plan.${month} should not be empty`,
    );
  }
  for (const [month, value] of Object.entries(row.fact)) {
    assert.notEqual(
      value,
      "",
      `default row ${row.id} fact.${month} should not be empty`,
    );
  }
}

console.log("sanitation-day-document checks passed");
