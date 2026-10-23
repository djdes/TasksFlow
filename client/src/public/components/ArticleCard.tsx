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
      className="post-card"
    >
      <div className="post-cover">
        <CoverImage slug={post.slug} cluster={post.cluster} />
      </div>
      <div className="post-body">
        <div className="post-meta">
          <b>{c?.short ?? "Статьи"}</b> · {post.readingMins} мин
        </div>
        <h3 className="post-title">{post.title}</h3>
        <p className="post-desc">{post.description}</p>
      </div>
    </a>
  );
}
