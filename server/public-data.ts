/**
 * Загрузка данных для SSR публичных страниц по ключу роута. Реальные
 * данные блога берутся из server/blog.ts (content/blog/*.md), юридические
 * документы — из content/legal/*.md. Реквизиты оператора, контактный email
 * и id счётчиков аналитики — из env (legalOperator, siteConfig).
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
import { DEFAULT_CONTACT_EMAIL, LEGAL_SLUGS, OPERATOR_PLACEHOLDERS } from "../client/src/public/legal";
import QRCode from "qrcode";
import { appInfo } from "./app-links";
import { DEFAULT_PRICES } from "@shared/billing";
import { billingStore } from "./billing/store";
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
const legalCache = new Map<string, LegalDoc>();

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

/**
 * Документ из content/legal/<slug>.md. В тексте доступны {{operator}},
 * {{email}} и {{site}}; плейсхолдер незаданного оператора подсвечивается.
 * Кэш по набору подстановок: env в рантайме не меняется.
 */
export function loadLegalDoc(slug: string, env: Env = process.env): LegalDoc | null {
  if (!LEGAL_SLUGS.has(slug)) return null;
  const operatorName = envValue(env, "LEGAL_OPERATOR_NAME");
  const vars: Record<string, string> = {
    operator: operatorName ?? OPERATOR_PLACEHOLDERS.name,
    email: legalContactEmail(env),
    site: siteHost(),
  };
  const updatedEnv = isoDate(envValue(env, "LEGAL_UPDATED_AT"));
  const key = JSON.stringify([slug, vars, updatedEnv]);
  const hit = legalCache.get(key);
  if (hit) return hit;

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
  let { html, toc } = renderMarkdown(body);
  if (!operatorName) {
    const ph = OPERATOR_PLACEHOLDERS.name;
    html = html.split(ph).join(`<span class="legal-ph" title="Задаётся в LEGAL_OPERATOR_NAME">${ph}</span>`);
  }
  const doc: LegalDoc = {
    slug: slug as LegalSlug,
    title: String(data.title || slug),
    description: String(data.description || ""),
    html,
    toc,
    updatedAt: updatedEnv ?? isoDate(data.updated),
  };
  legalCache.set(key, doc);
  return doc;
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
      // Лендинг важнее точности цены: без БД — цены по умолчанию.
      const prices = await billingStore.getPrices().catch(() => DEFAULT_PRICES.map((p) => ({ ...p })));
      return { featuredPosts, totalPosts: totalPosts(), prices };
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

