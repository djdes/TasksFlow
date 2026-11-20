/**
 * CLI-утилита прогрева и диагностики JSON-кэша промо-страниц:
 *   npm run promo-cache:refresh — пересобрать и атомарно перезаписать все снимки
 *   npm run promo-cache:status  — показать состояние файлов снимков без обращения к БД
 */
import "dotenv/config";
import { getPromoCacheStatus, refreshAllPromoDatasets } from "../server/promo-cache/datasets";

async function main() {
  const mode = process.argv.includes("--status") ? "status" : "refresh";
  if (mode === "status") {
    const status = getPromoCacheStatus();
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  try {
    const result = await refreshAllPromoDatasets();
    console.log(
      JSON.stringify(
        {
          ok: true,
          cacheDir: result.cacheDir,
          datasets: result.datasets.map((d) => ({
            dataset: d.dataset,
            exists: d.exists,
            generatedAt: d.generatedAt,
            sizeBytes: d.sizeBytes,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    const { pool } = await import("../server/db").catch(() => ({ pool: null }));
    await pool?.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[promo-cache] ошибка:", err);
  process.exitCode = 1;
});
