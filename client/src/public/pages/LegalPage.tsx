import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { TableOfContents } from "../components/TableOfContents";
import { NotFoundPage } from "./NotFound";
import { LEGAL_DOCS, formatLegalDate, operatorLines } from "../legal";
import type { LegalData } from "../types";

const OPERATOR_SECTION = { id: "operator", text: "Оператор и контакты", level: 2 };

/**
 * Страница юридического документа: узкая колонка для чтения, переключатель
 * документов, дата редакции, содержание (сбоку на десктопе, раскрывающееся
 * на телефоне) и карточка оператора из env. Незаданные реквизиты видны как
 * плейсхолдеры — их нужно заполнить, а не угадать.
 */
export function LegalPage({ data }: { data: LegalData | null }) {
  const doc = data?.doc ?? null;
  if (!data || !doc) return <NotFoundPage />;
  const updated = formatLegalDate(doc.updatedAt);
  const sections = [...doc.toc.filter((t) => t.level === 2), OPERATOR_SECTION];

  return (
    <div className="legal min-h-screen bg-background text-foreground flex flex-col">
      <Nav />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-20 sm:pt-10">
        <div className="legal-grid">
          <article className="min-w-0">
            <nav aria-label="Документы" className="legal-tabs">
              {LEGAL_DOCS.map((d) => (
                <a
                  key={d.slug}
                  href={d.path}
                  className="legal-tab"
                  aria-current={d.slug === doc.slug ? "page" : undefined}
                >
                  {d.short}
                </a>
              ))}
            </nav>

            <h1 className="legal-title">{doc.title}</h1>
            {updated && <p className="legal-meta">{`Редакция от ${updated}`}</p>}

            <details className="legal-toc lg:hidden">
              <summary>
                Содержание <span>{sections.length}</span>
              </summary>
              <ol>
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.text}</a>
                  </li>
                ))}
              </ol>
            </details>

            <div className="tf-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

            <section className="legal-operator" aria-labelledby={OPERATOR_SECTION.id}>
              <h2 id={OPERATOR_SECTION.id}>{OPERATOR_SECTION.text}</h2>
              <dl>
                {operatorLines(data.operator).map((l) => (
                  <div key={l.label}>
                    <dt>{l.label}</dt>
                    <dd>
                      {l.placeholder ? (
                        <span className="legal-ph" title={`Задаётся в ${l.env}`}>{l.value}</span>
                      ) : (
                        l.value
                      )}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${data.contactEmail}`}>{data.contactEmail}</a>
                  </dd>
                </div>
              </dl>
            </section>
          </article>

          <aside className="hidden lg:block">
            <TableOfContents items={sections} />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
