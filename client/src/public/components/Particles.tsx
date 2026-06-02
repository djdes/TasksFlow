/**
 * Декоративный слой плавающих частиц фона (точки, кольца, разные оттенки).
 * Чистый CSS-дрейф, детерминированные позиции, очень мягко — не мешает
 * чтению, уважает prefers-reduced-motion (см. public.css). SSR-safe.
 */
const FIELD = [
  { l: "4%", t: "16%", s: 12, d: 9, delay: 0, k: "" },
  { l: "9%", t: "70%", s: 9, d: 11, delay: 1.2, k: "p-violet" },
  { l: "16%", t: "34%", s: 26, d: 13, delay: 0.5, k: "p-ring" },
  { l: "30%", t: "84%", s: 10, d: 10, delay: 2, k: "" },
  { l: "47%", t: "12%", s: 14, d: 14, delay: 0.8, k: "p-cyan" },
  { l: "50%", t: "62%", s: 8, d: 12, delay: 1.6, k: "" },
  { l: "66%", t: "24%", s: 34, d: 16, delay: 0.3, k: "p-ring" },
  { l: "73%", t: "78%", s: 11, d: 11, delay: 2.4, k: "p-violet" },
  { l: "83%", t: "18%", s: 9, d: 9, delay: 1, k: "" },
  { l: "90%", t: "62%", s: 14, d: 13, delay: 0.6, k: "p-cyan" },
  { l: "95%", t: "40%", s: 8, d: 15, delay: 1.9, k: "" },
  { l: "40%", t: "46%", s: 7, d: 10, delay: 2.6, k: "p-violet" },
  { l: "60%", t: "88%", s: 20, d: 17, delay: 0.4, k: "p-ring" },
  { l: "6%", t: "46%", s: 10, d: 12, delay: 1.4, k: "p-cyan" },
  { l: "26%", t: "8%", s: 8, d: 12, delay: 0.9, k: "" },
  { l: "86%", t: "84%", s: 9, d: 14, delay: 1.7, k: "p-violet" },
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
