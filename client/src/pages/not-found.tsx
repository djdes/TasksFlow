import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-screen flex w-full items-center justify-center p-4">
      <Card className="content-panel w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Страница не найдена</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Запрашиваемая страница не существует.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
