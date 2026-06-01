import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  name: string;
  href?: string;
}

/**
 * Хлебные крошки для публичных страниц (блог, категории, статьи).
 * JSON-LD BreadcrumbList добавляется отдельно в seo.ts.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i === 0 && <Home className="w-3.5 h-3.5" />}
              {c.href && !last ? (
                <a href={c.href} className="hover:text-foreground transition">{c.name}</a>
              ) : (
                <span className={last ? "text-foreground font-medium" : ""}>{c.name}</span>
              )}
              {!last && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
