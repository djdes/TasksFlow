/**
 * APNs для iOS-приложения: HTTP/2 + токен-аутентификация (ключ .p8 из
 * Apple Developer → Keys). Без зависимостей: JWT ES256 подписывает
 * node:crypto, соединение держит node:http2.
 *
 *   APNS_KEY_ID, APNS_TEAM_ID (или APPLE_TEAM_ID), APNS_KEY — содержимое .p8
 *   (PEM, можно в одну строку с \n или base64), APNS_BUNDLE_ID — по умолчанию
 *   ru.tasksflow.app. Без них APNs выключен, остальное работает.
 */
import crypto from "node:crypto";
import http2 from "node:http2";
import { APP_PACKAGE_ID } from "@shared/app-info";
import type { SendResult } from "./types";

export type ApnsConfig = { keyId: string; teamId: string; bundleId: string; key: crypto.KeyObject };
export type ApnsEnvironment = "sandbox" | "production";

export const APNS_ORIGINS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

export function apnsFromEnv(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = (env.APNS_TEAM_ID || env.APPLE_TEAM_ID)?.trim();
  let raw = env.APNS_KEY?.trim();
  if (!keyId || !teamId || !raw) return null;
  if (!raw.includes("BEGIN")) raw = Buffer.from(raw, "base64").toString("utf8");
  raw = raw.replace(/\\n/g, "\n");
  try {
    return { keyId, teamId, bundleId: env.APNS_BUNDLE_ID?.trim() || APP_PACKAGE_ID, key: crypto.createPrivateKey(raw) };
  } catch {
    return null;
  }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

let cachedToken: { token: string; iat: number; keyId: string } | null = null;

/** Apple принимает токен до часа и не любит новый на каждый запрос — обновляем раз в 50 минут. */
export function apnsJwt(cfg: ApnsConfig, now = Math.floor(Date.now() / 1000)): string {
  if (cachedToken && cachedToken.keyId === cfg.keyId && now - cachedToken.iat < 50 * 60) return cachedToken.token;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key: cfg.key, dsaEncoding: "ieee-p1363" });
  const token = `${header}.${claims}.${b64url(signature)}`;
  cachedToken = { token, iat: now, keyId: cfg.keyId };
  return token;
}

const sessions = new Map<string, http2.ClientHttp2Session>();

function session(origin: string): http2.ClientHttp2Session {
  const existing = sessions.get(origin);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const client = http2.connect(origin);
  client.on("error", () => sessions.delete(origin));
  client.on("close", () => sessions.delete(origin));
  // Соединение не должно держать процесс при остановке.
  client.unref();
  sessions.set(origin, client);
  return client;
}

export function closeApnsSessions() {
  sessions.forEach((client) => client.close());
  sessions.clear();
}

export type ApnsPayload = {
  aps: { alert: { title: string; body: string }; sound?: string; "thread-id"?: string };
  url: string;
};

export function sendApns(
  cfg: ApnsConfig,
  token: string,
  environment: ApnsEnvironment,
  payload: ApnsPayload,
  opts: { ttl: number; collapseId?: string; origin?: string },
): Promise<SendResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: SendResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    let req: http2.ClientHttp2Stream;
    try {
      const headers: http2.OutgoingHttpHeaders = {
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${apnsJwt(cfg)}`,
        "apns-topic": cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + opts.ttl),
        "content-type": "application/json",
      };
      if (opts.collapseId) headers["apns-collapse-id"] = opts.collapseId.slice(0, 64);
      req = session(opts.origin ?? APNS_ORIGINS[environment]).request(headers);
    } catch {
      done("failed");
      return;
    }
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.setTimeout(10_000, () => {
      req.close();
      done("failed");
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      if (status === 200) return done("ok");
      let reason = "";
      try {
        reason = JSON.parse(body).reason ?? "";
      } catch {
        reason = "";
      }
      // Приложение удалили или токен от другой сборки — больше не шлём.
      if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic") {
        return done("gone");
      }
      done("failed");
    });
    req.on("error", () => done("failed"));
    req.end(JSON.stringify(payload));
  });
}
