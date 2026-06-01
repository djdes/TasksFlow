import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ArticleCard } from "../components/ArticleCard";
import { CoverImage } from "../components/CoverImage";
import { CLUSTER_BY_KEY, clusterTitle } from "../clusters";
import type { BlogIndexData } from "../types";

export function BlogIndex({ data }: { data: BlogIndexData | null }) {
  const posts = data?.posts ?? [];
  const clusters = data?.clusters ?? [];
  const featured = data?.featured ?? null;
  const active = data?.activeCluster ?? null;

  const crumbs = active
    ? [
        { name: "Главная", href: "/" },
        { name: "Блог", href: "/blog" },
        { name: clusterTitle(active) },
      ]
    : [{ name: "Главная", href: "/" }, { name: "Блог" }];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs items={crumbs} />

        <header className="mt-6 mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold">
            {active ? clusterTitle(active) : "Блог TasksFlow"}
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Практические статьи о постановке и контроле задач, мотивации персонала,
            фотоотчётах и автоматизации выездных команд.
          </p>
        </header>

        {/* Фильтр по кластерам */}
        <div className="flex flex-wrap gap-2 mb-8">
          <a
            href="/blog"
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
              !active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            }`}
          >
            Все
          </a>
          {clusters.map((c) => (
            <a
              key={c.key}
              href={`/blog/category/${c.key}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition ${
                active === c.key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              {c.short} <span className="opacity-60">{c.count}</span>
            </a>
          ))}
        </div>

        {/* Featured */}
        {featured && !active && (
          <a
            href={`/blog/${featured.slug}`}
            className="group grid md:grid-cols-2 gap-6 rounded-3xl border border-border bg-card overflow-hidden mb-10 hover:shadow-lg transition"
          >
            <CoverImage slug={featured.slug} cluster={featured.cluster} className="aspect-[16/10] md:aspect-auto md:h-full w-full" eager />
            <div className="p-7 flex flex-col justify-center">
              <div className="text-xs font-medium text-primary mb-2">
                {CLUSTER_BY_KEY[featured.cluster]?.short ?? "Статьи"} · {featured.readingMins} мин
              </div>
              <h2 className="text-2xl font-bold leading-snug group-hover:text-primary transition">{featured.title}</h2>
              <p className="mt-3 text-muted-foreground">{featured.description}</p>
              <span className="mt-4 text-sm font-medium text-primary">Читать →</span>
            </div>
          </a>
        )}

        {/* Сетка */}
        {posts.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map((p) => <ArticleCard key={p.slug} post={p} />)}
          </div>
        ) : (
          <p className="text-muted-foreground py-16 text-center">Статьи скоро появятся.</p>
        )}
      </div>
      <Footer />
    </div>
  );
}
