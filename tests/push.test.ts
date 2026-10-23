/**
 * Push-уведомления: фильтр push-сервисов (SSRF), шифрование Web Push так,
 * что браузер его расшифрует, APNs по HTTP/2 с подписанным JWT, рассылка
 * с чисткой мёртвых подписок, склейка частых событий, маршруты подписки и
 * push в утренних напоминаниях.
 */
import crypto from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import webpush from "web-push";
// @ts-expect-error — у http_ece нет типов; он приходит вместе с web-push.
import ece from "http_ece";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isAllowedPushEndpoint } from "../shared/push";

const users = new Map<number, any>([
  [10, { id: 10, name: "Анна", phone: "+79990000010", companyId: 1, isAdmin: false }],
  [1, { id: 1, name: "Ирина", phone: "+79990000001", companyId: 1, isAdmin: true }],
]);

vi.mock("../server/storage", () => ({
  storage: {
    getUserById: async (id: number) => users.get(id),
    getAllUsers: async () => Array.from(users.values()),
  },
  DatabaseStorage: { parseManagedWorkerIds: (raw: string | null) => (raw ? JSON.parse(raw) : null) },
}));
vi.mock("../server/db", () => ({ db: {} }));

const { sendToUsers, notifySoon, newTasksMessage, awaitingReviewMessage, resetPushConfig, pushConfig } = await import("../server/push");
const { apnsJwt, sendApns, closeApnsSessions } = await import("../server/push/apns");
const { registerPushRoutes } = await import("../server/push-routes");
const { runReminders } = await import("../server/services/reminders");

describe("какие endpoint принимаем", () => {
  it("push-сервисы браузеров — да", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://web.push.apple.com/QOnEdj",
      "https://wns2-am3p.notify.windows.com/w/?token=x",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("свой адрес, http, порт, IP и похожие домены — нет", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/x",
      "https://fcm.googleapis.com:8443/x",
      "https://evil.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://user:pass@fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
    expect(isAllowedPushEndpoint("https://push.example.org/x", ["example.org"])).toBe(true);
  });
});

describe("Web Push", () => {
  it("браузер расшифровывает уведомление, VAPID подписан для его push-сервиса", async () => {
    const vapid = webpush.generateVAPIDKeys();
    const browser = crypto.createECDH("prime256v1");
    browser.generateKeys();
    const authSecret = crypto.randomBytes(16);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
      keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") },
    };
    const payload = JSON.stringify({ title: "Новая задача", body: "Витрина", url: "/dashboard", tag: "new-tasks" });
    const details = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: { subject: "mailto:support@tasksflow.ru", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 600,
      topic: "new-tasks",
    });
    expect(details.headers.TTL).toBe(600);
    expect(details.headers.Topic).toBe("new-tasks");
    const auth = String(details.headers.Authorization);
    expect(auth).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    const jwt = auth.slice("vapid t=".length).split(",")[0];
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:support@tasksflow.ru");

    const decrypted = ece.decrypt(details.body, { version: "aes128gcm", privateKey: browser, authSecret: subscription.keys.auth });
    expect(JSON.parse(decrypted.toString())).toEqual(JSON.parse(payload));
  });
});

