import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { DEFAULT_PHOTO_SETTINGS, type PhotoSettings } from "@shared/photo-settings";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ROWS: Array<{ key: keyof PhotoSettings; title: string; hint: string }> = [
  { key: "stamp", title: "Дата и время на фото", hint: "Видно, когда сделан снимок, — и в кабинете, и в выгрузке" },
  { key: "cameraOnly", title: "Только камера", hint: "Сразу открывается камера, без выбора старых фото из галереи" },
];

/** «Фото-отчёты» в настройках компании: подпись времени и «только камера». */
export function PhotoSettingsPanel({ company }: { company: { name: string; photo?: PhotoSettings | null } }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [photo, setPhoto] = useState<PhotoSettings>(company.photo ?? DEFAULT_PHOTO_SETTINGS);
  useEffect(() => setPhoto(company.photo ?? DEFAULT_PHOTO_SETTINGS), [company.photo]);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/companies/me", { name: company.name, photo }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-me"] }),
        queryClient.invalidateQueries({ queryKey: ["companies", "me"] }),
      ]);
      toast({ title: "Настройки фото сохранены" });
    },
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="content-panel">
      <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
        <Camera className="w-5 h-5 text-primary" aria-hidden="true" />
        Фото-отчёты
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Фото сжимаются перед отправкой — грузятся в десятки раз быстрее, а без сети ждут и уходят сами.
      </p>
      <div className="schedule-slots">
        {ROWS.map((row) => (
          <div key={row.key} className="schedule-slot" data-off={!photo[row.key] || undefined}>
            <input
              id={`photo-${row.key}`}
              type="checkbox"
              className="schedule-check"
              checked={photo[row.key]}
              onChange={(e) => setPhoto((p) => ({ ...p, [row.key]: e.target.checked }))}
            />
            <label htmlFor={`photo-${row.key}`} className="schedule-slot-text">
              <span>{row.title}</span>
              <small>{row.hint}</small>
            </label>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={() => save.mutate()} loading={save.isPending} loadingLabel="Сохраняем…">
          Сохранить
        </Button>
      </div>
    </div>
  );
}
