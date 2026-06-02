import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ArticleCard } from "../components/ArticleCard";
import { Particles } from "../components/Particles";
import { AuthForm } from "../landing/auth";
import { clusterTitle } from "../clusters";
import type { ArticleData } from "../types";

function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-[60] bg-transparent">
      <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BlogArticle({ data }: { data: ArticleData | null }) {
  const post = data?.post ?? null;

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-bold mb-3">Статья не найдена</h1>
          <p className="text-muted-foreground mb-6">Возможно, ссылка устарела.</p>
          <a href="/blog" className="inline-flex rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">
            Все статьи
          </a>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <ReadingProgress />
      <Nav />

      {/* Декоративный фон в шапке статьи */}
      <div className="absolute inset-x-0 top-0 h-[400px] -z-10 overflow-hidden" aria-hidden="true">
        <div className="aurora">
          <div className="orb orb-a" style={{ width: 420, height: 420, left: -140, top: -160, background: "radial-gradient(circle, hsl(var(--primary)/0.45), transparent 70%)" }} />
          <div className="orb orb-c" style={{ width: 320, height: 320, right: -90, top: -60, background: "radial-gradient(circle, rgba(34,211,238,0.32), transparent 70%)" }} />
        </div>
        <Particles />
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { name: "Главная", href: "/" },
            { name: "Блог", href: "/blog" },
            { name: clusterTitle(post.cluster), href: `/blog/category/${post.cluster}` },
            { name: post.title },
          ]}
        />

        <div className="mt-6 grid lg:grid-cols-[1fr_260px] gap-10">
          <article className="min-w-0">
            <div className="text-sm font-medium text-primary mb-2">
              {clusterTitle(post.cluster)} · {post.readingMins} мин чтения
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-4">{post.title}</h1>
            <p className="text-lg text-muted-foreground mb-8">{post.description}</p>

            <div
              className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-a:text-primary"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />

            {post.faq && post.faq.length > 0 && (
              <section className="mt-12">
                <h2 className="text-2xl font-bold mb-5">Частые вопросы</h2>
                <div className="space-y-3">
                  {post.faq.map((f) => (
                    <details key={f.q} className="group rounded-xl border border-border bg-card p-5">
                      <summary className="font-semibold cursor-pointer list-none flex justify-between items-center">
                        {f.q}<span className="text-primary group-open:rotate-45 transition">+</span>
                      </summary>
                      <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* CTA */}
            <div className="mt-12 rounded-2xl bg-primary/5 border border-primary/20 p-7">
              <h3 className="text-xl font-bold mb-2">Попробуйте TasksFlow</h3>
              <p className="text-muted-foreground mb-5">Поставьте задачи, требуйте фотоотчёты и контролируйте команду. Регистрация за секунду.</p>
              <AuthForm layout="row" />
            </div>
          </article>

          {/* TOC */}
          {post.toc.length > 0 && (
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Содержание</div>
                <nav className="space-y-1.5 text-sm">
                  {post.toc.map((t) => (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      className={`block text-muted-foreground hover:text-foreground transition ${t.level === 3 ? "pl-3" : ""}`}
                    >
                      {t.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>

        {/* Похожие */}
        {post.related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-bold mb-6">Читайте также</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {post.related.map((p) => <ArticleCard key={p.slug} post={p} />)}
            </div>
          </section>
        )}
      </div>
      <Footer />
    </div>
  );
}
