import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useUpdateWorker, useWorker } from "@/hooks/use-workers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { insertWorkerSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

export default function EditWorker() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: worker, isLoading } = useWorker(Number(id));
  const updateWorker = useUpdateWorker();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof insertWorkerSchema>>({
    resolver: zodResolver(insertWorkerSchema),
    defaultValues: {
      name: "",
    },
  });

  // Обновляем форму когда сотрудник загружен
  useEffect(() => {
    if (worker) {
      form.reset({ name: worker.name });
    }
  }, [worker, form]);

  const onSubmit = (values: z.infer<typeof insertWorkerSchema>) => {
    if (!id) return;
    updateWorker.mutate(
      { id: Number(id), ...values },
      {
        onSuccess: () => {
          toast({
            title: "Успешно",
            description: "Сотрудник обновлен",
          });
          setLocation("/");
        },
        onError: (error: any) => {
          toast({
            title: "Ошибка",
            description: error.message || "Не удалось обновить сотрудника",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/10 to-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/10 to-background">
        <div className="text-center content-panel">
          <h1 className="text-2xl font-semibold mb-2">Сотрудник не найден</h1>
          <button
            onClick={() => setLocation("/")}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-screen">
      <div className="page-container page-container--narrow">
        <div className="page-header">
          <button
            onClick={() => setLocation("/")}
            className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="page-icon">
              <Edit className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title">Редактировать сотрудника</h1>
          </div>
          <p className="page-subtitle sm:ml-[60px]">Измените информацию о сотруднике</p>
        </div>

        <div className="content-panel">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Имя</FormLabel>
                  <FormControl>
                    <Input 
                      className="things-input" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
              <div className="flex gap-4 pt-4">
                <Button 
                  type="button" 
                  variant="ghost"
                  onClick={() => setLocation("/")}
                  className="flex-1 border border-border/50"
                >
                  Отмена
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateWorker.isPending}
                  className="flex-1 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all"
                >
                  {updateWorker.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
