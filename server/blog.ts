/**
 * Загрузка статей блога из content/blog/*.md (frontmatter + Markdown).
 *
 * Статьи не удерживаются в куче процесса (никакого Map в RAM): разобранный
 * индекс (`blog-index.json`) и полные статьи (`blog-posts.json`) сохраняются
 * как атомарные JSON-снимки на диске и автоматически пересобираются по
 * `sourceSignature` при изменении файлов в content/blog.
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { renderMarkdown, readingMinutes } from "./markdown";
import { CLUSTERS, CLUSTER_BY_KEY } from "@shared/blog-clusters";
import {
  readPromoSnapshotSync,
  writePromoSnapshotAtomicSync,
} from "./promo-cache/store";

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

interface StoredPost {
  meta: PostMeta;
  markdown: string;
  html: string;
  toc: TocItem[];
  faq?: FaqItem[];
}

function byDateDesc(a: PostMeta, b: PostMeta): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title);
}

function computeBlogSourceSignature(): { files: string[]; signature: string } {
  let files: string[];
  try {
    files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { files: [], signature: "empty" };
  }
  let maxMtime = 0;
  let totalSize = 0;
  for (const f of files) {
    try {
      const st = fs.statSync(path.join(BLOG_DIR, f));
      if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      totalSize += st.size;
    } catch {
      // Файл исчез между readdir и stat — пропускаем.
    }
  }
  return { files, signature: `${files.length}:${totalSize}:${Math.floor(maxMtime)}` };
}

function buildBlogSnapshots(
  files: string[],
  signature: string,
  env: NodeJS.ProcessEnv,
): { index: PostMeta[]; postsBySlug: Record<string, StoredPost> } {
  const postsBySlug: Record<string, StoredPost> = {};
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf-8");
      const { data, content } = matter(raw);
      const slug = String(data.slug || file.replace(/\.md$/, ""));
      const cluster = String(data.cluster || "upravlenie");
      const { html, toc } = renderMarkdown(content);
      postsBySlug[slug] = {
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
        markdown: content,
        html,
        toc,
        faq: Array.isArray(data.faq)
          ? data.faq.map((f: any) => ({ q: String(f.q), a: String(f.a) }))
          : undefined,
      };
    } catch (err) {
      console.error(`[blog] не удалось разобрать ${file}:`, err);
    }
  }
  const index = Object.values(postsBySlug)
    .map((p) => p.meta)
    .sort(byDateDesc);

  try {
    writePromoSnapshotAtomicSync("blog-index", index, { sourceSignature: signature, env });
    writePromoSnapshotAtomicSync("blog-posts", postsBySlug, { sourceSignature: signature, env });
  } catch (err) {
    console.error("[blog] не удалось записать JSON-снимок блога:", err);
  }

  return { index, postsBySlug };
}

function loadBlogIndex(env: NodeJS.ProcessEnv = process.env): PostMeta[] {
  const { files, signature } = computeBlogSourceSignature();
  const snap = readPromoSnapshotSync<PostMeta[]>("blog-index", env);
  if (snap && snap.sourceSignature === signature && Array.isArray(snap.data)) {
    return snap.data;
  }
  return buildBlogSnapshots(files, signature, env).index;
}

function loadBlogPostsMap(env: NodeJS.ProcessEnv = process.env): Record<string, StoredPost> {
  const { files, signature } = computeBlogSourceSignature();
  const snap = readPromoSnapshotSync<Record<string, StoredPost>>("blog-posts", env);
  if (snap && snap.sourceSignature === signature && snap.data && typeof snap.data === "object") {
    return snap.data;
  }
  return buildBlogSnapshots(files, signature, env).postsBySlug;
}

export function warmBlogSnapshots(env: NodeJS.ProcessEnv = process.env): void {
  const { files, signature } = computeBlogSourceSignature();
  buildBlogSnapshots(files, signature, env);
}

export function getAllPosts(env: NodeJS.ProcessEnv = process.env): PostMeta[] {
  return loadBlogIndex(env);
}

export function getByCluster(clusterKey: string, env: NodeJS.ProcessEnv = process.env): PostMeta[] {
  return getAllPosts(env).filter((p) => p.cluster === clusterKey);
}

export function getFeatured(env: NodeJS.ProcessEnv = process.env): PostMeta | null {
  const all = getAllPosts(env);
  return all.find((p) => p.featured) || all[0] || null;
}

export function getRelated(
  slug: string,
  cluster: string,
  n = 3,
  env: NodeJS.ProcessEnv = process.env,
): PostMeta[] {
  const all = getAllPosts(env).filter((p) => p.slug !== slug);
  const same = all.filter((p) => p.cluster === cluster);
  const rest = all.filter((p) => p.cluster !== cluster);
  return [...same, ...rest].slice(0, n);
}

export function getPost(slug: string, env: NodeJS.ProcessEnv = process.env): PostFull | null {
  const parsed = loadBlogPostsMap(env)[slug];
  if (!parsed) return null;
  return {
    ...parsed.meta,
    html: parsed.html,
    toc: parsed.toc,
    faq: parsed.faq,
    related: getRelated(parsed.meta.slug, parsed.meta.cluster, 3, env),
  };
}

export function getPostMarkdown(slug: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const parsed = loadBlogPostsMap(env)[slug];
  return parsed ? parsed.markdown : null;
}

export function clusterStats(
  env: NodeJS.ProcessEnv = process.env,
): { key: string; title: string; short: string; count: number }[] {
  const all = getAllPosts(env);
  return CLUSTERS.map((c) => ({
    key: c.key,
    title: c.title,
    short: c.short,
    count: all.filter((p) => p.cluster === c.key).length,
  }));
}

export function totalPosts(env: NodeJS.ProcessEnv = process.env): number {
  return getAllPosts(env).length;
}

/** Для тестов / совместимости: в памяти процесса статьи больше не удерживаются. */
export function clearBlogCache(): void {
  // Данные читаются с диска (из страничного кэша ОС) по sourceSignature.
}
