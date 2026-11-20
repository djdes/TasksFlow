/**
 * Чистая Markdown-выдача и расширенный индекс /llms-full.txt для ИИ-агентов и краулеров.
 *
 * Работает строго поверх дисковых JSON-снимков (0 SELECT к MySQL):
 *   • .md-двойники публичных страниц: /index.md, /blog.md, /blog/category/:cluster.md,
 *     /blog/:slug.md, /privacy.md, /consent.md, /terms.md, /offer.md, /app.md
 *   • HTTP content negotiation по RFC 9110: Accept: text/markdown на тех же URL
 *   • /llms-full.txt — полный справочник продукта, тарифов, FAQ и статей блога
 */
import { CLUSTERS, CLUSTER_BY_KEY } from "@shared/blog-clusters";
import {
  DEFAULT_PRICES,
  formatRub,
  monthlyRate,
  pickPromotion,
  promotionDiscountRub,
  type PlanPrice,
  type PricePromotion,
} from "@shared/billing";
import { PLAN_FEATURES, PLAN_IDS, PLANS } from "@shared/plans";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "../../client/src/public/seo";
import { LANDING_FAQ } from "../../client/src/public/landing-faq";
import { LEGAL_DOCS, LEGAL_SLUGS, operatorLines } from "../../client/src/public/legal";
import { appInfo } from "../app-links";
import {
  clusterStats,
  getAllPosts,
  getByCluster,
  getPost,
  getPostMarkdown,
} from "../blog";
import { legalContactEmail, loadLegalData, loadLegalMarkdown } from "../public-data";
import { getPromoPrices, getPromoPromotions } from "./datasets";

/**
 * Разбирает заголовок Accept (RFC 9110) и возвращает true, только когда клиент
 * явно запросил `text/markdown` (или `text/x-markdown`) с весом q > 0 и не ниже `text/html`.
 * Обычные браузеры и запросы с wildcard media-range получают HTML.
 */
