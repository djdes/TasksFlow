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
}

export interface ArticleData {
  post: PostFull | null;
}

export type PageData = LandingData | BlogIndexData | ArticleData | null;
