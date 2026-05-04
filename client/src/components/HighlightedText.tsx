/**
 * Подсветка совпадений с поисковым запросом в тексте. Простая
 * замена `{title}` на `<HighlightedText text={title} query={search}/>`
 * — без перевёрстки мест где он используется.
 *
 * Безопасно: regex-эскейп для query, без dangerouslySetInnerHTML.
 * Регистр игнорируется. Пустой query — текст без изменений.
 */

type Props = {
  text: string;
  query?: string | null;
  className?: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightedText({ text, query, className }: Props) {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return <span className={className}>{text}</span>;

  const re = new RegExp(`(${escapeRegex(trimmed)})`, "gi");
  const parts = text.split(re);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark key={i} className="search-highlight">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
