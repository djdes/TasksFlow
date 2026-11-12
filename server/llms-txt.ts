/**
 * /llms.txt — короткое описание сайта для ИИ-помощников (ChatGPT, Алиса,
 * Perplexity) в формате llmstxt.org: заголовок, цитата-описание, списки ссылок.
 *
 * Своего текста здесь нет: описание — то же, что в <meta description> главной,
 * тарифы — shared/plans.ts, вопросы — те же, что на лендинге, статьи и разделы
 * блога — content/blog, документы — список из legal.ts. Цен в файле нет: они
 * хранятся в базе и меняются акциями, актуальные — на главной.
 */
import { DEFAULT_DESCRIPTION, SITE_NAME } from "../client/src/public/seo";
import { LANDING_FAQ } from "../client/src/public/landing-faq";
import { LEGAL_DOCS } from "../client/src/public/legal";
import { CLUSTERS } from "@shared/blog-clusters";
import { PLAN_FEATURES, PLAN_IDS, PLANS } from "@shared/plans";
import type { PostMeta } from "./blog";

/** Одна строка без переводов строк: в llms.txt абзац = строка. */
function oneLine(s: string): string {
  return String(s).replace(/\s+/g, " ").trim();
}

export function buildLlmsTxt(origin: string, posts: PostMeta[]): string {
  const base = origin.replace(/\/+$/, "");
  const lines: string[] = [`# ${SITE_NAME}`, "", `> ${oneLine(DEFAULT_DESCRIPTION)}`, ""];

  lines.push(
    "## Страницы",
    "",
    `- [Главная](${base}/): возможности, тарифы с ценами, вопросы и ответы`,
    `- [Блог](${base}/blog): статьи о постановке и контроле задач`,
    ...CLUSTERS.map((c) => `- [Блог: ${oneLine(c.title)}](${base}/blog/category/${c.key})`),
    "",
  );

  lines.push("## Тарифы", "");
  for (const id of PLAN_IDS) {
    lines.push(`- ${PLANS[id].name}: ${PLAN_FEATURES[id].map(oneLine).join(", ")}`);
  }
  lines.push("", `Цены — на [главной](${base}/).`, "");

  if (posts.length > 0) {
    lines.push("## Статьи", "");
    for (const p of posts) {
      lines.push(`- [${oneLine(p.title)}](${base}/blog/${p.slug}): ${oneLine(p.description)}`);
    }
    lines.push("");
  }

  lines.push("## Вопросы и ответы", "");
  for (const { q, a } of LANDING_FAQ) lines.push(`### ${oneLine(q)}`, "", oneLine(a), "");

  lines.push("## Документы", "", ...LEGAL_DOCS.map((d) => `- [${d.label}](${base}${d.path})`), "");

  return lines.join("\n");
}
