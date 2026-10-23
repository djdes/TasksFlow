/**
 * SSE кабинета: событие уходит только своей компании, поток чистится при
 * закрытии, лимит вкладок на человека, остановка сервера закрывает потоки.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { closeAllLiveStreams, liveStreamCount, openLiveStream, publishToCompany } from "../server/live-events";

function fakeStream() {
  const req = new EventEmitter() as any;
  const res = new EventEmitter() as any;
  res.writes = [] as string[];
  res.headers = {} as Record<string, string>;
  res.status = (code: number) => ((res.code = code), res);
  res.json = (body: unknown) => ((res.body = body), res);
  res.setHeader = (k: string, v: string) => (res.headers[k.toLowerCase()] = v);
  res.flushHeaders = () => {};
  res.write = (chunk: string) => (res.writes.push(chunk), true);
  res.end = () => res.emit("close");
  return { req, res };
}

describe("живые обновления", () => {
  it("событие получает только своя компания", () => {
    const a = fakeStream();
    const b = fakeStream();
    openLiveStream(a.req, a.res, 1, 100);
    openLiveStream(b.req, b.res, 2, 200);
    expect(a.res.headers["content-type"]).toContain("text/event-stream");
    expect(a.res.headers["x-accel-buffering"]).toBe("no");
    publishToCompany(1, { type: "tasks", taskId: 5 });
    expect(a.res.writes.at(-1)).toBe('event: tasks\ndata: {"type":"tasks","taskId":5}\n\n');
    expect(b.res.writes.some((w: string) => w.startsWith("event:"))).toBe(false);
    a.req.emit("close");
    b.req.emit("close");
  });

  it("закрытая вкладка больше ничего не получает", () => {
    const a = fakeStream();
    openLiveStream(a.req, a.res, 3, 300);
    const before = liveStreamCount();
    a.req.emit("close");
    expect(liveStreamCount()).toBe(before - 1);
    const writes = a.res.writes.length;
    publishToCompany(3, { type: "tasks" });
    expect(a.res.writes.length).toBe(writes);
  });

  it("не больше 6 потоков на человека", () => {
    const open = Array.from({ length: 6 }, () => fakeStream());
    open.forEach((s) => openLiveStream(s.req, s.res, 4, 400));
    const extra = fakeStream();
    openLiveStream(extra.req, extra.res, 4, 400);
    expect(extra.res.code).toBe(429);
    open[0].req.emit("close");
    const again = fakeStream();
    openLiveStream(again.req, again.res, 4, 400);
    expect(again.res.code).toBe(200);
    closeAllLiveStreams();
    expect(liveStreamCount()).toBe(0);
  });
});
