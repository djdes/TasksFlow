import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { ArticleCard } from "../components/ArticleCard";
import { ContentBanner } from "../components/ContentBanner";
import { TableOfContents } from "../components/TableOfContents";
import { AuthForm } from "../landing/auth";
import { clusterTitle } from "../clusters";
import type { ArticleData } from "../types";

export function BlogArticle({ data }: { data: ArticleData | null }) {
  const post = data?.post ?? null;

  if (!post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Nav />
        <main className="flex-1 max-w-3xl mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-bold mb-3">Статья не найдена</h1>
          <p className="text-muted-foreground mb-6">Возможно, ссылка устарела.</p>
          <a href="/blog" className="inline-flex rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">
            Все статьи
          </a>
        </main>
        <Footer />
      </div>
    );
  }

  const cluster = clusterTitle(post.cluster);
  // Прогресс чтения рисует шапка (.scroll-progress), отдельная полоса не нужна.
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-20 sm:pt-8">
        <Breadcrumbs
          items={[
            { name: "Главная", href: "/" },
            { name: "Блог", href: "/blog" },
            { name: cluster, href: `/blog/category/${post.cluster}` },
            { name: post.title },
          ]}
        />

        <div className="read-grid mt-4">
          <article className="min-w-0">
            <header className="article-head">
              <div className="article-eyebrow">
                <a href={`/blog/category/${post.cluster}`}>{cluster}</a> · {post.readingMins} мин чтения
              </div>
              <h1 className="article-title">{post.title}</h1>
              <p className="article-lead">{post.description}</p>
            </header>

            <div className="tf-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

            {post.faq && post.faq.length > 0 && (
              <section className="article-faq">
                <h2>Частые вопросы</h2>
                <div className="faq">
                  {post.faq.map((f) => (
                    <details key={f.q} className="faq-item">
                      <summary>
                        {f.q}
                        <span className="faq-icon" aria-hidden="true" />
                      </summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Промо-баннер в контенте статьи (если активен) */}
            <ContentBanner className="mt-12" />

            <section className="article-cta" data-cookie-avoid>
              <h2>Попробуйте TasksFlow</h2>
              <p>Поставьте задачи, требуйте фотоотчёты и контролируйте команду. Регистрация за секунду.</p>
              <AuthForm layout="row" />
            </section>
          </article>

          {post.toc.length > 0 && (
            <aside className="hidden lg:block">
              <TableOfContents items={post.toc} />
            </aside>
          )}
        </div>

        {post.related.length > 0 && (
          <section className="article-related">
            <h2>Читайте также</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {post.related.map((p) => <ArticleCard key={p.slug} post={p} />)}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