export function prefersMarkdown(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) return false;
  let mdQ = -1;
  let htmlQ = -1;

  for (const rawPart of acceptHeader.split(",")) {
    const segments = rawPart.trim().split(";");
    const mime = (segments[0] || "").trim().toLowerCase();
    if (!mime) continue;
    let q = 1;
    for (let i = 1; i < segments.length; i++) {
      const kv = segments[i].trim().split("=");
      if (kv[0]?.trim().toLowerCase() === "q") {
        const parsed = Number.parseFloat(kv[1]?.trim() ?? "1");
        if (Number.isFinite(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
    }
    if (mime === "text/markdown" || mime === "text/x-markdown") {
      mdQ = Math.max(mdQ, q);
    } else if (mime === "text/html" || mime === "application/xhtml+xml") {
      htmlQ = Math.max(htmlQ, q);
    }
  }

  return mdQ > 0 && mdQ >= htmlQ;
}

/**
 * Переводит `.md`-адрес или канонический публичный путь в канонический путь промо-страницы.
 * Возвращает `null`, если адрес не относится к промо-страницам.
 */
export function resolveMarkdownTwinPath(pathname: string): string | null {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "/index.md") return "/";
  if (clean === "/blog" || clean === "/blog.md") return "/blog";
  if (clean === "/app" || clean === "/app.md") return "/app";

  const withoutMd = clean.endsWith(".md") ? clean.slice(0, -3) : clean;
  if (LEGAL_SLUGS.has(withoutMd.slice(1))) return withoutMd;

  const cat = withoutMd.match(/^\/blog\/category\/([^/]+)$/);
  if (cat) return `/blog/category/${decodeURIComponent(cat[1])}`;

  const art = withoutMd.match(/^\/blog\/([^/]+)$/);
  if (art) return `/blog/${decodeURIComponent(art[1])}`;

  return null;
}

/** Канонический URL `.md`-версии для тега `<link rel="alternate" type="text/markdown" />`. */
export function markdownTwinHref(origin: string, canonicalPath: string): string {
  const base = origin.replace(/\/+$/, "");
  if (canonicalPath === "/" || canonicalPath === "") return `${base}/index.md`;
  return `${base}${canonicalPath}.md`;
}

function formatPlanPriceMd(
  planId: (typeof PLAN_IDS)[number],
  prices: readonly PlanPrice[],
  promotion: PricePromotion | null,
): string {
  if (planId === "start") return "0 ₽ (навсегда)";
  const rate = monthlyRate(prices, planId);
  if (rate === null) return "по запросу";
  const month = Math.round(rate);
  if (promotion) {
    const sale = month - promotionDiscountRub(month, promotion.percent);
    return `${formatRub(sale)} / мес (без акции ${formatRub(month)} / мес, −${promotion.percent}%)`;
  }
  return `${formatRub(month)} / мес`;
}

async function loadLandingPricingSafe(env: NodeJS.ProcessEnv = process.env): Promise<{
  prices: PlanPrice[];
  promotion: PricePromotion | null;
}> {
  const prices = await getPromoPrices(env).catch(() => DEFAULT_PRICES.map((p) => ({ ...p })));
  const promotions = await getPromoPromotions(env).catch(() => []);
  const promotion = pickPromotion(promotions, Math.floor(Date.now() / 1000));
  return { prices, promotion };
}

export async function renderPromoMarkdown(
  pathname: string,
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ status: number; markdown: string } | null> {
  const canonicalPath = resolveMarkdownTwinPath(pathname);
  if (!canonicalPath) return null;
  const base = origin.replace(/\/+$/, "");
  const contactEmail = legalContactEmail(env);

  if (canonicalPath === "/") {
    const { prices, promotion } = await loadLandingPricingSafe(env);
    const featured = getAllPosts(env).slice(0, 6);
    const lines: string[] = [
      `# ${SITE_NAME} — контроль задач для выездных и линейных сотрудников`,
      "",
      `> ${DEFAULT_DESCRIPTION}`,
      "",
      `- Канонический адрес: ${base}/`,
      `- Контакты: ${contactEmail}`,
      `- Карта для ИИ: ${base}/llms.txt | ${base}/llms-full.txt`,
      "",
      "## Ключевые возможности",
      "",
      "- **Чек-листы и фотоотчёты**: подтверждение выполнения задач фотографией прямо с камеры телефона.",
      "- **Повторяющиеся задачи смены**: автоматическая постановка ежедневных и еженедельных регламентов по часовому поясу компании.",
      "- **Telegram-бот и мобильное приложение**: постановка задач голосом или текстом, пуш-уведомления на Android и iPhone.",
      "- **Двухэтапная приёмка и премии**: проверка выполненных задач руководителем, бонусы и прозрачный KPI.",
      "",
      "## Тарифы",
      "",
    ];
    if (promotion) {
      const until = new Date((promotion.endsAt - 1) * 1000).toLocaleDateString("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
        month: "long",
      });
      lines.push(`**Действующая акция — ${promotion.title}:** скидка −${promotion.percent}% до ${until}.`, "");
    }
    lines.push("| Тариф | Стоимость | Возможности |", "| --- | --- | --- |");
    for (const id of PLAN_IDS) {
      lines.push(
        `| ${PLANS[id].name} | ${formatPlanPriceMd(id, prices, promotion)} | ${PLAN_FEATURES[id].join("; ")} |`,
      );
    }
    lines.push("");

    if (featured.length > 0) {
      lines.push("## Свежие статьи в блоге", "");
      for (const p of featured) {
        lines.push(`- [${p.title}](${base}/blog/${p.slug}) (${p.date}, ${p.readingMins} мин): ${p.description}`);
      }
      lines.push("", `Все статьи: ${base}/blog`, "");
    }

    lines.push("## Частые вопросы", "");
    for (const item of LANDING_FAQ) {
      lines.push(`### ${item.q}`, "", item.a, "");
    }
    return { status: 200, markdown: lines.join("\n") };
  }

  if (canonicalPath === "/blog") {
    const posts = getAllPosts(env);
    const stats = clusterStats(env);
    const lines: string[] = [
      `# Блог ${SITE_NAME}`,
      "",
      "> Практические статьи о постановке и контроле задач, мотивации персонала, фотоотчётах и автоматизации выездных команд.",
      "",
      `Канонический адрес: ${base}/blog`,
      "",
      "## Разделы",
      "",
      ...stats.map((c) => `- [${c.title}](${base}/blog/category/${c.key}) (${c.count})`),
      "",
      `## Все статьи (${posts.length})`,
      "",
      ...posts.map(
        (p) => `- [${p.title}](${base}/blog/${p.slug}) — ${p.date}, ${p.readingMins} мин: ${p.description}`,
      ),
      "",
    ];
    return { status: 200, markdown: lines.join("\n") };
  }

  if (canonicalPath.startsWith("/blog/category/")) {
    const clusterKey = canonicalPath.slice("/blog/category/".length);
    const cluster = CLUSTER_BY_KEY[clusterKey];
    if (!cluster) {
      return {
        status: 404,
        markdown: `# Раздел не найден — ${SITE_NAME}\n\nПерейти ко всем статьям: ${base}/blog\n`,
      };
    }
    const posts = getByCluster(clusterKey, env);
    const lines: string[] = [
      `# ${cluster.title} — блог ${SITE_NAME}`,
      "",
      `Канонический адрес: ${base}/blog/category/${clusterKey}`,
      "",
      ...posts.map(
        (p) => `- [${p.title}](${base}/blog/${p.slug}) — ${p.date}, ${p.readingMins} мин: ${p.description}`,
      ),
      "",
    ];
    return { status: 200, markdown: lines.join("\n") };
  }

  if (canonicalPath.startsWith("/blog/")) {
    const slug = canonicalPath.slice("/blog/".length);
    const post = getPost(slug, env);
    if (!post) {
      return {
        status: 404,
        markdown: `# Статья не найдена — ${SITE_NAME}\n\nВсе статьи блога: ${base}/blog\n`,
      };
    }
    const rawMd = getPostMarkdown(slug, env) ?? "";
    const cluster = CLUSTER_BY_KEY[post.cluster]?.title ?? post.cluster;
    const lines: string[] = [
      `# ${post.title}`,
      "",
      `> ${post.description}`,
      "",
      `- Канонический адрес: ${base}/blog/${post.slug}`,
      `- Раздел: [${cluster}](${base}/blog/category/${post.cluster})`,
      `- Дата публикации: ${post.date}`,
      `- Время чтения: ${post.readingMins} мин`,
      ...(post.tags.length > 0 ? [`- Теги: ${post.tags.join(", ")}`] : []),
      "",
      rawMd.trim(),
      "",
    ];
    if (post.faq && post.faq.length > 0) {
      lines.push("## Частые вопросы", "");
      for (const f of post.faq) {
        lines.push(`### ${f.q}`, "", f.a, "");
      }
    }
    if (post.related.length > 0) {
      lines.push("## Читайте также", "");
      for (const r of post.related) {
        lines.push(`- [${r.title}](${base}/blog/${r.slug}): ${r.description}`);
      }
      lines.push("");
    }
    return { status: 200, markdown: lines.join("\n") };
  }

  if (canonicalPath === "/app") {
    const info = appInfo();
    const lines: string[] = [
      `# Приложение ${SITE_NAME} для Android и iPhone`,
      "",
      "> Задачи смены, чек-листы и фотоотчёты в телефоне: уведомления о новых задачах, камера, работа при плохой связи.",
      "",
      `Канонический адрес: ${base}/app`,
      "",
      "## Android",
      "",
      ...(info.android.apk ? [`- Скачать APK (${info.android.apk.versionName}): ${base}${info.android.apk.url}`] : []),
      ...(info.android.playUrl ? [`- Google Play: ${info.android.playUrl}`] : []),
      ...(info.android.rustoreUrl ? [`- RuStore: ${info.android.rustoreUrl}`] : []),
      "1. Откройте tasksflow.ru в Chrome.",
      "2. Меню ⋮ → «Установить приложение».",
      "3. Включите уведомления в разделе «Аккаунт».",
      "",
      "## iPhone и iPad",
      "",
      ...(info.ios.appStoreUrl ? [`- App Store: ${info.ios.appStoreUrl}`] : []),
      "1. Откройте tasksflow.ru в Safari.",
      "2. Нажмите «Поделиться» → «На экран Домой» → «Добавить».",
      "3. Откройте приложение с экрана и включите уведомления (iOS 16.4+).",
      "",
    ];
    return { status: 200, markdown: lines.join("\n") };
  }

  const legalSlug = canonicalPath.slice(1);
  if (LEGAL_SLUGS.has(legalSlug)) {
    const legal = loadLegalData(legalSlug, env);
    const mdBody = loadLegalMarkdown(legalSlug, env);
    if (!legal.doc || mdBody === null) {
      return { status: 404, markdown: `# Документ не найден — ${SITE_NAME}\n` };
    }
    const lines: string[] = [
      `# ${legal.doc.title}`,
      "",
      ...(legal.doc.description ? [`> ${legal.doc.description}`, ""] : []),
      `- Канонический адрес: ${base}/${legal.doc.slug}`,
      ...(legal.doc.updatedAt ? [`- Дата редакции: ${legal.doc.updatedAt}`] : []),
      "",
      mdBody.trim(),
      "",
      "## Оператор и контакты",
      "",
      ...operatorLines(legal.operator).map((l) => `- **${l.label}**: ${l.value}`),
      `- **Email**: ${legal.contactEmail}`,
      "",
    ];
    return { status: 200, markdown: lines.join("\n") };
  }

  return null;
}

