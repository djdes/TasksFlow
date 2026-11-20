/**
 * Загрузка данных для SSR публичных страниц по ключу роута. Реальные
 * данные блога берутся из server/blog.ts (blog-index.json / blog-posts.json),
 * юридические документы — из content/legal/*.md (с дисковым снимком legal-docs.json),
 * цены и акции лендинга — из именованных JSON-снимков БД (0 SELECT на выдаче).
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import {
  getAllPosts,
  getByCluster,
  getFeatured,
  getPost,
  clusterStats,
  totalPosts,
} from "./blog";
import { renderMarkdown } from "./markdown";
import { getPublicTasksflowBaseUrl } from "./public-urls";
import { DEFAULT_CONTACT_EMAIL, LEGAL_DOCS, LEGAL_SLUGS, OPERATOR_PLACEHOLDERS } from "../client/src/public/legal";
import QRCode from "qrcode";
import { appInfo } from "./app-links";
import { DEFAULT_PRICES, pickPromotion } from "@shared/billing";
import { getPromoPrices, getPromoPromotions } from "./promo-cache/datasets";
import {
  readPromoSnapshotSync,
  writePromoSnapshotAtomicSync,
} from "./promo-cache/store";
import type {
  AnalyticsIds,
  AppPageData,
  LegalData,
  LegalDoc,
  LegalOperator,
  LegalSlug,
  SiteConfig,
} from "../client/src/public/types";

const PAGE_SIZE = 12;

function clampPage(raw: string | undefined, itemCount: number): number {
  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  const n = parseInt(raw || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

type Env = Record<string, string | undefined>;

function envValue(env: Env, key: string): string | null {
  const v = env[key]?.trim();
  return v ? v : null;
}

/**
 * Реквизиты оператора. Единственное место, где они задаются, — env
 * LEGAL_OPERATOR_NAME / _INN / _OGRN / _ADDRESS. Пустое поле — null:
 * страница покажет плейсхолдер (OPERATOR_PLACEHOLDERS), а не выдумку.
 */
export function legalOperator(env: Env = process.env): LegalOperator {
  return {
    name: envValue(env, "LEGAL_OPERATOR_NAME"),
    inn: envValue(env, "LEGAL_OPERATOR_INN"),
    ogrn: envValue(env, "LEGAL_OPERATOR_OGRN"),
    address: envValue(env, "LEGAL_OPERATOR_ADDRESS"),
  };
}

export function legalContactEmail(env: Env = process.env): string {
  const v = envValue(env, "LEGAL_CONTACT_EMAIL");
  return v && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : DEFAULT_CONTACT_EMAIL;
}

/** id счётчиков. Мусор отбрасываем: значение уходит в URL скрипта. */
export function analyticsIds(env: Env = process.env): AnalyticsIds {
  const ym = envValue(env, "YM_ID");
  const ga = envValue(env, "GA_ID");
  return {
    ym: ym && /^\d{4,12}$/.test(ym) ? ym : null,
    ga: ga && /^(G|UA|GT|AW)-[A-Z0-9-]{4,24}$/i.test(ga) ? ga : null,
  };
}

/** Общие настройки всех публичных страниц (window.__SSR_SITE__). */
export function siteConfig(env: Env = process.env): SiteConfig {
  return { contactEmail: legalContactEmail(env), analytics: analyticsIds(env) };
}

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");

function isoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function siteHost(): string {
  try {
    return new URL(getPublicTasksflowBaseUrl()).host;
  } catch {
    return "tasksflow.ru";
  }
}

