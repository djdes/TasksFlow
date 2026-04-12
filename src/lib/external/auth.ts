import { NextResponse } from "next/server";

export type ExternalAuthResult =
  | { ok: true; token: string; source: "external" | "sensor" }
  | { ok: false; response: NextResponse };

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function tokenHint(token: string | null | undefined): string {
  if (!token) return "none";
  return token.length <= 4 ? "***" : `***${token.slice(-4)}`;
}

/**
 * Validate Bearer token against EXTERNAL_API_TOKEN and SENSOR_API_TOKEN envs.
 * Returns which bucket the caller belongs to so routes can gate per-source behaviour.
 */
export function authenticateExternalRequest(request: Request): ExternalAuthResult {
  const token = extractBearer(request);
  const external = process.env.EXTERNAL_API_TOKEN?.trim();
  const sensor = process.env.SENSOR_API_TOKEN?.trim();

  if (!external && !sensor) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "External API token not configured on server" },
        { status: 503 }
      ),
    };
  }

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Authorization: Bearer <token> required" },
        { status: 401 }
      ),
    };
  }

  if (external && token === external) {
    return { ok: true, token, source: "external" };
  }
  if (sensor && token === sensor) {
    return { ok: true, token, source: "sensor" };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: "Invalid token" },
      { status: 401 }
    ),
  };
}
