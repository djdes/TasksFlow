import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateExternalRequest, tokenHint } from "@/lib/external/auth";
import { dispatchExternalEntries } from "@/lib/external/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EntrySchema = z.object({
  employeeId: z.string().optional().nullable(),
  date: z.string().min(10).optional().nullable(),
  data: z.unknown().optional(),
});

const PayloadSchema = z.object({
  organizationId: z.string().min(1),
  journalCode: z.string().min(1),
  date: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  data: z.unknown().optional(),
  entries: z.array(EntrySchema).optional(),
});

async function logRequest(params: {
  organizationId: string | null;
  journalCode: string | null;
  date: Date | null;
  source: string | null;
  token: string;
  httpStatus: number;
  status: "ok" | "error";
  errorMessage?: string | null;
  documentId?: string | null;
  entriesWritten?: number;
  payload?: unknown;
}) {
  try {
    await db.journalExternalLog.create({
      data: {
        organizationId: params.organizationId ?? undefined,
        journalCode: params.journalCode ?? undefined,
        date: params.date ?? undefined,
        source: params.source ?? undefined,
        tokenHint: tokenHint(params.token),
        httpStatus: params.httpStatus,
        status: params.status,
        errorMessage: params.errorMessage ?? undefined,
        documentId: params.documentId ?? undefined,
        entriesWritten: params.entriesWritten ?? 0,
        payload: (params.payload ?? null) as never,
      },
    });
  } catch (error) {
    console.error("[external] failed to write JournalExternalLog", error);
  }
}

export async function POST(request: Request) {
  const auth = authenticateExternalRequest(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const res = NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    await logRequest({
      organizationId: null,
      journalCode: null,
      date: null,
      source: auth.source,
      token: auth.token,
      httpStatus: 400,
      status: "error",
      errorMessage: "Invalid JSON",
    });
    return res;
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    await logRequest({
      organizationId: null,
      journalCode: null,
      date: null,
      source: auth.source,
      token: auth.token,
      httpStatus: 400,
      status: "error",
      errorMessage: parsed.error.message,
      payload: body,
    });
    return NextResponse.json(
      { ok: false, error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  const entries = payload.entries && payload.entries.length > 0
    ? payload.entries
    : [
        {
          employeeId: payload.employeeId ?? null,
          date: payload.date ?? null,
          data: payload.data ?? {},
        },
      ];

  const anchorDate = (() => {
    const candidate = payload.date ?? entries[0]?.date;
    if (!candidate) return null;
    const d = new Date(candidate);
    return Number.isFinite(d.getTime()) ? d : null;
  })();

  const result = await dispatchExternalEntries({
    organizationId: payload.organizationId,
    journalCode: payload.journalCode,
    entries,
  }).catch((error) => ({
    ok: false as const,
    httpStatus: 500,
    error: error instanceof Error ? error.message : "Unknown dispatch error",
  }));

  if (!result.ok) {
    await logRequest({
      organizationId: payload.organizationId,
      journalCode: payload.journalCode,
      date: anchorDate,
      source: payload.source ?? auth.source,
      token: auth.token,
      httpStatus: result.httpStatus,
      status: "error",
      errorMessage: result.error,
      payload,
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  await logRequest({
    organizationId: payload.organizationId,
    journalCode: payload.journalCode,
    date: anchorDate,
    source: payload.source ?? auth.source,
    token: auth.token,
    httpStatus: 200,
    status: "ok",
    documentId: result.documentId,
    entriesWritten: result.entriesWritten,
    payload,
  });

  return NextResponse.json({
    ok: true,
    documentId: result.documentId,
    entriesWritten: result.entriesWritten,
    createdDocument: result.createdDocument,
    templateCode: result.templateCode,
  });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      name: "journals-external-entries",
      methods: ["POST"],
      docs: ".agent/tasks/journals-external-api/API.md",
    },
    { status: 200 }
  );
}
