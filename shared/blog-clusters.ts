/**
 * Тематические кластеры блога — единый источник истины для клиента
 * (UI, фильтры, обложки) и сервера (статистика, генерация обложек,
 * страницы категорий). Лежит в shared/, т.к. нужен в обоих бандлах.
 */
export interface Cluster {
  key: string;
  title: string;
  short: string;
  /** lucide-иконка (имя экспорта из lucide-react). */
  icon: string;
  /** Базовый hue для градиента обложки. */
  hue: number;
}

export const CLUSTERS: Cluster[] = [
  { key: "upravlenie", title: "Управление и контроль задач", short: "Управление", icon: "ClipboardCheck", hue: 233 },
  { key: "otrasli", title: "Отраслевые кейсы", short: "Отрасли", icon: "Building2", hue: 162 },
  { key: "motivaciya", title: "Мотивация и KPI персонала", short: "Мотивация", icon: "TrendingUp", hue: 28 },
  { key: "sravneniya", title: "Сравнения и альтернативы", short: "Сравнения", icon: "Scale", hue: 280 },
];

export const CLUSTER_BY_KEY: Record<string, Cluster> = Object.fromEntries(
  CLUSTERS.map((c) => [c.key, c]),
);

export function clusterTitle(key: string): string {
  return CLUSTER_BY_KEY[key]?.title ?? "Статьи";
}

export function isClusterKey(key: string): boolean {
  return key in CLUSTER_BY_KEY;
}
