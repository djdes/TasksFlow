import type { Request } from "express";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function parseHttpUrl(value: string | undefined | null): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isLocalUrl(value: URL): boolean {
  return LOCAL_HOSTNAMES.has(value.hostname);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function publicEnvUrl(names: string[]): URL | null {
  for (const name of names) {
    const parsed = parseHttpUrl(process.env[name]);
    if (parsed) return parsed;
  }
  return null;
}

export function getPublicTasksflowBaseUrl(req: Request): string {
  const fromEnv = publicEnvUrl([
    "TASKSFLOW_PUBLIC_URL",
    "APP_PUBLIC_URL",
    "APP_URL",
    "PUBLIC_URL",
  ]);
  if (fromEnv) return trimTrailingSlashes(fromEnv.toString());

  const origin = parseHttpUrl(firstHeaderValue(req.headers.origin));
  if (origin && (!isProduction() || !isLocalUrl(origin))) {
    return trimTrailingSlashes(origin.toString());
  }

  const forwardedHost = firstHeaderValue(req.headers["x-forwarded-host"]);
  const host = forwardedHost || req.headers.host;
  if (host) {
    const forwardedProto =
      firstHeaderValue(req.headers["x-forwarded-proto"]) ||
      (isProduction() ? "https" : req.protocol || "http");
    const parsed = parseHttpUrl(`${forwardedProto}://${host}`);
    if (parsed && (!isProduction() || !isLocalUrl(parsed))) {
      return trimTrailingSlashes(parsed.toString());
    }
  }

  if (isProduction()) {
    return "https://tasksflow.ru";
  }

  return `http://localhost:${process.env.PORT || 5001}`;
}

export function getPublicWesetupBaseUrl(internalBaseUrl: string): string {
  const fromEnv = publicEnvUrl(["WESETUP_PUBLIC_URL"]);
  if (fromEnv) return trimTrailingSlashes(fromEnv.toString());

  const parsedInternal = parseHttpUrl(internalBaseUrl);
  if (parsedInternal && isProduction() && isLocalUrl(parsedInternal)) {
    return "https://wesetup.ru";
  }

  return trimTrailingSlashes(internalBaseUrl);
}

export function toPublicWesetupUrl(upstreamUrl: string, publicBaseUrl: string): string {
  const base = parseHttpUrl(publicBaseUrl);
  if (!base) return upstreamUrl;

  let parsed: URL;
  try {
    parsed = new URL(upstreamUrl, base);
  } catch {
    return upstreamUrl;
  }

  if (isLocalUrl(parsed) || !parseHttpUrl(upstreamUrl)) {
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, base).toString();
  }

  return parsed.toString();
}
