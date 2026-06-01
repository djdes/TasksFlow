// Реэкспорт из shared, чтобы клиентские компоненты импортировали из
// "../clusters", а источник истины жил в @shared/blog-clusters (нужен и серверу).
export * from "@shared/blog-clusters";
