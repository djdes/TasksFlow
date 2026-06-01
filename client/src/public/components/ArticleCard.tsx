import { CLUSTER_BY_KEY } from "../clusters";
import { CoverImage } from "./CoverImage";
import type { PostMeta } from "../types";

export function ArticleCard({ post, delay = 0 }: { post: PostMeta; delay?: number }) {
  const c = CLUSTER_BY_KEY[post.cluster];
  return (
    <a
      href={`/blog/${post.slug}`}
      data-reveal
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className="group flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden hover-lift"
    >
      <div className="aspect-[16/9] w-full overflow-hidden">
        <CoverImage
          slug={post.slug}
          cluster={post.cluster}
          className="w-full h-full transition-transform duration-500 group-hover:scale-[1.05]"
        />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="text-xs font-medium text-primary mb-2">
          {c?.short ?? "Статьи"} · {post.readingMins} мин
        </div>
        <h3 className="font-semibold text-foreground leading-snug group-hover:text-primary transition line-clamp-2">
          {post.title}
        </h3>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{post.description}</p>
      </div>
    </a>
  );
}
