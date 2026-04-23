/**
 * After prisma/seed.ts + seed-admin.ts + crawling each /journals/<code>
 * to trigger the built-in `ensure*SampleDocuments` helpers, some
 * templates end up with the wrong count:
 *   - audit_protocol / audit_report / complaint_register had no helper
 *     → 0 docs
 *   - equipment_calibration helper only creates an active, no closed
 *   - finished_product helper creates one closed doc per calendar day
 *     → ~36 closed docs for a single month
 *
 * This fill-up normalises every template to exactly 1 active + 1 closed
 * demo document so the dev dashboard shows the same shape across all
 * journals. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx prisma/seed-demo-docs-fillup.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const ADMIN_EMAIL = "admin@haccp.local";
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const adapter = new PrismaPg(new pg.Pool({ connectionString: DB_URL }));
const prisma = new PrismaClient({ adapter });

function monthBounds(offsetMonths: number) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + offsetMonths;
  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 0)),
  };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`Admin user ${ADMIN_EMAIL} not found`);
  const organizationId = admin.organizationId;
  const createdById = admin.id;
  const responsibleUserId = admin.id;

  const templates = await prisma.journalTemplate.findMany({
    select: { id: true, code: true, name: true },
  });

  const current = monthBounds(0);
  const previous = monthBounds(-1);

  for (const tpl of templates) {
    const active = await prisma.journalDocument.count({
      where: { templateId: tpl.id, organizationId, status: "active" },
    });
    const closed = await prisma.journalDocument.count({
      where: { templateId: tpl.id, organizationId, status: "closed" },
    });

    if (active === 1 && closed === 1) {
      continue;
    }

    // Cap excess: keep the newest 1 active, newest 1 closed, delete the rest
    if (active > 1) {
      const extras = await prisma.journalDocument.findMany({
        where: { templateId: tpl.id, organizationId, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
        skip: 1,
      });
      if (extras.length > 0) {
        await prisma.journalDocument.deleteMany({
          where: { id: { in: extras.map((e) => e.id) } },
        });
        console.log(`  ${tpl.code}: trimmed ${extras.length} extra active`);
      }
    }
    if (closed > 1) {
      const extras = await prisma.journalDocument.findMany({
        where: { templateId: tpl.id, organizationId, status: "closed" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
        skip: 1,
      });
      if (extras.length > 0) {
        await prisma.journalDocument.deleteMany({
          where: { id: { in: extras.map((e) => e.id) } },
        });
        console.log(`  ${tpl.code}: trimmed ${extras.length} extra closed`);
      }
    }

    // Fill missing
    if (active === 0) {
      await prisma.journalDocument.create({
        data: {
          templateId: tpl.id,
          organizationId,
          title: tpl.name,
          status: "active",
          dateFrom: current.from,
          dateTo: current.to,
          responsibleUserId,
          responsibleTitle: "Управляющий",
          autoFill: true,
          createdById,
          config: {},
        },
      });
      console.log(`  ${tpl.code}: created missing active`);
    }
    if (closed === 0) {
      await prisma.journalDocument.create({
        data: {
          templateId: tpl.id,
          organizationId,
          title: tpl.name,
          status: "closed",
          dateFrom: previous.from,
          dateTo: previous.to,
          responsibleUserId,
          responsibleTitle: "Управляющий",
          createdById,
          config: {},
        },
      });
      console.log(`  ${tpl.code}: created missing closed`);
    }
  }

  const summary = await prisma.$queryRawUnsafe<
    Array<{ code: string; active_docs: bigint; closed_docs: bigint }>
  >(`
    SELECT t.code,
      SUM(CASE WHEN d.status='active' THEN 1 ELSE 0 END)::int AS active_docs,
      SUM(CASE WHEN d.status='closed' THEN 1 ELSE 0 END)::int AS closed_docs
    FROM "JournalTemplate" t
    LEFT JOIN "JournalDocument" d
      ON d."templateId" = t.id AND d."organizationId" = $1
    GROUP BY t.code
    ORDER BY t.code
  `, organizationId);

  console.log("\nFinal demo-doc counts for admin org:");
  for (const row of summary) {
    console.log(`  ${row.code.padEnd(32)}  active=${row.active_docs}  closed=${row.closed_docs}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