describe("APNs", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const cfg = { keyId: "KEY1234567", teamId: "TEAM123456", bundleId: "ru.tasksflow.app", key: privateKey };
  let server: http2.Http2Server;
  let origin = "";
  const seen: Array<{ headers: http2.IncomingHttpHeaders; body: string }> = [];
  let reply: { status: number; body?: string } = { status: 200 };

  beforeAll(async () => {
    server = http2.createServer();
    server.on("stream", (stream, headers) => {
      let body = "";
      stream.setEncoding("utf8");
      stream.on("data", (c) => (body += c));
      stream.on("end", () => {
        seen.push({ headers, body });
        stream.respond({ ":status": reply.status, "content-type": "application/json" });
        stream.end(reply.body ?? "");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    closeApnsSessions();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    seen.length = 0;
    reply = { status: 200 };
  });

  it("JWT ES256 с kid и iss, подпись проверяется открытым ключом", () => {
    const token = apnsJwt(cfg, 1_800_000_000);
    const [h, c, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    const ok = crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
    // Тот же токен в пределах 50 минут.
    expect(apnsJwt(cfg, 1_800_000_000 + 49 * 60)).toBe(token);
  });

  it("запрос по правилам Apple и ответ 200 — доставлено", async () => {
    const token = "a".repeat(64);
    const result = await sendApns(
      cfg,
      token,
      "production",
      { aps: { alert: { title: "Новая задача", body: "Витрина" }, sound: "default" }, url: "/dashboard" },
      { ttl: 3600, collapseId: "new-tasks", origin },
    );
    expect(result).toBe("ok");
    const { headers, body } = seen[0];
    expect(headers[":method"]).toBe("POST");
    expect(headers[":path"]).toBe(`/3/device/${token}`);
    expect(headers["apns-topic"]).toBe("ru.tasksflow.app");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers["apns-collapse-id"]).toBe("new-tasks");
    expect(String(headers.authorization)).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(body)).toEqual({ aps: { alert: { title: "Новая задача", body: "Витрина" }, sound: "default" }, url: "/dashboard" });
  });

  it("410 и BadDeviceToken — подписки нет; 500 — временная ошибка", async () => {
    const payload = { aps: { alert: { title: "t", body: "b" } }, url: "/" };
    reply = { status: 410, body: JSON.stringify({ reason: "Unregistered" }) };
    expect(await sendApns(cfg, "b".repeat(64), "sandbox", payload, { ttl: 60, origin })).toBe("gone");
    reply = { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
    expect(await sendApns(cfg, "b".repeat(64), "sandbox", payload, { ttl: 60, origin })).toBe("gone");
    reply = { status: 500, body: JSON.stringify({ reason: "InternalServerError" }) };
    expect(await sendApns(cfg, "b".repeat(64), "sandbox", payload, { ttl: 60, origin })).toBe("failed");
  });
});

function fakeStore(rows: any[]) {
  return {
    rows,
    save: vi.fn(async () => {}),
    removeEndpoint: vi.fn(async () => 1),
    listForUsers: vi.fn(async (ids: number[]) => rows.filter((r) => ids.includes(r.userId))),
    remove: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    markOk: vi.fn(async () => {}),
    countForUser: vi.fn(async () => 2),
  };
}

describe("рассылка", () => {
  it("Web Push и APNs по устройствам, мёртвые подписки удаляются", async () => {
    const store = fakeStore([
      { id: 1, userId: 10, kind: "web", endpoint: "https://fcm.googleapis.com/a", p256dh: "k", auth: "a", environment: null },
      { id: 2, userId: 10, kind: "web", endpoint: "https://fcm.googleapis.com/b", p256dh: "k", auth: "a", environment: null },
      { id: 3, userId: 10, kind: "apns", endpoint: "c".repeat(64), p256dh: null, auth: null, environment: "sandbox" },
      { id: 4, userId: 99, kind: "web", endpoint: "https://fcm.googleapis.com/x", p256dh: "k", auth: "a", environment: null },
    ]);
    const web = vi.fn(async (target: { endpoint: string }) => (target.endpoint.endsWith("/a") ? ("ok" as const) : ("gone" as const)));
    const apns = vi.fn(async () => "failed" as const);
    const result = await sendToUsers([10, 10], { title: "Новая задача", body: "Витрина", url: "/dashboard", tag: "new-tasks" }, {
      store,
      web,
      apns,
    });
    expect(result).toEqual({ sent: 1, removed: 1 });
    expect(store.listForUsers).toHaveBeenCalledWith([10]);
    expect(web).toHaveBeenCalledTimes(2);
    const payload = JSON.parse((web.mock.calls[0] as unknown as [unknown, string])[1]);
    expect(payload).toMatchObject({ title: "Новая задача", body: "Витрина", url: "/dashboard", tag: "new-tasks" });
    expect(apns).toHaveBeenCalledWith("c".repeat(64), "sandbox", expect.objectContaining({ url: "/dashboard" }), expect.objectContaining({ collapseId: "new-tasks" }));
    expect(store.markOk).toHaveBeenCalledWith(1);
    expect(store.remove).toHaveBeenCalledWith(2);
    expect(store.markFailed).toHaveBeenCalledWith(3);
  });

  it("без транспортов ничего не читает из БД", async () => {
    const store = fakeStore([]);
    expect(await sendToUsers([10], { title: "t", body: "b", url: "/" }, { store, web: null, apns: null })).toEqual({ sent: 0, removed: 0 });
    expect(store.listForUsers).not.toHaveBeenCalled();
  });

  it("несколько событий подряд — одно уведомление", async () => {
    const send = vi.fn();
    notifySoon("new-task", 10, "Витрина", newTasksMessage, send, 20);
    notifySoon("new-task", 10, "Склад", newTasksMessage, send, 20);
    notifySoon("new-task", 10, "Касса", newTasksMessage, send, 20);
    notifySoon("review", 1, "Витрина — Анна", awaitingReviewMessage, send, 20);
    await new Promise((r) => setTimeout(r, 60));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith([10], { title: "Новых задач: 3", body: "Витрина · Склад · Касса", url: "/dashboard", tag: "new-tasks" });
    expect(send).toHaveBeenCalledWith([1], { title: "Ждёт проверки", body: "Витрина — Анна", url: "/admin/verification", tag: "verification" });
    expect(newTasksMessage(["a", "b", "c", "d", "e"]).body).toBe("a · b · c и ещё 2");
  });
});

describe("маршруты подписки", () => {
  const saved = { ...process.env };
  let store: ReturnType<typeof fakeStore>;
  let send: ReturnType<typeof vi.fn>;

  function app(userId = 10) {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => {
      (req as any).session = { userId };
      next();
    });
    registerPushRoutes(a, { requireAuth: (_req, _res, next) => next(), store, send: send as any, extraHosts: [] });
    return a;
  }

  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
    keys: { p256dh: "B" + "A".repeat(86), auth: "c".repeat(22) },
  };

  beforeEach(() => {
    store = fakeStore([]);
    send = vi.fn(async () => ({ sent: 1, removed: 0 }));
    process.env.VAPID_PUBLIC_KEY = "BPub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    delete process.env.APNS_KEY_ID;
    resetPushConfig();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetPushConfig();
  });

  it("config отдаёт открытый ключ, без ключей — выключено", async () => {
    const res = await request(app()).get("/api/push/config").expect(200);
    expect(res.body).toEqual({ web: { enabled: true, publicKey: "BPub" }, apns: { enabled: false } });
    delete process.env.VAPID_PUBLIC_KEY;
    resetPushConfig();
    expect(pushConfig().web.enabled).toBe(false);
  });

  it("подписка браузера сохраняется на того, кто вошёл", async () => {
    const res = await request(app()).post("/api/push/subscriptions").send({ kind: "web", subscription }).expect(201);
    expect(res.body).toEqual({ ok: true, devices: 2 });
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, companyId: 1, kind: "web", endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh }),
    );
  });

  it("чужой адрес вместо push-сервиса — 400, сервер туда не пойдёт", async () => {
    const res = await request(app())
      .post("/api/push/subscriptions")
      .send({ kind: "web", subscription: { ...subscription, endpoint: "https://169.254.169.254/latest" } })
      .expect(400);
    expect(res.body.message).toContain("не поддерживается");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("iPhone без ключа APNs — понятный 503; кривой токен — 400", async () => {
    await request(app()).post("/api/push/subscriptions").send({ kind: "apns", token: "a".repeat(64), environment: "production" }).expect(503);
    await request(app()).post("/api/push/subscriptions").send({ kind: "apns", token: "zz", environment: "production" }).expect(400);
  });

  it("отписка — только своё устройство", async () => {
    await request(app()).delete("/api/push/subscriptions").send({ endpoint: subscription.endpoint }).expect(200);
    expect(store.removeEndpoint).toHaveBeenCalledWith(subscription.endpoint, 10);
    await request(app()).delete("/api/push/subscriptions").send({}).expect(400);
  });

  it("проверочное уведомление себе, не чаще раза в 10 секунд", async () => {
    const a = app(1);
    const res = await request(a).post("/api/push/test").expect(200);
    expect(res.body).toEqual({ sent: 1, removed: 0 });
    expect(send).toHaveBeenCalledWith([1], expect.objectContaining({ title: "Уведомления работают", tag: "test" }));
    await request(a).post("/api/push/test").expect(429);
  });
});

