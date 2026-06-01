/**
 * SEO-head + JSON-LD для публичных страниц. Чистые функции (без доступа
 * к сети/окружению): принимают route + data + origin, возвращают строку
 * head-тегов для вставки в SSR-шаблон. Аналитику и сериализацию данных
 * добавляет сервер (server/ssr.ts).
 */
import type { MatchedRoute } from "./router";
import { clusterTitle } from "./clusters";
import type { BlogIndexData, ArticleData, PostFull } from "./types";

export const SITE_NAME = "TasksFlow";
const DEFAULT_DESCRIPTION =
  "TasksFlow — постановка и контроль задач для выездных и линейных сотрудников: " +
  "чек-листы, фотоотчёты, повторяющиеся задачи, бонусы и KPI. Запуск за день.";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLd(obj: unknown): string {
  // Экранируем </script> в JSON-LD, иначе можно закрыть тег раньше времени.
  const json = JSON.stringify(obj).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

interface HeadInput {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  type?: "website" | "article";
  jsonLdBlocks?: unknown[];
  prev?: string;
  next?: string;
}

function renderHead(input: HeadInput): string {
  const { title, description, canonical, ogImage, type = "website", jsonLdBlocks = [], prev, next } = input;
  const img = ogImage || `${new URL(canonical).origin}/og/default.svg`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    ...(prev ? [`<link rel="prev" href="${esc(prev)}" />`] : []),
    ...(next ? [`<link rel="next" href="${esc(next)}" />`] : []),
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    ...jsonLdBlocks.map(jsonLd),
  ].join("\n    ");
}

export function organizationLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: origin,
    logo: `${origin}/favicon.png`,
    description: DEFAULT_DESCRIPTION,
  };
}

export function softwareApplicationLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    url: origin,
    offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function articleLd(post: PostFull, origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    image: `${origin}/og/${post.slug}.svg`,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${origin}/favicon.png` },
    },
    mainEntityOfPage: `${origin}/blog/${post.slug}`,
  };
}

/** Главная функция: head-теги для роута. */
export function buildHead(route: MatchedRoute, data: unknown, origin: string): string {
  switch (route.key) {
    case "landing":
      return renderHead({
        title: "TasksFlow — контроль задач для выездных и линейных сотрудников",
        description: DEFAULT_DESCRIPTION,
        canonical: `${origin}/`,
        jsonLdBlocks: [organizationLd(origin), softwareApplicationLd(origin)],
      });

    case "blog-index": {
      const d = data as BlogIndexData;
      const page = d?.page ?? 1;
      const totalPages = d?.totalPages ?? 1;
      const base = `${origin}/blog`;
      const pageUrl = (n: number) => (n <= 1 ? base : `${base}?page=${n}`);
      const baseTitle = "Блог TasksFlow — задачи, контроль персонала, кейсы";
      return renderHead({
        title: page > 1 ? `${baseTitle} — страница ${page}` : baseTitle,
        description:
          "Практические статьи о постановке и контроле задач, мотивации персонала и автоматизации выездных команд.",
        canonical: pageUrl(page),
        prev: page > 1 ? pageUrl(page - 1) : undefined,
        next: page < totalPages ? pageUrl(page + 1) : undefined,
        jsonLdBlocks: [
          breadcrumbLd([
            { name: "Главная", url: `${origin}/` },
            { name: "Блог", url: `${origin}/blog` },
          ]),
        ],
      });
    }

    case "blog-category": {
      const key = route.params.cluster;
      const d = data as BlogIndexData;
      const page = d?.page ?? 1;
      const totalPages = d?.totalPages ?? 1;
      const base = `${origin}/blog/category/${key}`;
      const pageUrl = (n: number) => (n <= 1 ? base : `${base}?page=${n}`);
      const baseTitle = `${clusterTitle(key)} — блог TasksFlow`;
      return renderHead({
        title: page > 1 ? `${baseTitle} — страница ${page}` : baseTitle,
        description: `Статьи раздела «${clusterTitle(key)}» в блоге TasksFlow.`,
        canonical: pageUrl(page),
        prev: page > 1 ? pageUrl(page - 1) : undefined,
        next: page < totalPages ? pageUrl(page + 1) : undefined,
        jsonLdBlocks: [
          breadcrumbLd([
            { name: "Главная", url: `${origin}/` },
            { name: "Блог", url: `${origin}/blog` },
            { name: clusterTitle(key), url: `${origin}/blog/category/${key}` },
          ]),
        ],
      });
    }

    case "blog-article": {
      const d = data as ArticleData;
      const post = d?.post;
      if (!post) {
        return renderHead({
          title: "Статья не найдена — TasksFlow",
          description: "Запрошенная статья не найдена.",
          canonical: `${origin}/blog`,
        });
      }
      const blocks: unknown[] = [
        articleLd(post, origin),
        breadcrumbLd([
          { name: "Главная", url: `${origin}/` },
          { name: "Блог", url: `${origin}/blog` },
          { name: clusterTitle(post.cluster), url: `${origin}/blog/category/${post.cluster}` },
          { name: post.title, url: `${origin}/blog/${post.slug}` },
        ]),
      ];
      if (post.faq && post.faq.length) blocks.push(faqLd(post.faq));
      return renderHead({
        title: `${post.title} — TasksFlow`,
        description: post.description,
        canonical: `${origin}/blog/${post.slug}`,
        ogImage: `${origin}/og/${post.slug}.svg`,
        type: "article",
        jsonLdBlocks: blocks,
      });
    }

    default:
      return renderHead({
        title: "Страница не найдена — TasksFlow",
        description: "Страница не найдена.",
        canonical: `${origin}/`,
      });
  }
}
