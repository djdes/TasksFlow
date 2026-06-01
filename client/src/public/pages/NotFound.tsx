import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />
      <div className="flex-1 max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="text-7xl font-extrabold text-primary/20 mb-4">404</div>
        <h1 className="text-2xl font-bold mb-3">Страница не найдена</h1>
        <p className="text-muted-foreground mb-7">Возможно, ссылка устарела или страница была перемещена.</p>
        <div className="flex gap-3 justify-center">
          <a href="/" className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">На главную</a>
          <a href="/blog" className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted">В блог</a>
        </div>
      </div>
      <Footer />
    </div>
  );
}
