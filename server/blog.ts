/**
 * Загрузка статей блога из content/blog/*.md (frontmatter + Markdown).
 * Парсится один раз и кэшируется в памяти (контент статичен в рантайме).
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { renderMarkdown, readingMinutes } from "./markdown";
import { CLUSTERS, CLUSTER_BY_KEY } from "@shared/blog-clusters";

export interface FaqItem { q: string; a: string }
export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  cluster: string;
  tags: string[];
  readingMins: number;
  featured?: boolean;
}
export interface TocItem { id: string; text: string; level: number }
export interface PostFull extends PostMeta {
  html: string;
  faq?: FaqItem[];
  related: PostMeta[];
  toc: TocItem[];
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// Детерминированная дата из slug — чтобы статьи без явного date в
// frontmatter получали разные даты публикации (для сортировки/featured),
// а не одну на всех. Спред по 2026 году.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function dateFromSlug(slug: string): string {
  const h = hashStr(slug);
  const month = (h % 6) + 1; // 1..6 (2026 first half)
  const day = (Math.floor(h / 6) % 27) + 1; // 1..27
  const p = (n: number) => String(n).padStart(2, "0");
  return `2026-${p(month)}-${p(day)}`;
}

interface ParsedPost {
  meta: PostMeta;
  html: string;
  toc: TocItem[];
  faq?: FaqItem[];
}

let cache: Map<string, ParsedPost> | null = null;

function loadAll(): Map<string, ParsedPost> {
  if (cache) return cache;
  const map = new Map<string, ParsedPost>();
  let files: string[] = [];
  try {
    files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    files = []; // папки ещё нет — блог пуст
  }
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf-8");
      const { data, content } = matter(raw);
      const slug = String(data.slug || file.replace(/\.md$/, ""));
      const cluster = String(data.cluster || "upravlenie");
      const { html, toc } = renderMarkdown(content);
      map.set(slug, {
        meta: {
          slug,
          title: String(data.title || slug),
          description: String(data.description || ""),
          date: data.date ? String(data.date) : dateFromSlug(slug),
          cluster: CLUSTER_BY_KEY[cluster] ? cluster : "upravlenie",
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          readingMins: readingMinutes(content),
          featured: Boolean(data.featured),
        },
        html,
        toc,
        faq: Array.isArray(data.faq)
          ? data.faq.map((f: any) => ({ q: String(f.q), a: String(f.a) }))
          : undefined,
      });
    } catch (err) {
      console.error(`[blog] не удалось разобрать ${file}:`, err);
    }
  }
  cache = map;
  return map;
}

function byDateDesc(a: PostMeta, b: PostMeta): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title);
}

export function getAllPosts(): PostMeta[] {
  return Array.from(loadAll().values(), (p) => p.meta).sort(byDateDesc);
}

export function getByCluster(clusterKey: string): PostMeta[] {
  return getAllPosts().filter((p) => p.cluster === clusterKey);
}

export function getFeatured(): PostMeta | null {
  const all = getAllPosts();
  return all.find((p) => p.featured) || all[0] || null;
}

export function getRelated(slug: string, cluster: string, n = 3): PostMeta[] {
  const all = getAllPosts().filter((p) => p.slug !== slug);
  const same = all.filter((p) => p.cluster === cluster);
  const rest = all.filter((p) => p.cluster !== cluster);
  return [...same, ...rest].slice(0, n);
}

export function getPost(slug: string): PostFull | null {
  const parsed = loadAll().get(slug);
  if (!parsed) return null;
  return {
    ...parsed.meta,
    html: parsed.html,
    toc: parsed.toc,
    faq: parsed.faq,
    related: getRelated(parsed.meta.slug, parsed.meta.cluster),
  };
}

export function clusterStats(): { key: string; title: string; short: string; count: number }[] {
  const all = getAllPosts();
  return CLUSTERS.map((c) => ({
    key: c.key,
    title: c.title,
    short: c.short,
    count: all.filter((p) => p.cluster === c.key).length,
  }));
}

export function totalPosts(): number {
  return loadAll().size;
}

/** Для тестов / hot-reload: сбросить кэш. */
export function clearBlogCache(): void {
  cache = null;
}
