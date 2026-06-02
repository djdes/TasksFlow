import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ArticleCard } from "../components/ArticleCard";
import { CoverImage } from "../components/CoverImage";
import { Pagination } from "../components/Pagination";
import { Particles } from "../components/Particles";
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
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav />

      {/* Декоративный фон в шапке блога */}
      <div className="absolute inset-x-0 top-0 h-[460px] -z-10 overflow-hidden" aria-hidden="true">
        <div className="aurora">
          <div className="orb orb-a" style={{ width: 420, height: 420, left: -120, top: -140, background: "radial-gradient(circle, hsl(var(--primary)/0.5), transparent 70%)" }} />
          <div className="orb orb-b" style={{ width: 360, height: 360, right: -100, top: -80, background: "radial-gradient(circle, rgba(139,92,246,0.45), transparent 70%)" }} />
        </div>
        <Particles />
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs items={crumbs} />

        <header data-reveal className="mt-6 mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold">
            {active ? clusterTitle(active) : <>Блог <span className="text-gradient">TasksFlow</span></>}
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
            data-reveal
            className="group grid md:grid-cols-2 gap-6 rounded-3xl border border-border bg-card overflow-hidden mb-10 hover-lift"
          >
            <div className="aspect-[16/10] md:aspect-auto md:h-full w-full overflow-hidden">
              <CoverImage slug={featured.slug} cluster={featured.cluster} className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]" eager />
            </div>
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

        {/* Счётчик + страница */}
        {total > 0 && (
          <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
            <span>
              {active ? `${total} ст.` : `${total} статей`} в разделе
            </span>
            {totalPages > 1 && <span>Страница {page} из {totalPages}</span>}
          </div>
        )}

        {/* Сетка */}
        {posts.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {posts.map((p, i) => <ArticleCard key={p.slug} post={p} delay={(i % 3) * 70} />)}
          </div>
        ) : (
          <p className="text-muted-foreground py-16 text-center">Статьи скоро появятся.</p>
        )}

        <Pagination page={page} totalPages={totalPages} basePath={basePath} />
      </div>
      <Footer />
    </div>
  );
}
