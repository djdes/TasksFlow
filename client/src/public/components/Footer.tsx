import type { ReactNode } from "react";
import { CLUSTERS } from "../clusters";
import { LEGAL_DOCS } from "../legal";
import { COOKIE_SETTINGS_EVENT, hasAnalytics } from "../analytics";
import { goToStart } from "../landing/start";
import { useSite } from "../site";
import { Logo } from "./Logo";

const linkCls = "hover:text-foreground transition-colors";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-foreground mb-3 text-sm">{title}</div>
      <ul className="space-y-2 text-sm text-muted-foreground">{children}</ul>
    </div>
  );
}

export function Footer() {
  const { contactEmail, analytics } = useSite();
  const year = 2026;
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <Logo className="mb-3" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Контроль задач для выездных и линейных команд: чек-листы, фотоотчёты, премии.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Вопросы и подключение:{" "}
            <a href={`mailto:${contactEmail}`} className="font-medium text-foreground hover:text-primary transition-colors">
              {contactEmail}
            </a>
          </p>
          <a
            href="/#start"
            onClick={goToStart}
            className="press mt-5 inline-flex rounded-full bg-primary text-primary-foreground text-sm font-semibold px-5 py-2"
          >
            Попробовать бесплатно
          </a>
        </div>
        <Column title="Продукт">
          <li><a href="/#features" className={linkCls}>Возможности</a></li>
          <li><a href="/#how" className={linkCls}>Как работает</a></li>
          <li><a href="/#pricing" className={linkCls}>Тарифы</a></li>
          <li><a href="/login" className={linkCls}>Вход для сотрудников</a></li>
        </Column>
        <Column title="Блог">
          <li><a href="/blog" className={linkCls}>Все статьи</a></li>
          {CLUSTERS.map((c) => (
            <li key={c.key}>
              <a href={`/blog/category/${c.key}`} className={linkCls}>{c.short}</a>
            </li>
          ))}
        </Column>
        <Column title="Документы">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}>
              <a href={d.path} className={linkCls}>{d.label}</a>
            </li>
          ))}
          {hasAnalytics(analytics) && (
            <li>
              <button
                type="button"
                className={linkCls}
                onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}
              >
                Cookie
              </button>
            </li>
          )}
        </Column>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {year} TasksFlow
      </div>
    </footer>
  );
}
