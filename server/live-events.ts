import { EventEmitter } from "node:events";
import type { Request, Response } from "express";

/**
 * Живые обновления кабинета через Server-Sent Events.
 *
 * Кто-то закрыл задачу (на сайте, в Telegram, через WeSetup) — всем
 * открытым кабинетам этой компании уходит событие «tasks», и клиент
 * перезапрашивает список. Данных задач в событии нет: права остаются на
 * обычных GET, а событие говорит только «пора обновиться».
 *
 * Один процесс (как и очередь вебхуков): шина в памяти. При нескольких
 * процессах кабинет просто обновится по фокусу окна, как раньше.
 */
export type LiveEvent = { type: "tasks"; taskId?: number | null } | { type: "billing" };

const bus = new EventEmitter();
bus.setMaxListeners(0);

const streams = new Set<Response>();
const perUser = new Map<number, number>();
const MAX_STREAMS = 2000;
const MAX_PER_USER = 6;
const HEARTBEAT_MS = 25_000;

export function publishToCompany(companyId: number | null | undefined, event: LiveEvent): void {
  if (!companyId) return;
  bus.emit(`company:${companyId}`, event);
}

/**
 * Открыть поток событий компании. Сердцебиение раз в 25 с держит
 * соединение через nginx (proxy_read_timeout 60 с) и мобильные сети.
 */
export function openLiveStream(req: Request, res: Response, companyId: number, userId: number): void {
  const mine = perUser.get(userId) ?? 0;
  if (streams.size >= MAX_STREAMS || mine >= MAX_PER_USER) {
    res.status(429).json({ message: "Слишком много открытых вкладок" });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // nginx не должен копить поток в буфере.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  // Переподключение через 5 с, если соединение оборвалось.
  res.write("retry: 5000\n\n");

  const channel = `company:${companyId}`;
  const send = (event: LiveEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  heartbeat.unref?.();

  bus.on(channel, send);
  streams.add(res);
  perUser.set(userId, mine + 1);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    bus.off(channel, send);
    streams.delete(res);
    const left = (perUser.get(userId) ?? 1) - 1;
    if (left > 0) perUser.set(userId, left);
    else perUser.delete(userId);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
}

/** При остановке сервера: иначе открытые потоки держат httpServer.close(). */
export function closeAllLiveStreams(): void {
  for (const res of Array.from(streams)) res.end();
}

export function liveStreamCount(): number {
  return streams.size;
}
