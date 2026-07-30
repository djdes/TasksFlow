/**
 * Локальный разбор через Claude CLI — без очереди ProjectsFlow.
 *
 * Зачем: путь через ProjectsFlow требует pfat-токена, настроенного
 * проекта и живого диспетчера ralph. Пока всего этого нет, бот всё равно
 * обязан разбирать задачи, а не сваливаться в ручной черновик на каждом
 * сообщении.
 *
 * Порядок провайдеров в composer: очередь PF (если задан PF_AGENT_TOKEN) →
 * этот локальный → ручной черновик. Контракт ответа один и тот же, так что
 * нормализация ниже по потоку не знает, кто именно отвечал.
 *
 * Промпт-близнец лежит в ralph (prompts/tasksflow-task.md) для пути через
 * очередь. Правки нужно вносить в оба файла.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../logger";
import type { PfAiResult, StageReporter, WorkerEnvelope } from "./pf-ai";

/** Больше — и человек в чате решит, что бот умер. */
const WATCHDOG_MS = 180_000;

const DOW_NAMES = [
  "воскресенье", "понедельник", "вторник", "среда",
  "четверг", "пятница", "суббота",
];

let promptCache: string | null = null;

function promptPath(): string {
  // В деве работаем из корня репо, в проде рядом с собранным dist.
  const candidates = [
    path.join(process.cwd(), "prompts", "tasksflow-task.md"),
    path.join(process.cwd(), "..", "prompts", "tasksflow-task.md"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}

export function isLocalAiAvailable(): boolean {
  return existsSync(promptPath()) && resolveClaudeBin() !== null;
}

/** Подстановка плейсхолдеров — та же, что делает Do-TasksFlow в ralph. */
export async function buildPrompt(envelope: WorkerEnvelope): Promise<string> {
  if (promptCache === null) {
    promptCache = await readFile(promptPath(), "utf8");
  }
  const members =
    envelope.members.length > 0
      ? envelope.members
          .map((m) => `- id=${m.id}: ${m.name}${m.position ? ` — ${m.position}` : ""}`)
          .join("\n")
      : "(список пуст)";
  const categories =
    envelope.categories.length > 0
      ? envelope.categories.map((c) => `- ${c}`).join("\n")
      : "(категорий пока нет)";

  return promptCache
    .replace("{{TODAY}}", envelope.today)
    .replace("{{DOW_NAME}}", DOW_NAMES[envelope.dow] ?? "")
    .replace("{{AUTHOR}}", `${envelope.author.name} (${envelope.author.role})`)
    .replace("{{MEMBERS}}", members)
    .replace("{{CATEGORIES}}", categories)
    .replace("{{HAS_PHOTOS}}", String(envelope.hasPhotos))
    .replace("{{MESSAGE}}", envelope.message);
}

/**
 * Достаёт JSON из ответа модели: снимает markdown-забор и обрезает
 * болтовню вокруг. Тот же приём, что Parse-ComposeJson в ralph — модель
 * иногда добавляет «Вот результат:» вопреки инструкции.
 */
export function extractJson(text: string): string | null {
  if (!text) return null;
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  const json = s.slice(start, end + 1);
  try {
    const obj = JSON.parse(json);
    if (!obj || !Array.isArray(obj.segments) || obj.segments.length === 0) {
      return null;
    }
  } catch {
    return null;
  }
  return json;
}

export async function requestLocalParse(
  envelope: WorkerEnvelope,
  onStage?: StageReporter,
): Promise<PfAiResult> {
  if (!isLocalAiAvailable()) {
    return { ok: false, reason: "not_configured", detail: "prompt file missing" };
  }

  let prompt: string;
  try {
    prompt = await buildPrompt(envelope);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[tg-ai] не смог прочитать промпт",
    );
    return { ok: false, reason: "not_configured" };
  }

  onStage?.("Думаю над задачей");

  const raw = await runClaude(prompt);
  if (raw === null) return { ok: false, reason: "timeout" };
  if (raw === "") return { ok: false, reason: "job_failed" };

  const json = extractJson(raw);
  if (!json) {
    logger.warn({ preview: raw.slice(0, 200) }, "[tg-ai] локальный ответ без валидного JSON");
    return { ok: false, reason: "bad_json" };
  }
  return { ok: true, raw: json };
}

/**
 * Где лежит исполняемый claude.
 *
 * Нужен именно бинарник или cli.js, а НЕ claude.cmd: Node отказывается
 * запускать .cmd без shell (spawn EINVAL), а shell:true склеивает
 * аргументы без экранирования — текст задачи с кавычками сломал бы
 * команду. Тот же порядок поиска, что в ai-job-worker.ps1.
 */
function resolveClaudeBin(): { file: string; args: string[] } | null {
  if (process.env.CLAUDE_BIN) {
    return { file: process.env.CLAUDE_BIN, args: [] };
  }

  const home = process.env.USERPROFILE || process.env.HOME || "";
  const appData = process.env.APPDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";

  const nativeCandidates = [
    path.join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    path.join(localAppData, "Programs", "claude", "claude.exe"),
    path.join(appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    "/usr/local/bin/claude",
    path.join(home, ".npm-global", "bin", "claude"),
  ];
  for (const candidate of nativeCandidates) {
    if (candidate && existsSync(candidate)) return { file: candidate, args: [] };
  }

  // Фолбэк: пакет без нативного бинарника — гоняем cli.js текущим node.
  const cliJs = path.join(
    appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js",
  );
  if (existsSync(cliJs)) return { file: process.execPath, args: [cliJs] };

  return null;
}

/**
 * Запуск CLI. Флаги повторяют ai-job-worker.ps1: без инструментов, без
 * MCP, без сохранения сессии — модель должна только распарсить текст.
 */
function runClaude(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    const bin = resolveClaudeBin();
    if (!bin) {
      logger.warn("[tg-ai] claude CLI не найден — локальный разбор недоступен");
      resolve("");
      return;
    }

    const args = [
      ...bin.args,
      "-p",
      "--output-format", "json",
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources=",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--model", process.env.TASKSFLOW_AI_MODEL || "sonnet",
    ];

    let child;
    try {
      child = spawn(bin.file, args, { windowsHide: true });
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[tg-ai] claude CLI не запустился",
      );
      resolve("");
      return;
    }

    let stdout = "";
    let stderr = "";
    let done = false;

    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* уже мёртв */ }
      logger.warn("[tg-ai] локальный разбор упёрся в watchdog");
      finish(null);
    }, WATCHDOG_MS);

    child.stdout.on("data", (c) => { stdout += c.toString("utf8"); });
    child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });

    child.on("error", (err) => {
      logger.warn({ err: err.message }, "[tg-ai] ошибка запуска claude CLI");
      finish("");
    });

    child.on("close", (code) => {
      if (code !== 0) {
        logger.warn(
          { code, stderr: stderr.slice(0, 300) },
          "[tg-ai] claude CLI завершился с ошибкой",
        );
        finish("");
        return;
      }
      // --output-format json оборачивает ответ; при неожиданном формате
      // отдаём сырой stdout — extractJson разберётся.
      try {
        const parsed = JSON.parse(stdout);
        finish(typeof parsed.result === "string" ? parsed.result : stdout);
      } catch {
        finish(stdout);
      }
    });

    child.stdin.on("error", () => finish(""));
    child.stdin.end(prompt, "utf8");
  });
}
