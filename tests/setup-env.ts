/**
 * Vitest setup: задаём fake MySQL credentials до import'а server модулей.
 *
 * Раньше тесты которые импортили server/routes.ts (через buildApp)
 * падали при загрузке модуля с "MySQL credentials not set" в db.ts:11.
 * mysql2 createPool() — lazy, реального connect нет до первого query.
 * Тесты mock'ают storage через vi.mock(), так что реальные query
 * никогда не выполняются. Поэтому fake values безопасны:
 *
 *   tests/invitations.test.ts → vi.mock("../server/storage", ...)
 *                                     ↓
 *                             buildApp → registerRoutes
 *                                     ↓
 *                             server/routes.ts импортит db (lazy pool)
 *                                     ↓
 *                       db.ts требует MYSQL_* env vars при импорте
 *                                     ↓
 *                       раньше: throw → 27 тестов падали
 *                       теперь: fake creds → pool создаётся, не используется
 */

process.env.MYSQL_HOST ??= "localhost";
process.env.MYSQL_USER ??= "test";
process.env.MYSQL_PASSWORD ??= "test";
process.env.MYSQL_DATABASE ??= "tasksflow_test";

// SESSION_SECRET — некоторые тесты также пытаются инстанцировать
// session middleware. В dev fallback есть, но в production throw.
process.env.SESSION_SECRET ??= "test-secret-do-not-use-in-prod-1234567890";
