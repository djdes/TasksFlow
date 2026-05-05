import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

const host = process.env.MYSQL_HOST;
const user = process.env.MYSQL_USER;
const password = process.env.MYSQL_PASSWORD;
const database = process.env.MYSQL_DATABASE;

if (!host || !user || !password || !database) {
  throw new Error("MySQL credentials not set. Check MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE");
}

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  // TCP keep-alive: за NAT / firewall idle connection часто рвётся
  // через ~30s. Без этого следующий запрос на «протухшем» сокете
  // валится с PROTOCOL_CONNECTION_LOST, и юзер видит 500 пока pool
  // не вычистит мёртвые соединения.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  // idleTimeout — закрываем connection если он не использовался >5 мин,
  // чтобы pool не накапливал stale-сокеты. Новые запросы создадут
  // свежее соединение.
  idleTimeout: 5 * 60 * 1000,
});

export const db = drizzle(pool, { schema, mode: "default" });
export { pool };
