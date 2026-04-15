import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBuildMeta(): { sha: string | null; time: string | null } {
  try {
    const root = process.cwd();
    const sha = fs.readFileSync(path.join(root, ".build-sha"), "utf8").trim() || null;
    const time = fs
      .readFileSync(path.join(root, ".build-time"), "utf8")
      .trim() || null;
    return { sha, time };
  } catch {
    return { sha: null, time: null };
  }
}

/**
 * Lightweight healthcheck for external integrators. Answers three questions:
 *  - is the server up?
 *  - which build is live (sha + time)?
 *  - can we read the database and how many canonical journal templates does it hold?
 *
 * Deliberately anonymous — no bearer token required. External apps should
 * call this at startup to detect rolling deploys before issuing real POSTs.
 */
export async function GET() {
  const startedAt = Date.now();
  const { sha, time } = readBuildMeta();

  let dbReachable = false;
  let journalTemplateCount = 0;
  try {
    journalTemplateCount = await db.journalTemplate.count({ where: { isActive: true } });
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      ok: dbReachable,
      build: { sha, time },
      db: { reachable: dbReachable, journalTemplates: journalTemplateCount },
      latencyMs: elapsedMs,
      now: new Date().toISOString(),
    },
    { status: dbReachable ? 200 : 503 }
  );
}