/** Экранируем подставляемое значение, чтобы «*» или «_» в названии не стали разметкой. */
function escapeMarkdown(s: string): string {
  return s.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

interface StoredLegalEntry {
  doc: LegalDoc;
  markdown: string;
}

function computeLegalSignature(env: Env): string {
  const operatorName = envValue(env, "LEGAL_OPERATOR_NAME") ?? "";
  const contact = legalContactEmail(env);
  const updatedEnv = isoDate(envValue(env, "LEGAL_UPDATED_AT")) ?? "";
  const host = siteHost();
  const stats: string[] = [];
  for (const { slug } of LEGAL_DOCS) {
    try {
      const st = fs.statSync(path.join(LEGAL_DIR, `${slug}.md`));
      stats.push(`${slug}:${st.size}:${Math.floor(st.mtimeMs)}`);
    } catch {
      stats.push(`${slug}:missing`);
    }
  }
  return JSON.stringify([operatorName, contact, updatedEnv, host, stats.join("|")]);
}

function parseSingleLegalDoc(slug: string, env: Env): StoredLegalEntry | null {
  if (!LEGAL_SLUGS.has(slug)) return null;
  const operatorName = envValue(env, "LEGAL_OPERATOR_NAME");
  const vars: Record<string, string> = {
    operator: operatorName ?? OPERATOR_PLACEHOLDERS.name,
    email: legalContactEmail(env),
    site: siteHost(),
  };
  const updatedEnv = isoDate(envValue(env, "LEGAL_UPDATED_AT"));

  let raw: string;
  try {
    raw = fs.readFileSync(path.join(LEGAL_DIR, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
  const { data, content } = matter(raw);
  const body = content.replace(/\{\{(\w+)\}\}/g, (m, name: string) =>
    name in vars ? escapeMarkdown(vars[name]) : m,
  );
  const rendered = renderMarkdown(body);
  let html = rendered.html;
  const { toc } = rendered;
  if (!operatorName) {
    const ph = OPERATOR_PLACEHOLDERS.name;
    html = html.split(ph).join(`<span class="legal-ph" title="Задаётся в LEGAL_OPERATOR_NAME">${ph}</span>`);
  }
  return {
    doc: {
      slug: slug as LegalSlug,
      title: String(data.title || slug),
      description: String(data.description || ""),
      html,
      toc,
      updatedAt: updatedEnv ?? isoDate(data.updated),
    },
    markdown: body,
  };
}

function loadLegalSnapshotsMap(env: Env = process.env): Record<string, StoredLegalEntry> {
  const cacheEnv = env === process.env ? process.env : { ...process.env, ...env };
  const sig = computeLegalSignature(env);
  // Записываем на диск только для рабочего окружения (process.env), чтобы
  // синтетические env в тестах не перезаписывали боевой файл при каждом вызове.
  if (env === process.env) {
    const snap = readPromoSnapshotSync<Record<string, StoredLegalEntry>>("legal-docs", cacheEnv);
    if (snap && snap.sourceSignature === sig && snap.data) {
      return snap.data;
    }
  }
  const map: Record<string, StoredLegalEntry> = {};
  for (const { slug } of LEGAL_DOCS) {
    const parsed = parseSingleLegalDoc(slug, env);
    if (parsed) map[slug] = parsed;
  }
  if (env === process.env) {
    try {
      writePromoSnapshotAtomicSync("legal-docs", map, { sourceSignature: sig, env: cacheEnv });
    } catch {
      // ignore disk write errors in read-only sandboxes
    }
  }
  return map;
}

export function warmLegalSnapshots(env: NodeJS.ProcessEnv = process.env): void {
  const sig = computeLegalSignature(env);
  const map: Record<string, StoredLegalEntry> = {};
  for (const { slug } of LEGAL_DOCS) {
    const parsed = parseSingleLegalDoc(slug, env);
    if (parsed) map[slug] = parsed;
  }
  writePromoSnapshotAtomicSync("legal-docs", map, { sourceSignature: sig, env });
}

/**
 * Документ из content/legal/<slug>.md. В тексте доступны {{operator}},
 * {{email}} и {{site}}; плейсхолдер незаданного оператора подсвечивается.
 */
export function loadLegalDoc(slug: string, env: Env = process.env): LegalDoc | null {
  if (!LEGAL_SLUGS.has(slug)) return null;
  return loadLegalSnapshotsMap(env)[slug]?.doc ?? null;
}

export function loadLegalMarkdown(slug: string, env: Env = process.env): string | null {
  if (!LEGAL_SLUGS.has(slug)) return null;
  return loadLegalSnapshotsMap(env)[slug]?.markdown ?? null;
}

export function loadLegalData(slug: string, env: Env = process.env): LegalData {
  return { doc: loadLegalDoc(slug, env), operator: legalOperator(env), contactEmail: legalContactEmail(env) };
}

export async function loadRouteData(
  routeKey: string,
  params: Record<string, string>,
): Promise<unknown> {
  switch (routeKey) {
    case "landing": {
      const featuredPosts = getAllPosts().slice(0, 3);
      // Читаем из дисковых JSON-снимков (0 SELECT при прогретом кэше);
      // если снимка ещё нет и БД недоступна — дефолтные цены и без акции.
      const prices = await getPromoPrices().catch(() => DEFAULT_PRICES.map((p) => ({ ...p })));
      const promotions = await getPromoPromotions().catch(() => []);
      const promotion = pickPromotion(promotions, Math.floor(Date.now() / 1000));
      return { featuredPosts, totalPosts: totalPosts(), prices, promotion };
    }
    case "blog-index": {
      const featured = getFeatured();
      // Featured показываем отдельным блоком на 1-й странице, поэтому
      // исключаем его из пагинируемого списка, чтобы не было дубля.
      const rest = getAllPosts().filter((p) => !featured || p.slug !== featured.slug);
      const page = clampPage(params.page, rest.length);
      const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
      const start = (page - 1) * PAGE_SIZE;
      return {
        posts: rest.slice(start, start + PAGE_SIZE),
        clusters: clusterStats(),
        featured: page === 1 ? featured : null,
        activeCluster: null,
        total: getAllPosts().length,
        page,
        totalPages,
        pageSize: PAGE_SIZE,
      };
    }
    case "blog-category": {
      const cluster = params.cluster ?? null;
      const list = cluster ? getByCluster(cluster) : getAllPosts();
      const page = clampPage(params.page, list.length);
      const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      const start = (page - 1) * PAGE_SIZE;
      return {
        posts: list.slice(start, start + PAGE_SIZE),
        clusters: clusterStats(),
        featured: null,
        activeCluster: cluster,
        total: list.length,
        page,
        totalPages,
        pageSize: PAGE_SIZE,
      };
    }
    case "blog-article":
      return { post: getPost(params.slug) };
    case "legal":
      return loadLegalData(params.doc ?? "");
    case "app":
      return loadAppPageData(params.origin ?? "");
    default:
      return null;
  }
}

/** /app: что опубликовано (server/app-links.ts) и QR на эту страницу. */
export async function loadAppPageData(origin: string): Promise<AppPageData> {
  const url = `${origin.replace(/\/+$/, "")}/app`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });
  return { info: appInfo(), qrSvg, url };
}
