/**
 * Связь сайта с приложениями: assetlinks.json по сертификату из CI и из
 * env (Play App Signing), apple-app-site-association только с Team ID,
 * APK с правильными заголовками, /api/app/info для страницы «Приложение».
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { androidFingerprints, appleAppSiteAssociation, normalizeFingerprint, registerAppLinks } from "../server/app-links";

const CERT = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

let dir: string;
const savedEnv = { ...process.env };

function publish(meta: Record<string, unknown>, apk = "PK\u0003\u0004fake-apk") {
  fs.writeFileSync(path.join(dir, "tasksflow.apk"), apk);
  fs.writeFileSync(path.join(dir, "android.json"), JSON.stringify(meta));
}

function makeApp() {
  const app = express();
  registerAppLinks(app, { downloadsDir: dir });
  return app;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-downloads-"));
  delete process.env.ANDROID_CERT_SHA256;
  delete process.env.APPLE_TEAM_ID;
  delete process.env.ANDROID_PLAY_URL;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

describe("отпечатки сертификата", () => {
  it("нормализует регистр и разделители, отбрасывает мусор", () => {
    expect(normalizeFingerprint(CERT.toLowerCase())).toBe(CERT);
    expect(normalizeFingerprint(CERT.replace(/:/g, ""))).toBe(CERT);
    expect(normalizeFingerprint("AB:CD")).toBeNull();
    expect(normalizeFingerprint("")).toBeNull();
  });

  it("берёт сертификат CI и ключ Google Play из env без повторов", () => {
    publish({ versionName: "1.0.5", versionCode: 105, size: 10, sha256: "x", certSha256: CERT });
    const play = "11".repeat(32);
    const list = androidFingerprints(dir, { ANDROID_CERT_SHA256: `${play}, ${CERT.toLowerCase()}` } as NodeJS.ProcessEnv);
    expect(list).toEqual([CERT, normalizeFingerprint(play)]);
  });
});

describe("/.well-known/assetlinks.json", () => {
  it("404, пока приложение не выложено и ключа в env нет", async () => {
    await request(makeApp()).get("/.well-known/assetlinks.json").expect(404);
  });

  it("отдаёт пакет и отпечаток, когда CI выложил APK", async () => {
    publish({ versionName: "1.0.5", versionCode: 105, size: 10, sha256: "x", certSha256: CERT });
    const res = await request(makeApp()).get("/.well-known/assetlinks.json").expect(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "ru.tasksflow.app", sha256_cert_fingerprints: [CERT] },
      },
    ]);
  });

  it("видит новый android.json без перезапуска сервера", async () => {
    const app = makeApp();
    await request(app).get("/.well-known/assetlinks.json").expect(404);
    publish({ versionName: "1.0.6", versionCode: 106, size: 10, sha256: "x", certSha256: CERT });
    await request(app).get("/.well-known/assetlinks.json").expect(200);
  });
});

describe("/.well-known/apple-app-site-association", () => {
  it("без APPLE_TEAM_ID — 404", async () => {
    await request(makeApp()).get("/.well-known/apple-app-site-association").expect(404);
  });

  it("с Team ID — JSON со ссылками кабинета, без лендинга", async () => {
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    const res = await request(makeApp()).get("/.well-known/apple-app-site-association").expect(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const body = JSON.parse(res.text);
    expect(body).toEqual(appleAppSiteAssociation("ABCDE12345"));
    const paths = body.applinks.details[0].components.map((c: { "/": string }) => c["/"]);
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.ru.tasksflow.app"]);
    expect(paths).toContain("/dashboard*");
    expect(paths).toContain("/join/*");
    expect(paths).not.toContain("/");
    expect(paths.some((p: string) => p.startsWith("/blog"))).toBe(false);
  });

  it("кривой Team ID не публикуется", async () => {
    process.env.APPLE_TEAM_ID = "not-a-team";
    await request(makeApp()).get("/.well-known/apple-app-site-association").expect(404);
  });
});

describe("APK с сайта", () => {
  it("до публикации — понятный 404", async () => {
    const res = await request(makeApp()).get("/downloads/tasksflow.apk").expect(404);
    expect(res.text).toContain("ещё не опубликован");
  });

  it("отдаёт файл как APK с версией в имени и без кэша", async () => {
    publish({ versionName: "1.0.7", versionCode: 107, size: 16, sha256: "abc", certSha256: CERT });
    const res = await request(makeApp()).get("/downloads/tasksflow.apk").buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers["content-type"]).toBe("application/vnd.android.package-archive");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="TasksFlow-1.0.7.apk"');
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect((res.body as Buffer).toString()).toContain("fake-apk");
  });

  it("android.json и /api/app/info описывают сборку", async () => {
    publish({ versionName: "1.0.7", versionCode: 107, size: 2048, sha256: "abc", certSha256: CERT, builtAt: "2026-10-23T10:00:00Z" });
    process.env.ANDROID_PLAY_URL = "https://play.google.com/store/apps/details?id=ru.tasksflow.app";
    process.env.IOS_APP_STORE_URL = "javascript:alert(1)";
    const app = makeApp();
    const meta = await request(app).get("/downloads/android.json").expect(200);
    expect(meta.body).toMatchObject({ packageName: "ru.tasksflow.app", versionName: "1.0.7", versionCode: 107, certSha256: CERT });
    const info = await request(app).get("/api/app/info").expect(200);
    expect(info.body).toEqual({
      android: {
        apk: { url: "/downloads/tasksflow.apk", versionName: "1.0.7", size: 2048, builtAt: "2026-10-23T10:00:00Z" },
        playUrl: "https://play.google.com/store/apps/details?id=ru.tasksflow.app",
        rustoreUrl: null,
      },
      // Не https — не ссылка.
      ios: { appStoreUrl: null, testflightUrl: null },
    });
  });
});
