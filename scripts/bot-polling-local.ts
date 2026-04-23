import dotenv from "dotenv";
dotenv.config(); // load .env (TELEGRAM_BOT_TOKEN, etc.)
dotenv.config({ path: ".env.local", override: true }); // load .env.local (MINI_APP_BASE_URL)

/**
 * Local polling runner for the Telegram bot.
 *
 * Use this when webhook can't be set (rate limits, network issues, etc).
 * The bot will pull updates directly from Telegram API via getUpdates.
 *
 * Prerequisites:
 *   - Dev server running on localhost:3000
 *   - Localtunnel (or ngrok) active for MINI_APP_BASE_URL
 *   - .env.local with MINI_APP_BASE_URL=<tunnel>/mini
 *
 * Run:
 *   npx tsx scripts/bot-polling-local.ts
 *
 * Stop: Ctrl+C
 */
import { Bot } from "grammy";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const apiRoot = process.env.TELEGRAM_API_ROOT?.replace(/\/+$/, "") || undefined;
const forceIp = process.env.TELEGRAM_FORCE_IP?.trim() || undefined;

if (forceIp) {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup: ((hostname: string, options: object, callback: any) => {
          if (hostname === "api.telegram.org") {
            callback(null, [{ address: forceIp, family: 4 }]);
            return;
          }
          import("node:dns").then(({ lookup }) => {
            lookup(hostname, { ...options, all: true }, callback);
          });
        }) as unknown as undefined,
      },
    })
  );
}

const tgFetch = forceIp
  ? async (url: unknown, init: unknown) => {
      const opts = (init as { signal?: unknown } | undefined) ?? {};
      const signal = opts.signal;
      const forwarded =
        signal && !(signal instanceof AbortSignal)
          ? { ...(init as object), signal: undefined }
          : (init as object | undefined);
      return undiciFetch(
        url as Parameters<typeof undiciFetch>[0],
        forwarded as Parameters<typeof undiciFetch>[1]
      );
    }
  : undefined;

const bot = new Bot(token, {
  client: {
    ...(apiRoot ? { apiRoot } : {}),
    ...(tgFetch ? { fetch: tgFetch as any } : {}),
  },
});

// Import handlers from the main bot app
import { registerStartHandler } from "../src/lib/bot/handlers/start";
import { Composer } from "grammy";

const composer = new Composer();
registerStartHandler(composer);
bot.use(composer);

bot.catch((err) => {
  console.error("Bot error:", err);
});

console.log("Starting bot in polling mode...");
console.log("Mini-app base URL:", process.env.MINI_APP_BASE_URL || "not set (will use NEXTAUTH_URL)");

bot.start();
