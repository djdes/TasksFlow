/** Общие типы публичной части (лендинг + блог). */

export interface FaqItem {
  q: string;
  a: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  cluster: string; // ключ из CLUSTERS
  tags: string[];
  readingMins: number;
  featured?: boolean;
}

export interface TocItem {
  id: string;
  text: string;
  level: number; // 2 | 3
}

export interface PostFull extends PostMeta {
  /** Отрендеренный из Markdown HTML тела статьи. */
  html: string;
  faq?: FaqItem[];
  related: PostMeta[];
  toc: TocItem[];
}

export interface ClusterStat {
  key: string;
  title: string;
  short: string;
  count: number;
}

export interface LandingData {
  featuredPosts: PostMeta[];
  totalPosts: number;
}

export interface BlogIndexData {
  posts: PostMeta[];
  clusters: ClusterStat[];
  featured: PostMeta | null;
  activeCluster: string | null;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

export interface ArticleData {
  post: PostFull | null;
}

export type LegalSlug = "privacy" | "consent" | "terms";

/** Реквизиты оператора из env (LEGAL_OPERATOR_*). Пустое поле — null, на странице не выводится. */
export interface LegalOperator {
  name: string | null;
  inn: string | null;
  ogrn: string | null;
  address: string | null;
}

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  description: string;
  /** Отрендеренный Markdown из content/legal/<slug>.md. */
  html: string;
  toc: TocItem[];
  /** yyyy-mm-dd: LEGAL_UPDATED_AT или дата из frontmatter. */
  updatedAt: string | null;
}

export interface LegalData {
  doc: LegalDoc | null;
  operator: LegalOperator;
  contactEmail: string;
}

/** Счётчики аналитики. Грузятся только после согласия посетителя (CookieNotice). */
export interface AnalyticsIds {
  ym: string | null;
  ga: string | null;
}

/** Общие для всех публичных страниц настройки (window.__SSR_SITE__). */
export interface SiteConfig {
  contactEmail: string;
  analytics: AnalyticsIds;
}

export type PageData = LandingData | BlogIndexData | ArticleData | LegalData | null;
