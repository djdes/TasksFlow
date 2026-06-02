/**
 * Декоративный слой плавающих частиц фона (точки, кольца, разные оттенки).
 * Чистый CSS-дрейф, детерминированные позиции, очень мягко — не мешает
 * чтению, уважает prefers-reduced-motion (см. public.css). SSR-safe.
 */
const FIELD = [
  { l: "6%", t: "18%", s: 8, d: 9, delay: 0, k: "" },
  { l: "14%", t: "62%", s: 5, d: 11, delay: 1.2, k: "p-violet" },
  { l: "22%", t: "30%", s: 14, d: 13, delay: 0.5, k: "p-ring" },
  { l: "33%", t: "75%", s: 6, d: 10, delay: 2, k: "" },
  { l: "44%", t: "16%", s: 10, d: 14, delay: 0.8, k: "p-cyan" },
  { l: "52%", t: "55%", s: 5, d: 12, delay: 1.6, k: "" },
  { l: "63%", t: "28%", s: 18, d: 16, delay: 0.3, k: "p-ring" },
  { l: "71%", t: "70%", s: 7, d: 11, delay: 2.4, k: "p-violet" },
  { l: "80%", t: "22%", s: 6, d: 9, delay: 1, k: "" },
  { l: "88%", t: "58%", s: 9, d: 13, delay: 0.6, k: "p-cyan" },
  { l: "92%", t: "38%", s: 5, d: 15, delay: 1.9, k: "" },
  { l: "38%", t: "44%", s: 4, d: 10, delay: 2.6, k: "p-violet" },
  { l: "58%", t: "82%", s: 12, d: 17, delay: 0.4, k: "p-ring" },
  { l: "10%", t: "44%", s: 6, d: 12, delay: 1.4, k: "p-cyan" },
];

export function Particles({ className = "" }: { className?: string }) {
  return (
    <div className={`particles ${className}`} aria-hidden="true">
      {FIELD.map((p, i) => (
        <span
          key={i}
          className={`particle ${p.k}`}
          style={{
            left: p.l,
            top: p.t,
            width: p.s,
            height: p.s,
            animationDuration: `${p.d}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