export async function buildLlmsFullTxt(
  origin: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const base = origin.replace(/\/+$/, "");
  const { prices, promotion } = await loadLandingPricingSafe(env);
  const posts = getAllPosts(env);
  const contactEmail = legalContactEmail(env);

  const lines: string[] = [
    `# ${SITE_NAME} — Полный справочник для ИИ-систем (llms-full.txt)`,
    "",
    `> ${DEFAULT_DESCRIPTION}`,
    "",
    `- Сайт: ${base}/`,
    `- Краткий индекс: ${base}/llms.txt`,
    `- Поддержка: ${contactEmail}`,
    "",
    "## Тарифы и условия",
    "",
  ];

  if (promotion) {
    lines.push(`Акция «${promotion.title}»: −${promotion.percent}% на платные тарифы.`, "");
  }
  lines.push("| Тариф | Стоимость | Что входит |", "| --- | --- | --- |");
  for (const id of PLAN_IDS) {
    lines.push(
      `| ${PLANS[id].name} | ${formatPlanPriceMd(id, prices, promotion)} | ${PLAN_FEATURES[id].join("; ")} |`,
    );
  }
  lines.push("");

  lines.push("## Разделы сайта и Markdown-версии", "");
  lines.push(
    `- Главная: ${base}/ (Markdown: ${base}/index.md)`,
    `- Блог: ${base}/blog (Markdown: ${base}/blog.md)`,
    `- Мобильное приложение: ${base}/app (Markdown: ${base}/app.md)`,
    ...CLUSTERS.map(
      (c) => `- Раздел «${c.title}»: ${base}/blog/category/${c.key} (Markdown: ${base}/blog/category/${c.key}.md)`,
    ),
    ...LEGAL_DOCS.map((d) => `- ${d.label}: ${base}${d.path} (Markdown: ${base}${d.path}.md)`),
    "",
  );

  lines.push("## Вопросы и ответы", "");
  for (const { q, a } of LANDING_FAQ) {
    lines.push(`### ${q}`, "", a, "");
  }

  if (posts.length > 0) {
    lines.push(`## База статей блога (${posts.length})`, "");
    for (const p of posts) {
      const md = getPostMarkdown(p.slug, env) ?? "";
      lines.push(
        `---`,
        "",
        `### ${p.title}`,
        "",
        `- URL: ${base}/blog/${p.slug}`,
        `- Markdown: ${base}/blog/${p.slug}.md`,
        `- Дата: ${p.date} | Время чтения: ${p.readingMins} мин`,
        `- Описание: ${p.description}`,
        "",
        md.trim(),
        "",
      );
    }
  }

  return lines.join("\n");
}
