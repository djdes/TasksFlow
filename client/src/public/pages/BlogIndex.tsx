import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ArticleCard } from "../components/ArticleCard";
import { CoverImage } from "../components/CoverImage";
import { Pagination } from "../components/Pagination";
import { CLUSTER_BY_KEY, clusterTitle } from "../clusters";
import type { BlogIndexData } from "../types";

export function BlogIndex({ data }: { data: BlogIndexData | null }) {
  const posts = data?.posts ?? [];
  const clusters = data?.clusters ?? [];
  const featured = data?.featured ?? null;
  const active = data?.activeCluster ?? null;
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? posts.length;
  const basePath = active ? `/blog/category/${active}` : "/blog";

  const crumbs = active
    ? [
        { name: "Главная", href: "/" },
        { name: "Блог", href: "/blog" },
        { name: clusterTitle(active) },
      ]
    : [{ name: "Главная", href: "/" }, { name: "Блог" }];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-20 sm:pt-8">
        <Breadcrumbs items={crumbs} />

        <header className="blog-head">
          <span className="lp-eyebrow">Блог</span>
          <h1 className="blog-title">
            {active ? clusterTitle(active) : <>Блог <span className="text-primary">TasksFlow</span></>}
          </h1>
          <p className="lp-lead">
            Практические статьи о постановке и контроле задач, мотивации персонала,
            фотоотчётах и автоматизации выездных команд.
          </p>
        </header>

        <nav aria-label="Разделы блога" className="blog-chips">
          <a href="/blog" className="blog-chip" aria-current={!active ? "page" : undefined}>
            Все
          </a>
          {clusters.map((c) => (
            <a
              key={c.key}
              href={`/blog/category/${c.key}`}
              className="blog-chip"
              aria-current={active === c.key ? "page" : undefined}
            >
              {c.short} <span>{c.count}</span>
            </a>
          ))}
        </nav>

        {featured && !active && (
          <a href={`/blog/${featured.slug}`} data-reveal className="post-featured">
            <div className="post-cover">
              <CoverImage slug={featured.slug} cluster={featured.cluster} eager />
            </div>
            <div className="post-body">
              <div className="post-meta">
                <b>{CLUSTER_BY_KEY[featured.cluster]?.short ?? "Статьи"}</b> · {featured.readingMins} мин
              </div>
              <h2>{featured.title}</h2>
              <p className="post-desc">{featured.description}</p>
              <span className="post-more">Читать →</span>
            </div>
          </a>
        )}

        {total > 0 && (
          <div className="blog-count">
            <span>{active ? `${total} ст.` : `${total} статей`} в разделе</span>
            {totalPages > 1 && <span>Страница {page} из {totalPages}</span>}
          </div>
        )}

        {posts.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map((p, i) => <ArticleCard key={p.slug} post={p} delay={(i % 3) * 70} />)}
          </div>
        ) : (
          <p className="text-muted-foreground py-16 text-center">Статьи скоро появятся.</p>
        )}

        <Pagination page={page} totalPages={totalPages} basePath={basePath} />
      </main>
      <Footer />
    </div>
  );
}
