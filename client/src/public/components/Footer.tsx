import { CLUSTERS } from "../clusters";

export function Footer() {
  const year = 2026;
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="text-xl font-extrabold text-foreground mb-2">
            Tasks<span className="text-primary">Flow</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Контроль задач для выездных и линейных команд: чек-листы, фотоотчёты, KPI.
          </p>
        </div>
        <div>
          <div className="font-semibold text-foreground mb-3 text-sm">Продукт</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="/#features" className="hover:text-foreground">Возможности</a></li>
            <li><a href="/#how" className="hover:text-foreground">Как работает</a></li>
            <li><a href="/#pricing" className="hover:text-foreground">Тарифы</a></li>
            <li><a href="/login" className="hover:text-foreground">Вход для сотрудников</a></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-foreground mb-3 text-sm">Блог</div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="/blog" className="hover:text-foreground">Все статьи</a></li>
            {CLUSTERS.map((c) => (
              <li key={c.key}>
                <a href={`/blog/category/${c.key}`} className="hover:text-foreground">{c.short}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-foreground mb-3 text-sm">Начать</div>
          <p className="text-sm text-muted-foreground mb-3">Регистрация за секунду по email.</p>
          <a href="/" className="inline-flex rounded-full bg-primary text-primary-foreground text-sm font-semibold px-5 py-2">
            Попробовать бесплатно
          </a>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {year} TasksFlow. Все права защищены.
      </div>
    </footer>
  );
}
