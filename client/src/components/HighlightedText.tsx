/**
 * Подсветка совпадений с поисковым запросом в тексте. Простая
 * замена `{title}` на `<HighlightedText text={title} query={search}/>`
 * — без перевёрстки мест где он используется.
 *
 * Логика разбиения — в lib/highlight.ts (pure, тестируется отдельно).
 * Здесь только React-presentation.
 */

import { splitForHighlight } from "@/lib/highlight";

type Props = {
  text: string;
  query?: string | null;
  className?: string;
};

export function HighlightedText({ text, query, className }: Props) {
  const segments = splitForHighlight(text, query);
  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.isMatch ? (
          <mark key={i} className="search-highlight">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}
