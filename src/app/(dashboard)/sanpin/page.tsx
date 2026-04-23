import { BookOpen } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { SANPIN_NORMS } from "@/lib/sanpin-norms";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CATEGORIES = [
  { key: "temperature", title: "Температурные режимы", emoji: "🌡️" },
  { key: "shelf_life", title: "Сроки годности", emoji: "⏳" },
  { key: "incoming", title: "Входной контроль", emoji: "📦" },
  { key: "hygiene", title: "Гигиена персонала", emoji: "🧤" },
  { key: "cleaning", title: "Уборка и дезинфекция", emoji: "🧹" },
  { key: "haccp", title: "ХАССП / ККТ", emoji: "🛡️" },
  { key: "calibration", title: "Поверка оборудования", emoji: "⚙️" },
  { key: "pest_control", title: "Дезинсекция / Дератизация", emoji: "🐛" },
  { key: "writeoff", title: "Списание продукции", emoji: "🗑️" },
  { key: "general", title: "Общие положения", emoji: "📋" },
];

export default async function SanpinReferencePage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">Справочник СанПиН</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Основные нормативы для пищевых производств (СанПиН 2.3/2.4.3590-20, ГОСТ Р 51705.1-2024, ТР ТС 021/2011)
        </p>
      </div>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const norms = SANPIN_NORMS.filter((n) => n.category === cat.key);
          if (norms.length === 0) return null;

          return (
            <Card key={cat.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span>{cat.emoji}</span>
                  {cat.title}
                  <Badge variant="secondary" className="ml-auto">
                    {norms.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {norms.map((norm) => (
                    <div
                      key={norm.id}
                      className="rounded-lg border p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 font-semibold text-sm">
                          {norm.title}
                        </h3>
                        {norm.values && (
                          <Badge
                            variant="outline"
                            className="shrink-0 whitespace-normal break-all font-mono text-xs"
                          >
                            {norm.values}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {norm.description}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BookOpen className="size-3" />
                        <span>{norm.document}</span>
                      </div>
                      {norm.penalty && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                          <strong>Штраф:</strong> {norm.penalty}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
