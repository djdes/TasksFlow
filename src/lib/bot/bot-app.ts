import { Bot, Composer, type Context } from "grammy";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { registerStartHandler } from "./handlers/start";
import { TELEGRAM_COMMANDS } from "./start-response";

/**
 * Grammy bot app singleton.
 *
 * Shared with the outbound message path in `src/lib/telegram.ts` but kept
 * as its own file because the inbound (webhook) layer needs the `Bot`
 * instance exposed to call `bot.handleUpdate(...)` directly, and because
 * webhook dispatch requires a `Composer` we can register handlers on.
 *
 * DNS / apiRoot overrides mirror the outbound bot in telegram.ts so that
 * incoming webhook processing (e.g. replying with sendMessage) takes the
 * same reachability path when Telegram's canonical IPs are blocked.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiRoot = process.env.TELEGRAM_API_ROOT?.replace(/\/+$/, "") || undefined;
const forceIp = process.env.TELEGRAM_FORCE_IP?.trim() || undefined;

if (forceIp) {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup: ((
          hostname: string,
          options: object,
          callback: (
            err: NodeJS.ErrnoException | null,
            addresses: { address: string; family: number }[]
          ) => void
        ) => {
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

let cachedBot: Bot | null = null;
let initPromise: Promise<void> | null = null;
let commandsPromise: Promise<void> | null = null;

export function getInboundBot(): Bot | null {
  if (!token) return null;
  if (cachedBot) return cachedBot;
  cachedBot = new Bot(token, {
    client: {
      ...(apiRoot ? { apiRoot } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(tgFetch ? { fetch: tgFetch as any } : {}),
    },
  });
  const composer = new Composer<Context>();
  registerStartHandler(composer);
  cachedBot.use(composer);
  return cachedBot;
}

/**
 * Grammy requires `bot.init()` to have run once before `handleUpdate()` can
 * dispatch. In serverless handlers we lazy-init on the first webhook.
 */
export async function ensureBotInit(bot: Bot): Promise<void> {
  if (!initPromise) {
    initPromise = bot.init().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;

  if (!commandsPromise) {
    commandsPromise = bot.api
      .setMyCommands([...TELEGRAM_COMMANDS])
      .then(() => undefined)
      .catch((err) => {
        commandsPromise = null;
        console.error("Telegram setMyCommands error:", err);
      });
  }

  await commandsPromise;
}
