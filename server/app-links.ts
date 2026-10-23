/**
 * Связь сайта с приложениями и раздача APK.
 *
 *   GET /.well-known/assetlinks.json          — Android: сайт доверяет
 *       приложению ru.tasksflow.app, и Chrome открывает его без адресной
 *       строки (Trusted Web Activity). Отпечатки сертификата: из
 *       downloads/android.json (его пишет CI вместе с APK) и из
 *       ANDROID_CERT_SHA256 — для ключа Google Play App Signing.
 *   GET /.well-known/apple-app-site-association — iOS: ссылки кабинета
 *       открываются в приложении. Нужен APPLE_TEAM_ID.
 *   GET /downloads/tasksflow.apk, /downloads/android.json — APK с сайта.
 *   GET /api/app/info — что показать на странице «Приложение».
 *
 * Регистрируется до SSR и SPA-fallback, иначе /.well-known отдал бы HTML.
 */
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { APP_PACKAGE_ID, type AppInfo } from "@shared/app-info";

export const DOWNLOADS_ROOT = path.resolve(process.cwd(), "downloads");

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AndroidRelease = {
  versionName: string;
  versionCode: number;
  size: number;
  sha256: string;
  certSha256: string | null;
  builtAt: string | null;
};

/** "ab:cd:…" или "ABCD…" → "AB:CD:…"; мусор — null. */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 64) return null;
  const value = hex.match(/.{2}/g)!.join(":");
  return FINGERPRINT.test(value) ? value : null;
}

let releaseCache: { mtimeMs: number; dir: string; value: AndroidRelease | null } | null = null;

/** Последний APK, который выложил CI. Перечитывается, когда файл меняется. */
export function readAndroidRelease(dir = DOWNLOADS_ROOT): AndroidRelease | null {
  const meta = path.join(dir, "android.json");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(meta);
  } catch {
    return null;
  }
  if (releaseCache && releaseCache.dir === dir && releaseCache.mtimeMs === stat.mtimeMs) return releaseCache.value;
  let value: AndroidRelease | null = null;
  try {
    const json = JSON.parse(fs.readFileSync(meta, "utf8"));
    if (fs.existsSync(path.join(dir, "tasksflow.apk")) && typeof json.versionName === "string") {
      value = {
        versionName: json.versionName,
        versionCode: Number(json.versionCode) || 0,
        size: Number(json.size) || 0,
        sha256: typeof json.sha256 === "string" ? json.sha256 : "",
        certSha256: typeof json.certSha256 === "string" ? normalizeFingerprint(json.certSha256) : null,
        builtAt: typeof json.builtAt === "string" ? json.builtAt : null,
      };
    }
  } catch {
    value = null;
  }
  releaseCache = { mtimeMs: stat.mtimeMs, dir, value };
  return value;
}

export function androidFingerprints(dir = DOWNLOADS_ROOT, env = process.env): string[] {
  const fromEnv = (env.ANDROID_CERT_SHA256 || "")
    .split(/[\s,;]+/)
    .map((v) => normalizeFingerprint(v))
    .filter((v): v is string => !!v);
  const fromRelease = readAndroidRelease(dir)?.certSha256;
  return Array.from(new Set([...(fromRelease ? [fromRelease] : []), ...fromEnv]));
}

/** Страницы кабинета, которые iOS открывает в приложении (лендинг и блог — в Safari). */
const IOS_APP_PATHS = [
  "/dashboard*",
  "/login*",
  "/account*",
  "/reports*",
  "/register*",
  "/join/*",
  "/tasks/*",
  "/workers/*",
  "/admin/*",
  "/help*",
  "/instructions*",
];

export function appleAppSiteAssociation(teamId: string) {
  const appId = `${teamId}.${APP_PACKAGE_ID}`;
  return {
    applinks: {
      details: [{ appIDs: [appId], components: IOS_APP_PATHS.map((p) => ({ "/": p })) }],
    },
    webcredentials: { apps: [appId] },
  };
}

const TEAM_ID = /^[A-Z0-9]{10}$/;

export function appInfo(dir = DOWNLOADS_ROOT, env = process.env): AppInfo {
  const release = readAndroidRelease(dir);
  const url = (value: string | undefined) => (value && /^https:\/\//.test(value) ? value : null);
  return {
    android: {
      apk: release
        ? { url: "/downloads/tasksflow.apk", versionName: release.versionName, size: release.size, builtAt: release.builtAt }
        : null,
      playUrl: url(env.ANDROID_PLAY_URL),
      rustoreUrl: url(env.ANDROID_RUSTORE_URL),
    },
    ios: {
      appStoreUrl: url(env.IOS_APP_STORE_URL),
      testflightUrl: url(env.IOS_TESTFLIGHT_URL),
    },
  };
}

export function registerAppLinks(app: Express, options: { downloadsDir?: string } = {}): void {
  const dir = options.downloadsDir ?? DOWNLOADS_ROOT;

  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    const fingerprints = androidFingerprints(dir);
    if (fingerprints.length === 0) {
      res.status(404).json([]);
      return;
    }
    res
      .set("Cache-Control", "public, max-age=300")
      .json([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: APP_PACKAGE_ID, sha256_cert_fingerprints: fingerprints },
        },
      ]);
  });

  app.get("/.well-known/apple-app-site-association", (_req: Request, res: Response) => {
    const teamId = (process.env.APPLE_TEAM_ID || "").trim();
    if (!TEAM_ID.test(teamId)) {
      res.status(404).json({});
      return;
    }
    // Apple ждёт JSON без редиректов и без расширения в пути.
    res.set("Cache-Control", "public, max-age=3600").type("application/json").send(JSON.stringify(appleAppSiteAssociation(teamId)));
  });

  app.get("/downloads/android.json", (_req: Request, res: Response) => {
    const release = readAndroidRelease(dir);
    if (!release) {
      res.status(404).json({ message: "APK ещё не опубликован" });
      return;
    }
    res.set("Cache-Control", "no-cache").json({ packageName: APP_PACKAGE_ID, ...release });
  });

  app.get("/downloads/tasksflow.apk", (_req: Request, res: Response) => {
    const release = readAndroidRelease(dir);
    if (!release) {
      res.status(404).type("text/plain").send("APK ещё не опубликован");
      return;
    }
    res.set({
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="TasksFlow-${release.versionName.replace(/[^0-9A-Za-z.\-]/g, "")}.apk"`,
      // Имя файла не меняется между версиями — без кэша, иначе скачается старая.
      "Cache-Control": "no-cache",
    });
    res.sendFile(path.join(dir, "tasksflow.apk"));
  });

  app.get("/api/app/info", (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=60").json(appInfo(dir));
  });
}
