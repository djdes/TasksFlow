/**
 * Unit + integration tests for the Telegram journal wizard.
 *
 * Runs via `npx tsx scripts/test-bot-wizard.ts`.
 *
 * Unit side: exercises the pure parsers / validators from
 * src/lib/bot-wizard.ts — no database needed.
 *
 * Integration side: talks to the real Postgres pointed at by DATABASE_URL,
 * creates a throw-away Organization + User + JournalTemplate, drives the
 * wizard save path via the same `prisma.journalEntry.create` call the bot
 * uses, asserts the row is there with the right shape, and rolls the
 * fixtures back on the way out.
 *
 * Exit code 0 when every case passes, 1 otherwise.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "node:crypto";
import {
  findMissingRequired,
  parseDateInput,
  parseFields,
  parseNumberInput,
  validateAll,
  validateFieldValue,
  type FieldDef,
} from "../src/lib/bot-wizard";

let PASS = 0;
let FAIL = 0;

function ok(label: string) {
  PASS += 1;
  console.log(`  \u2713 ${label}`);
}
function bad(label: string, details?: string) {
  FAIL += 1;
  console.log(`  \u2717 ${label}${details ? ` — ${details}` : ""}`);
}

function expectEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    ok(label);
  } else {
    bad(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// UNIT TESTS — parsers + validators
// ---------------------------------------------------------------------------

function runUnitTests() {
  console.log("\n== parseDateInput ==");
  expectEq(
    "DD.MM.YYYY",
    parseDateInput("05.03.2026"),
    "2026-03-05"
  );
  expectEq("YYYY-MM-DD", parseDateInput("2026-03-05"), "2026-03-05");
  expectEq(
    "сегодня is today",
    parseDateInput("сегодня"),
    new Date().toISOString().slice(0, 10)
  );
  expectEq("rejects garbage", parseDateInput("вчерашний день"), null);
  expectEq("rejects month>12", parseDateInput("05.13.2026"), null);
  expectEq("rejects non-existent feb 30", parseDateInput("30.02.2026"), null);

  console.log("\n== parseNumberInput ==");
  expectEq("integer", parseNumberInput("42"), 42);
  expectEq("decimal with comma", parseNumberInput("4,5"), 4.5);
  expectEq("decimal with dot", parseNumberInput("-3.14"), -3.14);
  expectEq("rejects empty", parseNumberInput(""), null);
  expectEq("rejects words", parseNumberInput("сорок два"), null);

  console.log("\n== parseFields ==");
  const fields = parseFields([
    { key: "temp", label: "Температура", type: "number", required: true },
    { key: "notes", label: "Заметки", type: "text" },
    { garbage: true },
    null,
    { key: "when", type: "date" },
  ]);
  expectEq("parses 3 valid, drops junk", fields.length, 3);
  expectEq("fields[0] required true", fields[0].required, true);
  expectEq("fields[1] required default false", fields[1].required, false);
  expectEq("fields[2] label falls back to key", fields[2].label, "when");

  console.log("\n== validateFieldValue ==");
  const fRequiredText: FieldDef = {
    key: "x",
    label: "X",
    type: "text",
    required: true,
  };
  expectEq(
    "required missing text → error",
    validateFieldValue(fRequiredText, undefined),
    "Обязательное поле"
  );
  expectEq(
    "required empty string → error",
    validateFieldValue(fRequiredText, "   "),
    "Обязательное поле"
  );
  expectEq(
    "required ok",
    validateFieldValue(fRequiredText, "hello"),
    null
  );
  const fNumber: FieldDef = { key: "n", label: "N", type: "number" };
  expectEq(
    "optional number undefined → ok",
    validateFieldValue(fNumber, undefined),
    null
  );
  expectEq(
    "number with string → error",
    validateFieldValue(fNumber, "42" as unknown),
    "Ожидается число"
  );
  const fSelect: FieldDef = {
    key: "s",
    label: "S",
    type: "select",
    required: true,
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  };
  expectEq(
    "select out of list → error",
    validateFieldValue(fSelect, "c"),
    "Вариант не из списка"
  );
  expectEq("select ok", validateFieldValue(fSelect, "a"), null);
  const fDate: FieldDef = { key: "d", label: "D", type: "date" };
  expectEq(
    "date wrong format → error",
    validateFieldValue(fDate, "05.03.2026"),
    "Ожидается дата ГГГГ-ММ-ДД"
  );
  expectEq("date ok", validateFieldValue(fDate, "2026-03-05"), null);

  console.log("\n== findMissingRequired + validateAll ==");
  const missingFields: FieldDef[] = [
    { key: "a", label: "A", type: "text", required: true },
    { key: "b", label: "B", type: "number", required: true },
    { key: "c", label: "C", type: "text" },
  ];
  expectEq(
    "both required missing",
    findMissingRequired(missingFields, {}),
    ["A", "B"]
  );
  expectEq(
    "one required filled",
    findMissingRequired(missingFields, { a: "ok", b: 1 }),
    []
  );
  expectEq(
    "validateAll returns error map",
    validateAll(missingFields, { a: "ok", b: "not a number" }),
    { B: "Ожидается число" }
  );
}

// ---------------------------------------------------------------------------
// INTEGRATION TEST — real journal entry round-trip
// ---------------------------------------------------------------------------

async function runIntegrationTest() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log("\n== integration: create + load JournalEntry ==");
  const tag = crypto.randomBytes(4).toString("hex");
  const orgName = `test-bot-${tag}`;
  const templateCode = `test_bot_wizard_${tag}`;

  // Handles we populate progressively — cleaned up in finally no matter
  // which assertion throws.
  let orgId: string | null = null;
  let userId: string | null = null;
  let templateId: string | null = null;

  try {
    const org = await prisma.organization.create({
      data: { name: orgName, type: "restaurant" },
    });
    orgId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `bot-test-${tag}@example.invalid`,
        name: "Bot Tester",
        passwordHash: "",
        role: "manager",
        organizationId: org.id,
        isActive: false,
      },
    });
    userId = user.id;
    const template = await prisma.journalTemplate.create({
      data: {
        code: templateCode,
        name: `Bot wizard test ${tag}`,
        description: "Ephemeral template for bot wizard tests",
        fields: [
          { key: "temp", label: "Temp", type: "number", required: true },
          { key: "note", label: "Note", type: "text" },
        ] as unknown as object,
        isActive: true,
        sortOrder: 9999,
      },
    });
    templateId = template.id;

    const data = { temp: -18.5, note: "cold storage fine" };
    const fields = parseFields(template.fields);
    const missing = findMissingRequired(fields, data);
    if (missing.length > 0) {
      bad("validation passes for valid data", missing.join(", "));
    } else {
      ok("validation passes for valid data");
    }

    const entry = await prisma.journalEntry.create({
      data: {
        templateId: template.id,
        organizationId: org.id,
        filledById: user.id,
        data: data as unknown as object,
        status: "submitted",
      },
    });

    const fresh = await prisma.journalEntry.findUnique({
      where: { id: entry.id },
    });
    if (!fresh) {
      bad("entry round-trips");
    } else {
      ok("entry round-trips");
      expectEq(
        "stored data.temp matches",
        (fresh.data as Record<string, unknown>).temp,
        -18.5
      );
      expectEq(
        "stored data.note matches",
        (fresh.data as Record<string, unknown>).note,
        "cold storage fine"
      );
      expectEq("status = submitted", fresh.status, "submitted");
      expectEq("templateId matches", fresh.templateId, template.id);
      expectEq("filledById matches", fresh.filledById, user.id);
    }

    // Required-missing path — we don't try to create; just assert the
    // validator blocks it the way saveWizard() does.
    const missingNow = findMissingRequired(fields, { note: "no temp here" });
    expectEq("required block when temp missing", missingNow, ["Temp"]);
  } catch (err) {
    bad("integration aborted", (err as Error).message);
  } finally {
    // Always attempt cleanup, even when an assertion above threw.
    try {
      if (templateId) {
        await prisma.journalEntry.deleteMany({ where: { templateId } });
        await prisma.journalTemplate.delete({ where: { id: templateId } });
      }
      if (userId) await prisma.user.delete({ where: { id: userId } });
      if (orgId) await prisma.organization.delete({ where: { id: orgId } });
      if (templateId || userId || orgId) ok("fixtures cleaned up");
    } catch (cleanupErr) {
      bad("cleanup failed", (cleanupErr as Error).message);
    }
    await prisma.$disconnect();
  }
}

async function main() {
  console.log("Running bot wizard tests...");
  runUnitTests();
  if (process.env.DATABASE_URL) {
    await runIntegrationTest();
  } else {
    console.log("\n[skip] DATABASE_URL not set — skipping integration test");
  }
  console.log(`\n${PASS} passed, ${FAIL} failed.`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main();