describe("push в напоминаниях", () => {
  it("утром push получает и тот, у кого нет Telegram", async () => {
    const msk9 = Date.UTC(2026, 9, 24, 6, 5) / 1000; // 09:05 по Москве
    const person = { id: 10, name: "Анна Петрова", phone: "+7999", isAdmin: false, companyId: 1, managedWorkerIds: null, tgChatId: null, tgStartedAt: null };
    const tasks = [
      { id: 1, title: "Витрина", workerId: 10, isCompleted: false, isRecurring: true, completedAt: null, createdAt: 1, photoUrls: [], checklist: [], weekDays: null, monthDay: null, price: 0, claimedByWorkerId: null, verificationStatus: null, companyId: 1 },
      { id: 2, title: "Склад", workerId: 10, isCompleted: false, isRecurring: true, completedAt: null, createdAt: 1, photoUrls: [], checklist: [], weekDays: null, monthDay: null, price: 0, claimedByWorkerId: null, verificationStatus: null, companyId: 1 },
    ];
    const push = vi.fn(async () => true);
    const runs = await runReminders(
      {
        listCompanies: async () => [{ id: 1, timezone: "Europe/Moscow", notifySettings: null, notifyState: null }],
        claimNotify: async () => true,
        getUsers: async () => [person as any],
        getTasks: async () => tasks as any,
      },
      { pushRecipients: async () => new Set([10]), push },
      msk9,
      { reportUrl: "https://tasksflow.ru/reports" },
    );
    expect(runs).toEqual([{ companyId: 1, slot: "morning", sent: 1 }]);
    expect(push).toHaveBeenCalledWith(10, {
      title: "Доброе утро, Анна!",
      body: "Задач на сегодня: 2. Витрина · Склад",
      url: "/dashboard",
      tag: "morning",
    });
  });
});
