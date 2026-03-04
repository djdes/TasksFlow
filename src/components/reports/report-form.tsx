"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileDown, Loader2 } from "lucide-react";

interface Template {
  id: string;
  code: string;
  name: string;
}

interface Area {
  id: string;
  name: string;
}

interface ReportFormProps {
  templates: Template[];
  areas: Area[];
}

export function ReportForm({ templates, areas }: ReportFormProps) {
  const [templateCode, setTemplateCode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [areaId, setAreaId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDownload = async () => {
    setError("");

    if (!templateCode) {
      setError("Выберите журнал");
      return;
    }
    if (!dateFrom) {
      setError("Укажите дату начала");
      return;
    }
    if (!dateTo) {
      setError("Укажите дату окончания");
      return;
    }
    if (new Date(dateFrom) > new Date(dateTo)) {
      setError("Дата начала не может быть позже даты окончания");
      return;
    }

    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        template: templateCode,
        from: dateFrom,
        to: dateTo,
      });

      if (areaId && areaId !== "__all__") {
        params.set("area", areaId);
      }

      const response = await fetch(`/api/reports/pdf?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка при формировании отчёта");
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `report_${templateCode}_${dateFrom}_${dateTo}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Ошибка при формировании отчёта";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Сформировать отчёт</CardTitle>
        <CardDescription>
          Выберите журнал и период для формирования PDF-отчёта
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label>Журнал</Label>
            <Select value={templateCode} onValueChange={setTemplateCode}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите журнал" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div className="space-y-2">
            <Label>Дата начала</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          {/* Date to */}
          <div className="space-y-2">
            <Label>Дата окончания</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {/* Area filter (optional) */}
          <div className="space-y-2">
            <Label>
              Участок{" "}
              <span className="text-muted-foreground font-normal">
                (необязательно)
              </span>
            </Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Все участки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Все участки</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Submit button */}
          <Button
            onClick={handleDownload}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Формирование...
              </>
            ) : (
              <>
                <FileDown className="size-4" />
                Скачать PDF
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
