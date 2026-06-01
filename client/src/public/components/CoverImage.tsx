import { CLUSTER_BY_KEY } from "../clusters";

/**
 * Обложка статьи. Картинка — серверный детерминированный SVG /og/:slug.svg
 * (server/og-cover.ts). Под ней градиент-фолбэк по кластеру, чтобы карточка
 * выглядела цельной даже пока SVG грузится / если не отрисовался.
 */
export function CoverImage({
  slug,
  cluster,
  className = "",
  eager = false,
}: {
  slug: string;
  cluster: string;
  className?: string;
  eager?: boolean;
}) {
  const c = CLUSTER_BY_KEY[cluster];
  const hue = c?.hue ?? 233;
  return (
    <div
      className={className}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 72% 56%), hsl(${(hue + 38) % 360} 70% 46%))`,
      }}
    >
      <img
        src={`/og/${slug}.svg`}
        alt=""
        loading={eager ? "eager" : "lazy"}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
