/**
 * Telegram long-polling daemon.
 *
 * Runs as a separate PM2 process (`haccp-telegram-poller`). Handles:
 *   - /start <token>: link Telegram chat to a WeSetup user
 *   - /stop: unlink
 *   - /menu, /journals: interactive journal menu
 *   - Inline-keyboard navigation over the journal catalogue
 *   - Text/number/date/select/boolean wizard for new entries in
 *     field-based journals; document-based journals deep-link to the web
 *
 * Prisma runs in-process so entries are persisted the same way the web
 * handler does. ACL mirrors src/lib/journal-acl.ts (management + root
 * bypass; otherwise UserJournalAccess.canWrite).
 */

import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import crypto from "node:crypto";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FORCE_IP = process.env.TELEGRAM_FORCE_IP?.trim();
const LINK_SECRET =
  process.env.TELEGRAM_LINK_TOKEN_SECRET ||
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "";
const WEB_BASE = process.env.WEB_BASE_URL || "https://wesetup.ru";

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set — exiting");
  process.exit(1);
}
if (!LINK_SECRET) {
  console.error("TELEGRAM_LINK_TOKEN_SECRET missing — exiting");
  process.exit(1);
}

if (FORCE_IP) {
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
            callback(null, [{ address: FORCE_IP, family: 4 }]);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const grammyFetch: any = async (url: unknown, init: unknown) => {
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
};

const bot = new Bot(TOKEN, { client: { fetch: grammyFetch } });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Link-token crypto (mirrors src/lib/telegram.ts)
// ---------------------------------------------------------------------------

function hmacBase64Url(payload: string): string {
  return crypto
    .createHmac("sha256", LINK_SECRET)
    .update(payload)
    .digest("base64url");
}

function parseLinkToken(token: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const i1 = decoded.indexOf(":");
    const i2 = decoded.indexOf(":", i1 + 1);
    if (i1 < 0 || i2 < 0) return null;
    const userId = decoded.slice(0, i1);
    const expStr = decoded.slice(i1 + 1, i2);
    const sig = decoded.slice(i2 + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;
    const expected = hmacBase64Url(`${userId}:${expStr}`);
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return { userId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Role / ACL — mirrors src/lib/user-roles.ts + src/lib/journal-acl.ts
// Kept inline because the script doesn't go through the Next.js bundle.
// ---------------------------------------------------------------------------

const MANAGEMENT_ROLES = new Set([
  "manager",
  "owner",
  "head_chef",
  "technologist",
]);

function isManagement(role: string | null | undefined): boolean {
  return MANAGEMENT_ROLES.has((role || "").toLowerCase());
}

async function canWriteJournal(
  userId: string,
  role: string | null,
  isRoot: boolean,
  templateCode: string
): Promise<boolean> {
  if (isRoot || isManagement(role)) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { journalAccessMigrated: true },
  });
  if (!user || user.journalAccessMigrated !== true) return true;
  const row = await prisma.userJournalAccess.findUnique({
    where: {
      userId_templateCode: { userId, templateCode },
    },
  });
  return row?.canWrite === true;
}

async function listAllowedJournals(
  userId: string,
  role: string | null,
  isRoot: boolean
): Promise<
  Array<{ id: string; code: string; name: string; fields: unknown }>
> {
  const all = await prisma.journalTemplate.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, fields: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (isRoot || isManagement(role)) return all;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { journalAccessMigrated: true },
  });
  if (!user || user.journalAccessMigrated !== true) return all;
  const rows = await prisma.userJournalAccess.findMany({
    where: { userId, canWrite: true },
    select: { templateCode: true },
  });
  const allowed = new Set(rows.map((r) => r.templateCode));
  return all.filter((t) => allowed.has(t.code));
}

// ---------------------------------------------------------------------------
// Document-based templates — these use the grid UI on the web and are not
// fillable field-by-field in chat. We keep a small list that mirrors
// src/lib/journal-document-helpers.ts#isDocumentTemplate; when a new
// document-journal is added on the web, add its code here too.
// ---------------------------------------------------------------------------

