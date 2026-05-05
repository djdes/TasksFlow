/**
 * @fileoverview Централизованное логирование через Pino
 *
 * Уровни логов:
 * - fatal: Критические ошибки, приложение не может продолжать работу
 * - error: Ошибки, которые нужно исправить
 * - warn: Предупреждения (например, deprecated функции)
 * - info: Важная информация (запуск, остановка, авторизация)
 * - debug: Отладочная информация
 * - trace: Детальная трассировка
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  // В production используем JSON формат для парсинга логов
  ...(isDev ? {} : {
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
});

// Дочерний logger с module-меткой — для HTTP request log'ов в
// server/index.ts. Раньше были также dbLogger/authLogger/taskLogger,
// но они никогда не использовались (ts-prune подтвердил dead). Если
// понадобится в будущем — добавить child заново. Лучше явно создать
// при первом use, чем держать dead exports.
export const httpLogger = logger.child({ module: "http" });
