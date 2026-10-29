import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  // Цвета — токенами темы: с text-gray-900 заголовок в тёмной теме сливался с карточкой.
  // Кнопка назад обязательна: на телефоне у этой страницы нет меню, и без неё
  // из 404 можно было уйти только кнопкой браузера.
  return (
    <div className="page-screen flex w-full items-center justify-center p-4">
      <Card className="content-panel w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 shrink-0 text-red-500" />
            <h1 className="text-2xl font-bold text-foreground">404 Страница не найдена</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Запрашиваемая страница не существует.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <ArrowLeft className="h-4 w-4" />
            На главную
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
