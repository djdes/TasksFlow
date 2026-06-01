import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Пагинация публичного блога. Ссылки — обычные <a href> (?page=N),
 * чтобы работали без JS и индексировались. На первой странице page
 * опускается из URL (канонический /blog).
 */
function buildItems(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("...");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("...");
  items.push(total);
  return items;
}

export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const href = (n: number) => (n <= 1 ? basePath : `${basePath}?page=${n}`);
  const items = buildItems(page, totalPages);

  const baseBtn =
    "inline-flex items-center justify-center min-w-10 h-10 px-3 rounded-xl text-sm font-medium transition select-none";
  const idle = "border border-border bg-card text-foreground hover:bg-muted";
  const disabled = "border border-border bg-muted/40 text-muted-foreground/50 pointer-events-none";

  return (
    <nav aria-label="Постраничная навигация" className="mt-12 flex items-center justify-center gap-2 flex-wrap">
      {page > 1 ? (
        <a href={href(page - 1)} className={`${baseBtn} ${idle}`} rel="prev" aria-label="Предыдущая страница">
          <ChevronLeft className="w-4 h-4" />
        </a>
      ) : (
        <span className={`${baseBtn} ${disabled}`} aria-hidden="true">
          <ChevronLeft className="w-4 h-4" />
        </span>
      )}

      {items.map((it, i) =>
        it === "..." ? (
          <span key={`e${i}`} className="inline-flex items-center justify-center min-w-10 h-10 text-muted-foreground">
            …
          </span>
        ) : it === page ? (
          <span
            key={it}
            aria-current="page"
            className={`${baseBtn} bg-primary text-primary-foreground shadow-lg shadow-primary/25`}
          >
            {it}
          </span>
        ) : (
          <a key={it} href={href(it)} className={`${baseBtn} ${idle}`}>
            {it}
          </a>
        ),
      )}

      {page < totalPages ? (
        <a href={href(page + 1)} className={`${baseBtn} ${idle}`} rel="next" aria-label="Следующая страница">
          <ChevronRight className="w-4 h-4" />
        </a>
      ) : (
        <span className={`${baseBtn} ${disabled}`} aria-hidden="true">
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </nav>
  );
}