const DOCUMENT_TEMPLATE_CODES = new Set<string>([
  "hygiene",
  "health_check",
  "finished_product",
  "cold_equipment_control",
  "climate_control",
  "cleaning",
  "equipment_cleaning",
  "equipment_maintenance",
  "staff_training",
  "perishable_rejection",
  "med_books",
  "glass_items_list",
  "glass_control",
  "audit_plan",
  "training_plan",
  "breakdown_history",
  "accident_journal",
  "ppe_issuance",
  "traceability_test",
  "metal_impurity",
  "intensive_cooling",
  "disinfectant_usage",
  "sanitary_day_control",
  "incoming_control",
  "incoming_raw_materials_control",
]);

function isDocumentTemplate(code: string): boolean {
  return DOCUMENT_TEMPLATE_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Field model
// ---------------------------------------------------------------------------

type FieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  step?: number;
};

function parseFields(raw: unknown): FieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (typeof f.key !== "string" || typeof f.type !== "string") continue;
    out.push({
      key: f.key,
      label: typeof f.label === "string" ? f.label : f.key,
      type: f.type,
      required: f.required === true,
      options: Array.isArray(f.options)
        ? (f.options as Array<{ value: string; label: string }>).filter(
            (o) => o && typeof o.value === "string" && typeof o.label === "string"
          )
        : undefined,
      step: typeof f.step === "number" ? f.step : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// In-memory wizard state. Keyed by chat id — one wizard per chat.
// Bot restart clears state; users just rerun the wizard.
// ---------------------------------------------------------------------------

type WizardState = {
  userId: string;
  organizationId: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  fields: FieldDef[];
  index: number;
  data: Record<string, unknown>;
};

const wizards = new Map<number, WizardState>();

function cancelWizard(chatId: number): void {
  wizards.delete(chatId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLinkedUser(ctx: Context) {
  const chatId = String(ctx.chat?.id);
  if (!chatId) return null;
  return prisma.user.findFirst({
    where: { telegramChatId: chatId },
    select: {
      id: true,
      name: true,
      role: true,
      isRoot: true,
      organizationId: true,
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"
  );
}

function fmtValue(f: FieldDef, v: unknown): string {
  if (v == null || v === "") return "—";
  if (f.type === "boolean") return v === true ? "Да" : "Нет";
  if (f.type === "select" && f.options) {
    const opt = f.options.find((o) => o.value === v);
    if (opt) return opt.label;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

async function showMainMenu(ctx: Context) {
  const linked = await getLinkedUser(ctx);
  const kb = new InlineKeyboard();
  if (linked) {
    kb.text("📋 Журналы", "nav:journals:0").row();
    kb.text("⚙️ Профиль", "nav:profile");
  } else {
    kb.url("🔗 Привязать аккаунт", `${WEB_BASE}/settings/notifications`);
  }
  const text = linked
    ? `Привет, <b>${escapeHtml(linked.name || "пользователь")}</b>!\n\nВыберите раздел:`
    : "Привет! Чтобы вести журналы из Telegram, сначала привяжите аккаунт WeSetup.";
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

// ---------------------------------------------------------------------------
// Journals list (paginated)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 8;

async function showJournalsList(ctx: Context, page: number) {
  const linked = await getLinkedUser(ctx);
  if (!linked) {
    await ctx.reply("Сначала привяжите аккаунт: /start");
    return;
  }
  const list = await listAllowedJournals(
    linked.id,
    linked.role,
    linked.isRoot === true
  );
  if (list.length === 0) {
    await ctx.reply(
      "У вас пока нет доступных журналов. Попросите руководителя открыть доступ в настройках."
    );
    return;
  }
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const clamped = Math.min(Math.max(0, page), totalPages - 1);
  const slice = list.slice(clamped * PAGE_SIZE, (clamped + 1) * PAGE_SIZE);

  const kb = new InlineKeyboard();
  for (const t of slice) {
    kb.text(t.name.length > 55 ? t.name.slice(0, 54) + "…" : t.name, `j:${t.code}`).row();
  }
  if (totalPages > 1) {
    if (clamped > 0) kb.text("← Назад", `nav:journals:${clamped - 1}`);
    kb.text(`${clamped + 1} / ${totalPages}`, "noop");
    if (clamped < totalPages - 1)
      kb.text("Вперёд →", `nav:journals:${clamped + 1}`);
    kb.row();
  }
  kb.text("⬅︎ В меню", "nav:menu");

  const text = `<b>Доступные журналы:</b> ${list.length}\n\nВыберите журнал.`;
  if (ctx.callbackQuery) {
    await ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: kb })
      .catch(async () => {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
      });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

// ---------------------------------------------------------------------------
// Journal card
// ---------------------------------------------------------------------------

async function showJournalCard(ctx: Context, code: string) {
  const linked = await getLinkedUser(ctx);
  if (!linked) {
    await ctx.reply("Сначала привяжите аккаунт: /start");
    return;
  }
  const template = await prisma.journalTemplate.findUnique({
    where: { code },
    select: { code: true, name: true, description: true, fields: true },
  });
  if (!template) {
    await ctx.answerCallbackQuery({ text: "Журнал не найден" }).catch(() => {});
    return;
  }
  const canWrite = await canWriteJournal(
    linked.id,
    linked.role,
    linked.isRoot === true,
    template.code
  );
  const isDoc = isDocumentTemplate(template.code);
  const fields = parseFields(template.fields);

  const kb = new InlineKeyboard();
  if (canWrite && !isDoc && fields.length > 0) {
    kb.text("➕ Новая запись", `j:${template.code}:new`).row();
  }
  kb.text("🕑 Последние 5 записей", `j:${template.code}:recent`).row();
  kb.url("🌐 Открыть в вебе", `${WEB_BASE}/journals/${template.code}`).row();
  kb.text("⬅︎ К списку", "nav:journals:0");

  const caption =
    `<b>${escapeHtml(template.name)}</b>\n` +
    (template.description ? `\n${escapeHtml(template.description)}\n` : "") +
    (isDoc
      ? "\n<i>Этот журнал ведётся таблицей за период — откройте его в вебе для заполнения.</i>"
      : fields.length === 0
      ? "\n<i>У журнала нет полей для заполнения из бота — откройте его в вебе.</i>"
      : `\n<b>Полей:</b> ${fields.length}`);

  await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb });
}

async function showRecent(ctx: Context, code: string) {
  const linked = await getLinkedUser(ctx);
  if (!linked) return;
  const template = await prisma.journalTemplate.findUnique({
    where: { code },
    select: { id: true, name: true },
  });
  if (!template) return;

  const entries = await prisma.journalEntry.findMany({
    where: {
      templateId: template.id,
      organizationId: linked.organizationId,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      filledBy: { select: { name: true } },
    },
  });

  if (entries.length === 0) {
    await ctx.reply(`<b>${escapeHtml(template.name)}</b>\n\nПока нет записей.`, {
      parse_mode: "HTML",
    });
    return;
  }
  const lines = entries.map((e, i) => {
    const d = new Date(e.createdAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${i + 1}. ${d} — ${escapeHtml(e.filledBy?.name ?? "—")}`;
  });
  await ctx.reply(
    `<b>${escapeHtml(template.name)}</b>\n\n` + lines.join("\n"),
    { parse_mode: "HTML" }
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

async function startWizard(ctx: Context, code: string) {
  const linked = await getLinkedUser(ctx);
  if (!linked || !ctx.chat) return;
  const canWrite = await canWriteJournal(
    linked.id,
    linked.role,
    linked.isRoot === true,
    code
  );
  if (!canWrite) {
    await ctx.reply("У вас нет прав на запись в этот журнал.");
    return;
  }
  if (isDocumentTemplate(code)) {
    await ctx.reply("Этот журнал ведётся в вебе — откройте его одним нажатием из карточки.");
    return;
  }
  const template = await prisma.journalTemplate.findUnique({
    where: { code },
    select: { id: true, code: true, name: true, fields: true },
  });
  if (!template) {
    await ctx.reply("Журнал не найден.");
    return;
  }
  const fields = parseFields(template.fields);
  if (fields.length === 0) {
    await ctx.reply("У этого журнала нет полей для заполнения из бота.");
    return;
  }
  wizards.set(ctx.chat.id, {
    userId: linked.id,
    organizationId: linked.organizationId,
    templateId: template.id,
    templateCode: template.code,
    templateName: template.name,
    fields,
    index: 0,
    data: {},
  });
  await ctx.reply(
    `<b>Новая запись:</b> ${escapeHtml(template.name)}\n\n` +
      `Заполним ${fields.length} ${pluralFields(fields.length)}. ` +
      `В любой момент можно написать /cancel, чтобы отменить.`,
    { parse_mode: "HTML" }
  );
  await askCurrentField(ctx);
}

function pluralFields(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "полей";
  if (last === 1) return "поле";
  if (last >= 2 && last <= 4) return "поля";
  return "полей";
}

async function askCurrentField(ctx: Context) {
  if (!ctx.chat) return;
  const w = wizards.get(ctx.chat.id);
  if (!w) return;
  if (w.index >= w.fields.length) {
    await showWizardSummary(ctx, w);
    return;
  }
  const f = w.fields[w.index];
  const head = `Поле ${w.index + 1} из ${w.fields.length}\n<b>${escapeHtml(f.label)}</b>${f.required ? " <i>(обязательное)</i>" : ""}`;

  if (f.type === "boolean") {
    const kb = new InlineKeyboard()
      .text("Да", "w:bool:1")
      .text("Нет", "w:bool:0")
      .row()
      .text("Пропустить", "w:skip")
      .text("Отмена", "w:cancel");
    await ctx.reply(head, { parse_mode: "HTML", reply_markup: kb });
    return;
  }
  if (f.type === "select" && f.options && f.options.length > 0) {
    const kb = new InlineKeyboard();
    f.options.forEach((o, i) => {
      kb.text(o.label, `w:sel:${i}`).row();
    });
    kb.text("Пропустить", "w:skip").text("Отмена", "w:cancel");
    await ctx.reply(head, { parse_mode: "HTML", reply_markup: kb });
    return;
  }
  if (f.type === "employee" || f.type === "equipment") {
    const items =
      f.type === "employee"
        ? await prisma.user.findMany({
            where: { organizationId: w.organizationId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: 16,
          })
        : await prisma.equipment.findMany({
            where: { organizationId: w.organizationId, isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: 16,
          });
    if (items.length === 0) {
      await ctx.reply(
        head + "\n\n<i>Справочник пуст — отправьте текстом.</i>",
        { parse_mode: "HTML" }
      );
      return;
    }
    const kb = new InlineKeyboard();
    items.forEach((it, i) => {
      const label = it.name.length > 50 ? it.name.slice(0, 49) + "…" : it.name;
      kb.text(label, `w:ref:${i}`).row();
    });
    kb.text("Пропустить", "w:skip").text("Отмена", "w:cancel");
    // Stash the list on the state so the callback knows which to pick.
    (w as WizardState & { _refList?: typeof items })._refList = items;
    await ctx.reply(head, { parse_mode: "HTML", reply_markup: kb });
    return;
  }
  // Free-form types — text / number / date
  const hint =
    f.type === "number"
      ? "\n\nОтправьте число."
      : f.type === "date"
      ? "\n\nОтправьте дату в формате ДД.ММ.ГГГГ (или «сегодня»)."
      : "\n\nОтправьте текстом.";
  const kb = new InlineKeyboard()
    .text("Пропустить", "w:skip")
    .text("Отмена", "w:cancel");
  await ctx.reply(head + hint, { parse_mode: "HTML", reply_markup: kb });
}

async function handleWizardText(ctx: Context, text: string) {
  if (!ctx.chat) return;
  const w = wizards.get(ctx.chat.id);
  if (!w) return;
  const f = w.fields[w.index];
  if (!f) return;

  // Inline-only fields: ignore text (user should tap button).
  if (f.type === "boolean" || f.type === "select") {
    await ctx.reply("Пожалуйста, выберите вариант кнопкой.");
    return;
  }

  let value: unknown = text.trim();
  if (f.type === "number") {
    const n = Number(text.replace(",", ".").trim());
    if (!Number.isFinite(n)) {
      await ctx.reply("Не похоже на число. Попробуйте ещё раз.");
      return;
    }
    value = n;
  } else if (f.type === "date") {
    const parsed = parseDateInput(text.trim());
    if (!parsed) {
      await ctx.reply("Не распознал дату. Формат: ДД.ММ.ГГГГ или «сегодня».");
      return;
    }
    value = parsed;
  }

  w.data[f.key] = value;
  w.index += 1;
  await askCurrentField(ctx);
}

function parseDateInput(s: string): string | null {
  const v = s.toLowerCase();
  if (v === "сегодня" || v === "today") {
    return new Date().toISOString().slice(0, 10);
  }
  const m = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  const iso = v.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return v;
  return null;
}

async function showWizardSummary(ctx: Context, w: WizardState) {
  const lines = w.fields.map((f, i) => {
    const raw = w.data[f.key];
    return `${i + 1}. <b>${escapeHtml(f.label)}:</b> ${escapeHtml(fmtValue(f, raw))}`;
  });
  const kb = new InlineKeyboard()
    .text("💾 Сохранить", "w:save")
    .text("❌ Отмена", "w:cancel");
  await ctx.reply(
    `<b>Новая запись — ${escapeHtml(w.templateName)}</b>\n\n` +
      lines.join("\n") +
      "\n\nСохранить?",
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function saveWizard(ctx: Context) {
  if (!ctx.chat) return;
  const w = wizards.get(ctx.chat.id);
  if (!w) return;
  try {
    const entry = await prisma.journalEntry.create({
      data: {
        templateId: w.templateId,
        organizationId: w.organizationId,
        filledById: w.userId,
        data: w.data as never,
        status: "submitted",
      },
    });
    wizards.delete(ctx.chat.id);
    await ctx.reply(
      `✅ Запись сохранена.\n\nОткрыть в вебе: ${WEB_BASE}/journals/${w.templateCode}/${entry.id}`
    );
  } catch (err) {
    console.error("[save] failed", err);
    await ctx.reply("Не удалось сохранить запись. Попробуйте ещё раз.");
  }
}

// ---------------------------------------------------------------------------
// Bot wiring
// ---------------------------------------------------------------------------

bot.use(async (ctx, next) => {
  const kind = ctx.update.message
    ? "msg"
    : ctx.update.callback_query
    ? "cb"
    : "other";
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "";
  const chat = ctx.chat?.id;
  console.log(
    `[update] id=${ctx.update.update_id} ${kind} chat=${chat} text=${JSON.stringify(text).slice(0, 200)}`
  );
  await next();
});

bot.command("start", async (ctx) => {
  const token = ctx.match?.trim();
  if (!token) {
    await showMainMenu(ctx);
    return;
  }
  const parsed = parseLinkToken(token);
  if (!parsed) {
    await ctx.reply(
      "Неверная ссылка привязки. Попробуйте получить новую ссылку в настройках WeSetup."
    );
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: parsed.userId } });
  if (!user) {
    await ctx.reply("Пользователь не найден. Проверьте ссылку привязки.");
    return;
  }
  const chatId = String(ctx.chat.id);
  await prisma.user.update({
    where: { id: parsed.userId },
    data: { telegramChatId: chatId },
  });
  await ctx.reply("✅ Аккаунт успешно привязан!");
  await showMainMenu(ctx);
});

bot.command("stop", async (ctx) => {
  const chatId = String(ctx.chat.id);
  const user = await prisma.user.findFirst({
    where: { telegramChatId: chatId },
  });
  if (!user) {
    await ctx.reply("Ваш аккаунт не привязан к WeSetup.");
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null },
  });
  cancelWizard(ctx.chat.id);
  await ctx.reply(
    "Аккаунт отвязан. Для повторной привязки получите ссылку в настройках: " +
      `${WEB_BASE}/settings/notifications`
  );
});

bot.command("menu", showMainMenu);
bot.command("journals", (ctx) => showJournalsList(ctx, 0));

bot.command("cancel", async (ctx) => {
  if (ctx.chat && wizards.has(ctx.chat.id)) {
    wizards.delete(ctx.chat.id);
    await ctx.reply("Заполнение отменено.");
  } else {
    await ctx.reply("Нечего отменять.");
  }
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  try {
    if (data === "noop") {
      await ctx.answerCallbackQuery();
      return;
    }
    if (data === "nav:menu") {
      await ctx.answerCallbackQuery();
      await showMainMenu(ctx);
      return;
    }
    if (data === "nav:profile") {
      await ctx.answerCallbackQuery();
      const linked = await getLinkedUser(ctx);
      if (!linked) {
        await ctx.reply("Вы не привязаны. /start");
        return;
      }
      const kb = new InlineKeyboard()
        .url("⚙️ Настройки в вебе", `${WEB_BASE}/settings/notifications`)
        .row()
        .text("Отвязать", "profile:unlink");
      await ctx.reply(
        `<b>${escapeHtml(linked.name || "")}</b>\nРоль: ${escapeHtml(linked.role || "—")}`,
        { parse_mode: "HTML", reply_markup: kb }
      );
      return;
    }
    if (data === "profile:unlink") {
      await ctx.answerCallbackQuery();
      const linked = await getLinkedUser(ctx);
      if (linked) {
        await prisma.user.update({
          where: { id: linked.id },
          data: { telegramChatId: null },
        });
        await ctx.reply("Аккаунт отвязан.");
      }
      return;
    }
    const pageMatch = data.match(/^nav:journals:(\d+)$/);
    if (pageMatch) {
      await ctx.answerCallbackQuery();
      await showJournalsList(ctx, Number(pageMatch[1]));
      return;
    }
    const cardMatch = data.match(/^j:([a-z0-9_]+)$/);
    if (cardMatch) {
      await ctx.answerCallbackQuery();
      await showJournalCard(ctx, cardMatch[1]);
      return;
    }
    const newMatch = data.match(/^j:([a-z0-9_]+):new$/);
    if (newMatch) {
      await ctx.answerCallbackQuery();
      await startWizard(ctx, newMatch[1]);
      return;
    }
    const recentMatch = data.match(/^j:([a-z0-9_]+):recent$/);
    if (recentMatch) {
      await ctx.answerCallbackQuery();
      await showRecent(ctx, recentMatch[1]);
      return;
    }
    // Wizard callbacks
    if (!ctx.chat || !wizards.has(ctx.chat.id)) {
      await ctx.answerCallbackQuery({ text: "Сессия истекла" });
      return;
    }
    const w = wizards.get(ctx.chat.id)!;
    if (data === "w:cancel") {
      await ctx.answerCallbackQuery({ text: "Отменено" });
      wizards.delete(ctx.chat.id);
      await ctx.reply("Заполнение отменено.");
      return;
    }
    if (data === "w:skip") {
      await ctx.answerCallbackQuery();
      w.index += 1;
      await askCurrentField(ctx);
      return;
    }
    if (data === "w:save") {
      await ctx.answerCallbackQuery();
      await saveWizard(ctx);
      return;
    }
    const boolMatch = data.match(/^w:bool:(0|1)$/);
    if (boolMatch) {
      await ctx.answerCallbackQuery();
      const f = w.fields[w.index];
      w.data[f.key] = boolMatch[1] === "1";
      w.index += 1;
      await askCurrentField(ctx);
      return;
    }
    const selMatch = data.match(/^w:sel:(\d+)$/);
    if (selMatch) {
      await ctx.answerCallbackQuery();
      const f = w.fields[w.index];
      const idx = Number(selMatch[1]);
      const opt = f.options?.[idx];
      if (opt) w.data[f.key] = opt.value;
      w.index += 1;
      await askCurrentField(ctx);
      return;
    }
    const refMatch = data.match(/^w:ref:(\d+)$/);
    if (refMatch) {
      await ctx.answerCallbackQuery();
      const f = w.fields[w.index];
      const list = (w as WizardState & {
        _refList?: Array<{ id: string; name: string }>;
      })._refList;
      const idx = Number(refMatch[1]);
      const item = list?.[idx];
      if (item) w.data[f.key] = item.id;
      w.index += 1;
      await askCurrentField(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
  } catch (err) {
    console.error("[cb] error", err);
    await ctx.answerCallbackQuery({ text: "Ошибка" }).catch(() => {});
  }
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text || "";
  if (text.startsWith("/")) return;
  if (ctx.chat && wizards.has(ctx.chat.id)) {
    await handleWizardText(ctx, text);
    return;
  }
  await showMainMenu(ctx);
});

bot.catch((err) => {
  console.error("[poller] bot error", err);
});

async function main() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("[poller] webhook cleared, starting long polling");
  } catch (err) {
    console.error("[poller] deleteWebhook failed", err);
  }
  await bot.start({
    onStart: (me) => console.log(`[poller] @${me.username} listening`),
  });
}

main().catch((err) => {
  console.error("[poller] fatal", err);
  process.exit(1);
});
